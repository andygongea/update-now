import * as vscode from 'vscode';
import { EnvironmentRegistry } from '../environments/EnvironmentRegistry';
import { IUpdateAllOptions } from '../environments/base/types';
import { updateDependency } from './updateDependency';
import { logger } from '../utils/logger';

/**
 * Updates all dependencies in a document
 * 
 * @param context The extension context
 * @param documentUri The URI of the document containing dependencies
 * @param options Options for updating dependencies
 */
export async function updateAllDependencies(
  context: vscode.ExtensionContext,
  documentUri: vscode.Uri,
  options?: IUpdateAllOptions
): Promise<void> {
  logger.info('Starting update all dependencies process');
  
  // Open the document
  const document = await vscode.workspace.openTextDocument(documentUri);
  
  // Find the appropriate environment for this document
  const environment = EnvironmentRegistry.getEnvironmentForDocument(document);
  if (!environment) {
    vscode.window.showErrorMessage('No environment found for this document.');
    return;
  }
  
  logger.info(`Using environment: ${environment.id}`);
  
  // Get configuration for which update types to include
  const config = vscode.workspace.getConfiguration('update-now.codeLens');
  const includePatch = options?.includePatch ?? config.get<boolean>('patch', true);
  const includeMinor = options?.includeMinor ?? config.get<boolean>('minor', true);
  const includeMajor = options?.includeMajor ?? config.get<boolean>('major', true);
  
  // Use the environment's update all implementation with our options
  const updateCount = await environment.updateAllDependencies(document, {
    includePatch,
    includeMinor,
    includeMajor,
    skipConfirmation: options?.skipConfirmation
  });
  
  logger.info(`Processed ${updateCount} dependencies`);
  
  if (updateCount === 0) {
    logger.info('No dependencies need updating');
    vscode.window.showInformationMessage("All dependencies are up to date.");
  } else {
    logger.info('Successfully updated all dependencies');
    vscode.window.showInformationMessage(
      `🎉 Congrats! You just updated ${updateCount} dependencies to their latest versions. Please ensure your code still runs as intended.`
    );
  }
}
