import * as vscode from "vscode";

// Status bar item to display plugin status
let statusBarItem: vscode.StatusBarItem;

/**
 * Initialize the status bar item
 * @param context The extension context
 * @returns The created status bar item
 */
export function initializeStatusBar(context: vscode.ExtensionContext): vscode.StatusBarItem {
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = "⇪ Update Now: ✅ Ready";
  statusBarItem.tooltip = "Updates across your scanned package.json files";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);
  return statusBarItem;
}

/**
 * Update the status bar with a message
 * @param message The message to display
 * @param isProcessing Whether to show a processing indicator
 * @param cachedDependenciesCount Optional number of cached dependencies to display
 */
export function updateStatusBar(message: string, isProcessing: boolean = false, cachedDependenciesCount?: number): void {
  if (!statusBarItem) {
    return;
  }
  
  if (isProcessing) {
    statusBarItem.text = `⇪ Update Now: $(sync~spin) ${message}`;
    statusBarItem.tooltip = "🔃 Fetching dependencies' latest versions.";
    statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
  } else {
    let statusText = `⇪ Update Now:`;
    if (cachedDependenciesCount !== undefined) {
      statusText += `📦 ${cachedDependenciesCount} cached dependencies`;
    }
    statusBarItem.text = statusText;
    statusBarItem.tooltip = "Updates across your scanned package.json files.";
    statusBarItem.backgroundColor = undefined; // Reset to default
  }
}

/**
 * Get the status bar item
 * @returns The status bar item
 */
export function getStatusBarItem(): vscode.StatusBarItem {
  return statusBarItem;
}
