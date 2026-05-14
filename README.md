<div align="center">

```
  ____             _     ____  _     _  __ _   
 |  _ \  ___   ___| | __/ ___|| |__ (_)/ _| |_ 
 | | | |/ _ \ / __| |/ /\___ \| '_ \| | |_| __|
 | |_| | (_) | (__|   <  ___) | | | | |  _| |_ 
 |____/ \___/ \___|_|\_\|____/|_| |_|_|_|  \__|
```

### A sleek, floating productivity dock for Windows

[![Electron](https://img.shields.io/badge/Electron-40.x-47848F?style=for-the-badge&logo=electron&logoColor=white)](https://www.electronjs.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-5-646CFF?style=for-the-badge&logo=vite&logoColor=white)](https://vitejs.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge&logo=windows&logoColor=white)](https://www.microsoft.com/windows)

**A floating dock for Windows, built around three things it does well:**<br/>
persistent clipboard history · one-click workspace snapshots · a floating AI assistant with clipboard context<br/>
<sub>…plus screenshots, voice-to-text, notes, a launcher, and lightweight terminal & browser panels.</sub>

> **Windows only.** DockShift relies on Win32 / PowerShell window tracking and Windows
> clipboard internals — macOS and Linux are not supported.

[Getting Started](#-getting-started) · [Features](#-features) · [Architecture](#-architecture) · [Contributing](#-contributing)

</div>

---

<br/>

<div align="center">
<img src="assets/dock-bar.png" alt="DockShift Bar" width="85%" />
<p><em>The dock bar — minimal, elegant, always within reach</em></p>
</div>

<br/>

## ✨ What is DockShift?

DockShift is a **macOS-inspired floating dock** for Windows. It hovers above all windows as a
sleek, dark bar — click any icon to launch a draggable, resizable panel.

The dock bundles a handful of tools, but it's strongest at three of them:

- **📋 Clipboard history** — persistent, type-aware, with image previews. The standout feature.
- **📁 Workspace snapshots** — save and restore your open apps and window layout in one click.
  There's no built-in Windows equivalent.
- **✨ Floating AI assistant** — Gemini chat that can act on whatever's in your clipboard,
  without leaving your current app.

The remaining panels (screenshots, voice-to-text, notes, launcher) are solid for quick tasks.
The **terminal and browser panels are intentionally lightweight** — handy for a quick command
or doc lookup, not a replacement for Windows Terminal or a real browser.

Built with **Electron + React + Vite**, it features a dark UI with smooth animations and runs
as a lightweight overlay that stays out of your way until you need it.

<br/>

## 🎨 Features

<table>
<tr>
<td width="50%">

### ✨ AI Assistant
Chat with **Gemini 2.5 Flash** directly from your dock. Quick actions let you summarize, translate, fix code, or explain anything from your clipboard — fills your input so you can edit before sending.

</td>
<td width="50%">

### 📋 Clipboard History
System-wide clipboard manager tracking **text, images, files, links, and hex colors**. Filter by type, click any item to copy. Click images for a **fullscreen preview**. Stores up to 200 entries with intelligent deduplication.

</td>
</tr>
<tr>
<td>

### 🖥️ Terminal *(lightweight)*
An **xterm.js** terminal powered by **node-pty** for quick one-off commands. Single session, no tabs or splits — for serious terminal work, use Windows Terminal.

</td>
<td>

### 🌐 Browser *(lightweight)*
A sandboxed `webview` with a URL bar, bookmarks, and history — handy for a quick docs lookup. No extensions or autofill; it's not a daily-driver browser.

</td>
</tr>
<tr>
<td>

### 📸 Screenshots
Capture **full screen** or **individual windows** instantly. Screenshots are saved, thumbnailed, and browsable from a gallery. Click to **preview fullscreen**, copy, open in explorer, or delete.

</td>
<td>

### 🎤 Voice to Text
Speech recognition powered by **Gemini AI**. Record audio, get transcription via the main process — your API key never touches the renderer.

</td>
</tr>
<tr>
<td>

### 📝 Quick Notes
A rich-text note editor with **WYSIWYG formatting** — headings, bold, italic, lists, code blocks, blockquotes, and checkboxes. Pin important notes to the top.

</td>
<td>

### ⚡ Quick Launcher
Spotlight/PowerToys-style **app launcher**. Searches your Start Menu and system apps with fuzzy matching. Navigate with keyboard, press Enter to launch.

</td>
</tr>
<tr>
<td>

### 📁 Workspace Snapshots
Save and restore your **entire desktop workspace** — open applications, window positions, and dock state. Switch between project contexts in seconds.

</td>
<td>

### ⚙️ Settings
Configure dock position, always-on-top behavior, launch-on-startup, clipboard limits, and view keyboard shortcuts. All preferences persist across sessions.

</td>
</tr>
</table>

<br/>

<div align="center">
<img src="assets/ai-panel.png" alt="AI Panel" width="45%" />
&nbsp;&nbsp;&nbsp;
<img src="assets/settings-panel.png" alt="Settings Panel" width="45%" />
<p><em>AI Assistant and Settings panels — draggable, resizable, clean dark UI</em></p>
</div>

<br/>

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ and **npm**
- **Windows 10/11** (primary platform)
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey) (for AI & voice features)

### Installation

```bash
# Clone the repository
git clone https://github.com/Salah-XD/dockshift.git
cd dockshift

# Install dependencies
npm install

# Configure your API key
cp .env.example .env
# Edit .env and add your Gemini API key
```

### Running in Development

```bash
# Start both Vite dev server and Electron
npm run dev

# Or run them separately:
npm run dev:vite     # Start Vite (React HMR)
npm run dev:electron # Start Electron
```

### Building a Windows installer

```bash
npm run dist       # builds the renderer + a Windows NSIS installer & portable build → release/
npm run dist:dir   # unpacked build (faster, for local testing)
```

> Packaging requires an app icon at `assets/icon.ico`. Releases are also built automatically
> by the GitHub Actions workflow when a `v*` tag is pushed.

### Keyboard Shortcut

| Shortcut | Action |
|---|---|
| `Ctrl + Shift + D` | Toggle dock visibility |

<br/>

## 🏗️ Architecture

```
dockshift/
├── electron-main.js          # Main process — IPC handlers, window management
├── preload.js                # Secure bridge between main & renderer
├── src/
│   ├── App.jsx               # Root component
│   ├── main.jsx              # React entry point
│   ├── components/
│   │   ├── DockMenu.jsx      # The dock bar with all icons
│   │   ├── ResizablePanel.jsx # Shared draggable + resizable panel wrapper
│   │   ├── AiPanel.jsx       # AI chat interface
│   │   ├── ClipboardPanel.jsx # Clipboard history
│   │   ├── TerminalPanel.jsx  # Integrated terminal
│   │   ├── BrowserPanel.jsx   # Built-in browser
│   │   ├── ScreenshotPanel.jsx # Screenshot capture
│   │   ├── VoicePanel.jsx     # Voice-to-text
│   │   ├── NotesPanel.jsx     # Rich text notes
│   │   ├── LauncherPanel.jsx  # App launcher
│   │   ├── WorkspacePanel.jsx # Workspace snapshots
│   │   └── SettingsPanel.jsx  # Settings
│   ├── hooks/
│   │   └── usePanelPosition.js # Dragging + positioning logic
│   ├── workspace/
│   │   ├── SnapshotManager.js  # Save/load workspace snapshots
│   │   ├── WindowTracker.js    # Track open windows
│   │   └── TerminalManager.js  # Terminal session management
│   └── styles/
│       ├── global.css
│       ├── DockMenu.css
│       ├── panels.css          # Panel animations & shared styles
│       └── ...
├── .env.example              # API key template
└── package.json
```

### Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Framework** | Electron 40 | Desktop app shell, system APIs |
| **UI** | React 18 | Component-based UI |
| **Build** | Vite 5 | Fast HMR & bundling |
| **Terminal** | xterm.js + node-pty | Embedded terminal emulator |
| **AI** | Google Gemini 2.5 Flash | AI chat, text processing & voice transcription |
| **Panels** | re-resizable | Resizable panel containers |

<br/>

## 🔒 Security

DockShift takes security seriously, especially as a desktop application with system-level access:

| Measure | Details |
|---|---|
| **Context Isolation** | Renderer runs in a sandboxed context with `contextIsolation: true` |
| **IPC Allowlists** | Both `invoke()` and `send()` channels are allowlisted in the preload script |
| **No Node Integration** | Renderer has no direct access to Node.js APIs |
| **Env Filtering** | Sensitive environment variables (API keys, tokens) are stripped from PTY sessions |
| **Input Validation** | Shell commands use argument arrays (no string interpolation) to prevent injection |
| **Path Traversal Protection** | File operations validate paths are within expected directories |
| **Webview Sandboxing** | Browser panel uses isolated partition and blocks dangerous URL schemes |
| **API Key Safety** | `.env` is gitignored; all API calls go through the main process — keys never touch the renderer |

<br/>

## 🎮 Usage Tips

- **Drag panels freely** — grab any panel header to move it anywhere on screen
- **Resize from any edge** — all panels support 8-direction resizing
- **Toggle with hotkey** — `Ctrl+Shift+D` hides/shows the dock instantly
- **Clipboard auto-tracks** — just copy anything on your system and it appears in history
- **Click images to preview** — clipboard images and screenshots open in a fullscreen overlay
- **Quick AI actions** — click a suggestion to fill your prompt, edit it, then send
- **Keyboard launcher** — type to search, arrow keys to navigate, Enter to launch

<br/>

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/amazing-feature`)
3. **Commit** your changes (`git commit -m 'Add amazing feature'`)
4. **Push** to the branch (`git push origin feature/amazing-feature`)
5. **Open** a Pull Request

### Development Notes

- The app uses ES Modules (`"type": "module"` in package.json)
- Preload script uses CommonJS (required by Electron)
- `node-pty` requires native compilation — run `npm install` with build tools available
- Hot reload works for the React UI; Electron main process requires restart

<br/>

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

<br/>

---

<div align="center">

**Built with ❤️ and way too much coffee**

<sub>DockShift — because Alt+Tab is so last decade.</sub>

</div>
