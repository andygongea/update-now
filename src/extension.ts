import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { debounce } from "./utils/debounce";
import { getUpdateType } from "./utils/getUpdateType";
import { getVersionPrefix } from "./utils/getVersionPrefix";
import { VersionInfo } from "./utils/types";
import semver from "semver";
import { incrementUpgradeCount } from "./utils/incrementUpgradeCount";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

interface DependencyData {
  version: string | null;
  description?: string;
  author?: string;
  timestamp: number;
  updateType?: "major" | "minor" | "patch" | "latest" | "invalid" | "invalid latest" | "url";
}

class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: Record<string, DependencyData> = {};

  constructor(private context: vscode.ExtensionContext) {}

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    if (isPackageJson(document)) {
      const packageJson = JSON.parse(document.getText());
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};

      const storedDependencies = this.context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});

      console.log(JSON.stringify(storedDependencies, null, 2));

      if (Object.keys(storedDependencies).length !== 0) {
        this.dependenciesData = storedDependencies;
      }

      const currentTime = Date.now();
      for (const packageName in { ...dependencies, ...devDependencies }) {
        const currentVersion = dependencies[packageName] || devDependencies[packageName];
        const storedDependency = storedDependencies[packageName];
        if (!storedDependency || currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || storedDependency.version === null) {
          this.promises.push(this.updateDependencyData(document, packageName, currentVersion));
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

    const latestVersionData = (await getLatestVersion(packageName)) as VersionInfo | null;
    const position = getPosition(document, packageName);
    const latestVersion = latestVersionData ? latestVersionData.version : null;
    const updateType = getUpdateType(currentVersion, latestVersion!);

    this.dependenciesData[packageName] = {
      version: latestVersion,
      description: latestVersionData?.description,
      author: latestVersionData?.author?.name || "various contributors",
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
      description: latestVersionData?.description,
      author: latestVersionData?.author?.name || "various contributors",
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

async function updateDependency(context: vscode.ExtensionContext, documentUri: vscode.Uri, packageName: string, latestVersion: string): Promise<void> {
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

  const storedDependencies = context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});
  storedDependencies[packageName] = {
    ...storedDependencies[packageName],
    version: latestVersion,
    timestamp: Date.now(),
    updateType: "latest",
  };
  await context.workspaceState.update('dependenciesData', storedDependencies);

  await incrementUpgradeCount(context);

  vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
}

function getPosition(document: vscode.TextDocument, packageName: string) {
  const regex = new RegExp(`"${packageName}"\\s*:`);
  const line = document
    .getText()
    .split("\n")
    .findIndex((line) => regex.test(line));
  const character = document.lineAt(line).text.indexOf(`"${packageName}":`);

  return { line, character };
}

async function updateAllDependencies(context: vscode.ExtensionContext, documentUri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const packageJson = JSON.parse(document.getText());
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  const dependenciesToUpdate: string[] = [];

  const storedDependencies = context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});

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
          updateType: "latest",
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

export function activate(context: vscode.ExtensionContext): void {
  context.globalState.update("dependencyUpgradeCount", 0);

  context.subscriptions.push(
    vscode.commands.registerCommand("update-now.updateDependency", async (documentUri, packageName, latestVersion) => {
      await updateDependency(context, documentUri, packageName, latestVersion);
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

export function deactivate(): void {}