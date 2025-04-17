import * as vscode from 'vscode';

/**
 * Represents the type of update available for a dependency
 */
export enum UpdateType {
  latest = 'latest',
  patch = 'patch',
  minor = 'minor',
  major = 'major',
  invalid = 'invalid'
}

/**
 * Information about a dependency version
 */
export interface IVersionInfo {
  version: string;
  description?: string | null;
  author?: { name?: string } | null;
}

/**
 * Position information for a package in a dependency file
 */
export interface IPackagePosition {
  line: number;
  character: number;
  inDependencies: boolean;
}

/**
 * Stored data for a dependency
 */
export interface IDependencyData {
  version: string | null;
  description?: string | null;
  author?: string | null;
  timestamp: number;
  updateType: string;
}

/**
 * Complete information about a dependency
 */
export interface IDependencyInfo {
  name: string;
  currentVersion: string;
  latestVersion?: string;
  description?: string | null;
  author?: string | null;
  updateType?: UpdateType;
  section?: string; // e.g., "dependencies", "devDependencies"
  position?: IPackagePosition; // For CodeLens positioning
}

/**
 * Options for updating all dependencies
 */
export interface IUpdateAllOptions {
  includePatch?: boolean;
  includeMinor?: boolean;
  includeMajor?: boolean;
  skipConfirmation?: boolean;
}
