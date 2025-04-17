import * as vscode from 'vscode';
import { IEnvironment } from './environments/base/interfaces';
import { EnvironmentRegistry } from './environments/EnvironmentRegistry';
import { IDependencyData, IDependencyInfo, UpdateType } from './environments/base/types';
import { debounce } from './utils/debounce';
import { getUpdateType } from './utils/getUpdateType';

/**
 * Provider for CodeLens that shows update information for dependencies
 * Works with any registered environment implementation
 */
export class DependencyCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
  public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

  private promises: Promise<any>[] = [];
  private dependenciesData: Record<string, Record<string, IDependencyData>> = {};
  private totalDependencies: number = 0;
  private currentDependency: number = 0;
  private isProcessing: boolean = false;
  private currentBatchPromises: Promise<any>[] = [];
  private document: vscode.TextDocument | null = null;

  constructor(private context: vscode.ExtensionContext) { }

  /**
   * Validates and updates dependency information
   */
  private async validateAndUpdateDependencies(
    document: vscode.TextDocument,
    environment: IEnvironment
  ): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    this.document = document;
    const currentTime = Date.now();
    const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

    // Get stored data for this environment
    const storedDependencies = environment.getStoredDependenciesData(this.context);
    
    // Parse dependencies from the document
    const dependencies = environment.parseDependencies(document);
    
    // Initialize dependenciesData for this environment if needed
    if (!this.dependenciesData[environment.id]) {
      this.dependenciesData[environment.id] = {};
    }
    this.dependenciesData[environment.id] = storedDependencies;

    const updatePromises: Promise<any>[] = [];
    this.currentBatchPromises = [];

    this.totalDependencies = dependencies.length;
    this.currentDependency = 0;
    const estimatedMinutes = Math.ceil(this.totalDependencies / 20);

    // Update status bar with progress information
    vscode.window.setStatusBarMessage(`[⇪ Update Now] Checking ${this.totalDependencies} dependencies (~${estimatedMinutes} min)`, 5000);

    // Process each dependency
    for (const dependency of dependencies) {
      const packageName = dependency.name;
      const currentVersion = dependency.currentVersion;
      
      const storedDependency = storedDependencies[packageName];
      const needsUpdate = !storedDependency || 
                          currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || 
                          storedDependency.version === null;

      if (needsUpdate) {
        this.currentDependency++;
        const remainingDeps = this.totalDependencies - this.currentDependency;
        const remainingMinutes = Math.ceil(remainingDeps / 20);
        const timeText = remainingMinutes > 0 ? `~${remainingMinutes} min remaining` : 'less than 1 min remaining';
        
        vscode.window.setStatusBarMessage(
          `[⇪ Update Now] Fetching [${Math.max(1, this.currentDependency - 19)}...${this.currentDependency}] of ${this.totalDependencies} dependencies (${timeText})`, 
          5000
        );

        const promise = this.updateDependencyData(environment, document, packageName, currentVersion);
        updatePromises.push(promise);
        this.currentBatchPromises.push(promise);

        // When we reach 20 dependencies or it's the last one, process the current batch
        if (this.currentBatchPromises.length === 20 || this.currentDependency === this.totalDependencies) {
          await Promise.all(this.currentBatchPromises);
          
          // Refresh CodeLens after each batch
          this._onDidChangeCodeLenses.fire();
          this.currentBatchPromises = [];
        }
      } else if (storedDependency) {
        // Use stored data but recalculate update type
        this.dependenciesData[environment.id][packageName] = {
          ...storedDependency,
          updateType: getUpdateType(currentVersion, storedDependency.version || '') as UpdateType
        };
      }
    }

    if (updatePromises.length > 0) {
      await Promise.all(updatePromises);
    }

    // Update status bar with results
    const outdatedCount = Object.values(this.dependenciesData[environment.id])
      .filter(dep => dep.updateType !== "latest")
      .length;
      
    if (outdatedCount > 0) {
      vscode.window.setStatusBarMessage(`[⇪ Update Now] 📦 ${outdatedCount} total updates available`, 10000);
    } else {
      vscode.window.setStatusBarMessage(`[⇪ Update Now] ✅ All up to date`, 5000);
    }

    this.isProcessing = false;
  }

  /**
   * Updates dependency data for a specific package
   */
  private async updateDependencyData(
    environment: IEnvironment,
    document: vscode.TextDocument,
    packageName: string,
    currentVersion: string
  ): Promise<void> {
    if (!currentVersion) {
      console.warn(`[⇪ Update Now] Current version for package ${packageName} is undefined.`);
      return;
    }

    try {
      const latestVersionData = await environment.getLatestVersion(packageName, currentVersion);
      if (!latestVersionData) { 
        return; 
      }

      const latestVersion = latestVersionData.version;
      const updateType = getUpdateType(currentVersion, latestVersion);

      const data: IDependencyData = {
        version: latestVersion,
        description: latestVersionData.description,
        author: latestVersionData.author?.name || "various contributors",
        timestamp: Date.now(),
        updateType: updateType as UpdateType,
      };

      this.dependenciesData[environment.id][packageName] = data;
      await environment.updateStoredDependencyData(this.context, packageName, data);
      
      return;
    } catch (error) {
      console.error(`[⇪ Update Now] Error updating dependency data for ${packageName}:`, error);
    }
  }

  /**
   * Provides CodeLenses for the document
   */
  async provideCodeLenses(document: vscode.TextDocument): Promise<vscode.CodeLens[]> {
    const codeLenses: vscode.CodeLens[] = [];

    // Find the appropriate environment for this document
    const environment = EnvironmentRegistry.getEnvironmentForDocument(document);
    if (!environment) {
      return codeLenses;
    }

    try {
      // Get stored dependencies data for this environment
      if (!this.dependenciesData[environment.id]) {
        this.dependenciesData[environment.id] = environment.getStoredDependenciesData(this.context);
      }

      // Update dependency information
      await this.validateAndUpdateDependencies(document, environment);
      
      // Add CodeLenses
      this.addCodeLenses(codeLenses, document, environment);

      return codeLenses;
    } catch (error) {
      console.error(`[⇪ Update Now] Error in provideCodeLenses:`, error);
      return codeLenses;
    }
  }

  /**
   * Adds CodeLenses to the document
   */
  private addCodeLenses(
    codeLenses: vscode.CodeLens[],
    document: vscode.TextDocument,
    environment: IEnvironment
  ): void {
    const envData = this.dependenciesData[environment.id] || {};
    
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

    // Parse dependencies for the current environment
    const dependencies = environment.parseDependencies(document);
    
    for (const dep of dependencies) {
      const packageName = dep.name;
      const currentVersion = dep.currentVersion;
      const storedData = envData[packageName];
      
      if (!storedData || !storedData.version) {
        continue;
      }
      
      const latestVersion = storedData.version;
      const position = dep.position;
      
      if (!position) {
        continue;
      }

      // Skip if already at latest version
      const cleanCurrentVersion = currentVersion.replace(/^[~^]/, "");
      const cleanLatestVersion = latestVersion.replace(/^[~^]/, "");
      
      if (cleanCurrentVersion === cleanLatestVersion) {
        continue;
      }

      // Calculate update type
      const updateType = getUpdateType(currentVersion, latestVersion);
      
      // Skip if update type is disabled in settings
      if ((updateType === "patch" && !showPatch) ||
          (updateType === "minor" && !showMinor) ||
          (updateType === "major" && !showMajor)) {
        continue;
      }

      // Count this update type
      if (updateType === "patch" || updateType === "minor" || updateType === "major") {
        const currentCount = updateCounts.get(updateType as UpdateType) || 0;
        updateCounts.set(updateType as UpdateType, currentCount + 1);

        // Add individual CodeLens
        this.addIndividualCodeLens(
          codeLenses,
          document,
          environment,
          packageName,
          position,
          dep.section || 'dependencies',
          currentVersion,
          latestVersion,
          storedData.description,
          storedData.author
        );
      }
    }

    // Add summary CodeLenses at the top of the file
    this.addSummaryCodeLenses(codeLenses, document, updateCounts, showPatch, showMinor, showMajor);
  }

  /**
   * Adds a CodeLens for an individual dependency
   */
  private addIndividualCodeLens(
    codeLenses: vscode.CodeLens[],
    document: vscode.TextDocument,
    environment: IEnvironment,
    packageName: string,
    position: any,
    sectionType: string,
    currentVersion: string,
    latestVersion: string,
    description?: string | null,
    author?: string | null
  ): void {
    const range = new vscode.Range(position.line, position.character, position.line, position.character);

    // Safely handle potentially null/undefined values
    const displayAuthor = author || "various contributors";
    let strippedDescription = description ? description.replace(/<[^>]*>/g, '').trim() : '';
    let title = "";
    let tooltip = `📦 ${packageName} (${sectionType}) \n  ├  by ${displayAuthor} \n  ╰  ${strippedDescription}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n`;

    // Calculate update type
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
        arguments: [environment.id, document.uri, packageName, latestVersion, sectionType],
      })
    );
  }

  /**
   * Adds summary CodeLenses at the top of the file
   */
  private addSummaryCodeLenses(
    codeLenses: vscode.CodeLens[],
    document: vscode.TextDocument,
    updateCounts: Map<UpdateType, number>,
    showPatch: boolean,
    showMinor: boolean,
    showMajor: boolean
  ): void {
    const summaryRange = new vscode.Range(0, 0, 0, 0);

    // Handle disabled CodeLens notification
    const disabledTypes = [];
    if (!showPatch) { disabledTypes.push("patch"); }
    if (!showMinor) { disabledTypes.push("minor"); }
    if (!showMajor) { disabledTypes.push("major"); }

    const totalUpdates = (updateCounts.get(UpdateType.patch) || 0) + 
                         (updateCounts.get(UpdateType.minor) || 0) + 
                         (updateCounts.get(UpdateType.major) || 0);
                         
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
   * Refreshes CodeLenses for a document
   */
  refreshCodeLenses = debounce(async (document: vscode.TextDocument) => {
    // Just trigger the CodeLens refresh without clearing cache
    this._onDidChangeCodeLenses.fire();

    // Reset only the promises array for new checks
    this.promises = [];

    // Let provideCodeLenses handle cache validation
    await this.provideCodeLenses(document);
  }, 50);
}
