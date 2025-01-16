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
import { CacheViewProvider } from './webview/main/CacheViewProvider';
import { logger } from './utils/logger';
import { isURL } from './utils/isURL';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

let statusBarItem: vscode.StatusBarItem;

class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: Record<string, IDependencyData> = {};
  private totalDependencies: number = 0;
  private currentDependency: number = 0;
  private isProcessing: boolean = false;
  private currentBatchPromises: Promise<any>[] = [];
  private document: vscode.TextDocument | null = null;

  private updateStatusBar(message: string, isProcessing: boolean = false) {
    if (isProcessing) {
      statusBarItem.text = `⇪ Update Now: $(sync~spin) ${message}`;
    } else {
      statusBarItem.text = `⇪ Update Now: ${message}`;
    }
    statusBarItem.tooltip = "Updates across your scanned package.json files";
  }

  constructor(private context: vscode.ExtensionContext) { }

  private async validateAndUpdateDependencies(
    document: vscode.TextDocument,
    dependencies: Record<string, string>,
    storedDependencies: Record<string, IDependencyData>
  ): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.document = document;
    const currentTime = Date.now();
    const updatePromises: Promise<any>[] = [];
    this.currentBatchPromises = [];

    this.totalDependencies = Object.keys(dependencies).length;
    this.currentDependency = 0;
    const estimatedMinutes = Math.ceil(this.totalDependencies / 20);
    
    this.updateStatusBar(`Checking ${this.totalDependencies} dependencies (~${estimatedMinutes} min)`, true);
    
    for (const [packageName, currentVersion] of Object.entries(dependencies)) {
      const storedDependency = storedDependencies[packageName];
      const needsUpdate = !storedDependency || 
                         currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || 
                         storedDependency.version === null;

      if (needsUpdate) {
        this.currentDependency++;
        const remainingDeps = this.totalDependencies - this.currentDependency;
        const remainingMinutes = Math.ceil(remainingDeps / 20);
        const timeText = remainingMinutes > 0 ? `~${remainingMinutes} min remaining` : 'less than 1 min remaining';
        this.updateStatusBar(`Checking dependencies [${Math.max(1, this.currentDependency - 19)}...${this.currentDependency}] of ${this.totalDependencies} (${timeText})`, true);
        
        const promise = this.updateDependencyData(document, packageName, currentVersion);
        updatePromises.push(promise);
        this.currentBatchPromises.push(promise);
        
        // When we reach 20 dependencies or it's the last one, process the current batch
        if (this.currentBatchPromises.length === 20 || this.currentDependency === this.totalDependencies) {
          await Promise.all(this.currentBatchPromises);
          await this.context.workspaceState.update('dependenciesData', this.dependenciesData);
          
          // Refresh CodeLens and Cache View after each batch
          this.refreshCodeLenses(this.document);
          if (cacheViewProvider) {
            cacheViewProvider.refresh();
          }
          
          this.currentBatchPromises = [];
        }
      } else {
        this.updateStoredDependency(packageName, currentVersion, storedDependency);
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
      await this.context.workspaceState.update('dependenciesData', this.dependenciesData);
    }

    // Update status bar with results
    const outdatedCount = Object.values(this.dependenciesData).filter(dep => dep.updateType !== "latest").length;
    if (outdatedCount > 0) {
      this.updateStatusBar(`📦 ${outdatedCount} updates available`);
    } else {
      this.updateStatusBar(`✅ All up to date`);
    }
    
    this.isProcessing = false;
    
    // Final refresh of Cache View
    if (cacheViewProvider) {
      cacheViewProvider.refresh();
    }
  }

  private updateStoredDependency(
    packageName: string, 
    currentVersion: string, 
    storedDependency: IDependencyData
  ): void {
    const updatedData = {
      ...storedDependency,
      updateType: getUpdateType(currentVersion, storedDependency.version || '') as UpdateType
    };
    
    this.dependenciesData[packageName] = updatedData;
  }

  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    if (!isPackageJson(document)) {
      return codeLenses;
    }

    try {
      const packageJson = JSON.parse(document.getText());
      const allDependencies = {
        ...packageJson.dependencies || {},
        ...packageJson.devDependencies || {}
      };

      const storedDependencies = this.context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});
      this.dependenciesData = Object.keys(storedDependencies).length !== 0 ? storedDependencies : {};

      await this.validateAndUpdateDependencies(document, allDependencies, storedDependencies);
      this.addCodeLenses(codeLenses, document);

      return codeLenses;
    } catch (error) {
      console.error(`[⇪ Update Now] Error in provideCodeLenses:`, error);
      return codeLenses;
    }
  }

  private async updateDependencyData(document: vscode.TextDocument, packageName: string, currentVersion: string) {
    if (!currentVersion) {
      console.warn(`[⇪ Update Now] ` + `Current version for package ${packageName} is undefined.`);
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

    // Get configuration settings
    const config = vscode.workspace.getConfiguration('update-now.codeLens');
    const showPatch = config.get<boolean>('patch', true);
    const showMinor = config.get<boolean>('minor', true);
    const showMajor = config.get<boolean>('major', true);

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
        // Skip if the update type is disabled in settings
        if ((updateType === "patch" && !showPatch) ||
            (updateType === "minor" && !showMinor) ||
            (updateType === "major" && !showMajor)) {
          continue;
        }

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
    
    // Handle disabled CodeLens notification
    const disabledTypes = [];
    if (!showPatch) {disabledTypes.push("patch");}
    if (!showMinor) {disabledTypes.push("minor");}
    if (!showMajor) {disabledTypes.push("major");}

    if (patches + minors + majors > 0) {
      // Add disabled types notification if any
      if (disabledTypes.length > 0) {
        codeLenses.unshift(
          new vscode.CodeLens(summaryRange, {
            title: `⚠️ You have disabled CodeLens for ${disabledTypes.join(" and ")} updates.`,
            tooltip: "You can enable these update types in settings",
            command: ""
          })
        );
      }
      const summaryTitle = `⇪ Update Now: ${patches + minors + majors
        } updates available (❇️ ${patches} x patch, ✴️ ${minors} x minor, 🛑 ${majors} x major)`;

      codeLenses.unshift(
        new vscode.CodeLens(summaryRange, {
          title: summaryTitle,
          tooltip: "Please be careful when updating all dependencies at once. \nMINOR ✴️ and MAJOR 🛑 updates can break your code functionality.",
          command: "update-now.showNotification",
        })
      );

    } else {
      // When no updates are available or all types are disabled
      if (disabledTypes.length === 3) {
        // All update types are disabled
        codeLenses.unshift(
          new vscode.CodeLens(summaryRange, {
            title: "⇪ Update Now: All CodeLens are disabled.",
            tooltip: "CodeLens for PATCH, MINOR and MAJOR are disabled.",
            command: "update-now.enableAllCodeLens"
          }),
          new vscode.CodeLens(summaryRange, {
            title: "👉 Enable codeLens for PATCH, MINOR and MAJOR updates.",
            command: "update-now.enableAllCodeLens"
          })
        );
      } else {
        // No updates available but some types are enabled
        codeLenses.unshift(
          new vscode.CodeLens(summaryRange, {
            title: "Congrats! 🙌 Your dependencies are up to date.",
            command: ""
          })
        );
        
        if (disabledTypes.length > 0) {
          codeLenses.unshift(
            new vscode.CodeLens(summaryRange, {
              title: `⚠️ You have disabled codeLens for ${disabledTypes.join(" and ")} updates.`,
              tooltip: "You can enable these update types in settings",
              command: ""
            })
          );
        }
      }
    }
  }

  refreshCodeLenses = debounce(async (document: vscode.TextDocument) => {
    // Just trigger the CodeLens refresh without clearing cache
    this._onDidChangeCodeLenses.fire();
    
    // Reset only the promises array for new checks
    this.promises = [];
    
    // Let provideCodeLenses handle cache validation
    await this.provideCodeLenses(document);
  }, 50);
}

async function updateDependency(this: any, context: vscode.ExtensionContext, documentUri: vscode.Uri, packageName: string, latestVersion: string, showNotification: boolean = true): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();
  const packageJson = JSON.parse(text);
  const currentVersion = packageJson.dependencies[packageName] || packageJson.devDependencies[packageName];

  if (!currentVersion) {
    vscode.window.showErrorMessage(`Current version for package ${packageName} not found.`);
    return;
  }

  // Clean versions for comparison
  const cleanCurrentVersion = currentVersion.replace(/^[~^]/, "");
  const cleanLatestVersion = latestVersion.replace(/^[~^]/, "");

  if (!cleanLatestVersion) {
    vscode.window.showErrorMessage(`Invalid version format: ${latestVersion}`);
    return;
  }

  // Compare clean versions
  const isMajorUpdate = semver.diff(cleanLatestVersion, cleanCurrentVersion) === "major";
  const versionPrefix = getVersionPrefix(currentVersion);
  
  // Only apply prefix if it's not a major update and we had a prefix before
  let updatedVersion = cleanLatestVersion;
  if (!isMajorUpdate && versionPrefix) {
    // Validate the version with prefix is valid
    const prefixedVersion = versionPrefix + cleanLatestVersion;
    if (!semver.validRange(prefixedVersion)) {
      vscode.window.showErrorMessage(`Invalid version format after applying prefix: ${prefixedVersion}`);
      return;
    }
    updatedVersion = prefixedVersion;
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
    try {
      cacheViewProvider.refresh();
    } catch (error) {
      console.error('Failed to refresh cache view:', error);
    }
  }

  if (showNotification) {
    vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
  }
}

async function updateAllDependencies(context: vscode.ExtensionContext, documentUri: vscode.Uri): Promise<void> {
  logger.info('Starting update all dependencies process');
  const document = await vscode.workspace.openTextDocument(documentUri);
  const packageJson = JSON.parse(document.getText());
  const dependencies = packageJson.dependencies || {};
  const devDependencies = packageJson.devDependencies || {};
  const storedDependencies = context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});
  const dependenciesToUpdate: string[] = [];

  logger.debug('Initial package.json state:', { dependencies, devDependencies });

  for (const packageName in { ...dependencies, ...devDependencies }) {
    try {
      logger.info(`Processing package: ${packageName}`);
      const currentVersion = dependencies[packageName] || devDependencies[packageName];
      
      if (isURL(currentVersion)) {
        logger.info(`Skipping ${packageName} - URL dependency`);
        continue;
      }

      const latestVersionData = storedDependencies[packageName] && Date.now() - storedDependencies[packageName].timestamp < ONE_DAY_IN_MS
        ? storedDependencies[packageName]
        : (await getLatestVersion(packageName)) as VersionInfo | null;

      logger.debug(`Latest version data for ${packageName}:`, latestVersionData);

      if (latestVersionData?.version && semver.valid(latestVersionData.version)) {
        const strippedCurrentVersion = currentVersion.replace(/^[~^]/, "");
        if (latestVersionData.version !== strippedCurrentVersion) {
          const updateType = getUpdateType(currentVersion, latestVersionData.version);
          const config = vscode.workspace.getConfiguration('update-now.codeLens');
          const shouldUpdate = (updateType === "patch" && config.get<boolean>('patch', true)) ||
                             (updateType === "minor" && config.get<boolean>('minor', true)) ||
                             (updateType === "major" && config.get<boolean>('major', true));

          if (shouldUpdate) {
            logger.info(`Update found for ${packageName}: ${currentVersion} -> ${latestVersionData.version}`);
            dependenciesToUpdate.push(packageName);
            await updateDependency(context, documentUri, packageName, latestVersionData.version, false);
          } else {
            logger.info(`Skipping ${packageName} - update type ${updateType} is disabled in settings`);
          }
        } else {
          logger.info(`No update needed for ${packageName}`);
        }
      } else {
        logger.info(`Skipping ${packageName} - invalid version data`);
      }
    } catch (error) {
      logger.error(`Error processing package ${packageName}`, error);
    }
  }

  logger.info(`Processed ${dependenciesToUpdate.length} dependencies`);
  
  if (dependenciesToUpdate.length === 0) {
    logger.info('No dependencies need updating');
    vscode.window.showInformationMessage("All dependencies are up to date.");
  } else {
    logger.info('Successfully updated all dependencies');
    vscode.window.showInformationMessage(`🎉 Congrats! You just updated ${dependenciesToUpdate.length} dependencies to their latest versions. Please ensure you code still runs as intended.`);
  }
}

let cacheViewProvider: CacheViewProvider;

export function activate(context: vscode.ExtensionContext): void {
  // Create status bar item
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.text = "⇪ Update Now: ✅ Ready";
  statusBarItem.tooltip = "Updates across your scanned package.json files";
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  context.globalState.update("dependencyUpgradeCount", 0);

  const provider = new DependencyCodeLensProvider(context);
  cacheViewProvider = new CacheViewProvider(context.extensionUri, context);

  vscode.workspace.findFiles('**/package.json', '**/node_modules/**').then(async (packageJsonFiles) => {
    if (packageJsonFiles.length > 0) {
      const document = await vscode.workspace.openTextDocument(packageJsonFiles[0]);
      provider.refreshCodeLenses(document);
    }
  });

  // Command to enable all CodeLens types
  let enableAllCodeLensCommand = vscode.commands.registerCommand('update-now.enableAllCodeLens', () => {
    const config = vscode.workspace.getConfiguration('update-now');
    
    // Update all settings in parallel
    Promise.all([
      config.update('codeLens.patch', true, true),
      config.update('codeLens.minor', true, true),
      config.update('codeLens.major', true, true)
    ]).then(async () => {
      // Get active editor
      const editor = vscode.window.activeTextEditor;
      if (editor && isPackageJson(editor.document)) {
        // Refresh CodeLenses for the current document
        await provider.refreshCodeLenses(editor.document);
      }
      
      // Refresh cache view if it exists
      if (cacheViewProvider) {
        await cacheViewProvider.refresh();
      }
      
      vscode.window.showInformationMessage('All CodeLens types have been enabled.');
    });
  });
  context.subscriptions.push(enableAllCodeLensCommand);

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ language: 'json', pattern: '**/package.json' }, provider),
    vscode.window.registerWebviewViewProvider(CacheViewProvider.viewType, cacheViewProvider),
    cacheViewProvider,
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
    vscode.commands.registerCommand("update-now.showCacheView", async () => {
      try {
        await vscode.commands.executeCommand('workbench.view.update-now-cache');
      } catch (error) {
        console.error('[⇪ Update Now] Failed to show cache view:', error);
      }
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
