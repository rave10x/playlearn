#!/usr/bin/env bash
# Playlearn installer for Linux (x86_64). Run:
#   curl -fsSL https://raw.githubusercontent.com/rave10x/playlearn/main/install.sh | bash
# Downloads the latest AppImage to ~/.local/bin/playlearn and adds an app-menu entry. No root needed.
set -euo pipefail
REPO="rave10x/playlearn"
[ "$(uname -m)" = "x86_64" ] || { echo "Only x86_64 Linux builds are published."; exit 1; }
command -v curl >/dev/null || { echo "curl is required"; exit 1; }

echo "Playlearn - finding the latest release..."
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -1 | sed -E 's/.*"(https[^"]*)"/\1/')
[ -n "$URL" ] || { echo "No AppImage found in the latest release."; exit 1; }

BIN="$HOME/.local/bin"; DATA="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p "$BIN" "$DATA/applications" "$DATA/icons/hicolor/256x256/apps"
echo "Downloading $(basename "$URL")..."
curl -fL --progress-bar "$URL" -o "$BIN/playlearn.tmp"
chmod +x "$BIN/playlearn.tmp" && mv "$BIN/playlearn.tmp" "$BIN/playlearn"
curl -fsSL "https://raw.githubusercontent.com/$REPO/main/assets/icon-256.png" -o "$DATA/icons/hicolor/256x256/apps/playlearn.png" || true
cat > "$DATA/applications/playlearn.desktop" <<DESKTOP
[Desktop Entry]
Name=Playlearn
Comment=Turn YouTube playlists into Udemy-style courses
Exec=$BIN/playlearn %u
Icon=playlearn
Terminal=false
Type=Application
Categories=Education;AudioVideo;
StartupWMClass=playlearn
DESKTOP
update-desktop-database "$DATA/applications" 2>/dev/null || true
gtk-update-icon-cache -f -t "$DATA/icons/hicolor" 2>/dev/null || true
echo "Done. Open Playlearn from the app menu, or run: playlearn"
echo "Needs WebKitGTK 4.1 (Fedora: sudo dnf install webkit2gtk4.1; Ubuntu: sudo apt install libwebkit2gtk-4.1-0) and a yt-dlp (auto-downloaded on first use)."
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Note: add $BIN to your PATH to use the 'playlearn' command." ;; esac
