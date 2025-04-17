import * as vscode from "vscode";
import { incrementUpgradeCount } from "./utils/incrementUpgradeCount";
import { DependencyCodeLensProvider } from './DependencyCodeLensProvider';
import { CacheViewProvider } from './views/main/CacheViewProvider';
import { CachedDataView } from './views/debug/CachedDataView';
import { logger } from './utils/logger';
import { initializeStatusBar, updateStatusBar } from './views/statusBar';
import { EnvironmentRegistry } from "./environments/EnvironmentRegistry";
import { NpmEnvironment } from "./environments/npm/NpmEnvironment";
import { loadEnvironmentConfigs } from "./environments/config";
import { showUpdateAllNotification } from "./commands/showUpdateAllNotification";
import { updateDependency } from "./commands/updateDependency";
import { updateAllDependencies } from "./commands/updateAllDependencies";
import { isPackageJson } from "./utils/isPackageJson";

let cacheViewProvider: CacheViewProvider;
let cachedDataView: CachedDataView;

export function activate(context: vscode.ExtensionContext): void {
  logger.info("⇪ Update Now extension activating...");
  
  // Initialize status bar item
  initializeStatusBar(context);
  updateStatusBar("Loading...", true);

  // Register environments
  logger.info("Registering environments...");
  EnvironmentRegistry.register(new NpmEnvironment());
  logger.info("Registered environment: npm");

  // Load environment configurations
  const envConfigs = loadEnvironmentConfigs();
  const enabledEnvs = envConfigs.filter(e => e.enabled);
  logger.info(`Loaded ${enabledEnvs.length} enabled environments`);

  // Initialize context data
  context.globalState.update("dependencyUpgradeCount", 
    context.globalState.get("dependencyUpgradeCount") || 0);

  // Create providers
  const provider = new DependencyCodeLensProvider(context);
  cacheViewProvider = new CacheViewProvider(context.extensionUri, context);
  cachedDataView = new CachedDataView(context.extensionUri, context);

  // Register CodeLens provider for each enabled environment
  for (const config of enabledEnvs) {
    const env = EnvironmentRegistry.getEnvironment(config.id);
    if (env) {
      logger.info(`Registering CodeLens provider for environment: ${env.id}`);
      
      const filePatterns = env.filePatterns;
      for (const pattern of filePatterns) {
        context.subscriptions.push(
          vscode.languages.registerCodeLensProvider(
            { pattern },
            provider
          )
        );
      }
    }
  }

  // Find dependency files for each environment
  for (const config of enabledEnvs) {
    const env = EnvironmentRegistry.getEnvironment(config.id);
    if (env) {
      // Create include/exclude patterns
      const includePatterns = env.filePatterns;
      const excludePatterns = config.excludePatterns || [];
      
      // Find files matching the patterns
      vscode.workspace.findFiles(
        `{${includePatterns.join(',')}}`, 
        `{${excludePatterns.join(',')}}`
      ).then(async (files) => {
        if (files.length > 0) {
          logger.info(`Found ${files.length} dependency files for environment: ${env.id}`);
          try {
            const document = await vscode.workspace.openTextDocument(files[0]);
            provider.refreshCodeLenses(document);
          } catch (error) {
            logger.error(`Error opening dependency file:`, error);
          }
        }
      }, (error) => {
        logger.error(`Error finding dependency files for ${env.id}:`, error);
      });
    }
  }

  // Register commands
  
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

  // Register other commands
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CacheViewProvider.viewType, cacheViewProvider),
    cacheViewProvider,
    
    // Command to update a single dependency
    vscode.commands.registerCommand(
      "update-now.updateDependency", 
      async (environmentId, documentUri, packageName, latestVersion, sectionType) => {
        // Ensure sectionType is a string
        const section = typeof sectionType === 'string' ? sectionType : 'dependencies';
        await updateDependency(context, environmentId, documentUri, packageName, latestVersion, section);
      }
    ),
    
    // Command to update all dependencies
    vscode.commands.registerCommand(
      "update-now.updateAllDependencies", 
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          await updateAllDependencies(context, editor.document.uri);
        }
      }
    ),
    
    // Command to show notification about updates
    vscode.commands.registerCommand(
      "update-now.showNotification", 
      () => {
        const editor = vscode.window.activeTextEditor;
        if (editor) {
          const env = EnvironmentRegistry.getEnvironmentForDocument(editor.document);
          if (env) {
            showUpdateAllNotification();
          }
        }
      }
    ),
    
    // Command to show cache view
    vscode.commands.registerCommand(
      "update-now.showCacheView", 
      async () => {
        try {
          await vscode.commands.executeCommand('workbench.view.update-now-cache');
        } catch (error) {
          logger.error('Failed to show cache view:', error);
        }
      }
    ),
    
    // Command to show cache data
    vscode.commands.registerCommand(
      "update-now.showCacheData", 
      () => {
        cachedDataView.show();
      }
    )
  );

  // Watch for document saves
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
      const env = EnvironmentRegistry.getEnvironmentForDocument(document);
      if (env) {
        provider.refreshCodeLenses(document);
      }
    })
  );
  
  logger.info("⇪ Update Now extension activated successfully!");
  updateStatusBar("Ready", false);
}

export function deactivate(): void {
  logger.info("⇪ Update Now extension deactivated");
}
