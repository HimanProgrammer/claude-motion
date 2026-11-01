# Claude Motion MCP connector — chat in Claude Desktop, edit live in Premiere / After Effects

```
Claude Desktop  ⇄ (MCP, stdio)  mcp/server.js  ⇄ (127.0.0.1:8765)  Claude Motion panel  ⇄  Premiere / After Effects
```

No npm install and no API key. It needs **Node.js 18+** (nodejs.org) and **Claude Desktop** (claude.ai/download).

## Setup (Windows)
1. Install Node.js (LTS) from https://nodejs.org.
2. Make sure the Claude Motion panel is installed and up to date (v1.3.0+). It updates itself when opened.
3. Open Claude Desktop and go to **Settings → Developer → Edit Config**. This opens `claude_desktop_config.json`.
4. Paste this, replacing `hb199` with your Windows user name:
```json
{
  "mcpServers": {
    "claude-motion": {
      "command": "node",
      "args": ["C:\\Users\\hb199\\AppData\\Roaming\\Adobe\\CEP\\extensions\\ClaudeMotion\\mcp\\server.js"]
    }
  }
}
```
   (If the file already has an `"mcpServers"` section, add only the `"claude-motion": {...}` entry inside it.)
5. Save the file and **fully quit** Claude Desktop (tray icon → Quit), then reopen it.
6. Open Premiere or After Effects → **Window → Extensions → Claude Motion**. The pill turns green: **● Desktop: connected**.

macOS path: `/Users/<you>/Library/Application Support/Adobe/CEP/extensions/ClaudeMotion/mcp/server.js`

## Use
In Claude Desktop, just ask:
- "What's on my Premiere timeline?"
- "Add cross dissolves between every clip on V1 and a marker at each cut"
- "Import the clips in C:\Reels\clips and build a 9:16 sequence"
- "In After Effects, make an animated title 'Creative Mind IT Services' that slides up with a glow"

Claude calls `get_project_state` and `run_extendscript`; each change shows up live, and the panel logs what ran.

## Tools
| Tool | What it does |
|---|---|
| `get_status` | Which apps have the panel connected |
| `get_project_state` | Active comp (AE) or sequence (Premiere) as JSON |
| `run_extendscript` | Runs a script in the app (one undo step in AE) |

## Troubleshooting
- **Pill says "Desktop: off"**: Claude Desktop isn't running, or the config path is wrong. Check Settings → Developer for errors.
- **"port 8765 in use"**: another copy is running; quit Claude Desktop fully and reopen.
- To pause control, untick "Allow Claude Desktop…" in the panel's ⚙ Settings.
