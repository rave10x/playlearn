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

# ffmpeg gives 720p offline downloads; install it automatically when winget is available (yt-dlp is fetched by the app itself)
if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    if (Get-Command winget -ErrorAction SilentlyContinue) {
        Write-Host 'Installing ffmpeg (for 720p offline downloads)...'
        try { winget install --id Gyan.FFmpeg -e --silent --accept-package-agreements --accept-source-agreements | Out-Null } catch { Write-Host 'ffmpeg install skipped.' }
    } else { Write-Host 'winget not found: offline downloads will be 360p. Install ffmpeg later if you want 720p.' }
}

Write-Host "Playlearn $($rel.tag_name) installed. Open it from the Start menu." -ForegroundColor Green
Write-Host 'Nothing else to install: the web runtime is included and yt-dlp is downloaded automatically on first use.'
