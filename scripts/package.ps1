$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
& (Join-Path $PSScriptRoot 'build.ps1')
$deliveryDir = Join-Path $projectRoot 'delivery'
New-Item -ItemType Directory -Force -Path $deliveryDir | Out-Null
Compress-Archive -LiteralPath (Join-Path $projectRoot 'build\WKU-MatchDesk') -DestinationPath (Join-Path $deliveryDir 'WKU-MatchDesk-Windows-v1.0.0.zip') -Force
$sourcePaths = @('ui','native','scripts','tests','docs','README.md','package.json','package-lock.json','.gitignore') | ForEach-Object { Join-Path $projectRoot $_ }
Compress-Archive -LiteralPath $sourcePaths -DestinationPath (Join-Path $deliveryDir 'WKU-MatchDesk-Source-v1.0.0.zip') -Force
Get-FileHash -LiteralPath (Join-Path $deliveryDir 'WKU-MatchDesk-Windows-v1.0.0.zip'),(Join-Path $deliveryDir 'WKU-MatchDesk-Source-v1.0.0.zip') -Algorithm SHA256 | Format-Table Hash,Path -AutoSize
