import * as vscode from 'vscode';
import { IEnvironment } from './base/interfaces';

/**
 * Registry for managing environment implementations
 * Handles registration and retrieval of environments based on id or document
 */
export class EnvironmentRegistry {
  private static environments: Map<string, IEnvironment> = new Map();
  
  /**
   * Register a new environment implementation
   */
  static register(environment: IEnvironment): void {
    this.environments.set(environment.id, environment);
  }
  
  /**
   * Get an environment by its id
   */
  static getEnvironment(id: string): IEnvironment | undefined {
    return this.environments.get(id);
  }
  
  /**
   * Find the appropriate environment for a document
   */
  static getEnvironmentForDocument(document: vscode.TextDocument): IEnvironment | undefined {
    for (const env of this.environments.values()) {
      if (env.detectDependencyFile(document)) {
        return env;
      }
    }
    return undefined;
  }
  
  /**
   * Get all registered environments
   */
  static getAllEnvironments(): IEnvironment[] {
    return Array.from(this.environments.values());
  }
}
