param(
  [string]$PythonPath = 'python',
  [string]$DateStamp = (Get-Date).ToString('yyyyMMdd')
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$program = Join-Path $projectRoot ('test-output\public-build-' + $DateStamp)
& (Join-Path $PSScriptRoot 'build.ps1') -OutputDirectory $program
if($LASTEXITCODE -ne 0){throw 'Build failed.'}
& $PythonPath (Join-Path $PSScriptRoot 'package-public.py') --program $program --date $DateStamp
if($LASTEXITCODE -ne 0){throw 'Privacy check or packaging failed.'}
& $PythonPath (Join-Path $PSScriptRoot 'verify-delivery.py')
if($LASTEXITCODE -ne 0){throw 'Public package verification failed.'}
