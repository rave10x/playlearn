# Playlearn installer for Windows.  Run in PowerShell:
#   irm https://raw.githubusercontent.com/rave10x/playlearn/main/install.ps1 | iex
$ErrorActionPreference = 'Stop'
$repo = 'rave10x/playlearn'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host 'Playlearn - finding the latest release...' -ForegroundColor Magenta
$rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -like '*-setup.exe' } | Select-Object -First 1
if (-not $asset) { throw "No Windows installer found in release $($rel.tag_name)." }

$tmp = Join-Path $env:TEMP $asset.name
Write-Host "Downloading $($asset.name) ($([math]::Round($asset.size / 1MB, 1)) MB)..."
Invoke-WebRequest $asset.browser_download_url -OutFile $tmp -UseBasicParsing

Write-Host 'Installing (per-user, no admin needed)...'
Start-Process -FilePath $tmp -ArgumentList '/S' -Wait
Remove-Item $tmp -Force -ErrorAction SilentlyContinue

Write-Host "Playlearn $($rel.tag_name) installed. Open it from the Start menu." -ForegroundColor Green
Write-Host 'Tip: for 720p offline downloads run: winget install Gyan.FFmpeg'
