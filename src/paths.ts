import * as os from "os";
import * as path from "path";

export const BASE_DIR = path.join(os.homedir(), ".claude-code-rpc");
export const SESSIONS_DIR = path.join(BASE_DIR, "sessions");
export const CONFIG_PATH = path.join(BASE_DIR, "config.json");
export const DAEMON_PID_PATH = path.join(BASE_DIR, "daemon.pid");
export const INSTALLED_HOOKS_PATH = path.join(BASE_DIR, "installed-hooks.json");
export const CLAUDE_SETTINGS_PATH = path.join(os.homedir(), ".claude", "settings.json");

export function sessionFilePath(sessionId: string): string {
  return path.join(SESSIONS_DIR, `${sessionId}.json`);
}
