[CmdletBinding()]
param(
  [string]$PostgresBin = "C:\Users\AntonioOstrenskyNeto\scoop\apps\postgresql\current\bin"
)

$ErrorActionPreference = "Stop"
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("sanepar-auth-hardening-" + [guid]::NewGuid().ToString("N"))
$dataDir = Join-Path $tempRoot "data"
$logPath = Join-Path $tempRoot "postgres.log"
$port = Get-Random -Minimum 21000 -Maximum 29000
$initdb = Join-Path $PostgresBin "initdb.exe"
$pgCtl = Join-Path $PostgresBin "pg_ctl.exe"
$psql = Join-Path $PostgresBin "psql.exe"
$started = $false

try {
  [System.IO.Directory]::CreateDirectory($tempRoot) | Out-Null
  & $initdb -D $dataDir -A trust -U postgres --no-locale --encoding=UTF8 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "initdb failed" }

  & $pgCtl -D $dataDir -l $logPath -o "-p $port -h 127.0.0.1" start | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "pg_ctl start failed" }
  $started = $true

  $files = @(
    "supabase\tests\auth_hardening_fixture.sql",
    "supabase\migrations\20260815090000_supabase_auth_foundation.sql",
    "supabase\tests\auth_hardening_foundation.sql",
    "supabase\tests\auth_hardening_seed.sql",
    "supabase\migrations\20260815091000_supabase_auth_rls_cutover.sql",
    "supabase\tests\auth_hardening_rls.sql"
  )

  foreach ($relativePath in $files) {
    & $psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -U postgres -d postgres -f (Join-Path $repoRoot $relativePath)
    if ($LASTEXITCODE -ne 0) { throw "SQL test stage failed; details are in psql output." }
  }
} finally {
  if ($started) {
    & $pgCtl -D $dataDir stop -m fast | Out-Null
  }
  if ([System.IO.Directory]::Exists($tempRoot)) {
    [System.IO.Directory]::Delete($tempRoot, $true)
  }
}
