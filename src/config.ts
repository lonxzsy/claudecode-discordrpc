import * as fs from "fs";
import * as path from "path";
import { CONFIG_PATH, BASE_DIR } from "./paths";

export interface PrivacyConfig {
  showCommandText: boolean;
  showFullPaths: boolean;
}

export interface Config {
  discordClientId: string;
  privacy: PrivacyConfig;
  idleTimeoutMinutes: number;
}

const DEFAULT_CONFIG: Config = {
  discordClientId: "",
  privacy: {
    showCommandText: false,
    showFullPaths: false,
  },
  idleTimeoutMinutes: 10,
};

export function readConfig(): Config {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = fs.readFileSync(CONFIG_PATH, "utf-8");
      const parsed = JSON.parse(raw);
      return { ...DEFAULT_CONFIG, ...parsed, privacy: { ...DEFAULT_CONFIG.privacy, ...parsed.privacy } };
    }
  } catch {
    // fall through
  }
  return { ...DEFAULT_CONFIG };
}

export function writeConfig(config: Config): void {
  fs.mkdirSync(BASE_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}

export function updateConfig(patch: Partial<Config>): Config {
  const config = readConfig();
  const merged = { ...config, ...patch, privacy: { ...config.privacy, ...(patch.privacy ?? {}) } };
  writeConfig(merged);
  return merged;
}
