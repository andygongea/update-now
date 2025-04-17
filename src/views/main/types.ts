import { IDependencyData, UpdateType as EnvironmentUpdateType } from '../../environments/base/types';

// Extended dependency data for the view
export interface IViewDependencyData extends IDependencyData {
    name: string;
    section?: 'dependencies' | 'devDependencies';
    currentVersion?: string;
}

/** Type of dependency update available */
export type UpdateType = 'patch' | 'minor' | 'major' | 'latest';

/** Message sent from webview to extension */
export interface IWebviewMessage {
    command: 'refresh' | 'navigateToPackage' | 'updateSettings' | 'focusPackageJson' | 'clearCache' | 'quickOpen' | 'showCacheData';
    packageName?: string;
    section?: string; // Added to support navigating to the correct section (dependencies or devDependencies)
    settings?: {
        showPatch?: boolean;
        showMinor?: boolean;
        showMajor?: boolean;
    };
}

/** Message sent from extension to webview */
export interface IUpdateData {
    dependencies: Record<string, IDependencyData>;
    trackUpdate: any[];
    timestamp: string;
    analytics: Record<string, number>;
    settings: {
        showPatch: boolean;
        showMinor: boolean;
        showMajor: boolean;
    };
    customCss?: string; // Optional CSS to inject into the webview
}