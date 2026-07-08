param(
  [ValidateSet("DailyDb", "App", "Retention", "All")]
  [string]$Mode = "All"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Split-Path -Parent $ScriptDir
$ConfigPath = Join-Path $ScriptDir "backup-config.local.json"
$LastRunLog = Join-Path $ScriptDir "backup-last-run.log"

if (-not (Test-Path $ConfigPath)) {
  throw "Configuração não encontrada: $ConfigPath"
}

$Config = Get-Content -Raw -Encoding UTF8 -Path $ConfigPath | ConvertFrom-Json
$BackupRoot = $Config.backupRoot
if (-not $BackupRoot) {
  throw "backupRoot não configurado em $ConfigPath"
}

$AppBackupRoot = Join-Path $BackupRoot "APP"
$DbBackupRoot = Join-Path $BackupRoot "Backups"
$DailyRoot = Join-Path $DbBackupRoot "Diarios"
$MonthlyRoot = Join-Path $DbBackupRoot "Mensais"
$LogRoot = Join-Path $BackupRoot "Logs"
$OperationLog = Join-Path $LogRoot "operacoes.jsonl"

function Ensure-BackupFolders {
  New-Item -ItemType Directory -Force -Path $AppBackupRoot, $DbBackupRoot, $DailyRoot, $MonthlyRoot, $LogRoot | Out-Null
}

function Write-OperationLog {
  param(
    [string]$Operation,
    [string]$Status,
    [string]$Message,
    [string]$Target = "",
    [string]$ErrorMessage = ""
  )

  Ensure-BackupFolders
  $Entry = [ordered]@{
    timestamp = (Get-Date).ToUniversalTime().ToString("o")
    operation = $Operation
    status = $Status
    target = $Target
    message = $Message
  }

  if ($ErrorMessage) {
    $Entry.error = $ErrorMessage
  }

  $Line = ($Entry | ConvertTo-Json -Compress) + [Environment]::NewLine
  for ($Attempt = 1; $Attempt -le 6; $Attempt += 1) {
    try {
      Add-Content -Path $OperationLog -Value $Line -Encoding UTF8
      return
    } catch {
      if ($Attempt -eq 6) {
        Write-Warning "Não foi possível registrar no log de backups: $($_.Exception.Message)"
        return
      }
      Start-Sleep -Milliseconds (300 * $Attempt)
    }
  }
}

function Get-Sha256 {
  param([string]$Path)
  return (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
}

function Get-FolderSha256 {
  param([string]$Path)

  $Sha = [System.Security.Cryptography.SHA256]::Create()
  $Builder = New-Object System.Text.StringBuilder

  Get-ChildItem -Path $Path -Recurse -File | Sort-Object FullName | ForEach-Object {
    $Relative = $_.FullName.Substring($Path.Length).TrimStart("\").Replace("\", "/")
    [void]$Builder.Append($Relative)
    [void]$Builder.Append((Get-Sha256 -Path $_.FullName))
  }

  $Bytes = [System.Text.Encoding]::UTF8.GetBytes($Builder.ToString())
  return [System.BitConverter]::ToString($Sha.ComputeHash($Bytes)).Replace("-", "").ToLowerInvariant()
}

function Get-FolderSize {
  param([string]$Path)

  if (-not (Test-Path $Path)) {
    return 0
  }

  if ((Get-Item $Path).PSIsContainer) {
    return (Get-ChildItem -Path $Path -Recurse -File | Measure-Object -Property Length -Sum).Sum
  }

  return (Get-Item $Path).Length
}

function Write-Manifest {
  param(
    [string]$DestinationRoot,
    [hashtable]$Manifest
  )

  $Manifest.generatedAt = (Get-Date).ToUniversalTime().ToString("o")
  $Manifest.destinationRoot = $DestinationRoot
  $Manifest | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $DestinationRoot "backup-manifest.json") -Encoding UTF8
}

function Invoke-DailyDbBackup {
  Ensure-BackupFolders

  if (-not (Test-Path $Config.pgDumpPath)) {
    throw "pg_dump não encontrado: $($Config.pgDumpPath)"
  }

  $Day = Get-Date -Format "yyyy-MM-dd"
  $DestinationRoot = Join-Path $DailyRoot "Backup_Diario_$Day"
  $DatabaseBackupPath = Join-Path $DestinationRoot "BD_$Day.dump"

  if (Test-Path $DestinationRoot) {
    Remove-Item -LiteralPath $DestinationRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $DestinationRoot | Out-Null

  try {
    & $Config.pgDumpPath "--dbname=$($Config.connectionString)" "-F" "c" "-f" $DatabaseBackupPath
    if ($LASTEXITCODE -ne 0) {
      throw "pg_dump finalizou com código $LASTEXITCODE"
    }
  } catch {
    if (Test-Path $DestinationRoot) {
      Remove-Item -LiteralPath $DestinationRoot -Recurse -Force
    }
    throw
  }

  $Checksum = Get-FolderSha256 -Path $DestinationRoot
  "$Checksum  $(Split-Path -Leaf $DatabaseBackupPath)" | Set-Content -Path "$DatabaseBackupPath.sha256" -Encoding UTF8

  Write-Manifest -DestinationRoot $DestinationRoot -Manifest @{
    kind = "diario-bd"
    databaseBackupPath = $DatabaseBackupPath
    copiedFiles = 1
    checksum = $Checksum
    note = "Backup diário automático do banco de dados executado pelo Agendador de Tarefas do Windows."
  }

  Write-OperationLog -Operation "backup-diario-bd-windows" -Status "ok" -Target $DestinationRoot -Message "Backup diário do banco de dados concluído pelo Windows."
  "Backup OK: $DatabaseBackupPath ($([math]::Round((Get-FolderSize -Path $DestinationRoot) / 1KB, 1)) KB)"
}

function Invoke-AppBackup {
  Ensure-BackupFolders

  $Timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
  $DestinationZip = Join-Path $AppBackupRoot "APP_$Timestamp.zip"
  $TempRoot = Join-Path $env:TEMP "yvae-backup-app-$Timestamp"

  if (Test-Path $TempRoot) {
    Remove-Item -LiteralPath $TempRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $TempRoot | Out-Null

  $ExcludeDirs = @(".git", ".turbo", ".vercel", ".next", ".playwright-cli", ".playwright-mcp", ".claude", "coverage", "node_modules", "playwright-report", "output", "dist", "build")
  $ExcludeExtensions = @(".db", ".log", ".sqlite", ".sqlite3", ".tmp", ".tsbuildinfo")
  $script:Copied = 0

  Get-ChildItem -Path $AppRoot -Recurse -File | ForEach-Object {
    $Relative = $_.FullName.Substring($AppRoot.Length).TrimStart("\")
    $Parts = $Relative -split "\\"
    if ($Parts | Where-Object { $ExcludeDirs -contains $_ }) { return }
    if ($_.Name -like ".env*") { return }
    if ($ExcludeExtensions -contains $_.Extension.ToLowerInvariant()) { return }
    if ($Relative.Replace("\", "/").EndsWith("/backup-manifest.json")) { return }

    $Target = Join-Path $TempRoot $Relative
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $Target) | Out-Null
    Copy-Item -LiteralPath $_.FullName -Destination $Target -Force
    $script:Copied += 1
  }

  Write-Manifest -DestinationRoot $TempRoot -Manifest @{
    kind = "manual-app"
    sourceRoot = $AppRoot
    copiedFiles = $script:Copied
    note = "Backup automático do aplicativo executado pelo Agendador de Tarefas do Windows. Arquivos .env e bancos locais são ignorados."
  }

  tar.exe -c -f $DestinationZip -C $TempRoot .
  if ($LASTEXITCODE -ne 0) {
    throw "tar.exe finalizou com código $LASTEXITCODE"
  }

  Remove-Item -LiteralPath $TempRoot -Recurse -Force

  Get-ChildItem -Path $AppBackupRoot -Filter "APP_*.zip" -File |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip 5 |
    Remove-Item -Force

  $Checksum = Get-Sha256 -Path $DestinationZip
  Write-OperationLog -Operation "backup-app-windows" -Status "ok" -Target $DestinationZip -Message "Versão atual do aplicativo salva pelo Windows."
  "Backup APP OK: $DestinationZip ($([math]::Round((Get-FolderSize -Path $DestinationZip) / 1MB, 1)) MB, sha256 $($Checksum.Substring(0, 16))...)"
}

function Invoke-Retention {
  Ensure-BackupFolders

  $CurrentMonth = Get-Date -Format "yyyy-MM"
  $script:Archived = 0
  $script:Removed = 0

  Get-ChildItem -Path $DailyRoot -Directory -Filter "Backup_Diario_*" | ForEach-Object {
    if ($_.Name -notmatch "^Backup_Diario_(\d{4}-\d{2}-\d{2})$") { return }
    $Date = [datetime]::ParseExact($Matches[1], "yyyy-MM-dd", $null)
    $MonthKey = $Date.ToString("yyyy-MM")

    if ($MonthKey -eq $CurrentMonth) { return }

    if ($Date.Day -eq 1 -or $Date.Day -eq 15) {
      $Target = Join-Path $MonthlyRoot "Backup_Mensal_$($Date.ToString("yyyy-MM-dd"))"
      if (Test-Path $Target) {
        Remove-Item -LiteralPath $Target -Recurse -Force
      }
      Move-Item -LiteralPath $_.FullName -Destination $Target
      $script:Archived += 1
      return
    }

    Remove-Item -LiteralPath $_.FullName -Recurse -Force
    $script:Removed += 1
  }

  Write-OperationLog -Operation "limpeza-retencao-windows" -Status "ok" -Target $MonthlyRoot -Message "Retenção mensal concluída. Arquivados: $script:Archived. Removidos: $script:Removed."
  "Retenção OK: arquivados $script:Archived; removidos $script:Removed."
}

Start-Transcript -Path $LastRunLog -Force | Out-Null
try {
  $Failures = @()

  if ($Mode -eq "DailyDb" -or $Mode -eq "All") {
    try {
      Invoke-DailyDbBackup
    } catch {
      $Failures += "BD: $($_.Exception.Message)"
      Write-OperationLog -Operation "backup-diario-bd-windows" -Status "erro" -Message $_.Exception.Message -ErrorMessage $_.Exception.Message
      Write-Warning "Backup do BD falhou: $($_.Exception.Message)"
    }
  }
  if ($Mode -eq "App" -or $Mode -eq "All") {
    try {
      Invoke-AppBackup
    } catch {
      $Failures += "APP: $($_.Exception.Message)"
      Write-OperationLog -Operation "backup-app-windows" -Status "erro" -Message $_.Exception.Message -ErrorMessage $_.Exception.Message
      Write-Warning "Backup do APP falhou: $($_.Exception.Message)"
    }
  }
  if ($Mode -eq "Retention" -or $Mode -eq "All") {
    try {
      Invoke-Retention
    } catch {
      $Failures += "Retenção: $($_.Exception.Message)"
      Write-OperationLog -Operation "limpeza-retencao-windows" -Status "erro" -Message $_.Exception.Message -ErrorMessage $_.Exception.Message
      Write-Warning "Retenção falhou: $($_.Exception.Message)"
    }
  }

  if ($Failures.Count -gt 0) {
    throw ($Failures -join " | ")
  }
} finally {
  Stop-Transcript | Out-Null
}
