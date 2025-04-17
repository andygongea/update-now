import * as vscode from 'vscode';
import * as semver from 'semver';
import { BaseEnvironment } from '../base/BaseEnvironment';
import { IDependencyData, IDependencyInfo, IPackagePosition, IVersionInfo, UpdateType } from '../base/types';
import { isPackageJson } from '../../utils/isPackageJson';
import { getLatestVersion as fetchLatestVersion } from '../../utils/getLatestVersion';
import { getUpdateType } from '../../utils/getUpdateType';
import { getVersionPrefix } from '../../utils/getVersionPrefix';
import { getPosition } from '../../utils/getPosition';
import { isURL } from '../../utils/isURL';

/**
 * NPM package manager environment implementation
 * Handles package.json files and npm dependencies
 */
export class NpmEnvironment extends BaseEnvironment {
  id = 'npm';
  name = 'NPM';
  fileExtensions = ['.json'];
  filePatterns = ['**/package.json'];
  
  /**
   * Determines if the document is a package.json file
   */
  detectDependencyFile(document: vscode.TextDocument): boolean {
    return isPackageJson(document);
  }
  
  /**
   * Parses dependencies from package.json file
   */
  parseDependencies(document: vscode.TextDocument): IDependencyInfo[] {
    try {
      const packageJson = JSON.parse(document.getText());
      const dependencies: IDependencyInfo[] = [];
      
      // Process main dependencies section
      if (packageJson.dependencies) {
        for (const [name, currentVersion] of Object.entries<string>(packageJson.dependencies)) {
          if (isURL(currentVersion)) {
            continue; // Skip URL dependencies
          }
          
          const position = this.getDependencyPosition(document, name, 'dependencies');
          dependencies.push({
            name,
            currentVersion,
            section: 'dependencies',
            position: position === null ? undefined : position
          });
        }
      }
      
      // Process dev dependencies section
      if (packageJson.devDependencies) {
        for (const [name, currentVersion] of Object.entries<string>(packageJson.devDependencies)) {
          if (isURL(currentVersion)) {
            continue; // Skip URL dependencies
          }
          
          const position = this.getDependencyPosition(document, name, 'devDependencies');
          dependencies.push({
            name,
            currentVersion,
            section: 'devDependencies',
            position: position === null ? undefined : position
          });
        }
      }
      
      return dependencies;
    } catch (error) {
      console.error('[⇪ Update Now] Error parsing package.json:', error);
      return [];
    }
  }
  
  /**
   * Gets the latest version for a package from npm registry
   */
  async getLatestVersion(packageName: string, currentVersion: string): Promise<IVersionInfo | null> {
    if (!currentVersion || isURL(currentVersion)) {
      return null;
    }
    
    try {
      return await fetchLatestVersion(packageName);
    } catch (error) {
      console.error(`[⇪ Update Now] Error fetching latest version for ${packageName}:`, error);
      return null;
    }
  }
  
  /**
   * Updates a dependency in the package.json file
   */
  async updateDependency(
    document: vscode.TextDocument, 
    packageName: string, 
    newVersion: string, 
    section: string = 'dependencies'
  ): Promise<boolean> {
    try {
      const text = document.getText();
      const packageJson = JSON.parse(text);
      
      // Get the current version from the specified section
      let currentVersion: string | undefined;
      if (section === 'devDependencies') {
        currentVersion = packageJson.devDependencies?.[packageName];
      } else {
        currentVersion = packageJson.dependencies?.[packageName];
      }
      
      if (!currentVersion) {
        vscode.window.showErrorMessage(`Current version for package ${packageName} not found in ${section}.`);
        return false;
      }
      
      // Clean versions for comparison
      const cleanCurrentVersion = currentVersion.replace(/^[~^]/, "");
      const cleanLatestVersion = newVersion.replace(/^[~^]/, "");
      
      // Compare clean versions for major update detection
      const isMajorUpdate = semver.diff(cleanLatestVersion, cleanCurrentVersion) === "major";
      const versionPrefix = getVersionPrefix(currentVersion);
      
      // Only apply prefix if it's not a major update and we had a prefix before
      let updatedVersion = cleanLatestVersion;
      if (!isMajorUpdate && versionPrefix) {
        // Validate the version with prefix is valid
        const prefixedVersion = versionPrefix + cleanLatestVersion;
        if (!semver.validRange(prefixedVersion)) {
          vscode.window.showErrorMessage(`Invalid version format after applying prefix: ${prefixedVersion}`);
          return false;
        }
        updatedVersion = prefixedVersion;
      }
      
      // Update the package in the right section
      if (section === 'devDependencies' && packageJson.devDependencies) {
        packageJson.devDependencies[packageName] = updatedVersion;
      } else if (packageJson.dependencies) {
        packageJson.dependencies[packageName] = updatedVersion;
      } else {
        return false;
      }
      
      // Apply the edit to the document
      const updatedText = JSON.stringify(packageJson, null, 2);
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri, 
        new vscode.Range(document.positionAt(0), document.positionAt(text.length)), 
        updatedText
      );
      
      const success = await vscode.workspace.applyEdit(edit);
      if (success) {
        await document.save();
      }
      
      return success;
    } catch (error) {
      console.error(`[⇪ Update Now] Error updating ${packageName}:`, error);
      return false;
    }
  }
  
  /**
   * Gets the position of a dependency in the document
   */
  getDependencyPosition(
    document: vscode.TextDocument, 
    packageName: string, 
    section?: string
  ): IPackagePosition | null {
    const positions = getPosition(document, packageName);
    
    if (!positions || positions.length === 0) {
      return null;
    }
    
    // If section is specified, find the position in that section
    if (section) {
      for (const pos of positions) {
        if (pos.inDependencies) {
          // Check if this position is in the right section
          const isDevDep = this.isInDevDependencies(document, pos.line);
          if ((section === 'devDependencies' && isDevDep) || 
              (section === 'dependencies' && !isDevDep)) {
            return pos;
          }
        }
      }
    }
    
    // Return the first valid position if no section match is found
    return positions.find(pos => pos.inDependencies && pos.line !== -1) || null;
  }
  
  /**
   * Helper method to determine if a line is in the devDependencies section
   */
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
}
