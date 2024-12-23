import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { debounce } from "./utils/debounce";
import { getUpdateType } from "./utils/getUpdateType";
import { getVersionPrefix } from "./utils/getVersionPrefix";
import { VersionInfo, IDependencyData, UpdateType } from "./utils/types";
import semver from "semver";
import { incrementUpgradeCount } from "./utils/incrementUpgradeCount";
import { getPosition } from "./utils/getPosition";
import { CacheViewProvider } from './webview/CacheViewProvider';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: Record<string, IDependencyData> = {};

  constructor(private context: vscode.ExtensionContext) { }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    if (isPackageJson(document)) {
      const packageJson = JSON.parse(document.getText());
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};

      const storedDependencies = this.context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});

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
          // Recalculate update type since package.json version might have changed
          this.dependenciesData[packageName] = {
            ...storedDependency,
            updateType: getUpdateType(currentVersion, storedDependency.version) as UpdateType
          };

          console.log(packageName + ": " + JSON.stringify(storedDependencies[packageName], null, 2));
          console.log(packageName + ": " + JSON.stringify(this.dependenciesData[packageName], null, 2));
        }
      }

      if (this.promises.length > 0) {
        await Promise.all(this.promises);
        await this.context.workspaceState.update('dependenciesData', this.dependenciesData);
      }

      this.addCodeLenses(codeLenses, document);
    }

    return codeLenses;
  }

  private async updateDependencyData(document: vscode.TextDocument, packageName: string, currentVersion: string) {
    if (!currentVersion) {
      console.warn(`Current version for package ${packageName} is undefined.`);
      return;
    }

    const latestVersionData = await getLatestVersion(packageName);
    if (!latestVersionData) { return; };

    const position = getPosition(document, packageName);
    const latestVersion = latestVersionData.version;
    const updateType = getUpdateType(currentVersion, latestVersion);

    this.dependenciesData[packageName] = {
      version: latestVersion,
      description: latestVersionData.description,
      author: latestVersionData.author?.name || "various contributors",
      timestamp: Date.now(),
      updateType: updateType as UpdateType,
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
            arguments: [document.uri, packageName, latestVersion],
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

async function updateDependency(this: any, context: vscode.ExtensionContext, documentUri: vscode.Uri, packageName: string, latestVersion: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();
  const packageJson = JSON.parse(text);
  const currentVersion = packageJson.dependencies[packageName] || packageJson.devDependencies[packageName];

  if (!currentVersion) {
    vscode.window.showErrorMessage(`Current version for package ${packageName} not found.`);
    return;
  }

  const isMajorUpdate = semver.diff(latestVersion, currentVersion.replace(/^[~^]/, "")) === "major";
  const versionPrefix = getVersionPrefix(currentVersion);
  let updatedVersion = latestVersion;
  if (!isMajorUpdate && versionPrefix) {
    updatedVersion = versionPrefix + updatedVersion;
  }

  if (packageJson.dependencies[packageName]) {
    packageJson.dependencies[packageName] = updatedVersion;
  } else if (packageJson.devDependencies[packageName]) {
    packageJson.devDependencies[packageName] = updatedVersion;
  }

  const updatedText = JSON.stringify(packageJson, null, 2);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updatedText);
  await vscode.workspace.applyEdit(edit);
  await document.save();

  const storedDependencies = context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});
  storedDependencies[packageName] = {
    ...storedDependencies[packageName],
    version: latestVersion,
    timestamp: Date.now(),
    updateType: UpdateType.latest,
  };
  await context.workspaceState.update('dependenciesData', storedDependencies);

  await incrementUpgradeCount(context);

  // Get existing tracking data and ensure it's an array
  let existingData = context.workspaceState.get('trackUpdate') as any;
  if (!Array.isArray(existingData)) {
    existingData = existingData ? [existingData] : [];
  }
  
  // Add new update to the array
  await context.workspaceState.update('trackUpdate', [
    ...existingData,
    {
      packageName,
      currentVersion,
      latestVersion,
      updateType: getUpdateType(currentVersion, latestVersion),
      timestamp: Date.now()
    }
  ]);

  // Refresh the cache webview
  if (cacheViewProvider) {
    await vscode.commands.executeCommand('update-now.showCacheView');
  }

  vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
}

async function updateAllDependencies(context: vscode.ExtensionContext, documentUri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const packageJson = JSON.parse(document.getText());
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  const dependenciesToUpdate: string[] = [];

  const storedDependencies = context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});

  for (const packageName in { ...dependencies, ...devDependencies }) {
    const currentVersion = dependencies[packageName] || devDependencies[packageName];
    const versionPrefix = getVersionPrefix(currentVersion);
    const strippedCurrentVersion = currentVersion.replace(/^[~^]/, "");
    const latestVersionData = storedDependencies[packageName] && Date.now() - storedDependencies[packageName].timestamp < ONE_DAY_IN_MS
      ? storedDependencies[packageName]
      : (await getLatestVersion(packageName)) as VersionInfo | null;

    const isURL = (currentVersion: string) => /^https?:/.test(currentVersion) || /^git(\+ssh|\+https|\+file)?:/.test(currentVersion) || /^git@/.test(currentVersion) || /^[^\/]+\/[^\/]+$/.test(currentVersion);

    if (latestVersionData && latestVersionData.version && semver.valid(latestVersionData.version) && !isURL(currentVersion)) {
      const diff = semver.diff(latestVersionData.version, strippedCurrentVersion);
      const isPatchUpdate = diff === "patch";
      const isMinorUpdate = diff === "minor";

      let newVersion = latestVersionData.version;
      if (versionPrefix === "~" && isPatchUpdate) {
        newVersion = "~" + newVersion;
      } else if (versionPrefix === "^" && (isPatchUpdate || isMinorUpdate)) {
        newVersion = "^" + newVersion;
      }

      if (newVersion !== currentVersion) {
        dependenciesToUpdate.push(packageName);
        if (dependencies[packageName]) {
          packageJson.dependencies[packageName] = newVersion;
        } else if (devDependencies[packageName]) {
          packageJson.devDependencies[packageName] = newVersion;
        }
        storedDependencies[packageName] = {
          version: newVersion,
          timestamp: Date.now(),
          updateType: UpdateType.latest,
        };
      }
    }
  }

  if (dependenciesToUpdate.length !== 0) {
    const updatedText = JSON.stringify(packageJson, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), updatedText);
    await vscode.workspace.applyEdit(edit);
    await document.save();

    await context.workspaceState.update('dependenciesData', storedDependencies);
    await incrementUpgradeCount(context);

    vscode.window.showInformationMessage("Yay! 🥳 All dependencies have been updated to their latest version.");
  } else {
    vscode.window.showInformationMessage("All dependencies are up to date.");
  }
}

let cacheViewProvider: CacheViewProvider;

export function activate(context: vscode.ExtensionContext): void {
  context.globalState.update("dependencyUpgradeCount", 0);

  const provider = new DependencyCodeLensProvider(context);
  cacheViewProvider = new CacheViewProvider(context.extensionUri, context);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'json', pattern: '**/package.json' }, provider),
    vscode.window.registerWebviewViewProvider(CacheViewProvider.viewType, cacheViewProvider),
    vscode.commands.registerCommand("update-now.updateDependency", async (documentUri, packageName, latestVersion) => {
      await updateDependency(context, documentUri, packageName, latestVersion);
    }),
    vscode.commands.registerCommand("update-now.updateAllDependencies", async () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        await updateAllDependencies(context, editor.document.uri);
      }
    }),
    vscode.commands.registerCommand("update-now.showNotification", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor && isPackageJson(editor.document)) {
        showUpdateAllNotification();
      }
    }),
    vscode.commands.registerCommand("update-now.showCacheView", () => {
      vscode.commands.executeCommand('workbench.view.update-now-cache');
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      if (isPackageJson(document)) {
        provider.refreshCodeLenses(document);
      }
    })
  );
}

export function deactivate(): void { }
