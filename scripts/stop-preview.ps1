$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$sessionPath = Join-Path $projectRoot 'test-output\preview\session.json'
if (Test-Path -LiteralPath $sessionPath) {
  $previewSession = Get-Content -LiteralPath $sessionPath -Raw | ConvertFrom-Json
  $ownedProcess = Get-Process -Id $previewSession.pid -ErrorAction SilentlyContinue
  $expectedExe = [IO.Path]::GetFullPath((Join-Path $projectRoot 'build\WKU-MatchDesk\WKU-MatchDesk.exe'))
  if ($ownedProcess -and $ownedProcess.Path -eq $expectedExe) { Stop-Process -Id $ownedProcess.Id; $ownedProcess.WaitForExit() }
}
