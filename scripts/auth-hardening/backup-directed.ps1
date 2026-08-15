[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$OutputDirectory,

  [string]$DatabaseUrlEnvironmentVariable = "DATABASE_URL",

  [string]$PgDumpPath = "pg_dump"
)

$ErrorActionPreference = "Stop"
$orderId = "BLINDAR-AUTENTICACAO-SUPABASE-AUTH-2026-08-15"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$destination = [System.IO.Path]::GetFullPath($OutputDirectory)

if ($destination.StartsWith($repoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "O backup deve ficar fora do repositório."
}

$databaseUrl = [Environment]::GetEnvironmentVariable($DatabaseUrlEnvironmentVariable)
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw "Variável de conexão ausente; operação cancelada sem artefatos."
}

$uri = [Uri]$databaseUrl
$userInfo = $uri.UserInfo.Split(":", 2)
if ($userInfo.Count -ne 2) {
  throw "URL de conexão inválida; operação cancelada."
}

[System.IO.Directory]::CreateDirectory($destination) | Out-Null
$stamp = [DateTimeOffset]::UtcNow.ToString("yyyyMMddTHHmmssZ")
$encryptedPath = Join-Path $destination "auth-hardening-$stamp.pgdump.aesgcm"
$protectedKeyPath = Join-Path $destination "auth-hardening-$stamp.key.dpapi"
$manifestPath = Join-Path $destination "auth-hardening-$stamp.manifest.json"

foreach ($path in @($encryptedPath, $protectedKeyPath, $manifestPath)) {
  if ([System.IO.File]::Exists($path)) {
    throw "Destino já existe; operação cancelada sem sobrescrever."
  }
}

$processInfo = [System.Diagnostics.ProcessStartInfo]::new()
$processInfo.FileName = $PgDumpPath
$processInfo.UseShellExecute = $false
$processInfo.RedirectStandardOutput = $true
$processInfo.RedirectStandardError = $true
$processInfo.CreateNoWindow = $true
$processInfo.Environment["PGPASSWORD"] = [Uri]::UnescapeDataString($userInfo[1])
$processInfo.Environment["PGSSLMODE"] = "require"

foreach ($argument in @(
  "--format=custom",
  "--no-owner",
  "--no-acl",
  "--host=$($uri.Host)",
  "--port=$($uri.Port)",
  "--username=$([Uri]::UnescapeDataString($userInfo[0]))",
  "--dbname=$($uri.AbsolutePath.TrimStart('/'))",
  "--table=public.auth_users"
)) {
  $processInfo.ArgumentList.Add($argument)
}

$process = [System.Diagnostics.Process]::new()
$process.StartInfo = $processInfo
$plainStream = [System.IO.MemoryStream]::new()
$plainBytes = $null
$cipherBytes = $null
$key = $null

try {
  if (-not $process.Start()) {
    throw "pg_dump não iniciou."
  }
  $stderrTask = $process.StandardError.ReadToEndAsync()
  $process.StandardOutput.BaseStream.CopyTo($plainStream)
  $process.WaitForExit()
  $stderr = $stderrTask.GetAwaiter().GetResult()

  if ($process.ExitCode -ne 0) {
    throw "pg_dump falhou (exit $($process.ExitCode)); detalhes suprimidos."
  }
  if ($plainStream.Length -le 0 -or $plainStream.Length -gt 134217728) {
    throw "Tamanho do backup fora do limite seguro."
  }

  $plainBytes = $plainStream.ToArray()
  $key = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
  $nonce = [System.Security.Cryptography.RandomNumberGenerator]::GetBytes(12)
  $tag = [byte[]]::new(16)
  $cipherBytes = [byte[]]::new($plainBytes.Length)
  $header = [System.Text.Encoding]::UTF8.GetBytes("YVAE-AUTH-BACKUP-V1|$orderId")
  $aes = [System.Security.Cryptography.AesGcm]::new($key, 16)
  try {
    $aes.Encrypt($nonce, $plainBytes, $cipherBytes, $tag, $header)
  } finally {
    $aes.Dispose()
  }

  $protectedKey = [System.Security.Cryptography.ProtectedData]::Protect(
    $key,
    $header,
    [System.Security.Cryptography.DataProtectionScope]::CurrentUser
  )

  $output = [System.IO.File]::Open($encryptedPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write)
  try {
    $output.Write([System.Text.Encoding]::ASCII.GetBytes("YVAEAUTH1"))
    $output.Write($nonce)
    $output.Write($tag)
    $output.Write($cipherBytes)
  } finally {
    $output.Dispose()
  }
  [System.IO.File]::WriteAllText(
    $protectedKeyPath,
    [Convert]::ToBase64String($protectedKey) + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )

  $encryptedHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $encryptedPath).Hash.ToLowerInvariant()
  $keyHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $protectedKeyPath).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    version = 1
    orderId = $orderId
    createdAt = [DateTimeOffset]::UtcNow.ToString("O")
    source = "public.auth_users"
    format = "pg_dump custom + AES-256-GCM"
    keyProtection = "DPAPI CurrentUser"
    plaintextWrittenToDisk = $false
    encryptedArtifact = [ordered]@{
      file = [System.IO.Path]::GetFileName($encryptedPath)
      bytes = ([System.IO.FileInfo]$encryptedPath).Length
      sha256 = $encryptedHash
    }
    protectedKeyArtifact = [ordered]@{
      file = [System.IO.Path]::GetFileName($protectedKeyPath)
      bytes = ([System.IO.FileInfo]$protectedKeyPath).Length
      sha256 = $keyHash
    }
  }
  $manifestJson = $manifest | ConvertTo-Json -Depth 5
  [System.IO.File]::WriteAllText(
    $manifestPath,
    $manifestJson + [Environment]::NewLine,
    [System.Text.UTF8Encoding]::new($false)
  )

  [pscustomobject]@{
    status = "BACKUP_ENCRYPTED"
    encryptedFile = [System.IO.Path]::GetFileName($encryptedPath)
    encryptedSha256 = $encryptedHash
    protectedKeyFile = [System.IO.Path]::GetFileName($protectedKeyPath)
    protectedKeySha256 = $keyHash
    manifestFile = [System.IO.Path]::GetFileName($manifestPath)
  } | ConvertTo-Json -Compress
} catch {
  foreach ($path in @($encryptedPath, $protectedKeyPath, $manifestPath)) {
    if ([System.IO.File]::Exists($path)) {
      [System.IO.File]::Delete($path)
    }
  }
  throw
} finally {
  $plainStream.Dispose()
  if ($null -ne $plainBytes) {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plainBytes)
  }
  if ($null -ne $cipherBytes) {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($cipherBytes)
  }
  if ($null -ne $key) {
    [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($key)
  }
  $process.Dispose()
}
