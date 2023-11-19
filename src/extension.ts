import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateNotification } from "./commands/showNotification";
import { debounce } from "./utils/debounce";
import { getUpdateType } from "./utils/getUpdateType";

type VersionInfo = {
  version: string; // assuming 'version' is a string
  description: string; // assuming 'description' is a string
  author: Record<string, string>; // assuming 'author' is a string
  dependencies: Record<string, string>; // assuming 'dependencies' is an object with string properties
};

// CodeLensProvider class responsible for providing CodeLens annotations
class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  // Event emitter to notify VS Code when CodeLens annotations need to be updated
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: any = {};

  // Function to provide CodeLens annotations for a given TextDocument
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    if (isPackageJson(document)) {
      const packageJson = JSON.parse(document.getText());
      const dependencies = packageJson.dependencies || {};

      // If promises have not been created yet, create them
      if (this.promises.length === 0) {
        this.promises = Object.keys(dependencies).map(async (packageName) => {
          const latestVersionData = (await getLatestVersion(packageName)) as VersionInfo | null;
          const currentVersion = dependencies[packageName];
          const position = getPosition(document, packageName);
          const latestVersion = latestVersionData ? latestVersionData.version : null;
          return {
            packageName,
            currentVersion,
            latestVersion,
            update: getUpdateType(currentVersion, latestVersion!),
            line: position["line"],
            character: position["character"],
            description: latestVersionData?.description,
            author: latestVersionData?.author?.name || "various contributors",
          };
        });
      }
      // Convert the array of dependencies data to an object
      for (const promise of this.promises) {
        const dependencyData = await promise;
        if (dependencyData.latestVersion !== null) {
          this.dependenciesData[dependencyData.packageName] = {
            version: dependencyData.currentVersion,
            latestVersion: dependencyData.latestVersion,
            update: dependencyData.update,
            line: dependencyData.line,
            character: dependencyData.character,
            description: dependencyData.description,
            author: dependencyData.author,
          };
        }
      }

      const deps = this.dependenciesData;

      let patches = 0;
      let minors = 0;
      let majors = 0;

      // Loop through all dependencies in the package.json file
      for (const packageName in deps) {
        const currentVersion = deps[packageName].version;
        const line = deps[packageName].line;

        if (line === -1) {
          continue;
        }

        const character = deps[packageName].character;
        const latestVersion = deps[packageName].latestVersion;
        const updateType = deps[packageName].update;
        const description = deps[packageName].description;
        const creator = deps[packageName].author;

        // Skip when the current version is already the latest version
        if (updateType !== "latest" && currentVersion !== "latest") {
          const range = new vscode.Range(line, character, line, character);
          let tooltip: string = "";
          let title: string = "";

          if (updateType === "patch") {
            patches++;
            title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
            tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
          } else if (updateType === "minor") {
            minors++;
            title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
            tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
          } else if (updateType === "major") {
            majors++;
            title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
            tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
          }

          codeLenses.push(
            new vscode.CodeLens(range, {
              title: title,
              tooltip: tooltip,
              command: "update-now.updateDependency",
              arguments: [document.uri, packageName, latestVersion],
            })
          );
        }
      }

      const summaryRange = new vscode.Range(0, 0, 0, 0);
      if (patches + minors + majors > 0) {
        const summaryTitle = `Update Now: ${
          patches + minors + majors
        } updates available (❇️ ${patches} x patch, ✴️ ${minors} x minor, 🛑 ${majors} x major)`;

        codeLenses.unshift(
          new vscode.CodeLens(summaryRange, {
            title: summaryTitle,
            tooltip:
              "Please be careful when updating all dependencies at once. \nMINOR ✴️ and MAJOR 🛑 updates can break your code functionality. ",
            command: "update-now.showNotification",
          })
        );
      } else {
        codeLenses.unshift(
          new vscode.CodeLens(summaryRange, {
            title: "Congrats! 🙌 Your dependencies are up to date.",
            command: "",
          })
        );
      }
    }

    return codeLenses;
  }

  // Refresh the CodeLenses when the package.json file is saved
  refreshCodeLenses = debounce(async (document: vscode.TextDocument) => {
    // Clear the existing CodeLenses
    this._onDidChangeCodeLenses.fire();

    // Reset the promises and dependenciesData
    this.promises = [];
    this.dependenciesData = {};

    // Provide new CodeLenses based on the updated package.json
    await this.provideCodeLenses(document);
  }, 50);
}

// Function to update the version of a dependency in the package.json file
async function updateDependency(documentUri: vscode.Uri, packageName: string, latestVersion: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();

  const updatedText = text.replace(new RegExp(`("${packageName}":\\s*")([^"]+)`, "g"), `$1${latestVersion}`);

  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updatedText);

  // Apply the edit to the document
  await vscode.workspace.applyEdit(edit);

  // Save the document
  await document.save();

  vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
}

function getPosition(document: vscode.TextDocument, packageName: string) {
  const regex = new RegExp(`"${packageName}"\\s*:`);
  const line = document
    .getText()
    .split("\n")
    .findIndex((line) => regex.test(line));
  const character = document.lineAt(line).text.indexOf(`"${packageName}":`);

  return { line: line, character: character };
}

// Function to update all dependencies in the package.json file
async function updateAllDependencies(documentUri: vscode.Uri): Promise<void> {
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
    vscode.window.showInformationMessage("Yay! 🥳 All dependencies have been updated to their latest version.");
  } else {
    vscode.window.showInformationMessage("All dependencies are up to date.");
    return;
  }
}

// Extension activation function, called when the extension is activated
export function activate(context: vscode.ExtensionContext): void {
  context.subscriptions.push(vscode.commands.registerCommand("update-now.updateDependency", updateDependency));

  // Register the updateAllDependencies command
  const updateAllDependenciesCommand = vscode.commands.registerCommand("update-now.updateAllDependencies", async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && isPackageJson(editor.document)) {
      await updateAllDependencies(editor.document.uri);
    }
  });
  context.subscriptions.push(updateAllDependenciesCommand);

  // Register the CodeLens provider
  const codeLensProvider = new DependencyCodeLensProvider();
  const selector: vscode.DocumentSelector = [
    { language: "json", pattern: "**/package.json" },
    { language: "jsonc", pattern: "**/package.json" },
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

// Extension deactivation function, called when the extension is deactivated
export function deactivate(): void {}
