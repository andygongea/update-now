import * as vscode from 'vscode';
import { EnvironmentRegistry } from '../environments/EnvironmentRegistry';
import { incrementUpgradeCount } from '../utils/incrementUpgradeCount';
import { getUpdateType } from '../utils/getUpdateType';

/**
 * Updates a dependency to a new version
 * 
 * @param context The extension context
 * @param environmentId The environment ID to use for the update
 * @param documentUri The URI of the document containing the dependency
 * @param packageName The name of the package to update
 * @param latestVersion The version to update to
 * @param sectionType The section containing the dependency (e.g., 'dependencies', 'devDependencies')
 * @param showNotification Whether to show a notification after updating
 */
export async function updateDependency(
  context: vscode.ExtensionContext,
  environmentId: string,
  documentUri: vscode.Uri,
  packageName: string,
  latestVersion: string,
  sectionType: string = 'dependencies',
  showNotification: boolean = true
): Promise<void> {
  // Get the appropriate environment
  const environment = EnvironmentRegistry.getEnvironment(environmentId);
  if (!environment) {
    vscode.window.showErrorMessage(`Environment ${environmentId} not found.`);
    return;
  }

  // Open the document
  const document = await vscode.workspace.openTextDocument(documentUri);
  
  // Update the dependency using the environment implementation
  const success = await environment.updateDependency(
    document,
    packageName,
    latestVersion,
    sectionType
  );

  if (!success) {
    vscode.window.showErrorMessage(`Failed to update ${packageName} to version ${latestVersion}.`);
    return;
  }

  // Get the current version for tracking
  const dependencies = environment.parseDependencies(document);
  const currentVersion = dependencies.find(d => d.name === packageName && d.section === sectionType)?.currentVersion;

  // Update stored dependency data
  if (currentVersion) {
    // Mark this dependency as up to date (latest)
    const data = {
      version: latestVersion,
      timestamp: Date.now(),
      updateType: 'latest',
      author: null,
      description: null
    };
    await environment.updateStoredDependencyData(context, packageName, data);
  }

  // Increment upgrade count
  await incrementUpgradeCount(context);

  // Track update information
  const existingData = context.workspaceState.get('trackUpdate') as any;
  const trackUpdates = Array.isArray(existingData) ? existingData : (existingData ? [existingData] : []);
  
  await context.workspaceState.update('trackUpdate', [
    ...trackUpdates,
    {
      environmentId,
      packageName,
      currentVersion: currentVersion || 'unknown',
      latestVersion,
      updateType: currentVersion ? getUpdateType(currentVersion, latestVersion) : 'unknown',
      timestamp: Date.now()
    }
  ]);

  // Show notification if needed
  if (showNotification) {
    vscode.window.showInformationMessage(`Awesome! 📦 ${packageName} has been updated to version: ${latestVersion}.`);
  }
}
