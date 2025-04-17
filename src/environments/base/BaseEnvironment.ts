import * as vscode from 'vscode';
import { IEnvironment } from './interfaces';
import { IDependencyData, IDependencyInfo, IPackagePosition, IUpdateAllOptions, UpdateType, IVersionInfo } from './types';

/**
 * Abstract base class that implements common functionality for all environments
 * Specific environment implementations (npm, pip, etc.) will extend this class
 */
export abstract class BaseEnvironment implements IEnvironment {
  // Required properties to be implemented by specific environments
  abstract id: string;
  abstract name: string;
  abstract fileExtensions: string[];
  abstract filePatterns: string[];
  
  // Required methods to be implemented by specific environments
  abstract detectDependencyFile(document: vscode.TextDocument): boolean;
  abstract parseDependencies(document: vscode.TextDocument): IDependencyInfo[];
  abstract getLatestVersion(packageName: string, currentVersion: string): Promise<IVersionInfo | null>;
  abstract updateDependency(document: vscode.TextDocument, packageName: string, newVersion: string, section?: string): Promise<boolean>;
  abstract getDependencyPosition(document: vscode.TextDocument, packageName: string, section?: string): IPackagePosition | null;
  
  /**
   * Updates all dependencies in the document based on the provided options
   * This provides a shared implementation that can be overridden by specific environments if needed
   */
  async updateAllDependencies(document: vscode.TextDocument, options?: IUpdateAllOptions): Promise<number> {
    const dependencies = this.parseDependencies(document);
    let updateCount = 0;
    
    const config = vscode.workspace.getConfiguration('update-now.codeLens');
    const includePatch = options?.includePatch ?? config.get<boolean>('patch', true);
    const includeMinor = options?.includeMinor ?? config.get<boolean>('minor', true);
    const includeMajor = options?.includeMajor ?? config.get<boolean>('major', true);
    
    for (const dep of dependencies) {
      if (!dep.latestVersion || dep.currentVersion === dep.latestVersion) {
        continue; // Skip if no update available
      }
      
      // Skip based on update type filtering
      if ((dep.updateType === UpdateType.patch && !includePatch) ||
          (dep.updateType === UpdateType.minor && !includeMinor) ||
          (dep.updateType === UpdateType.major && !includeMajor)) {
        continue;
      }
      
      // Update the dependency and increment count if successful
      const success = await this.updateDependency(
        document, 
        dep.name, 
        dep.latestVersion,
        dep.section
      );
      
      if (success) {
        updateCount++;
      }
    }
    
    return updateCount;
  }
  
  /**
   * Gets stored dependency data for this environment from extension context
   */
  getStoredDependenciesData(context: vscode.ExtensionContext): Record<string, IDependencyData> {
    const key = `dependenciesData.${this.id}`;
    return context.workspaceState.get<Record<string, IDependencyData>>(key, {});
  }
  
  /**
   * Updates stored dependency data for this environment in extension context
   */
  async updateStoredDependencyData(
    context: vscode.ExtensionContext,
    packageName: string,
    data: IDependencyData
  ): Promise<void> {
    const key = `dependenciesData.${this.id}`;
    const dependencies = this.getStoredDependenciesData(context);
    dependencies[packageName] = data;
    await context.workspaceState.update(key, dependencies);
  }
}
