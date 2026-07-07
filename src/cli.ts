#!/usr/bin/env node

import * as fs from "fs";
import * as path from "path";
import { Command } from "commander";
import { spawn, execSync } from "child_process";
import {
  BASE_DIR,
  SESSIONS_DIR,
  CONFIG_PATH,
  DAEMON_PID_PATH,
  INSTALLED_HOOKS_PATH,
  CLAUDE_SETTINGS_PATH,
} from "./paths";
import { readConfig, writeConfig, updateConfig, Config } from "./config";

const REPORTER_PATH = path.join(__dirname, "reporter.js");
const DAEMON_PATH = path.join(__dirname, "daemon.js");

const HOOK_EVENTS = ["SessionStart", "UserPromptSubmit", "PreToolUse", "Notification", "Stop", "SessionEnd"];

interface InstalledHook {
  event: string;
  matcher?: string;
}

function ensureDirs(): void {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function readClaudeSettings(): Record<string, unknown> {
  try {
    if (fs.existsSync(CLAUDE_SETTINGS_PATH)) {
      return JSON.parse(fs.readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
    }
  } catch {
    // fall through
  }
  return {};
}

function writeClaudeSettings(settings: Record<string, unknown>): void {
  const dir = path.dirname(CLAUDE_SETTINGS_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");
}

function readInstalledHooks(): InstalledHook[] {
  try {
    if (fs.existsSync(INSTALLED_HOOKS_PATH)) {
      return JSON.parse(fs.readFileSync(INSTALLED_HOOKS_PATH, "utf-8"));
    }
  } catch {
    // fall through
  }
  return [];
}

function writeInstalledHooks(hooks: InstalledHook[]): void {
  fs.writeFileSync(INSTALLED_HOOKS_PATH, JSON.stringify(hooks, null, 2), "utf-8");
}

function isDaemonRunning(): boolean {
  try {
    if (!fs.existsSync(DAEMON_PID_PATH)) return false;
    const pid = parseInt(fs.readFileSync(DAEMON_PID_PATH, "utf-8").trim(), 10);
    if (isNaN(pid)) return false;
    process.kill(pid, 0); // signal 0 checks existence
    return true;
  } catch {
    return false;
  }
}

function getDaemonPid(): number | null {
  try {
    if (!fs.existsSync(DAEMON_PID_PATH)) return null;
    return parseInt(fs.readFileSync(DAEMON_PID_PATH, "utf-8").trim(), 10);
  } catch {
    return null;
  }
}

function startDaemon(): void {
  const child = spawn(process.execPath, [DAEMON_PATH], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  child.unref();
  console.log(`Daemon started (PID: ${child.pid})`);
}

function stopDaemon(): void {
  const pid = getDaemonPid();
  if (!pid) {
    console.log("Daemon is not running (no PID file).");
    return;
  }
  try {
    process.kill(pid, "SIGTERM");
    console.log(`Sent SIGTERM to daemon (PID: ${pid})`);
  } catch {
    console.log(`Daemon process ${pid} not found or already stopped.`);
  }
  try { fs.unlinkSync(DAEMON_PID_PATH); } catch { /* ignore */ }
}

// ---- CLI Commands ----

const program = new Command();
program.name("claude-code-discord-rpc").version("1.0.0");

program
  .command("install")
  .description("Install hooks into Claude Code settings and start the daemon")
  .option("--client-id <id>", "Discord Application Client ID")
  .action((opts: { clientId?: string }) => {
    ensureDirs();

    // Save client ID if provided
    if (opts.clientId) {
      updateConfig({ discordClientId: opts.clientId });
      console.log(`Discord Client ID saved: ${opts.clientId}`);
    }

    const config = readConfig();
    if (!config.discordClientId) {
      console.log(
        "Warning: No Discord Client ID configured.\n" +
          "Run: claude-code-discord-rpc config set-client-id <your-client-id>"
      );
    }

    // Merge hooks into Claude settings
    const settings = readClaudeSettings();
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};

    const installed: InstalledHook[] = [];

    for (const event of HOOK_EVENTS) {
      const hookHandler = {
        type: "command",
        command: "node",
        args: [REPORTER_PATH],
        async: true,
        timeout: 5,
      };

      const matcherGroup: Record<string, unknown> = {
        hooks: [hookHandler],
      };
      if (event !== "UserPromptSubmit" && event !== "Stop") {
        matcherGroup.matcher = "*";
      }

      // Each event is an array of matcher groups
      hooks[event] = [matcherGroup];
      installed.push({ event, matcher: matcherGroup.matcher as string | undefined });
    }

    settings.hooks = hooks;
    writeClaudeSettings(settings);
    writeInstalledHooks(installed);

    console.log("Hooks installed into ~/.claude/settings.json");

    // Start daemon
    if (!isDaemonRunning()) {
      startDaemon();
    } else {
      console.log("Daemon is already running.");
    }

    console.log("Installation complete!");
  });

program
  .command("uninstall")
  .description("Remove hooks from Claude Code settings and stop the daemon")
  .action(() => {
    // Remove hooks
    const settings = readClaudeSettings();
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
    const installed = readInstalledHooks();

    for (const ih of installed) {
      delete hooks[ih.event];
    }

    if (Object.keys(hooks).length === 0) {
      delete settings.hooks;
    } else {
      settings.hooks = hooks;
    }

    writeClaudeSettings(settings);
    writeInstalledHooks([]);

    console.log("Hooks removed from ~/.claude/settings.json");

    // Stop daemon
    stopDaemon();

    console.log("Uninstall complete!");
  });

program
  .command("start")
  .description("Start the Discord RPC daemon")
  .action(() => {
    ensureDirs();
    if (isDaemonRunning()) {
      console.log("Daemon is already running.");
      return;
    }
    startDaemon();
  });

program
  .command("stop")
  .description("Stop the Discord RPC daemon")
  .action(() => {
    stopDaemon();
  });

program
  .command("status")
  .description("Show daemon and session status")
  .action(() => {
    const running = isDaemonRunning();
    console.log(`Daemon: ${running ? "running" : "not running"}`);

    try {
      if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
        console.log(`Active sessions: ${files.length}`);
        for (const f of files) {
          try {
            const s = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
            console.log(`  - ${s.project}: ${s.status} (${s.details})`);
          } catch {
            // skip
          }
        }
      } else {
        console.log("Active sessions: 0");
      }
    } catch {
      console.log("Active sessions: 0");
    }

    const config = readConfig();
    console.log(`Discord Client ID: ${config.discordClientId || "(not set)"}`);
  });

program
  .command("doctor")
  .description("Run diagnostics")
  .action(() => {
    const config = readConfig();
    const running = isDaemonRunning();

    console.log("=== Claude Code Discord RPC Diagnostics ===\n");

    // Config check
    console.log(`Config file: ${CONFIG_PATH}`);
    if (config.discordClientId) {
      console.log(`  Discord Client ID: ${config.discordClientId} ✓`);
    } else {
      console.log("  Discord Client ID: NOT SET ✗");
      console.log("  → Run: claude-code-discord-rpc config set-client-id <id>");
    }

    // Claude settings check
    console.log(`\nClaude settings: ${CLAUDE_SETTINGS_PATH}`);
    const settings = readClaudeSettings();
    const hooks = (settings.hooks as Record<string, unknown[]>) ?? {};
    const installed = readInstalledHooks();
    const installedEvents = installed.map((h) => h.event);
    const allPresent = HOOK_EVENTS.every((e) => hooks[e] && Array.isArray(hooks[e]));
    if (allPresent && installedEvents.length === HOOK_EVENTS.length) {
      console.log("  Hooks: installed ✓");
    } else {
      console.log("  Hooks: NOT installed ✗");
      console.log("  → Run: claude-code-discord-rpc install");
    }

    // Daemon check
    console.log(`\nDaemon PID file: ${DAEMON_PID_PATH}`);
    console.log(`  Status: ${running ? "running ✓" : "not running ✗"}`);
    if (!running) {
      console.log("  → Run: claude-code-discord-rpc start");
    }

    // Sessions check
    console.log(`\nSessions directory: ${SESSIONS_DIR}`);
    try {
      if (fs.existsSync(SESSIONS_DIR)) {
        const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
        console.log(`  Active sessions: ${files.length}`);
      } else {
        console.log("  Active sessions: 0");
      }
    } catch {
      console.log("  Active sessions: 0");
    }

    // Discord connectivity hint
    console.log("\n=== Checklist ===");
    console.log(`1. Discord Desktop running: check`);
    console.log(`2. Discord Application created: ${config.discordClientId ? "yes" : "NO - create at https://discord.com/developers/applications"}`);
    console.log(`3. Rich Presence asset "claude_code_icon" uploaded: check in Developer Portal > your app > Rich Presence > Art Assets`);
    console.log("");
  });

program
  .command("config")
  .description("Manage configuration")
  .argument("[action]", "set-client-id")
  .argument("[value]", "Client ID value")
  .action((action?: string, value?: string) => {
    if (action === "set-client-id") {
      if (!value) {
        console.log("Usage: claude-code-discord-rpc config set-client-id <client-id>");
        return;
      }
      updateConfig({ discordClientId: value });
      console.log(`Discord Client ID set to: ${value}`);
    } else {
      const config = readConfig();
      console.log(JSON.stringify(config, null, 2));
    }
  });

program.parse();
