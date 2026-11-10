# Playlearn

<p align="center"><img src="assets/icon-256.png" width="128" alt="Playlearn icon"></p>

Turn any **YouTube playlist** into a **Udemy-style course** on your Linux or Windows desktop.
Paste a playlist link and get a classroom with sections, lesson checklist, progress tracking,
notes and a custom video player. Everything about your courses is stored locally on your computer.

Built in Rust ([Tauri](https://tauri.app)) for Linux and Windows. Developed and tested on Fedora.

## Features

- **Home page** – course grid with progress bars, "Continue learning" banner, add-playlist box
- **Udemy-like course page** – dark top bar with progress ring, video on the left,
  *Course content* sidebar (sections of 10 lessons, checkboxes, durations), Overview and Notes tabs
- **Import a playlist three ways** – paste a link, drag a link onto the window,
  or run `playlearn "https://www.youtube.com/playlist?list=..."`
- **Progress saved locally** – completed lessons, resume position, last lesson watched, per-lesson notes
- **Custom player** – play/pause, ±10s skip, seek bar with buffer, volume, speed, fullscreen,
  **captions** (on/off + language) and **auto-dubbed audio** switching; your choices are remembered
- **Autoplay next lesson**, auto-complete at ~92 % watched
- **Built-in ad blocker (always on, no setup)** – ad data is stripped from the player before any ad is scheduled, ad and tracking requests are blocked, and an in-player skipper handles anything left. Same blocker on Windows, Linux and Android (best effort)
- **Back button** on the course page (also `Esc` / `Alt+←`)

- **Custom courses** – no single playlist? Click **+ Custom course from individual videos** on Home, name it and paste any mix of video links (youtube.com, youtu.be, shorts) – one per line, from any channel. Playlist links in the mix add all their videos. Later, use **+ Add videos** in the course sidebar (or drop a link onto the window) to keep adding; hover a lesson to move it up/down or remove it, and rename the course on the Overview tab. Progress, notes, chapters, downloads and search work exactly like playlist courses
- **Article notes** – paste any article or blog link into a custom course (mixed in with videos, in any order) and Playlearn fetches the page and turns it into a clean, Notion-style note page: headings, lists, quotes, code and images, with no ads or menus. Hover a block to **highlight** it, add a **comment** under it, or **hide** it; click any text to edit it. Your reading position is remembered, scrolling to the end marks it read, search finds text inside articles, and **Copy as Markdown** exports the page (with your highlights and comments) for Notion or Obsidian
- **Playlist refresh** – picks up videos the creator adds later without touching your progress. The **↻** button on a course card (or **Refresh all** on Home), and **Refresh playlist** on the Overview tab, re-read the playlist; opening a course also checks automatically, at most once a day. New lessons get a **New** badge for a week; lessons that left the playlist are dropped, unless you have progress, notes or a download for them (those stay, marked *removed*)
- **Chapters on the seek bar** – videos with chapters get tick marks on the seek bar, a hover tooltip with time + chapter title, the current chapter name next to the time, a chapters menu, and `[` / `]` to jump between chapters (chapters are read with yt-dlp the first time a lesson opens, then cached)
- **Lesson search** – search box above the lesson list (`/` or `Ctrl+F`) matches lesson titles, your notes (general and timestamped) and chapter names, highlights matches, and jumps straight to the note/chapter moment when you click a result
- **Dark mode** – toggle in the top bar (sun/moon button); follows your system setting the first time and is remembered
- **Offline downloads** – download any lesson (arrow next to it) or the whole course (Overview tab). Offline lessons play in the same custom player with no internet, no ads and no YouTube page around them, keep captions (English) when available, and are used automatically

### Built for studying without distractions

- **Focus mode** (`Z`) – hides everything except the video; `Z` or `Esc` exits
- **No YouTube suggestions** – YouTube's pause/end-screen recommendation walls are hidden; at the end of a lesson you get a clean "Lesson complete" card with a Next button
- **Study timer** – Pomodoro presets (25/5, 50/10, 90/15) with automatic breaks; on GNOME it turns on **Do Not Disturb** while you study and restores your setting afterwards (even after a crash)
- **Timestamped notes** (`N`) – jot a note at the current second, click it later to jump back, and export all notes as Markdown

## Install

### Linux (x86_64)

One command, no root needed. It downloads the latest AppImage, puts a `playlearn` command in `~/.local/bin` and adds **Playlearn** to your app menu:

```bash
curl -fsSL https://raw.githubusercontent.com/rave10x/playlearn/main/install.sh | bash
```

Needs **WebKitGTK 4.1** (Fedora: `sudo dnf install webkit2gtk4.1`, Ubuntu/Debian: `sudo apt install libwebkit2gtk-4.1-0`).
For smooth YouTube playback you also need the GStreamer codec plugins (Fedora: `sudo dnf install gstreamer1-plugins-good gstreamer1-plugins-bad-free gstreamer1-libav` plus RPM Fusion for H.264).
You can also grab the `.deb` / `.rpm` / `.AppImage` from the [Releases](https://github.com/rave10x/playlearn/releases) page.
Run the same command again to update.

Importing playlists uses **yt-dlp** – `sudo dnf install yt-dlp` (if it's missing, the app downloads it on first import).

### Windows

One PowerShell command (downloads the latest release and installs it for your user, no admin needed):

```powershell
irm https://raw.githubusercontent.com/rave10x/playlearn/main/install.ps1 | iex
```

Or download the `-setup.exe` / `.msi` from the [Releases](https://github.com/rave10x/playlearn/releases) page.
yt-dlp is downloaded on first use. For 720p downloads install ffmpeg: `winget install Gyan.FFmpeg`.

### Build from source

Needs Rust and Node. On Linux also install the Tauri dependencies (Fedora: `sudo dnf install webkit2gtk4.1-devel gtk3-devel librsvg2-devel libappindicator-gtk3-devel openssl-devel`).

```bash
git clone https://github.com/rave10x/playlearn.git
cd playlearn
npm install        # Tauri CLI
npm run dev        # run in development
npm run build      # installers in target/release/bundle/
```

## Usage

1. Open **Playlearn**.
2. Paste a playlist URL (must contain `?list=...`) and press **Create course**.
3. Click a course card to open it. Pick lessons from the right-hand *Course content* list.
4. Tick lessons manually, or let them complete automatically as you watch.

### Keyboard shortcuts

| Key | Action |
|---|---|
| `Space` / `K` | Play / pause |
| `J` / `L` | Back / forward 10 s |
| `←` / `→` | Back / forward 5 s |
| `↑` / `↓` | Volume ±5 |
| `M` | Mute |
| `F` | Fullscreen |
| `C` | Toggle captions |
| `Z` | Focus mode |
| `[` / `]` | Previous / next chapter |
| `/` or `Ctrl+F` | Search lessons |
| `N` | Add a note at the current time |
| `<` / `>` (or `,` / `.`) | Slower / faster |
| `Shift+N` / `Shift+P` | Next / previous lesson |
| `Esc` / `Alt+←` | Back to home |

### Captions & auto-dubbed audio

In the player bar, the **CC** button chooses caption language (or Off) and the **globe** button
lists the video's audio tracks, including YouTube's auto-dubbed languages. Choosing a dubbed
language applies it to every lesson that offers it; choosing the original track clears the preference.
Availability depends on the video – not every video has captions or dubs.

## Offline downloads

Downloads use `yt-dlp` and are saved next to your course data:

```
~/.config/Playlearn/downloads/<playlist-id>/<video-id>.mp4
```

- Click the **↓** button next to a lesson to download it, click it again while it downloads to cancel, or when done to remove it (confirm with a second click).
- Overview tab → **Offline downloads**: download everything, cancel, open the folder, remove all.
- Without `ffmpeg`, downloads are limited to 360p. For up to 720p: `sudo dnf install ffmpeg-free` (Linux) or `winget install Gyan.FFmpeg` (Windows).
- Deleting a course also deletes its downloads. Please respect creators' rights and YouTube's Terms of Service; downloads are meant for your own offline study.

## Where is my data?

Courses are plain JSON files:

```
~/.config/Playlearn/courses/<playlist-id>.json          (Linux)
%APPDATA%\Playlearn\courses\<playlist-id>.json          (Windows)
```

> Upgrading from the old name "YT Course"? Courses in `~/.config/YT Course/` are copied over automatically on first launch.

Each file holds the lesson list, completed flags, resume positions and notes. Delete a course from
the Home page (hover a card → bin icon → click again), or remove its file. Back the folder up to keep your progress.

## How it works

- The Rust backend runs `yt-dlp --flat-playlist -J` to read the playlist metadata (titles, durations).
- The video plays through YouTube's embedded player, served from a small local HTTP server
  (YouTube blocks embeds from `file://`), with the default controls hidden and replaced by custom ones.
- Videos stream from YouTube unless you download them, so **watching needs an internet connection** unless a lesson is saved offline.

## Limitations

- Videos whose owners disabled embedding can't be streamed in the app (download them to play offline).
- Private / deleted videos are skipped on import.
- Refresh needs internet and `yt-dlp`; if the playlist can't be read, nothing is changed.
- Some ads are stitched into the stream and can't be blocked by URL; the skipper handles most of them.

## Project layout

```
core/            Rust backend: storage, yt-dlp import, downloads, backups, article reader, local HTTP API, Do Not Disturb
src-tauri/       Tauri shell: window, single instance, file dialogs, hidden article browser
renderer/        UI (index.html, styles.css, app.js, reader.js, pl-shim.js)
assets/          App icon (SVG, PNG sizes, ICO)
install.sh       Linux one-line installer (AppImage)
install.ps1      Windows one-line installer
```

## Uninstall

```bash
rm -f ~/.local/bin/playlearn ~/.local/share/applications/playlearn.desktop
rm -f ~/.local/share/icons/hicolor/*/apps/playlearn.*
rm -rf ~/.config/"Playlearn"      # also deletes your saved courses

Windows: uninstall Playlearn from Settings → Apps.
```

## Disclaimer

This is an unofficial tool, not affiliated with YouTube or Udemy. Videos are played through YouTube's
official embedded player. Respect creators and YouTube's Terms of Service.

## License

MIT
