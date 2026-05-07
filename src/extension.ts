import * as vscode from "vscode";
import {
  CONFIG_KIND,
  detectCurrentConfigKind,
  detectConfigFiles,
  getToggleTargetKind,
  switchConfig,
  type ConfigFileState,
  type ConfigKind,
} from "./configSwitcher";

interface WorkspaceUi {
  item: vscode.StatusBarItem;
  subscriptions: vscode.Disposable[];
  watcher: vscode.FileSystemWatcher;
  workspaceFolder: vscode.WorkspaceFolder;
}

const STATUS_PRIORITY = 100;

let workspaceUis: WorkspaceUi[] = [];

export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("egConfigSwitcher.toggle", async (workspaceUri?: vscode.Uri) => {
      await runToggle(workspaceUri);
    }),
  );

  void refreshWorkspaceUis(context);

  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(() => {
      void refreshWorkspaceUis(context);
    }),
  );
}

export function deactivate(): void {
  disposeWorkspaceUis();
}

async function refreshWorkspaceUis(context: vscode.ExtensionContext): Promise<void> {
  disposeWorkspaceUis();

  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  workspaceUis = workspaceFolders.map((workspaceFolder) => createWorkspaceUi(context, workspaceFolder));

  await Promise.all(workspaceUis.map((workspaceUi) => refreshWorkspaceUi(workspaceUi)));
}

function createWorkspaceUi(_context: vscode.ExtensionContext, workspaceFolder: vscode.WorkspaceFolder): WorkspaceUi {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, STATUS_PRIORITY);
  item.command = {
    command: "egConfigSwitcher.toggle",
    title: "Toggle EG Config",
    arguments: [workspaceFolder.uri],
  };

  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(workspaceFolder, "public/config*.json"),
  );

  const workspaceUi: WorkspaceUi = { item, subscriptions: [], watcher, workspaceFolder };

  workspaceUi.subscriptions.push(
    watcher.onDidCreate(() => void refreshWorkspaceUi(workspaceUi)),
    watcher.onDidChange(() => void refreshWorkspaceUi(workspaceUi)),
    watcher.onDidDelete(() => void refreshWorkspaceUi(workspaceUi)),
  );

  return workspaceUi;
}

async function refreshWorkspaceUi(workspaceUi: WorkspaceUi): Promise<void> {
  const workspacePath = workspaceUi.workspaceFolder.uri.fsPath;
  const [state, currentKind] = await Promise.all([
    detectConfigFiles(workspacePath),
    detectCurrentConfigKind(workspacePath),
  ]);

  updateStatusBar(workspaceUi, state, currentKind);
}

function updateStatusBar(workspaceUi: WorkspaceUi, state: ConfigFileState, currentKind: ConfigKind): void {
  if (!state.dev && !state.local) {
    workspaceUi.item.hide();
    return;
  }

  const targetKind = getToggleTargetKind(currentKind);
  workspaceUi.item.text = currentKind === CONFIG_KIND.LOCAL ? "$(home) Local" : "$(cloud) Dev";
  workspaceUi.item.tooltip = `Current EG config: ${currentKind}. Click to switch to ${targetKind} in ${workspaceUi.workspaceFolder.name}.`;
  workspaceUi.item.show();
}

async function runToggle(workspaceUri?: vscode.Uri): Promise<void> {
  const workspaceFolder = resolveWorkspaceFolder(workspaceUri);

  if (!workspaceFolder) {
    await vscode.window.showWarningMessage("Open a workspace folder to switch EG config files.");
    return;
  }

  try {
    const currentKind = await detectCurrentConfigKind(workspaceFolder.uri.fsPath);
    const targetKind = getToggleTargetKind(currentKind);
    await switchConfig(workspaceFolder.uri.fsPath, targetKind);
    await vscode.window.showInformationMessage(`EG config switched to ${targetKind}.`);
    const workspaceUi = workspaceUis.find((ui) => ui.workspaceFolder.uri.toString() === workspaceFolder.uri.toString());
    if (workspaceUi) {
      await refreshWorkspaceUi(workspaceUi);
    }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    await vscode.window.showErrorMessage(`Could not switch EG config: ${message}`);
  }
}

function resolveWorkspaceFolder(workspaceUri?: vscode.Uri): vscode.WorkspaceFolder | undefined {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];

  if (workspaceUri) {
    return vscode.workspace.getWorkspaceFolder(workspaceUri);
  }

  if (workspaceFolders.length === 1) {
    return workspaceFolders[0];
  }

  const activeWorkspaceFolder = vscode.window.activeTextEditor
    ? vscode.workspace.getWorkspaceFolder(vscode.window.activeTextEditor.document.uri)
    : undefined;

  return activeWorkspaceFolder ?? workspaceFolders[0];
}

function disposeWorkspaceUis(): void {
  for (const workspaceUi of workspaceUis) {
    workspaceUi.item.dispose();
    workspaceUi.watcher.dispose();
    for (const subscription of workspaceUi.subscriptions) {
      subscription.dispose();
    }
  }

  workspaceUis = [];
}
