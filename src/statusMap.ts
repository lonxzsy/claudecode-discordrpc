import * as path from "path";
import { readConfig } from "./config";

export interface ToolStatus {
  status: string;
  details: string;
  state?: string;
  smallImageKey: string;
  smallImageText: string;
}

export const ICON_KEYS = {
  idle: "icon_idle",
  thinking: "icon_thinking",
  terminal: "icon_terminal",
  pencil: "icon_pencil",
  book: "icon_book",
  search: "icon_search",
  globe: "icon_globe",
  robot: "icon_robot",
  plugin: "icon_plugin",
  wrench: "icon_wrench",
  bell: "icon_bell",
} as const;

export const ICON_TEXT: Record<string, string> = {
  icon_idle: "Idle",
  icon_thinking: "Thinking",
  icon_terminal: "Running a command",
  icon_pencil: "Editing a file",
  icon_book: "Reading a file",
  icon_search: "Searching the codebase",
  icon_globe: "Browsing the web",
  icon_robot: "Running a sub-agent",
  icon_plugin: "MCP tool",
  icon_wrench: "Using a tool",
  icon_bell: "Waiting for input",
};

const MCP_PATTERN = /^mcp__([^_]+)__/;

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "\u2026";
}

function basename(filePath: string): string {
  return path.basename(filePath);
}

export function resolveToolStatus(toolName: string, toolInput: Record<string, unknown>): ToolStatus {
  const config = readConfig();

  switch (toolName) {
    case "Bash": {
      const cmd = typeof toolInput.command === "string" ? toolInput.command : "";
      return {
        status: "running_command",
        details: "Running a command",
        state: config.privacy.showCommandText ? truncate(cmd, 40) : undefined,
        smallImageKey: ICON_KEYS.terminal,
        smallImageText: "Running a command",
      };
    }
    case "Edit":
    case "Write":
    case "NotebookEdit": {
      const fp = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
      return {
        status: "editing",
        details: "Editing a file",
        state: config.privacy.showFullPaths ? fp : basename(fp),
        smallImageKey: ICON_KEYS.pencil,
        smallImageText: "Editing a file",
      };
    }
    case "Read": {
      const fp = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
      return {
        status: "reading",
        details: "Reading a file",
        state: config.privacy.showFullPaths ? fp : basename(fp),
        smallImageKey: ICON_KEYS.book,
        smallImageText: "Reading a file",
      };
    }
    case "Grep":
    case "Glob":
      return {
        status: "searching",
        details: "Searching the codebase",
        smallImageKey: ICON_KEYS.search,
        smallImageText: "Searching the codebase",
      };
    case "WebFetch":
    case "WebSearch":
      return {
        status: "browsing",
        details: "Browsing the web",
        smallImageKey: ICON_KEYS.globe,
        smallImageText: "Browsing the web",
      };
    case "Task":
      return {
        status: "subagent",
        details: "Running a sub-agent",
        smallImageKey: ICON_KEYS.robot,
        smallImageText: "Running a sub-agent",
      };
    default: {
      const mcpMatch = toolName.match(MCP_PATTERN);
      if (mcpMatch) {
        return {
          status: "mcp",
          details: `Using ${mcpMatch[1]}`,
          smallImageKey: ICON_KEYS.plugin,
          smallImageText: `Using ${mcpMatch[1]}`,
        };
      }
      return {
        status: "tool",
        details: `Using ${toolName}`,
        smallImageKey: ICON_KEYS.wrench,
        smallImageText: `Using ${toolName}`,
      };
    }
  }
}
