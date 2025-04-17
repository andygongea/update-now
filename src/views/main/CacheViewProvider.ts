import * as vscode from 'vscode';
import { IWebviewMessage, IUpdateData, IViewDependencyData } from './types';
import { getCacheViewTemplate } from './template';
import { getUpdateType } from '../../utils/getUpdateType';
import { IDependencyData, UpdateType } from '../../environments/base/types';
import { EnvironmentRegistry } from '../../environments/EnvironmentRegistry';
import { getPosition } from '../../utils/getPosition';

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/**
 * Provides a webview for displaying and managing dependency updates.
 * This provider handles:
 * - Watching package.json for changes
 * - Displaying available updates
 * - Tracking update history
 * - Managing dependency analytics
 */
export class CacheViewProvider implements vscode.WebviewViewProvider, vscode.Disposable {
    public static readonly viewType = 'dependenciesData';

    private _webview?: vscode.Webview;
    private _fileWatcher?: vscode.FileSystemWatcher;

    /**
     * Creates a new instance of the CacheViewProvider
     * @param _extensionUri - The URI of the extension
     * @param _context - The extension context for state management
     */
    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        // Watch for package.json changes
        this._fileWatcher = vscode.workspace.createFileSystemWatcher('**/package.json');
        this._fileWatcher.onDidChange(() => {
            this.refresh();
        });

        // Watch for active editor changes
        this._context.subscriptions.push(
            vscode.window.onDidChangeActiveTextEditor(() => {
                if (this._webview) {
                    this._updateContent(this._webview);
                }
            })
        );

        // Register the watcher to be disposed when the extension is deactivated
        this._context.subscriptions.push(this._fileWatcher);
    }

    /**
     * Disposes of resources held by this provider
     */
    public dispose() {
        if (this._fileWatcher) {
            this._fileWatcher.dispose();
        }
    }

    /**
     * Resolves the webview view when it becomes visible
     * @param webviewView - The webview view to resolve
     * @param context - The context for resolving the view
     * @param _token - Cancellation token
     */
    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._webview = webviewView.webview;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Wait a bit for dependency data to be populated
        setTimeout(() => {
            this._updateContent(webviewView.webview);
        }, 1000);

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage((message: IWebviewMessage) => {
            switch (message.command) {
                case 'refresh':
                    this._updateContent(webviewView.webview);
                    return;
                case 'navigateToPackage':
                    this._navigateToPackage(message.packageName || '');
                    return;
                case 'showCacheData':
                    vscode.commands.executeCommand('update-now.showCacheData');
                    return;
                case 'updateSettings':
                    if (message.settings) {
                        const config = vscode.workspace.getConfiguration('update-now.codeLens');
                        if (typeof message.settings.showPatch === 'boolean') {
                            config.update('patch', message.settings.showPatch, true);
                        }
                        if (typeof message.settings.showMinor === 'boolean') {
                            config.update('minor', message.settings.showMinor, true);
                        }
                        if (typeof message.settings.showMajor === 'boolean') {
                            config.update('major', message.settings.showMajor, true);
                        }
                    }
                    return;
                case 'focusPackageJson':
                    this._focusOnPackageJson();
                    return;
                case 'clearCache':
                    this._clearCache();
                    return;
                case 'quickOpen':
                    vscode.commands.executeCommand('workbench.action.quickOpen', 'package.json');
                    return;
            }
        });

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateContent(webviewView.webview);
            }
        });
    }

    /**
     * Refreshes the webview content
     */
    public refresh() {
        if (this._webview) {
            this._updateContent(this._webview);
        }
    }

    /**
     * Updates the content of the webview with the latest dependency data
     * @param webview - The webview to update
     */
    private async _updateContent(webview: vscode.Webview) {
        // Get dependency data from all environments
        const allDependenciesData: Record<string, IDependencyData> = {};
        const environments = EnvironmentRegistry.getAllEnvironments();
        
        // Collect data from all environments
        for (const env of environments) {
            const envData = env.getStoredDependenciesData(this._context);
            // Merge into the flat structure for the UI
            Object.entries(envData).forEach(([packageName, data]) => {
                allDependenciesData[packageName] = {
                    ...data,
                    // Store the environment ID in our local structure
                    // but don't modify the original IDependencyData type
                };
            });
        }
        
        const trackIUpdateData = this._context.workspaceState.get<any[]>('trackUpdate', []);
        const currentTime = new Date().toISOString();

        // Get current settings
        const config = vscode.workspace.getConfiguration('update-now.codeLens');
        const settings = {
            showPatch: config.get<boolean>('patch', true),
            showMinor: config.get<boolean>('minor', true),
            showMajor: config.get<boolean>('major', true)
        };

        // Get current package.json content if any is open
        let currentPackageDeps: Record<string, IViewDependencyData> = {};
        const activeEditor = vscode.window.activeTextEditor;
        
        if (activeEditor) {
            // Find environment for the current document
            const env = EnvironmentRegistry.getEnvironmentForDocument(activeEditor.document);
            if (env && env.id === 'npm' && activeEditor.document.fileName.endsWith('package.json')) {
                try {
                    const packageJson = JSON.parse(activeEditor.document.getText());
                    
                    // Process dependencies
                    if (packageJson.dependencies) {
                        for (const [name, version] of Object.entries(packageJson.dependencies)) {
                            if (allDependenciesData[name]) {
                                const updateTypeResult = getUpdateType(version as string, allDependenciesData[name].version as string);
                                if (updateTypeResult === 'major' || updateTypeResult === 'minor' ||
                                    updateTypeResult === 'patch' || updateTypeResult === 'latest') {
                                    // Use section as part of the key to properly handle duplicates
                                    const depKey = `dependencies:${name}@${version}`;
                                    currentPackageDeps[depKey] = {
                                        ...allDependenciesData[name],
                                        name, // Add name explicitly for display
                                        section: 'dependencies',
                                        currentVersion: version as string,
                                        updateType: updateTypeResult as UpdateType
                                    };
                                }
                            }
                        }
                    }
                    
                    // Process devDependencies
                    if (packageJson.devDependencies) {
                        for (const [name, version] of Object.entries(packageJson.devDependencies)) {
                            if (allDependenciesData[name]) {
                                const updateTypeResult = getUpdateType(version as string, allDependenciesData[name].version as string);
                                if (updateTypeResult === 'major' || updateTypeResult === 'minor' ||
                                    updateTypeResult === 'patch' || updateTypeResult === 'latest') {
                                    // Use section as part of the key to properly handle duplicates
                                    const depKey = `devDependencies:${name}@${version}`;
                                    currentPackageDeps[depKey] = {
                                        ...allDependenciesData[name],
                                        name, // Add name explicitly for display
                                        section: 'devDependencies',
                                        currentVersion: version as string,
                                        updateType: updateTypeResult as UpdateType
                                    };
                                }
                            }
                        }
                    }
                } catch (error) {
                    console.error('Error parsing package.json:', error);
                }
            }
        }

        // Count updates by type only for current package
        const updateCounts: Record<string, number> = {
            'patch': 0,
            'minor': 0,
            'major': 0,
            'latest': 0,
            'invalid': 0,
            // Add these for backward compatibility with the UI
            'invalidLatest': 0, 
            'url': 0
        };

        // Only count updates for the current package's dependencies
        if (Array.isArray(trackIUpdateData)) {
            // Extract just the package names from currentPackageDeps keys (removing @version)
            const packageNames = Object.keys(currentPackageDeps).map(key => key.split('@')[0]);

            trackIUpdateData
                .filter(update => update?.packageName && packageNames.includes(update.packageName))
                .forEach((update: any) => {
                    if (update?.updateType) {
                        const updateType = update.updateType.toLowerCase() as UpdateType;
                        if (updateType in updateCounts) {
                            updateCounts[updateType]++;
                        }
                    }
                });
        }

        // Extract package names for filtering
        const packageNames = Object.keys(currentPackageDeps).map(key => key.split('@')[0]);

        const data: IUpdateData = {
            dependencies: currentPackageDeps,  // Only send dependencies from current package.json
            trackUpdate: trackIUpdateData.filter(update => update?.packageName && packageNames.includes(update.packageName)),  // Filter update history
            timestamp: currentTime,
            analytics: updateCounts,
            settings: settings  // Add settings to the data
        };

        // Determine if a package is open by checking if we have any dependencies in currentPackageDeps
        const isPackageOpen = Object.keys(currentPackageDeps).length > 0;

        // The section-badge styles are now served from the static CSS file
        // We'll set customCss to empty since we don't need dynamic CSS injection
        data.customCss = '';
        
        webview.postMessage({
            type: 'update',
            data,
            isPackageOpen // Include flag to indicate if a package.json is open with dependencies
        });
    }

    /**
     * Navigate to the line where a package is defined in package.json
     * @param packageName - Name of the package to navigate to
     */
    private async _navigateToPackage(packageName: string, section?: string) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document.fileName.endsWith('package.json')) {
            return;
        }

        // Split package name and version (format: @scope/name@version or name@version)
        let baseName: string;
        let targetVersion: string | undefined;

        const lastAtIndex = packageName.lastIndexOf('@');
        if (lastAtIndex > 0) { // > 0 to avoid splitting on @ for scoped packages
            targetVersion = packageName.substring(lastAtIndex + 1);
            baseName = packageName.substring(0, lastAtIndex);
        } else {
            baseName = packageName;
            targetVersion = undefined;
        }

        const positions = getPosition(activeEditor.document, baseName);

        if (positions.length > 0 && positions[0].line !== -1) {
            // Find the position that matches the version if specified
            let targetPosition = positions[0]; // Default to first position

            if (targetVersion && positions.length > 1) {
                // Check each position to find the one with matching version and section
                for (const pos of positions) {
                    const line = activeEditor.document.lineAt(pos.line).text;
                    const version = line.match(/":\s*"([^"]+)"/)?.[1]; // Extract version from the line
                    
                    // Also check if this position is in the right section (dependencies or devDependencies)
                    // Check if the line is in devDependencies by looking at lines above it
                    const isInDevSection = this.checkIfInDevDependencies(activeEditor.document, pos.line);
                    const posSection = isInDevSection ? 'devDependencies' : 'dependencies';
                    
                    // Match both version and section if provided
                    if (version === targetVersion && (!section || section === posSection)) {
                        targetPosition = pos;
                        break;
                    }
                }
            }

            // Create a selection on the line
            const position = new vscode.Position(targetPosition.line, targetPosition.character);
            activeEditor.selection = new vscode.Selection(position, position);

            // Reveal the line in editor
            activeEditor.revealRange(
                new vscode.Range(position, position),
                vscode.TextEditorRevealType.InCenter
            );
        }
    }

    private _focusOnPackageJson() {
        const editors = vscode.window.visibleTextEditors;
        for (const editor of editors) {
            if (editor.document.fileName.endsWith('package.json')) {
                vscode.window.showTextDocument(editor.document);
                return;
            }
        }
    }

    private async _clearCache() {
        // Clear cache for all environments
        const environments = EnvironmentRegistry.getAllEnvironments();
        for (const env of environments) {
            const key = `dependenciesData.${env.id}`;
            this._context.workspaceState.update(key, {});
        }
        vscode.window.showInformationMessage('Cache cleared successfully!');
        this.refresh();
    }

    private _getMediaUrl(fileName: string): vscode.Uri {
        return this._webview!.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'out', 'views', fileName));
    }

    /**
     * Helper method to determine if a line is in the devDependencies section
     */
    private checkIfInDevDependencies(document: vscode.TextDocument, lineNumber: number): boolean {
        const text = document.getText();
        const lines = text.split("\n");
        
        // Go backward from the current line to find section identifier
        for (let i = lineNumber; i >= 0; i--) {
            const line = lines[i].trim();
            
            // Found devDependencies section
            if (line.includes('"devDependencies"')) {
                return true;
            }
            
            // Found dependencies section
            if (line.includes('"dependencies"')) {
                return false;
            }
            
            // If we hit the end of a section, stop searching
            if (line === '}' && (i > 0 && lines[i - 1].includes('}'))) {
                return false;
            }
        }
        
        // Default to regular dependencies if we can't determine
        return false;
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        const settingsSection = `
            <div class="settings-section">
                <h4 class="settings-title">CodeLens</h4>
                <div class="settings-group">
                    <p class="dimmed">To reduce the number of CodeLens, you can choose which update types to show.</p>
                    <div class="setting-item">
                        <label class="setting-label">
                            <span class="setting-title">❇️ Show Patch updates </span>
                            <div class="switch">
                                <input type="checkbox" id="showPatch" class="setting-checkbox">
                                <span class="slider"></span>
                            </div>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label class="setting-label">
                            <span class="setting-title">✴️ Show Minor updates </span>
                            <div class="switch">
                                <input type="checkbox" id="showMinor" class="setting-checkbox">
                                <span class="slider"></span>
                            </div>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label class="setting-label">
                            <span class="setting-title">🛑 Show Major updates </span>
                            <div class="switch">
                                <input type="checkbox" id="showMajor" class="setting-checkbox">
                                <span class="slider"></span>
                            </div>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const emptyStateMessage = `
            <div class="upn-empty-state">
                <h1 class="upn-icon">📦</h1>
                <p class="upn-message">Open a  <strong>package.json</strong> file to see <em>latest versions</em> and <em>update type</em> for outdated packages.</p>
                <p class="upn-message dimmed"><small>Click to open package.json</small></p>
            </div>
        `;

        const warningMessage = `
            <div class="upn-warning">
                <p class="upn-message">⚠️ You have disabled CodeLens for the following update types:</br>
                <strong>Update Now</strong> will not show any CodeLens for these update types.</p>
            </div>
        `;

        const scriptContent = `
            (function() {
                const vscode = acquireVsCodeApi();
                const content = document.getElementById('content');
                const timestamp = document.querySelector('.timestamp');
                const analytics = document.querySelector('.upn-analytics');
                const tabItems = document.querySelectorAll('.upn-tab-item');
                const tabContents = document.querySelectorAll('.upn-tab-content');

                function formatRelativeTime(date) {
                    const now = new Date();
                    const past = new Date(date);
                    const diffMs = now.getTime() - past.getTime();
                    
                    const diffMins = Math.floor(diffMs / (60 * 1000));
                    const diffHours = Math.floor(diffMs / (60 * 60 * 1000));
                    const diffDays = Math.floor(diffMs / (24 * 60 * 60 * 1000));

                    if (diffMins < 1) {
                        return 'just now';
                    } else if (diffMins < 60) {
                        return \`\${diffMins} \${diffMins === 1 ? 'min' : 'mins'} ago\`;
                    } else if (diffHours < 24) {
                        return \`\${diffHours} \${diffHours === 1 ? 'hour' : 'hours'} ago\`;
                    } else if (diffDays < 30) {
                        return \`\${diffDays} \${diffDays === 1 ? 'day' : 'days'} ago\`;
                    } else {
                        return 'a while ago';
                    }
                }

                // Tab switching functionality
                tabItems.forEach((tab, index) => {
                    tab.addEventListener('click', () => {
                        tabItems.forEach(t => t.classList.remove('is-active'));
                        tabContents.forEach(c => c.classList.remove('is-active'));
                        tab.classList.add('is-active');
                        tabContents[index].classList.add('is-active');
                    });
                });

                // Set initial active tab
                tabItems[0].classList.add('is-active');
                tabContents[0].classList.add('is-active');

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'update':
                            updateContent(message.data);
                            // Toggle visibility of empty state message based on whether a package is open
                            const emptyState = document.querySelector('.upn-empty-state');
                            if (emptyState) {
                                if (message.isPackageOpen) {
                                    emptyState.classList.add('is-hidden');
                                } else {
                                    emptyState.classList.remove('is-hidden');
                                }
                            }
                            break;
                    }
                });

                // In your code where you display descriptions:
                function stripHtml(html) {
                    return html.replace(/<[^>]*>/g, '');
                }

                function updateContent(data) {
                    const availableUpdates = document.getElementById('available-updates');
                    const upToDate = document.getElementById('up-to-date');
                    const historicUpdates = document.getElementById('historic-updates');
                    
                    // Add custom CSS if provided and not empty
                    if (data.customCss && data.customCss.trim() !== '') {
                        // Use an ID to prevent duplicate style elements
                        let styleElement = document.getElementById('update-now-custom-styles');
                        if (!styleElement) {
                            styleElement = document.createElement('style');
                            styleElement.id = 'update-now-custom-styles';
                            document.head.appendChild(styleElement);
                        }
                        styleElement.textContent = data.customCss;
                    }
                    
                    // Make sure the section badge classes are defined
                    let badgeStyles = document.getElementById('section-badge-styles');
                    if (!badgeStyles) {
                        badgeStyles = document.createElement('style');
                        badgeStyles.id = 'section-badge-styles';
                        // Add the CSS for section badges directly
                        badgeStyles.textContent = 
                            '.section-badge {' +
                            '    display: inline-block;' + 
                            '    font-size: 1rem;' +
                            '    padding: 1px 5px 2px;' +
                            '    margin-left: 0.5rem;' +
                            '    border-radius: 10px;' +
                            '    line-height: 1;' +
                            '    background-color: #555;' +
                            '    color: white;' +
                            '}' +
                            '.section-badge.dev {' +
                            '    background-color: #2a6a99;' +
                            '}';
                        document.head.appendChild(badgeStyles);
                    }
                    
                    if (timestamp) {
                        timestamp.textContent = 'Last updated: ' + formatRelativeTime(data.timestamp);
                    }
                    
                    const totalCount = Object.keys(data.dependencies).length;
                    const titleElement = document.querySelector('#upn-cached-count');
                    if (titleElement) {
                        titleElement.textContent = 'Cached dependencies (' + totalCount + ')';
                    }
                    
                    const groups = { patch: [], minor: [], major: [], latest: []};

                    // Sort dependencies into groups
                    Object.entries(data.dependencies).forEach(([name, info]) => {
                        if (info.updateType in groups) {
                            groups[info.updateType].push({ name, ...info });
                        }
                    });

                    // Update tab counts
                    const toUpdateCount = groups.patch.length + groups.minor.length + groups.major.length;
                    const latestCount = groups.latest.length;
                    const historyCount = data.trackUpdate ? data.trackUpdate.length : 0;

                    document.querySelectorAll('.upn-tab-item').forEach((tab, index) => {
                        const count = tab.querySelector('.upn-stat-count');
                        if (count) {
                            switch(index) {
                                case 0: count.textContent = toUpdateCount.toString(); break;
                                case 1: count.textContent = latestCount.toString(); break;
                                case 2: count.textContent = historyCount.toString(); break;
                            }
                        }
                    });

                    // Clear previous content
                    if (availableUpdates) availableUpdates.innerHTML = '';
                    if (upToDate) upToDate.innerHTML = '';
                    if (historicUpdates) historicUpdates.innerHTML = '';

                    // Render available updates
                    ['patch', 'minor', 'major'].forEach(updateType => {
                        if (groups[updateType].length > 0 && availableUpdates) {
                            const groupDiv = document.createElement('div');
                            groupDiv.className = 'update-group';
                            groupDiv.innerHTML = '<h3 class="group-title"><span class="update-type ' + 
                                updateType + '"> Updates</span><i class="upn-stat-count">' + groups[updateType].length + '</i></h3>';
                             
                            groups[updateType]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .forEach(info => {
                                    const div = document.createElement('div');
                                    div.className = 'dependency-item';
                                    div.onclick = () => {
                                        vscode.postMessage({ 
                                            command: 'navigateToPackage',
                                            packageName: info.name,
                                            section: info.section
                                        });
                                    };
                                    // Add section indicator to differentiate between dependencies & devDependencies
                                    const sectionBadge = info.section === 'devDependencies' ? 
                                        '<span class="section-badge dev">DEV</span>' : '';
                                    
                                    div.innerHTML = 
                                        '<p>' +
                                        '<strong>📦 ' + info.name + '</strong> ' + sectionBadge + ' ' +
                                        '<span class="dimmed">⇢</span> ' +
                                        '<strong>' + (info.currentVersion || info.version) + '</strong>' +
                                        '</p>' +
                                        '<p class="dimmed">' + stripHtml(info.description || '') + '</p>';
                                    groupDiv.appendChild(div);
                                });
                             
                            availableUpdates.appendChild(groupDiv);
                        }
                    });

                    // Render up to date packages
                    if (groups.latest.length > 0 && upToDate) {
                        const groupDiv = document.createElement('div');
                        groupDiv.className = 'update-group';
                        groupDiv.innerHTML = '<h3 class="group-title"><span class="update-type latest"></span></h3>';
                         
                        groups.latest
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .forEach(info => {
                                const div = document.createElement('div');
                                div.className = 'dependency-item';
                                div.onclick = () => {
                                    vscode.postMessage({ 
                                        command: 'navigateToPackage',
                                        packageName: info.name 
                                    });
                                };
                                div.innerHTML = 
                                    '<p>' +
                                    '<strong>📦 ' + info.name + '</strong> ' +
                                    '</p>' +
                                    '<p class="dimmed">' + stripHtml(info.description || '') + '</p>';
                                groupDiv.appendChild(div);
                            });
                         
                        upToDate.appendChild(groupDiv);
                    }

                    // Render historic updates
                    if (data.trackUpdate && data.trackUpdate.length > 0 && historicUpdates) {
                        const historyDiv = document.createElement('div');
                        historyDiv.className = 'update-group';
                        historyDiv.innerHTML = '<h3 class="group-title"><span class="update-type">⌛ 100 Most recent updates</span></h3>';
                        
                        // Group updates by timestamp
                        const groupedUpdates = data.trackUpdate
                            .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                            .slice(0, 100) // Limit to 100 most recent entries
                            .reduce((groups, update) => {
                                const timeKey = formatRelativeTime(update.timestamp);
                                if (!groups[timeKey]) {
                                    groups[timeKey] = [];
                                }
                                groups[timeKey].push(update);
                                return groups;
                            }, {});
                        
                        // Render grouped updates
                        Object.entries(groupedUpdates).forEach(([timeKey, updates]) => {
                            const timeGroup = document.createElement('ul');
                            timeGroup.className = 'time-group';
                            timeGroup.innerHTML = '<li class="timestamp">Updated ' + timeKey;
                            
                            const updatesContainer = document.createElement('ul');
                            updatesContainer.className = 'updates-container';
                            
                            updates.forEach(update => {
                                const li = document.createElement('li');
                                li.className = 'history-item';
                                li.innerHTML = 
                                    '<span>📦 ' + update.packageName + '<span class="dimmed">@</span>' + update.currentVersion + '</span> ' +
                                    '<span class="dimmed">⇢</span> ' +
                                    '<strong>' + update.latestVersion + '</strong> ';
                                updatesContainer.appendChild(li);
                            });
                            
                            timeGroup.appendChild(updatesContainer);
                            timeGroup.innerHTML += '</li>';
                            historyDiv.appendChild(timeGroup);
                        });
                         
                        historicUpdates.appendChild(historyDiv);
                    }

                    // Update analytics values
                    Object.entries(data.analytics).forEach(([updateType, count]) => {
                        if (updateType !== 'latest') {
                            const statElement = document.querySelector('.upn-stat-' + updateType);
                            if (statElement) {
                                statElement.textContent = count.toString();
                            }
                        }
                    });

                    // Update settings checkboxes
                    if (data.settings) {
                        ['showPatch', 'showMinor', 'showMajor'].forEach(setting => {
                            const checkbox = document.getElementById(setting);
                            if (checkbox) {
                                checkbox.checked = data.settings[setting];
                            }
                        });
                    }
                }

                // Add settings event listeners
                function setupSettingsListeners() {
                    ['showPatch', 'showMinor', 'showMajor'].forEach(setting => {
                        const checkbox = document.getElementById(setting);
                        if (checkbox) {
                            checkbox.addEventListener('change', (e) => {
                                const settings = {};
                                settings[setting] = e.target.checked;
                                vscode.postMessage({
                                    command: 'updateSettings',
                                    settings
                                });
                                vscode.postMessage({
                                    command: 'focusPackageJson'
                                });
                            });
                        }
                    });
                }

                setupSettingsListeners();

                // Add clear cache button listener
                const clearCacheBtn = document.querySelector('.upn-clear-cache');
                if (clearCacheBtn) {
                    clearCacheBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'clearCache'
                        });
                    });
                }
                
                // Add show cache data button listener
                const showCacheDataBtn = document.querySelector('.upn-show-cache-data');
                if (showCacheDataBtn) {
                    showCacheDataBtn.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'showCacheData'
                        });
                    });
                }
                
                // Add click handler to empty state message
                const emptyState = document.querySelector('.upn-empty-state');
                if (emptyState) {
                    emptyState.addEventListener('click', () => {
                        vscode.postMessage({
                            command: 'quickOpen'
                        });
                    });
                }
            })();`;

        return getCacheViewTemplate(webview, this._getMediaUrl.bind(this), settingsSection, scriptContent, warningMessage, emptyStateMessage);
    }
}
