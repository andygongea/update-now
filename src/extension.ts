import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { showRatingNotification } from "./commands/showRatingNotification";
import { debounce } from "./utils/debounce";
import { getUpdateType } from "./utils/getUpdateType";
import semver from "semver";

type VersionInfo = {
  version: string;
  description: string;
  author: Record<string, string>;
  dependencies: Record<string, string>;
};

class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: any = {};

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    if (isPackageJson(document)) {
      const packageJson = JSON.parse(document.getText());
      const dependencies = packageJson.dependencies || {};
      const devDependencies = packageJson.devDependencies || {};

      if (this.promises.length === 0) {
        this.promises = [...this.createDependencyPromises(document, dependencies, "dependencies"),
        ...this.createDependencyPromises(document, devDependencies, "devDependencies")];

        await Promise.all(this.promises);
      }

      for (const promise of this.promises) {
        const dependencyData = await promise;
        if (dependencyData.latestVersion !== null) {
          this.dependenciesData[dependencyData.packageName] = dependencyData;
        }
      }

      this.addCodeLenses(codeLenses, document);
    }

    return codeLenses;
  }

  private createDependencyPromises(document: vscode.TextDocument, dependencies: Record<string, string>, type: string) {
    return Object.keys(dependencies).map(async (packageName) => {
      const latestVersionData = (await getLatestVersion(packageName)) as VersionInfo | null;
      const currentVersion = dependencies[packageName];
      const position = getPosition(document, packageName);
      const latestVersion = latestVersionData ? latestVersionData.version : null;

      return {
        packageName,
        currentVersion,
        latestVersion,
        update: getUpdateType(currentVersion, latestVersion!),
        line: position.line,
        character: position.character,
        description: latestVersionData?.description,
        author: latestVersionData?.author?.name || "various contributors",
      };
    });
  }

  private addCodeLenses(codeLenses: vscode.CodeLens[], document: vscode.TextDocument) {
    const deps = this.dependenciesData;
    let patches = 0;
    let minors = 0;
    let majors = 0;

    for (const packageName in deps) {
      const { version: currentVersion, line, character, latestVersion, update, description, author } = deps[packageName];
      if (line === -1) { continue; }

      if (update !== "latest" && currentVersion !== "latest") {
        const range = new vscode.Range(line, character, line, character);
        let title = "";
        let tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n`;

        if (update === "patch") {
          patches++;
          title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
          tooltip += `❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
        } else if (update === "minor") {
          minors++;
          title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
          tooltip += `✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
        } else if (update === "major") {
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
    await this.provideCodeLenses(document);
  }, 50);
}

async function updateDependency(context: vscode.ExtensionContext, documentUri: vscode.Uri, packageName: string, latestVersion: string): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();
  const packageJson = JSON.parse(text);
  const currentVersion = packageJson.dependencies[packageName];

  const isMajorUpdate = semver.diff(latestVersion, currentVersion.replace(/^[~^]/, "")) === "major";
  const versionPrefix = currentVersion.match(/^[~^]/)?.[0];
  let updatedVersion = latestVersion;
  if (!isMajorUpdate && versionPrefix) {
    updatedVersion = versionPrefix + updatedVersion;
  }

  packageJson.dependencies[packageName] = updatedVersion;
  const updatedText = JSON.stringify(packageJson, null, 2);
  const edit = new vscode.WorkspaceEdit();
  edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updatedText);
  await vscode.workspace.applyEdit(edit);
  await document.save();

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

  return { line: line, character: character };
}

async function updateAllDependencies(context: vscode.ExtensionContext, documentUri: vscode.Uri): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const packageJson = JSON.parse(document.getText());
  const dependencies = packageJson.dependencies || {};
  const dependenciesToUpdate: string[] = [];

  for (const packageName in dependencies) {
    const currentVersion = dependencies[packageName];
    const versionPrefix = currentVersion.match(/^[~^]/)?.[0];
    const strippedCurrentVersion = currentVersion.replace(/^[~^]/, "");
    const latestVersionData = (await getLatestVersion(packageName)) as VersionInfo | null;

    if (latestVersionData && semver.valid(latestVersionData.version)) {
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
        packageJson.dependencies[packageName] = newVersion;
      }
    }
  }

  if (dependenciesToUpdate.length !== 0) {
    const updatedText = JSON.stringify(packageJson, null, 2);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), updatedText);
    await vscode.workspace.applyEdit(edit);
    await document.save();

    await incrementUpgradeCount(context);

    vscode.window.showInformationMessage("Yay! 🥳 All dependencies have been updated to their latest version.");
  } else {
    vscode.window.showInformationMessage("All dependencies are up to date.");
  }
}

async function incrementUpgradeCount(context: vscode.ExtensionContext): Promise<void> {
  const upgradeCountKey = "dependencyUpgradeCount";
  const count = (context.globalState.get<number>(upgradeCountKey) || 0) + 1;
  await context.globalState.update(upgradeCountKey, count);
  if (count === 10) {
    setTimeout(showRatingNotification, 2000);
  }
}

export function activate(context: vscode.ExtensionContext): void {
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

  const codeLensProvider = new DependencyCodeLensProvider();
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
