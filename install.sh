#!/usr/bin/env bash
# Playlearn installer for Linux (x86_64). One command installs everything:
#   curl -fsSL https://raw.githubusercontent.com/rave10x/playlearn/main/install.sh | bash
# 1) system packages (WebKitGTK, video codecs, yt-dlp, ffmpeg) via your package manager (asks for sudo once)
# 2) the app itself into ~/.local (no root), with a `playlearn` command and app-menu entry
set -euo pipefail
REPO="rave10x/playlearn"
say() { printf '\033[35m▸\033[0m %s\n' "$*"; }
[ "$(uname -m)" = "x86_64" ] || { echo "Only x86_64 Linux builds are published."; exit 1; }
command -v curl >/dev/null || { echo "curl is required"; exit 1; }

# ---------- 1. dependencies ----------
SUDO=""; [ "$(id -u)" -eq 0 ] || SUDO="sudo"
if [ -z "${PL_SKIP_DEPS:-}" ]; then
  if command -v dnf >/dev/null; then
    say "Installing dependencies with dnf (WebKitGTK, codecs, yt-dlp, ffmpeg)..."
    $SUDO dnf install -y webkit2gtk4.1 gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-libav yt-dlp ffmpeg-free || \
      $SUDO dnf install -y webkit2gtk4.1 gstreamer1-plugins-good gstreamer1-plugins-bad-free yt-dlp || say "Some packages failed; continuing (the app downloads yt-dlp itself if missing)."
  elif command -v apt-get >/dev/null; then
    say "Installing dependencies with apt (WebKitGTK, codecs, yt-dlp, ffmpeg)..."
    $SUDO apt-get update -y || true
    W=libwebkit2gtk-4.1-0; apt-cache show "$W" >/dev/null 2>&1 || W=libwebkit2gtk-4.0-37
    $SUDO apt-get install -y "$W" gstreamer1.0-plugins-good gstreamer1.0-plugins-bad gstreamer1.0-libav ffmpeg xdg-utils || say "Some packages failed; continuing."
    $SUDO apt-get install -y yt-dlp || say "yt-dlp not in your repos; the app downloads it on first use."
  elif command -v pacman >/dev/null; then
    say "Installing dependencies with pacman..."
    $SUDO pacman -S --needed --noconfirm webkit2gtk-4.1 gst-plugins-good gst-plugins-bad gst-libav yt-dlp ffmpeg || say "Some packages failed; continuing."
  elif command -v zypper >/dev/null; then
    say "Installing dependencies with zypper..."
    $SUDO zypper --non-interactive install libwebkit2gtk-4_1-0 gstreamer-plugins-good gstreamer-plugins-bad gstreamer-plugins-libav yt-dlp ffmpeg || say "Some packages failed; continuing."
  else
    say "Unknown package manager: install WebKitGTK 4.1, GStreamer good/bad/libav plugins, yt-dlp and ffmpeg yourself."
  fi
fi

# ---------- 2. the app ----------
say "Finding the latest Playlearn release..."
URL=$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" | grep -o '"browser_download_url": *"[^"]*\.AppImage"' | head -1 | sed -E 's/.*"(https[^"]*)"/\1/')
[ -n "$URL" ] || { echo "No AppImage found in the latest release."; exit 1; }

BIN="$HOME/.local/bin"; DATA="${XDG_DATA_HOME:-$HOME/.local/share}"; APP="$DATA/playlearn"
mkdir -p "$BIN" "$DATA/applications" "$DATA/icons/hicolor/256x256/apps"
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
say "Downloading $(basename "$URL")..."
curl -fL --progress-bar "$URL" -o "$TMP/pl.AppImage"
chmod +x "$TMP/pl.AppImage"
# unpack instead of mounting, so no FUSE is needed
rm -rf "$APP"; mkdir -p "$APP"
( cd "$TMP" && APPIMAGE_EXTRACT_AND_RUN=1 ./pl.AppImage --appimage-extract >/dev/null )
mv "$TMP/squashfs-root/"* "$APP/" 2>/dev/null || mv "$TMP/squashfs-root/".[!.]* "$APP/" 2>/dev/null || true
[ -x "$APP/AppRun" ] || { echo "Unpacking the AppImage failed."; exit 1; }
printf '#!/bin/sh\nexec "%s/AppRun" "$@"\n' "$APP" > "$BIN/playlearn"; chmod +x "$BIN/playlearn"
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
printf '\033[32m✓ Playlearn installed.\033[0m Open it from the app menu, or run: playlearn\n'
case ":$PATH:" in *":$BIN:"*) ;; *) echo "Note: add $BIN to your PATH to use the 'playlearn' command." ;; esac
