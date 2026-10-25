$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$env:WKU_DATA_DIR = Join-Path $projectRoot 'test-output\preview'
$env:WKU_NO_BROWSER = '1'
New-Item -ItemType Directory -Force -Path $env:WKU_DATA_DIR | Out-Null
$previewProcess = Start-Process -FilePath (Join-Path $projectRoot 'build\WKU-MatchDesk\WKU-MatchDesk.exe') -WindowStyle Hidden -PassThru
for ($attempt = 0; $attempt -lt 50; $attempt++) {
  Start-Sleep -Milliseconds 100
  $sessionFile = Join-Path $env:WKU_DATA_DIR 'session.json'
  if (Test-Path -LiteralPath $sessionFile) {
    $sessionInfo = Get-Content -LiteralPath $sessionFile -Raw | ConvertFrom-Json
    if ($sessionInfo.pid -eq $previewProcess.Id) { $sessionInfo | ConvertTo-Json -Compress; exit 0 }
  }
}
throw 'Preview failed to start.'
