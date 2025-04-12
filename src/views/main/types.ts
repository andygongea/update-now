import { VersionInfo, IDependencyData, UpdateType as UtilsUpdateType } from '../../utils/types';

/** Type of dependency update available */
export type UpdateType = 'patch' | 'minor' | 'major' | 'latest';

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
    dependencies: Record<string, IDependencyData>;
    trackUpdate: any[];
    timestamp: string;
    analytics: Record<UtilsUpdateType, number>;
    settings: {
        showPatch: boolean;
        showMinor: boolean;
        showMajor: boolean;
    };
}