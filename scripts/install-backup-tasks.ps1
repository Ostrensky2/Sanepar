param(
  [string]$DailyTime = "12:15",
  [string]$AppTime = "12:25",
  [string]$MonthlyTime = "12:45"
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$BackupScript = Join-Path $ScriptDir "backup-bd-nuvem.ps1"

if (-not (Test-Path $BackupScript)) {
  throw "Script de backup não encontrado: $BackupScript"
}

$PowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$User = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-YvaeTask {
  param(
    [string]$Name,
    [string]$Mode,
    [string]$Schedule,
    [string]$Time
  )

  if ($Schedule -eq "Monthly") {
    $TaskCommand = "`"$PowerShell`" -NoProfile -ExecutionPolicy Bypass -File `"$BackupScript`" -Mode $Mode"
    schtasks.exe /Create /TN $Name /TR $TaskCommand /SC MONTHLY /D 1 /ST $Time /F | Out-Null
    Write-Host "Tarefa instalada/atualizada: $Name ($Mode, mensal no dia 1 às $Time)"
    return
  }

  $Action = New-ScheduledTaskAction -Execute $PowerShell -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$BackupScript`" -Mode $Mode"
  $Trigger = New-ScheduledTaskTrigger -Daily -At $Time
  $Settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
  $Principal = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Limited

  Register-ScheduledTask -TaskName $Name -Action $Action -Trigger $Trigger -Settings $Settings -Principal $Principal -Description "Backup local do Yva'e/Sanepar para Dropbox." -Force | Out-Null
  Write-Host "Tarefa instalada/atualizada: $Name ($Mode, $Schedule às $Time)"
}

Register-YvaeTask -Name "Yvae Backup Diario BD Nuvem" -Mode "DailyDb" -Schedule "Daily" -Time $DailyTime
Register-YvaeTask -Name "Yvae Backup Diario Aplicativo" -Mode "App" -Schedule "Daily" -Time $AppTime
Register-YvaeTask -Name "Yvae Backup Retencao Mensal" -Mode "Retention" -Schedule "Monthly" -Time $MonthlyTime

Write-Host "Backups reforçados no Windows. Logs: $(Join-Path (Split-Path -Parent $ScriptDir) "scripts\backup-last-run.log")"
