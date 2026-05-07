import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const CONFIG_TARGET = "config.json";

export const CONFIG_KIND = {
  DEV: "dev",
  LOCAL: "local",
} as const;

export type ConfigKind = (typeof CONFIG_KIND)[keyof typeof CONFIG_KIND];

export interface ConfigFileState {
  dev: boolean;
  local: boolean;
}

export interface RuntimeConfigApi {
  baseUri?: unknown;
}

export interface RuntimeConfig {
  api: RuntimeConfigApi;
}

const SOURCE_FILE_BY_KIND: Record<ConfigKind, string> = {
  [CONFIG_KIND.DEV]: "config.dev.json",
  [CONFIG_KIND.LOCAL]: "config.local.json",
};

export function getPublicDir(workspaceFolder: string): string {
  return path.join(workspaceFolder, "public");
}

export function getConfigSourcePath(workspaceFolder: string, kind: ConfigKind): string {
  return path.join(getPublicDir(workspaceFolder), SOURCE_FILE_BY_KIND[kind]);
}

export function getConfigTargetPath(workspaceFolder: string): string {
  return path.join(getPublicDir(workspaceFolder), CONFIG_TARGET);
}

export async function fileExists(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

export async function detectConfigFiles(workspaceFolder: string): Promise<ConfigFileState> {
  const [dev, local] = await Promise.all([
    fileExists(getConfigSourcePath(workspaceFolder, CONFIG_KIND.DEV)),
    fileExists(getConfigSourcePath(workspaceFolder, CONFIG_KIND.LOCAL)),
  ]);

  return { dev, local };
}

export async function detectCurrentConfigKind(workspaceFolder: string): Promise<ConfigKind> {
  const targetPath = getConfigTargetPath(workspaceFolder);

  if (!(await fileExists(targetPath))) {
    return CONFIG_KIND.DEV;
  }

  const fileContent = await fs.readFile(targetPath, "utf8");
  const parsedConfig = parseJson(fileContent);
  const baseUri = getBaseUri(parsedConfig);

  return baseUri.toLowerCase().includes("localhost") ? CONFIG_KIND.LOCAL : CONFIG_KIND.DEV;
}

export function getToggleTargetKind(currentKind: ConfigKind): ConfigKind {
  return currentKind === CONFIG_KIND.LOCAL ? CONFIG_KIND.DEV : CONFIG_KIND.LOCAL;
}

export async function switchConfig(workspaceFolder: string, kind: ConfigKind): Promise<void> {
  const sourcePath = getConfigSourcePath(workspaceFolder, kind);
  const publicDir = getPublicDir(workspaceFolder);
  const targetPath = getConfigTargetPath(workspaceFolder);
  const tempPath = path.join(publicDir, `.config.${process.pid}.${randomUUID()}.tmp`);

  await ensureSafePublicDir(publicDir);

  if (!(await isRegularFile(sourcePath))) {
    throw new Error(`Missing source config: ${path.relative(workspaceFolder, sourcePath)}`);
  }

  if (await isSymbolicLink(targetPath)) {
    throw new Error(`Refusing to overwrite symbolic link: ${path.relative(workspaceFolder, targetPath)}`);
  }

  try {
    await fs.copyFile(sourcePath, tempPath);
    await fs.rename(tempPath, targetPath);
  } catch (error: unknown) {
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

function parseJson(fileContent: string): unknown {
  try {
    return JSON.parse(fileContent) as unknown;
  } catch {
    return {};
  }
}

async function ensureSafePublicDir(publicDir: string): Promise<void> {
  try {
    const stat = await fs.lstat(publicDir);

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing to use unsafe public directory: ${publicDir}`);
    }
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await fs.mkdir(publicDir, { recursive: true });
      return;
    }

    throw error;
  }
}

async function isRegularFile(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isFile() && !stat.isSymbolicLink();
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

async function isSymbolicLink(filePath: string): Promise<boolean> {
  try {
    const stat = await fs.lstat(filePath);
    return stat.isSymbolicLink();
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return false;
    }

    throw error;
  }
}

function getBaseUri(config: unknown): string {
  if (!isRuntimeConfig(config)) {
    return "";
  }

  return typeof config.api.baseUri === "string" ? config.api.baseUri : "";
}

function isRuntimeConfig(config: unknown): config is RuntimeConfig {
  return (
    typeof config === "object" &&
    config !== null &&
    "api" in config &&
    typeof config.api === "object" &&
    config.api !== null
  );
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
