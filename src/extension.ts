import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateNotification } from "./commands/showNotification";
import { debounce } from "./utils/debounce";
import { isComposerJson } from "./vendors/composer/isComposerJson";
import { processPackageJSON } from "./vendors/npm/processPackageJSON";
import { processComposerJSON } from "./vendors/composer/processComposerJSON";

type VersionInfo = {
  version: string; // assuming 'version' is a string
  description: string; // assuming 'description' is a string
  author: Record<string, string>; // assuming 'author' is a string
};

// Global variable for the status bar item
let processingStatusBarItem: any;

// CodeLensProvider class responsible for providing CodeLens annotations
class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private context: vscode.ExtensionContext;

  constructor(context: vscode.ExtensionContext) {
    this.context = context;
  }
  // Event emitter to notify VS Code when CodeLens annotations need to be updated
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  // private promises: Promise<any>[] = [];
  // private dependenciesData: any = {};

  // Function to provide CodeLens annotations for a given TextDocument
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    let codeLenses: vscode.CodeLens[] = [];
    showProcessingStatus(`analyzing dependencies...`, true);
    if (isComposerJson(document)) {
      codeLenses = (await processComposerJSON(document, this.context)) || [];
    } else if (isPackageJson(document)) {
      codeLenses = (await processPackageJSON(document, this.context)) || [];
    }
    showProcessingStatus(`analysis complete.`, false);
    return codeLenses;
  }

  // Refresh the CodeLenses when the package.json file is saved
  refreshCodeLenses = debounce(async (document: vscode.TextDocument) => {
    // Clear the existing CodeLenses
    this._onDidChangeCodeLenses.fire();

    // // Reset the promises and dependenciesData
    // this.promises = [];
    // this.dependenciesData = {};

    // Provide new CodeLenses based on the updated package.json
    await this.provideCodeLenses(document);
  }, 50);
}

// Function to update the version of a dependency in the package.json file
async function updateDependency(documentUri: vscode.Uri, packageName: string, latestVersion: string): Promise<void> {
  showProcessingStatus(`updating ${packageName}...`, true);
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();

  const updatedText = text.replace(new RegExp(`("${packageName}":\\s*")([^"]+)`, "g"), `$1${latestVersion}`);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updatedText);

  // Apply the edit to the document
  await vscode.workspace.applyEdit(edit);

  // Save the document
  await document.save();
  showProcessingStatus(`${packageName} updated`, false);
  vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
}

// Function to update all dependencies in the package.json file
async function updateAllDependencies(documentUri: vscode.Uri): Promise<void> {
  showProcessingStatus(`updating all dependencies...`, true);
  const document = await vscode.workspace.openTextDocument(documentUri);
  const packageJson = JSON.parse(document.getText());
  const dependencies = packageJson.dependencies || {};
  const dependenciesToUpdate: string[] = [];

  for (const packageName in dependencies) {
    const latestVersionData = (await getLatestVersion(packageName)) as VersionInfo | null;
    if (latestVersionData) {
      dependenciesToUpdate.push(packageName);
      packageJson.dependencies[packageName] = latestVersionData.version; // update the version number
    }
  }

  if (dependenciesToUpdate.length !== 0) {
    const updatedText = JSON.stringify(packageJson, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(
      document.uri,
      new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
      updatedText
    );
    await vscode.workspace.applyEdit(edit);
    await document.save();
    showProcessingStatus(`update complete`, false);
    vscode.window.showInformationMessage("Yay! 🥳 All dependencies have been updated to their latest version.");
  } else {
    vscode.window.showInformationMessage("All dependencies are up to date.");
    return;
  }
}

// Extension activation function, called when the extension is activated
export function activate(context: vscode.ExtensionContext): void {
  // Create a status bar item
  processingStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  context.subscriptions.push(processingStatusBarItem);

  context.subscriptions.push(vscode.commands.registerCommand("update-now.updateDependency", updateDependency));

  // Register the updateAllDependencies command
  const updateAllDependenciesCommand = vscode.commands.registerCommand("update-now.updateAllDependencies", async () => {
    const editor = vscode.window.activeTextEditor;
    if ((editor && isPackageJson(editor.document)) || (editor && isComposerJson(editor.document))) {
      await updateAllDependencies(editor.document.uri);
    }
  });
  context.subscriptions.push(updateAllDependenciesCommand);

  // Register the CodeLens provider
  const codeLensProvider = new DependencyCodeLensProvider(context);
  const selector: vscode.DocumentSelector = [
    { language: "json", pattern: "**/package.json" },
    { language: "jsonc", pattern: "**/package.json" },
    { language: "json", pattern: "**/composer.json" },
    { language: "jsonc", pattern: "**/composer.json" },
  ];
  context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codeLensProvider));

  // Add event listener for document save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      if (isPackageJson(document)) {
        codeLensProvider.refreshCodeLenses(document);
      }
    })
  );

  // Register the showNotification command
  context.subscriptions.push(
    vscode.commands.registerCommand("update-now.showNotification", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && isPackageJson(editor.document)) {
        showUpdateNotification();
      }
    })
  );
}

// Function to show processing status
function showProcessingStatus(message: any, loading: boolean) {
  if (loading) {
    processingStatusBarItem.text = `$(arrow-up) Update Now: $(sync~spin) ${message}`;
  } else {
    processingStatusBarItem.text = `$(arrow-up) Update Now: ${message}`;
  }
  processingStatusBarItem.show();
}

// Function to hide processing status
function hideProcessingStatus() {
  processingStatusBarItem.hide();
}

// Extension deactivation function, called when the extension is deactivated
export function deactivate(): void {}
