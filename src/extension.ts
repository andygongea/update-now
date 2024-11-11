import * as vscode from "vscode";
import semver from "semver";
import { DependencyData } from "./utils/types";
import { UpdateType } from './utils/types';
import { isPackageJson } from "./envs/npm/isPackageJson";
import { getPosition } from "./utils/getPosition";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { getUpdateType } from "./utils/getUpdateType";
import { getVersionPrefix } from "./utils/getVersionPrefix";
import { incrementUpgradeCount } from "./utils/incrementUpgradeCount";
import { debounce } from "./utils/debounce";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

// Global variable for the status bar item
let processingStatusBarItem: any;


class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: Record<string, DependencyData> = {};

  constructor(private context: vscode.ExtensionContext) { }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    showProcessingStatus(`analyzing dependencies...`, true);

    if (isPackageJson(document)) {
      const packageJson = JSON.parse(document.getText());
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};

      const storedDependencies = this.context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});

      if (Object.keys(storedDependencies).length !== 0) {
        this.dependenciesData = storedDependencies;
      }

      const currentTime = Date.now();
      for (const packageName in { ...dependencies, ...devDependencies }) {
        const currentVersion = dependencies[packageName] || devDependencies[packageName];
        const storedDependency = storedDependencies[packageName];
        if (!storedDependency || currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || storedDependency.version === null) {
          this.promises.push(this.updateDependencyData(document, packageName, currentVersion));
        } else {
          this.dependenciesData[packageName] = storedDependency;
        }
      }

      if (this.promises.length > 0) {
        await Promise.all(this.promises);
        await this.context.workspaceState.update('dependenciesData', this.dependenciesData);
      }

      this.addCodeLenses(codeLenses, document);
    }

    showProcessingStatus(`analysis complete.`, false);

    return codeLenses;
  }

  private async updateDependencyData(document: vscode.TextDocument, packageName: string, currentVersion: string) {
    if (!currentVersion) {
      console.warn(`Current version for package ${packageName} is undefined.`);
      return;
    }

    // Use the updated `getLatestVersion` which now has caching logic
    const latestVersionData = await getLatestVersion(packageName);
    if (!latestVersionData) { return; }

    const position = getPosition(document, packageName);
    const latestVersion = latestVersionData.version;
    const updateType = getUpdateType(currentVersion, latestVersion) as UpdateType;

    this.dependenciesData[packageName] = {
      version: latestVersion,
      description: latestVersionData.description,
      author: latestVersionData.author?.name || "various contributors",
      timestamp: Date.now(),
      updateType,
    };

    return {
      packageName,
      currentVersion,
      latestVersion,
      update: updateType,
      line: position.line,
      character: position.character,
      description: latestVersionData.description,
      author: latestVersionData.author?.name || "various contributors",
    };
  }

  private addCodeLenses(codeLenses: vscode.CodeLens[], document: vscode.TextDocument) {
    const deps = this.dependenciesData;
    let patches = 0;
    let minors = 0;
    let majors = 0;

    for (const packageName in deps) {
      const { version, description, author, updateType } = deps[packageName];
      const packageJson = JSON.parse(document.getText());
      const currentVersion = packageJson.dependencies[packageName] || packageJson.devDependencies[packageName];
      const latestVersion = version;
      if (!currentVersion) {
        continue;
      }

      const position = getPosition(document, packageName);
      const { line, character } = position;

      if (line === -1) { continue; }

      if (updateType !== "latest" && currentVersion !== "latest") {
        const range = new vscode.Range(line, character, line, character);
        let title = "";
        let tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n`;

        if (updateType === "patch") {
          patches++;
          title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
          tooltip += `❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
        } else if (updateType === "minor") {
          minors++;
          title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
          tooltip += `✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
        } else if (updateType === "major") {
          majors++;
          title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
          tooltip += `🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
        }

        codeLenses.push(
          new vscode.CodeLens(range, {
            title,
            tooltip,
            command: "update-now.updateDependency",
            arguments: [document.uri, packageName, currentVersion],
          })
        );
      }
    }

    const summaryRange = new vscode.Range(0, 0, 0, 0);
    if (patches + minors + majors > 0) {
      const summaryTitle = `Update Now: ${patches + minors + majors
        } updates available (❇️ ${patches} x patch, ✴️ ${minors} x minor, 🛑 ${majors} x major)`;

      codeLenses.unshift(
        new vscode.CodeLens(summaryRange, {
          title: summaryTitle,
          tooltip: "Please be careful when updating all dependencies at once. \nMINOR ✴️ and MAJOR 🛑 updates can break your code functionality.",
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

  refreshCodeLenses = debounce(async (document: vscode.TextDocument) => {
    this._onDidChangeCodeLenses.fire();
    this.promises = [];
    this.dependenciesData = {};
    await this.context.workspaceState.update('dependenciesData', {});
    await this.provideCodeLenses(document);
  }, 50);
}

async function updateDependency(
  context: vscode.ExtensionContext,
  documentUri: vscode.Uri,
  packageName: string,
  currentVersion: string,
  suppressNotification: boolean = false
): Promise<void> {
  try {
    // Skip if version is invalid or a URL
    if (!currentVersion || isURL(currentVersion)) {
      if (!suppressNotification) {
        vscode.window.showWarningMessage(`Cannot update ${packageName}: invalid version format`);
      }
      return;
    }

    showProcessingStatus(`updating ${packageName}...`, true);


    const document = await vscode.workspace.openTextDocument(documentUri);
    const packageJson = JSON.parse(document.getText());
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    const versionPrefix = getVersionPrefix(currentVersion);
    const strippedCurrentVersion = currentVersion.replace(/^[~^]/, "");

    // Get latest version data
    const latestVersionData = await getLatestVersion(packageName);
    if (!latestVersionData?.version) {
      if (!suppressNotification) {
        vscode.window.showWarningMessage(`Could not fetch latest version for ${packageName}`);
      }
      return;
    }

    // Validate versions before comparison
    const cleanLatestVersion = latestVersionData.version.trim().replace(/^v/, '');
    const cleanCurrentVersion = strippedCurrentVersion.trim().replace(/^v/, '');

    // Skip if either version is invalid
    if (!semver.valid(cleanLatestVersion) || !semver.valid(cleanCurrentVersion)) {
      if (!suppressNotification) {
        vscode.window.showWarningMessage(
          `Invalid version format for ${packageName}: current=${cleanCurrentVersion}, latest=${cleanLatestVersion}`
        );
      }
      return;
    }

    try {
      const diff = semver.diff(cleanLatestVersion, cleanCurrentVersion);
      if (!diff) {
        if (!suppressNotification) {
          vscode.window.showInformationMessage(`${packageName} is already up to date`);
        }
        return;
      }

      const isPatchUpdate = diff === "patch";
      const isMinorUpdate = diff === "minor";

      let newVersion = cleanLatestVersion;
      if (versionPrefix === "~" && isPatchUpdate) {
        newVersion = "~" + newVersion;
      } else if (versionPrefix === "^" && (isPatchUpdate || isMinorUpdate)) {
        newVersion = "^" + newVersion;
      }

      // Update the package.json
      if (dependencies[packageName]) {
        packageJson.dependencies[packageName] = newVersion;
      } else if (devDependencies[packageName]) {
        packageJson.devDependencies[packageName] = newVersion;
      }

      const updatedText = JSON.stringify(packageJson, null, 2);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)),
        updatedText
      );

      await vscode.workspace.applyEdit(edit);
      await document.save();

      showProcessingStatus(`${packageName} updated`, false);


      // Update stored dependencies data
      const storedDependencies = context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});
      storedDependencies[packageName] = {
        version: newVersion,
        timestamp: Date.now(),
        updateType: UpdateType.latest,
      };
      await context.workspaceState.update('dependenciesData', storedDependencies);
      await incrementUpgradeCount(context);

      if (!suppressNotification) {
        vscode.window.showInformationMessage(
          `Successfully updated ${packageName} from ${currentVersion} to ${newVersion}`
        );
      }
    } catch (diffError) {
      console.error(`Error comparing versions for ${packageName}:`, diffError);
      if (!suppressNotification) {
        vscode.window.showErrorMessage(`Failed to compare versions for ${packageName}`);
      }
      return;
    }
  } catch (error) {
    console.error('Error in updateDependency:', error);
    if (!suppressNotification) {
      vscode.window.showErrorMessage(
        `Failed to update ${packageName}. Check the console for details.`
      );
    }
  }
}

async function updateAllDependencies(context: vscode.ExtensionContext, documentUri: vscode.Uri): Promise<void> {
  try {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const packageJson = JSON.parse(document.getText());
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};
    const dependenciesToUpdate: string[] = [];

    const storedDependencies = context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});

    for (const packageName in { ...dependencies, ...devDependencies }) {
      try {
        const currentVersion = dependencies[packageName] || devDependencies[packageName];

        // Skip if version is invalid or a URL
        if (!currentVersion || isURL(currentVersion)) {
          continue;
        }

        const versionPrefix = getVersionPrefix(currentVersion);
        const strippedCurrentVersion = currentVersion.replace(/^[~^]/, "");

        // Get latest version data
        const latestVersionData = storedDependencies[packageName] &&
          Date.now() - storedDependencies[packageName].timestamp < ONE_DAY_IN_MS
          ? storedDependencies[packageName]
          : await getLatestVersion(packageName);

        if (!latestVersionData?.version) {
          continue;
        }

        // Validate versions before comparison
        const cleanLatestVersion = latestVersionData.version.trim().replace(/^v/, '');
        const cleanCurrentVersion = strippedCurrentVersion.trim().replace(/^v/, '');

        // Skip if either version is invalid
        if (!semver.valid(cleanLatestVersion) || !semver.valid(cleanCurrentVersion)) {
          console.warn(`Invalid version for ${packageName}: current=${cleanCurrentVersion}, latest=${cleanLatestVersion}`);
          continue;
        }

        try {
          const diff = semver.diff(cleanLatestVersion, cleanCurrentVersion);
          if (!diff) {
            continue;
          }

          const isPatchUpdate = diff === "patch";
          const isMinorUpdate = diff === "minor";

          let newVersion = cleanLatestVersion;
          if (versionPrefix === "~" && isPatchUpdate) {
            newVersion = "~" + newVersion;
          } else if (versionPrefix === "^" && (isPatchUpdate || isMinorUpdate)) {
            newVersion = "^" + newVersion;
          }

          if (newVersion !== currentVersion) {
            dependenciesToUpdate.push(packageName);
            await updateDependency(context, documentUri, packageName, currentVersion, true); // Suppress notifications
          }
        } catch (diffError) {
          console.warn(`Error comparing versions for ${packageName}:`, diffError);
          continue;
        }
      } catch (packageError) {
        console.warn(`Error processing package ${packageName}:`, packageError);
        continue;
      }
    }

    if (dependenciesToUpdate.length !== 0) {
      vscode.window.showInformationMessage("Yay! 🥳 All dependencies have been updated to their latest version.");
    } else {
      vscode.window.showInformationMessage("🙌 All dependencies are up to date.");
    }
  } catch (error) {
    console.error('Error in updateAllDependencies:', error);
    vscode.window.showErrorMessage('Failed to update dependencies. Check the console for details.');
  }
}

// Helper function to check if version is a URL
function isURL(version: string): boolean {
  return /^https?:/.test(version) ||
    /^git(\+ssh|\+https|\+file)?:/.test(version) ||
    /^git@/.test(version) ||
    /^[^\/]+\/[^\/]+$/.test(version);
}

export function activate(context: vscode.ExtensionContext): void {
  context.globalState.update("dependencyUpgradeCount", 0);

  // Create a status bar item
  processingStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 10);
  context.subscriptions.push(processingStatusBarItem);

  context.subscriptions.push(
    vscode.commands.registerCommand("update-now.updateDependency", async (documentUri, packageName, currentVersion) => {
      await updateDependency(context, documentUri, packageName, currentVersion);
    })
  );

  const updateAllDependenciesCommand = vscode.commands.registerCommand("update-now.updateAllDependencies", async () => {
    const editor = vscode.window.activeTextEditor;
    if (editor && isPackageJson(editor.document)) {
      await updateAllDependencies(context, editor.document.uri);
    }
  });

  context.subscriptions.push(updateAllDependenciesCommand);

  const codeLensProvider = new DependencyCodeLensProvider(context);
  const selector: vscode.DocumentSelector = [
    { language: "json", pattern: "**/package.json" },
    { language: "jsonc", pattern: "**/package.json" },
  ];

  context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codeLensProvider));

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      if (isPackageJson(document)) {
        codeLensProvider.refreshCodeLenses(document);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("update-now.showNotification", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && isPackageJson(editor.document)) {
        showUpdateAllNotification();
      }
    })
  );
}

// Function to show processing status
function showProcessingStatus(message: any, loading: boolean) {
  if (loading) {
    processingStatusBarItem.text = `⇪ Update Now: $(sync~spin) ${message}`;
  } else {
    processingStatusBarItem.text = `⇪ Update Now: ${message}`;
  }
  processingStatusBarItem.show();
}

// Function to hide processing status
function hideProcessingStatus() {
  processingStatusBarItem.hide();
}

export function deactivate(): void { }
