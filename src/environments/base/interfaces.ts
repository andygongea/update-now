import * as vscode from 'vscode';
import { IDependencyData, IDependencyInfo, IPackagePosition, UpdateType, IVersionInfo, IUpdateAllOptions } from './types';

/**
 * Base interface for all package environment implementations
 * Each supported package manager (npm, pip, etc.) will implement this interface
 */
export interface IEnvironment {
  /**
   * Unique identifier for this environment
   */
  id: string;

  /**
   * Display name for this environment
   */
  name: string;

  /**
   * File extensions that this environment can process
   */
  fileExtensions: string[];

  /**
   * File patterns to watch for this environment (used for VS Code watchers)
   */
  filePatterns: string[];

  /**
   * Determines if the given document is a dependency file for this environment
   */
  detectDependencyFile(document: vscode.TextDocument): boolean;

  /**
   * Parses the dependencies from the given document
   */
  parseDependencies(document: vscode.TextDocument): IDependencyInfo[];

  /**
   * Retrieves the latest version information for a package
   */
  getLatestVersion(packageName: string, currentVersion: string): Promise<IVersionInfo | null>;

  /**
   * Updates a dependency to a new version
   */
  updateDependency(
    document: vscode.TextDocument, 
    packageName: string, 
    newVersion: string, 
    section?: string
  ): Promise<boolean>;

  /**
   * Updates all dependencies in the document
   */
  updateAllDependencies(
    document: vscode.TextDocument, 
    options?: IUpdateAllOptions
  ): Promise<number>;

  /**
   * Gets the position of a dependency in the document
   */
  getDependencyPosition(
    document: vscode.TextDocument, 
    packageName: string, 
    section?: string
  ): IPackagePosition | null;

  /**
   * Gets the stored data for dependencies in this environment
   */
  getStoredDependenciesData(context: vscode.ExtensionContext): Record<string, IDependencyData>;

  /**
   * Updates the stored data for a dependency
   */
  updateStoredDependencyData(
    context: vscode.ExtensionContext,
    packageName: string,
    data: IDependencyData
  ): Promise<void>;
}
