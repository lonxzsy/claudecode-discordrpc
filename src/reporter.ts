import * as fs from "fs";
import * as path from "path";
import { SESSIONS_DIR, sessionFilePath } from "./paths";
import { resolveToolStatus, ICON_KEYS, ICON_TEXT } from "./statusMap";

interface HookEvent {
  session_id: string;
  cwd: string;
  hook_event_name: string;
  permission_mode: string;
  source?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  message?: string;
}

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

function ensureDir(): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
}

function readSession(filePath: string): SessionState | null {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8"));
    }
  } catch {
    // ignore
  }
  return null;
}

function writeSessionAtomic(filePath: string, data: SessionState): void {
  const tmp = filePath + ".tmp." + process.pid;
  try {
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tmp, filePath);
  } catch {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
  }
}

function buildPatch(event: HookEvent): Partial<SessionState> | null {
  const now = Date.now();

  switch (event.hook_event_name) {
    case "SessionStart":
      return {
        project: path.basename(event.cwd),
        cwd: event.cwd,
        status: "idle",
        details: "Idle",
        state: null,
        small_image_key: ICON_KEYS.idle,
        small_image_text: "Idle",
        session_start: now,
        updated_at: now,
      };
    case "UserPromptSubmit":
      return {
        status: "thinking",
        details: "Thinking",
        state: null,
        small_image_key: ICON_KEYS.thinking,
        small_image_text: "Thinking",
        updated_at: now,
      };
    case "PreToolUse": {
      if (!event.tool_name) return null;
      const ts = resolveToolStatus(event.tool_name, event.tool_input ?? {});
      return {
        status: ts.status,
        details: ts.details,
        state: ts.state ?? null,
        small_image_key: ts.smallImageKey,
        small_image_text: ts.smallImageText,
        updated_at: now,
      };
    }
    case "Notification":
      return {
        status: "waiting_input",
        details: "Waiting for your input",
        state: null,
        small_image_key: ICON_KEYS.bell,
        small_image_text: "Waiting for input",
        updated_at: now,
      };
    case "Stop":
      return {
        status: "idle",
        details: "Idle",
        state: null,
        small_image_key: ICON_KEYS.idle,
        small_image_text: "Idle",
        updated_at: now,
      };
    case "SessionEnd":
      return null; // handled separately
    default:
      return null;
  }
}

function processInput(input: string): void {
  if (!input.trim()) process.exit(0);

  let event: HookEvent;
  try {
    event = JSON.parse(input);
  } catch {
    process.exit(0);
  }

  if (!event.session_id || !event.hook_event_name) process.exit(0);

  ensureDir();

  // Handle SessionEnd — delete file and exit
  if (event.hook_event_name === "SessionEnd") {
    const fp = sessionFilePath(event.session_id);
    try {
      if (fs.existsSync(fp)) fs.unlinkSync(fp);
    } catch {
      // ignore
    }
    process.exit(0);
  }

  const patch = buildPatch(event);
  if (!patch) process.exit(0);

  const filePath = sessionFilePath(event.session_id);
  const existing = readSession(filePath);

  const merged: SessionState = {
    project: (existing?.project ?? patch.project) ?? path.basename(event.cwd),
    cwd: (existing?.cwd ?? patch.cwd) ?? event.cwd,
    status: patch.status ?? existing?.status ?? "idle",
    details: patch.details ?? existing?.details ?? "Idle",
    state: patch.state !== undefined ? patch.state : (existing?.state ?? null),
    small_image_key: patch.small_image_key ?? existing?.small_image_key ?? null,
    small_image_text: patch.small_image_text ?? existing?.small_image_text ?? null,
    session_start: existing?.session_start ?? patch.session_start ?? Date.now(),
    updated_at: patch.updated_at ?? Date.now(),
  };

  writeSessionAtomic(filePath, merged);
  process.exit(0);
}

function main(): void {
  // Try sync read first (works on Linux/macOS)
  let input = "";
  try {
    const fd = fs.openSync("/dev/stdin", "r");
    const buf = Buffer.alloc(1024 * 1024);
    const bytesRead = fs.readSync(fd, buf, 0, buf.length, 0);
    fs.closeSync(fd);
    input = buf.slice(0, bytesRead).toString("utf-8");
    processInput(input);
    return;
  } catch {
    // /dev/stdin doesn't exist on Windows, fall through
  }

  // Fallback: async stdin read (works on Windows)
  const chunks: Buffer[] = [];
  process.stdin.on("data", (chunk: Buffer) => chunks.push(chunk));
  process.stdin.on("end", () => {
    input = Buffer.concat(chunks).toString("utf-8");
    processInput(input);
  });
  process.stdin.on("error", () => process.exit(0));
  // If no data arrives in 100ms, exit gracefully
  setTimeout(() => process.exit(0), 100);
}

main();
