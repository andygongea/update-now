import * as vscode from 'vscode';

/**
 * Configuration for an environment
 */
export interface IEnvironmentConfig {
  id: string;
  name: string;
  enabled: boolean;
  filePatterns: string[];
  excludePatterns: string[];
  priority: number; // For disambiguation when multiple environments could handle a file
}

/**
 * Default environment configurations
 */
export const defaultEnvironments: IEnvironmentConfig[] = [
  {
    id: 'npm',
    name: 'NPM',
    enabled: true,
    filePatterns: ['**/package.json'],
    excludePatterns: ['**/node_modules/**'],
    priority: 10
  }
];

/**
 * Load environment configurations from workspace settings
 */
export function loadEnvironmentConfigs(): IEnvironmentConfig[] {
  const config = vscode.workspace.getConfiguration('update-now');
  const envConfigs = config.get<IEnvironmentConfig[]>('environments', defaultEnvironments);
  return envConfigs;
}

/**
 * Save environment configurations to workspace settings
 */
export async function saveEnvironmentConfigs(configs: IEnvironmentConfig[]): Promise<void> {
  const config = vscode.workspace.getConfiguration('update-now');
  await config.update('environments', configs, vscode.ConfigurationTarget.Global);
}

/**
 * Get a specific environment configuration by ID
 */
export function getEnvironmentConfig(id: string): IEnvironmentConfig | undefined {
  const configs = loadEnvironmentConfigs();
  return configs.find(config => config.id === id);
}

/**
 * Update a specific environment configuration
 */
export async function updateEnvironmentConfig(
  id: string,
  updates: Partial<IEnvironmentConfig>
): Promise<boolean> {
  const configs = loadEnvironmentConfigs();
  const index = configs.findIndex(config => config.id === id);
  
  if (index === -1) {
    return false;
  }
  
  configs[index] = { ...configs[index], ...updates };
  await saveEnvironmentConfigs(configs);
  return true;
}
