import * as fs from "fs";
import * as path from "path";
import { Client } from "@xhayper/discord-rpc";
import * as chokidar from "chokidar";
import { SESSIONS_DIR, DAEMON_PID_PATH, BASE_DIR } from "./paths";
import { readConfig, Config } from "./config";

interface SessionState {
  project: string;
  cwd: string;
  status: string;
  details: string;
  state: string | null;
  small_image_key: string | null;
  small_image_text: string | null;
  session_start: number;
  updated_at: number;
}

let rpc: Client | null = null;
let config: Config = readConfig();
let connected = false;
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let watcher: chokidar.FSWatcher | null = null;
let lastLogTime = 0;

function log(msg: string): void {
  const now = Date.now();
  if (now - lastLogTime < 60_000) return; // throttle to once per minute
  lastLogTime = now;
  console.log(`[daemon] ${msg}`);
}

function debug(msg: string): void {
  if (process.env.DEBUG) console.log(`[daemon:debug] ${msg}`);
}

function writePid(): void {
  try {
    fs.mkdirSync(BASE_DIR, { recursive: true });
    fs.writeFileSync(DAEMON_PID_PATH, String(process.pid), "utf-8");
  } catch {
    // ignore
  }
}

function removePid(): void {
  try {
    if (fs.existsSync(DAEMON_PID_PATH)) fs.unlinkSync(DAEMON_PID_PATH);
  } catch {
    // ignore
  }
}

async function connectDiscord(): Promise<void> {
  if (connected || retryTimer) return;

  const clientId = config.discordClientId;
  if (!clientId) {
    log("No discordClientId configured. Run: claude-code-discord-rpc config set-client-id <id>");
    return;
  }

  try {
    rpc = new Client({ transport: { type: "ipc" }, clientId });
    rpc.on("disconnected", () => {
      log("Disconnected from Discord");
      connected = false;
      rpc = null;
      scheduleRetry();
    });
    await rpc.login();
    connected = true;
    log("Connected to Discord");
  } catch (err) {
    log(`Failed to connect to Discord: ${(err as Error).message ?? err}`);
    rpc = null;
    connected = false;
    scheduleRetry();
  }
}

function scheduleRetry(): void {
  if (retryTimer) return;
  retryTimer = setTimeout(async () => {
    retryTimer = null;
    config = readConfig(); // re-read config in case it was updated
    await connectDiscord();
  }, 7_000);
}

function readAllSessions(): SessionState[] {
  try {
    if (!fs.existsSync(SESSIONS_DIR)) return [];
    const files = fs.readdirSync(SESSIONS_DIR).filter((f) => f.endsWith(".json"));
    const sessions: SessionState[] = [];
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8");
        sessions.push(JSON.parse(raw));
      } catch {
        // skip corrupted files
      }
    }
    return sessions;
  } catch {
    return [];
  }
}

function pickActiveSession(sessions: SessionState[]): SessionState | null {
  if (sessions.length === 0) return null;
  return sessions.reduce((a, b) => (a.updated_at >= b.updated_at ? a : b));
}

async function updatePresence(): Promise<void> {
  const sessions = readAllSessions();
  const active = pickActiveSession(sessions);

  debug(`Found ${sessions.length} sessions, active: ${active?.project ?? "none"}`);

  if (!rpc || !connected || !rpc.user) {
    debug("RPC not ready, skipping");
    return;
  }

  try {
    if (!active) {
      debug("No active session, clearing activity");
      await rpc.user.clearActivity();
      return;
    }

    debug(`Setting activity: ${active.details} - ${active.state ?? "no state"}`);
    await rpc.user.setActivity({
      details: active.details,
      state: active.state ?? undefined,
      startTimestamp: active.session_start,
      largeImageKey: "claude_code_icon",
      largeImageText: `Claude Code \u2014 ${active.project}`,
      smallImageKey: active.small_image_key ?? undefined,
      smallImageText: active.small_image_text ?? undefined,
    });
    debug("Activity set successfully");
  } catch (err) {
    log(`Failed to update presence: ${(err as Error).message ?? err}`);
  }
}

function startWatcher(): void {
  try {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch {
    // ignore
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  watcher = chokidar.watch(SESSIONS_DIR, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 1500, pollInterval: 200 },
  });

  const onChanges = (type: string) => {
    debug(`File ${type} detected`);
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updatePresence().catch(() => {});
    }, 500);
  };

  watcher.on("add", (p) => onChanges(`added: ${p}`));
  watcher.on("change", (p) => onChanges(`changed: ${p}`));
  watcher.on("unlink", (p) => onChanges(`removed: ${p}`));
}

async function shutdown(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
  }
  if (rpc && connected && rpc.user) {
    try {
      await rpc.user.clearActivity();
    } catch {
      // ignore
    }
    try {
      await rpc.destroy();
    } catch {
      // ignore
    }
  }
  removePid();
  process.exit(0);
}

async function main(): Promise<void> {
  config = readConfig();

  if (!config.discordClientId) {
    console.log(
      "Discord Application Client ID is not configured.\n" +
        "1. Create an application at https://discord.com/developers/applications\n" +
        "2. Copy the Client ID\n" +
        "3. Run: claude-code-discord-rpc config set-client-id <your-client-id>"
    );
    process.exit(1);
  }

  writePid();

  process.on("SIGINT", () => { shutdown().catch(() => {}); });
  process.on("SIGTERM", () => { shutdown().catch(() => {}); });
  process.on("uncaughtException", () => { /* swallow */ });
  process.on("unhandledRejection", () => { /* swallow */ });

  startWatcher();
  await connectDiscord();
}

main().catch(() => {
  process.exit(1);
});
