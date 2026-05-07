import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";

export const CONFIG_TARGET = "config.json";
export const CONFIG_EXTENSION_SECTION = "configSwitcher";

export const CONFIG_KIND = {
  DEV: "dev",
  LOCAL: "local",
} as const;

export type ConfigKind = (typeof CONFIG_KIND)[keyof typeof CONFIG_KIND];

export interface ConfigFileState {
  dev: boolean;
  local: boolean;
}

export interface ConfigPaths {
  devConfigPath: string;
  localConfigPath: string;
  targetConfigPath: string;
}

export interface RuntimeConfigApi {
  baseUri?: unknown;
}

export interface RuntimeConfig {
  api: RuntimeConfigApi;
}

export const DEFAULT_CONFIG_PATHS: ConfigPaths = {
  devConfigPath: "public/config.dev.json",
  localConfigPath: "public/config.local.json",
  targetConfigPath: "public/config.json",
};

export function getConfigSourcePath(
  workspaceFolder: string,
  kind: ConfigKind,
  configPaths: ConfigPaths = DEFAULT_CONFIG_PATHS,
): string {
  return resolveWorkspaceFilePath(
    workspaceFolder,
    kind === CONFIG_KIND.DEV ? configPaths.devConfigPath : configPaths.localConfigPath,
  );
}

export function getConfigTargetPath(
  workspaceFolder: string,
  configPaths: ConfigPaths = DEFAULT_CONFIG_PATHS,
): string {
  return resolveWorkspaceFilePath(workspaceFolder, configPaths.targetConfigPath);
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

export async function detectConfigFiles(
  workspaceFolder: string,
  configPaths: ConfigPaths = DEFAULT_CONFIG_PATHS,
): Promise<ConfigFileState> {
  const [dev, local] = await Promise.all([
    fileExists(getConfigSourcePath(workspaceFolder, CONFIG_KIND.DEV, configPaths)),
    fileExists(getConfigSourcePath(workspaceFolder, CONFIG_KIND.LOCAL, configPaths)),
  ]);

  return { dev, local };
}

export async function detectCurrentConfigKind(
  workspaceFolder: string,
  configPaths: ConfigPaths = DEFAULT_CONFIG_PATHS,
): Promise<ConfigKind> {
  const targetPath = getConfigTargetPath(workspaceFolder, configPaths);

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

export async function switchConfig(
  workspaceFolder: string,
  kind: ConfigKind,
  configPaths: ConfigPaths = DEFAULT_CONFIG_PATHS,
): Promise<void> {
  const sourcePath = getConfigSourcePath(workspaceFolder, kind, configPaths);
  const targetPath = getConfigTargetPath(workspaceFolder, configPaths);
  const targetDir = path.dirname(targetPath);
  const tempPath = path.join(targetDir, `.config.${process.pid}.${randomUUID()}.tmp`);

  await ensureSafeDirectory(path.dirname(sourcePath));
  await ensureSafeDirectory(targetDir);

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

function resolveWorkspaceFilePath(workspaceFolder: string, relativeFilePath: string): string {
  if (!relativeFilePath.trim()) {
    throw new Error("Config paths cannot be empty.");
  }

  if (path.isAbsolute(relativeFilePath)) {
    throw new Error(`Config paths must be relative to the workspace: ${relativeFilePath}`);
  }

  const workspaceRoot = path.resolve(workspaceFolder);
  const resolvedPath = path.resolve(workspaceRoot, relativeFilePath);
  const relativePath = path.relative(workspaceRoot, resolvedPath);

  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Config paths must stay inside the workspace: ${relativeFilePath}`);
  }

  return resolvedPath;
}

function parseJson(fileContent: string): unknown {
  try {
    return JSON.parse(fileContent) as unknown;
  } catch {
    return {};
  }
}

async function ensureSafeDirectory(directoryPath: string): Promise<void> {
  try {
    const stat = await fs.lstat(directoryPath);

    if (stat.isSymbolicLink() || !stat.isDirectory()) {
      throw new Error(`Refusing to use unsafe config directory: ${directoryPath}`);
    }
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      await fs.mkdir(directoryPath, { recursive: true });
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
