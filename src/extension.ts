import * as vscode from "vscode";
import { isPackageJson } from "./utils/isPackageJson";
import { getLatestVersion } from "./utils/getLatestVersion";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { debounce } from "./utils/debounce";
import { getUpdateType } from "./utils/getUpdateType";
import { getVersionPrefix } from "./utils/getVersionPrefix";
import { VersionInfo, IDependencyData, UpdateType, IPackagePosition } from "./utils/types";
import semver from "semver";
import { incrementUpgradeCount } from "./utils/incrementUpgradeCount";
import { getPosition } from "./utils/getPosition";
import { CacheViewProvider } from './views/main/CacheViewProvider';
import { CachedDataView } from './views/debug/CachedDataView';
import { logger } from './utils/logger';
import { isURL } from './utils/isURL';
import { initializeStatusBar, updateStatusBar } from './views/statusBar';

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

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

  private updateStatusBar(message: string, isProcessing: boolean = false, cachedDependenciesCount?: number) {
    updateStatusBar(message, isProcessing, cachedDependenciesCount);
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
      const needsUpdate = !storedDependency || currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || storedDependency.version === null;

      if (needsUpdate) {
        this.currentDependency++;
        const remainingDeps = this.totalDependencies - this.currentDependency;
        const remainingMinutes = Math.ceil(remainingDeps / 20);
        const timeText = remainingMinutes > 0 ? `~${remainingMinutes} min remaining` : 'less than 1 min remaining';
        this.updateStatusBar(`Fetching [${Math.max(1, this.currentDependency - 19)}...${this.currentDependency}] of ${this.totalDependencies} dependencies (${timeText})`, true);

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
    const cachedDependenciesCount = Object.keys(this.dependenciesData).length;
    const outdatedCount = Object.values(this.dependenciesData).filter(dep => dep.updateType !== "latest").length;
    if (outdatedCount > 0) {
      this.updateStatusBar(`${outdatedCount} outdated dependencies`, false, cachedDependenciesCount);
    } else {
      this.updateStatusBar('All dependencies up to date', false, cachedDependenciesCount);
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
      description: latestVersionData.description,
      author: latestVersionData.author?.name || "various contributors",
    };
  }

  private addCodeLenses(codeLenses: vscode.CodeLens[], document: vscode.TextDocument) {
    const deps = this.dependenciesData;

    // Performance optimization: Use Map for counting updates
    const updateCounts = new Map<UpdateType, number>([
      [UpdateType.patch, 0],
      [UpdateType.minor, 0],
      [UpdateType.major, 0]
    ]);

    // Get configuration settings
    const config = vscode.workspace.getConfiguration('update-now.codeLens');
    const showPatch = config.get<boolean>('patch', true);
    const showMinor = config.get<boolean>('minor', true);
    const showMajor = config.get<boolean>('major', true);

    // Performance optimization: Get document text and parse JSON once outside the loop
    const documentText = document.getText();
    const packageJson = JSON.parse(documentText);

    for (const packageName in deps) {
      const { version, description, author } = deps[packageName];

      // Get positions dynamically when needed instead of storing them
      const positions = getPosition(document, packageName);

      // Check if we have valid positions in dependencies or devDependencies sections
      const validPositions = positions?.filter((pos: IPackagePosition) => pos.inDependencies && pos.line !== -1) || [];

      if (validPositions.length === 0) {
        continue; // Skip if no valid positions found
      }

      // Count each instance of a package (could appear in both dependencies and devDependencies)

      // Create a CodeLens for each position where the package appears
      for (const position of validPositions) {
        // Determine if this position is in dependencies or devDependencies
        const isDev = this.isInDevDependencies(document, position.line);
        const sectionType = isDev ? 'devDependencies' : 'dependencies';
        const currentVersion = packageJson[sectionType]?.[packageName];

        if (!currentVersion) {
          continue;
        }

        const latestVersion = version;

        // Skip if the package in this section is already at the latest version
        const cleanCurrentVersion = currentVersion.replace(/^[~^]/, "");
        const cleanLatestVersion = latestVersion ? latestVersion.replace(/^[~^]/, "") : '';

        if (cleanCurrentVersion === cleanLatestVersion) {
          continue;
        }

        // Calculate update type dynamically
        const calculatedUpdateType = getUpdateType(currentVersion, latestVersion || '');

        // Skip if the update type is disabled in settings
        if ((calculatedUpdateType === "patch" && !showPatch) ||
          (calculatedUpdateType === "minor" && !showMinor) ||
          (calculatedUpdateType === "major" && !showMajor)) {
          continue;
        }

        // Update counts for this package instance
        if (calculatedUpdateType === "patch" || calculatedUpdateType === "minor" || calculatedUpdateType === "major") {
          // Increment the count for this update type
          const currentCount = updateCounts.get(calculatedUpdateType as UpdateType) || 0;
          updateCounts.set(calculatedUpdateType as UpdateType, currentCount + 1);


          // Add CodeLens for this position
          this.addIndividualCodeLens(
            codeLenses,
            document,
            packageName,
            position,
            sectionType,
            currentVersion,
            latestVersion || '',
            description,
            author
          );
        }


      }
    }

    const summaryRange = new vscode.Range(0, 0, 0, 0);

    // Handle disabled CodeLens notification
    const disabledTypes = [];
    if (!showPatch) { disabledTypes.push("patch"); }
    if (!showMinor) { disabledTypes.push("minor"); }
    if (!showMajor) { disabledTypes.push("major"); }

    const totalUpdates = (updateCounts.get(UpdateType.patch) || 0) + (updateCounts.get(UpdateType.minor) || 0) + (updateCounts.get(UpdateType.major) || 0);
    if (totalUpdates > 0) {
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
      const summaryTitle = `⇪ Update Now: ${totalUpdates
        } updates available (❇️ ${updateCounts.get(UpdateType.patch)} x patch, ✴️ ${updateCounts.get(UpdateType.minor)} x minor, 🛑 ${updateCounts.get(UpdateType.major)} x major)`;

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

  /**
   * Creates an individual CodeLens for a specific package and position
   */
  private addIndividualCodeLens(
    codeLenses: vscode.CodeLens[],
    document: vscode.TextDocument,
    packageName: string,
    position: IPackagePosition,
    sectionType: string,
    currentVersion: string,
    latestVersion: string,
    description?: string | null | undefined,
    author?: string | null | undefined
  ): void {
    const range = new vscode.Range(position.line, position.character, position.line, position.character);

    // Safely handle potentially null/undefined values
    const displayAuthor = author || "various contributors";
    let strippedDescription = description ? description.replace(/<[^>]*>/g, '').trim() : '';
    let title = "";
    let tooltip = `📦 ${packageName} (${sectionType}) \n  ├  by ${displayAuthor} \n  ╰  ${strippedDescription}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n`;

    // Calculate update type dynamically
    const updateType = getUpdateType(currentVersion, latestVersion);

    if (updateType === "patch") {
      title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
      tooltip += `❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
    } else if (updateType === "minor") {
      title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
      tooltip += `✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
    } else if (updateType === "major") {
      title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
      tooltip += `🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
    }

    codeLenses.push(
      new vscode.CodeLens(range, {
        title,
        tooltip,
        command: "update-now.updateDependency",
        arguments: [document.uri, packageName, latestVersion, sectionType],
      })
    );
  }

  // Helper method to determine if a line is in the devDependencies section
  private isInDevDependencies(document: vscode.TextDocument, lineNumber: number): boolean {
    const text = document.getText();
    const lines = text.split("\n");

    // Go backward from the current line to find section identifier
    for (let i = lineNumber; i >= 0; i--) {
      const line = lines[i].trim();

      // Found devDependencies section
      if (line.includes('"devDependencies"')) {
        return true;
      }

      // Found dependencies section
      if (line.includes('"dependencies"')) {
        return false;
      }

      // If we hit the end of a section, stop searching
      if (line === '}' && (i > 0 && lines[i - 1].includes('}'))) {
        return false;
      }
    }

    // Default to regular dependencies if we can't determine
    return false;
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

async function updateDependency(this: any, context: vscode.ExtensionContext, documentUri: vscode.Uri, packageName: string, latestVersion: string, sectionType: string = 'dependencies', showNotification: boolean = true): Promise<void> {
  const document = await vscode.workspace.openTextDocument(documentUri);
  const text = document.getText();
  const packageJson = JSON.parse(text);

  // Use the specified section type or fall back to finding it
  let currentVersion: string | undefined;
  if (sectionType === 'devDependencies') {
    currentVersion = packageJson.devDependencies?.[packageName];
  } else if (sectionType === 'dependencies') {
    currentVersion = packageJson.dependencies?.[packageName];
  } else {
    // Fallback to either section if not specified
    currentVersion = packageJson.dependencies?.[packageName] || packageJson.devDependencies?.[packageName];

    // Determine which section contains this package
    if (currentVersion) {
      sectionType = packageJson.dependencies?.[packageName] ? 'dependencies' : 'devDependencies';
    }
  }

  if (!currentVersion) {
    vscode.window.showErrorMessage(`Current version for package ${packageName} not found in ${sectionType}.`);
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

  // Only update the specified section
  if (sectionType === 'dependencies' && packageJson.dependencies?.[packageName]) {
    packageJson.dependencies[packageName] = updatedVersion;
  } else if (sectionType === 'devDependencies' && packageJson.devDependencies?.[packageName]) {
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

  // Process regular dependencies
  for (const packageName in dependencies) {
    try {
      logger.info(`Processing package in dependencies: ${packageName}`);
      const currentVersion = dependencies[packageName];

      if (isURL(currentVersion)) {
        logger.info(`Skipping ${packageName} - URL dependency`);
        continue;
      }

      await processPackageUpdate(packageName, currentVersion, 'dependencies');
    } catch (error) {
      logger.error(`Error processing package ${packageName} in dependencies`, error);
    }
  }

  // Process dev dependencies
  for (const packageName in devDependencies) {
    try {
      logger.info(`Processing package in devDependencies: ${packageName}`);
      const currentVersion = devDependencies[packageName];

      if (isURL(currentVersion)) {
        logger.info(`Skipping ${packageName} - URL dependency`);
        continue;
      }

      await processPackageUpdate(packageName, currentVersion, 'devDependencies');
    } catch (error) {
      logger.error(`Error processing package ${packageName} in devDependencies`, error);
    }
  }

  // Helper function to process each package
  async function processPackageUpdate(packageName: string, currentVersion: string, sectionType: string): Promise<void> {
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
          // Only add to the tracking list if we haven't seen it before
          if (!dependenciesToUpdate.includes(packageName)) {
            dependenciesToUpdate.push(packageName);
          }
          await updateDependency(context, documentUri, packageName, latestVersionData.version, sectionType, false);
        } else {
          logger.info(`Skipping ${packageName} - update type ${updateType} is disabled in settings`);
        }
      } else {
        logger.info(`No update needed for ${packageName}`);
      }
    } else {
      logger.info(`Skipping ${packageName} - invalid version data`);
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
let cachedDataView: CachedDataView;

export function activate(context: vscode.ExtensionContext): void {
  // Initialize status bar item
  initializeStatusBar(context);

  context.globalState.update("dependencyUpgradeCount", 0);

  const provider = new DependencyCodeLensProvider(context);
  cacheViewProvider = new CacheViewProvider(context.extensionUri, context);
  cachedDataView = new CachedDataView(context.extensionUri, context);

  vscode.workspace.findFiles('**/package.json', '**/node_modules/**').then(async (packageJsonFiles) => {
    if (packageJsonFiles.length > 0) {
      try {
        const document = await vscode.workspace.openTextDocument(packageJsonFiles[0]);
        provider.refreshCodeLenses(document);
      } catch (error: unknown) {
        console.error('Error opening package.json file:', error);
      }
    }
  }, (error: unknown) => {
    console.error('Error finding package.json files:', error);
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
    vscode.commands.registerCommand("update-now.updateDependency", async (documentUri, packageName, latestVersion, sectionType) => {
      // Ensure sectionType is a string
      const section = typeof sectionType === 'string' ? sectionType : 'dependencies';
      await updateDependency(context, documentUri, packageName, latestVersion, section);
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
    }),
    vscode.commands.registerCommand("update-now.showCacheData", () => {
      cachedDataView.show();
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
