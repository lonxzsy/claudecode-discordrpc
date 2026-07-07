# claude-code-discord-rpc

Discord Rich Presence for Claude Code — show what Claude is doing in real time.

Displays in your Discord status:
- Which project Claude is working on
- What action is being performed (editing a file, running a command, searching, etc.)
- The specific file being edited/read
- How long the session has been active

## Prerequisites

- **Node.js >= 18**
- **Discord Desktop** running on the same machine
- A **Discord Application** with Rich Presence enabled

## Setup

### 1. Create a Discord Application

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click **New Application** and give it a name (e.g. "Claude Code")
3. Copy the **Client ID** from the General Information page
4. Go to **Rich Presence > Art Assets** and upload the images below
5. Optionally add a description for each asset

### 1.1 Upload Art Assets

Go to **Rich Presence > Art Assets** and upload all of these images (110x110 px, PNG/JPG/WebP):

| Asset Key | Description | Shown When |
|-----------|-------------|------------|
| `claude_code_icon` | Claude Code logo (512x512, large) | Always (main image) |
| `icon_idle` | Pause / zzz | Idle, session start, session stop |
| `icon_thinking` | Brain / lightbulb | Claude is thinking about your prompt |
| `icon_terminal` | Terminal console | Running a Bash command |
| `icon_pencil` | Pencil | Editing / writing a file |
| `icon_book` | Open book | Reading a file |
| `icon_search` | Magnifying glass | Searching codebase (Grep/Glob) |
| `icon_globe` | Globe | Browsing the web (WebFetch/WebSearch) |
| `icon_robot` | Robot | Running a sub-agent (Task) |
| `icon_plugin` | Puzzle piece | Using an MCP tool |
| `icon_wrench` | Wrench | Using any other tool |
| `icon_bell` | Bell | Waiting for your input (Notification) |

### 2. Install

```bash
npm install -g claude-code-discord-rpc
```

Or link locally:

```bash
cd claude-code-discord-rpc
npm install
npm link
```

### 3. Configure & Install

```bash
claude-code-discord-rpc install --client-id YOUR_DISCORD_CLIENT_ID
```

This will:
- Save your Client ID to `~/.claude-code-rpc/config.json`
- Add hook entries to `~/.claude/settings.json` (merges with existing settings, does not overwrite)
- Start the background daemon

### 4. Verify

```bash
claude-code-discord-rpc doctor
```

This runs diagnostics and tells you if everything is set up correctly.

## Usage

Once installed, start Claude Code as usual. Your Discord status will automatically update to show what Claude is doing.

### Commands

| Command | Description |
|---------|-------------|
| `claude-code-discord-rpc install --client-id <id>` | Install hooks and start daemon |
| `claude-code-discord-rpc uninstall` | Remove hooks and stop daemon |
| `claude-code-discord-rpc start` | Start the daemon |
| `claude-code-discord-rpc stop` | Stop the daemon |
| `claude-code-discord-rpc status` | Show daemon and session status |
| `claude-code-discord-rpc doctor` | Run diagnostics |
| `claude-code-discord-rpc config set-client-id <id>` | Set Discord Client ID |

### Configuration

Config file: `~/.claude-code-rpc/config.json`

```json
{
  "discordClientId": "your-client-id",
  "privacy": {
    "showCommandText": false,
    "showFullPaths": false
  },
  "idleTimeoutMinutes": 10
}
```

- `showCommandText` — Show bash command text in Discord (default: `false`)
- `showFullPaths` — Show full file paths instead of just filenames (default: `false`)

## How It Works

```
Claude Code --(hook event, JSON via stdin)--> reporter.js --(writes file)-->
~/.claude-code-rpc/sessions/<session_id>.json --(daemon.js watches)-->
Discord Rich Presence (via @xhayper/discord-rpc)
```

- **reporter.js** — Called by Claude Code hooks on each event. Reads JSON from stdin, writes session state to a file. Exits in milliseconds, never crashes the host process.
- **daemon.js** — Long-running process that watches session files and updates Discord via IPC. Retries Discord connection if Discord is not running.
- **cli.js** — Management commands for install/uninstall/daemon control.

## Development

```bash
git clone https://github.com/your-username/claude-code-discord-rpc.git
cd claude-code-discord-rpc
npm install
npm run build
```

### Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Build with tsup |
| `npm run dev` | Watch mode |
| `npm run typecheck` | Type-check with tsc |

## Uninstall

```bash
claude-code-discord-rpc uninstall
```

This removes all hooks from `~/.claude/settings.json` (only the ones added by this tool) and stops the daemon.

## Privacy

By default, this tool does **not** show:
- The content of bash commands you run
- Full file paths (only basenames are shown)

These can be enabled in the config if desired.

## License

[MIT](LICENSE)
