# Claude Motion — one Claude panel for After Effects & Premiere Pro

A single CEP extension that runs in **both After Effects (2019+) and Premiere Pro (2020+)**.
You type what you want ("slide-in lower third", "cross dissolves on V1", "wiggle the selected layers"),
Claude sees your active comp/sequence and writes an ExtendScript, and the panel runs it in the app.

## Features
- One panel, two hosts. It detects the app and adjusts the presets and Claude's instructions.
- Sends Claude the project state: comp layers, timing and selection in AE; tracks, clips and playhead in Premiere.
- Scripts run on a button click, or automatically if you turn that on. In After Effects each run is a single undo step (Ctrl/⌘+Z).
- **Ask Claude to fix**: when a script errors, one click sends the error back to Claude.
- Ready-made presets for common editing and motion graphics jobs.
- Choose Opus 5.5, Sonnet 5.5 or Haiku 5.5.

## Install (unsigned / development)
1. Turn on unsigned extensions:
   - **Windows:** `reg add HKCU\Software\Adobe\CSXS.11 /v PlayerDebugMode /t REG_SZ /d 1 /f` (also run it for CSXS.10 and CSXS.12)
   - **macOS:** `defaults write com.adobe.CSXS.11 PlayerDebugMode 1` (also for 10 and 12)
2. Download this repo (Code → Download ZIP), unzip it, and copy the folder to:
   - **Windows:** `%APPDATA%\Adobe\CEP\extensions\ClaudeMotion`
   - **macOS:** `~/Library/Application Support/Adobe/CEP/extensions/ClaudeMotion`
3. Restart AE or Premiere and open **Window → Extensions → Claude Motion**.
4. Click ⚙, paste your Anthropic API key (console.anthropic.com), then **Save**.
5. After Effects only: turn on *Preferences → Scripting & Expressions → Allow Scripts to Write Files and Access Network*.

To distribute it, sign the folder into a `.zxp` with Adobe's `ZXPSignCmd`.

## Files
| File | Purpose |
|---|---|
| `CSXS/manifest.xml` | Registers the panel for AEFT and PPRO |
| `index.html`, `css/style.css` | Panel UI |
| `js/main.js` | Chat, Claude API calls, code extraction, running scripts |
| `jsx/host.jsx` | ExtendScript bridge: `cm_getContext()` and `cm_run(code)` |
| `.debug` | Remote debugging ports (AE 8088, PPro 8089 → http://localhost:8088) |

## Safety notes
- Your API key is stored only in the panel's local storage on your machine.
- Read generated scripts before you run them, and save your project first. Auto-run is off by default.
