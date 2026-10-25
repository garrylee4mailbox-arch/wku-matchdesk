param([string]$OutputDirectory = '')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'build\WKU-MatchDesk' }
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) { $compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework\v4.0.30319\csc.exe' }
if (-not (Test-Path -LiteralPath $compiler)) { throw '.NET Framework 4.x compiler was not found. Build on Windows 10/11.' }
New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
& $compiler /nologo /codepage:65001 /target:winexe /optimize+ /platform:anycpu /reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll "/out:$OutputDirectory\WKU-MatchDesk.exe" "$projectRoot\native\Program.cs"
if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
Copy-Item -LiteralPath (Join-Path $projectRoot 'ui') -Destination $OutputDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'docs') -Destination $OutputDirectory -Recurse -Force
Copy-Item -LiteralPath (Join-Path $projectRoot 'README.md') -Destination (Join-Path $OutputDirectory 'README.md') -Force
Write-Output "Portable package: $OutputDirectory"
