/** Type of dependency update available */
export type UpdateType = 'patch' | 'minor' | 'major' | 'latest';

/** Information about a single dependency */
export interface IDependencyInfo {
    currentVersion: string;
    latestVersion: string;
    updateType: UpdateType;
}

/** Message sent from webview to extension */
export interface IWebviewMessage {
    command: 'refresh' | 'navigateToPackage' | 'updateSettings' | 'focusPackageJson' | 'clearCache' | 'quickOpen' | 'showCacheData';
    packageName?: string;
    settings?: {
        showPatch?: boolean;
        showMinor?: boolean;
        showMajor?: boolean;
    };
}

/** Message sent from extension to webview */
export interface IUpdateData {
    dependencies: Record<string, IDependencyInfo>;
    trackUpdate: any[];
    timestamp: string;
    analytics: Record<UpdateType, number>;
    settings: {
        showPatch: boolean;
        showMinor: boolean;
        showMajor: boolean;
    };
}