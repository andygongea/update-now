import * as vscode from 'vscode';

function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

/** Type of dependency update available */
type UpdateType = 'patch' | 'minor' | 'major' | 'latest';

/** Information about a single dependency */
interface IDependencyInfo {
    currentVersion: string;
    latestVersion: string;
    updateType: UpdateType;
}

/** Message sent from webview to extension */
interface IWebviewMessage {
    command: 'refresh' | 'navigateToPackage' | 'updateSettings';
    packageName?: string;
    settings?: {
        showPatch?: boolean;
        showMinor?: boolean;
        showMajor?: boolean;
    };
}

/** Message sent from extension to webview */
interface IUpdateData {
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
        const dependenciesData = this._context.workspaceState.get<Record<string, IDependencyInfo>>('dependenciesData', {});
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
        let currentPackageDeps: Record<string, IDependencyInfo> = {};
        const activeEditor = vscode.window.activeTextEditor;
        if (activeEditor && activeEditor.document.fileName.endsWith('package.json')) {
            try {
                const packageJson = JSON.parse(activeEditor.document.getText());
                const allDeps = { 
                    ...packageJson.dependencies || {}, 
                    ...packageJson.devDependencies || {} 
                };
                
                // Filter dependenciesData to only include current package.json dependencies
                for (const [name, version] of Object.entries(allDeps)) {
                    if (dependenciesData[name]) {
                        currentPackageDeps[name] = dependenciesData[name];
                    }
                }
            } catch (error) {
                console.error('Error parsing package.json:', error);
            }
        }
        
        // Count updates by type only for current package
        const updateCounts: Record<UpdateType, number> = {
            patch: 0,
            minor: 0,
            major: 0,
            latest: 0
        };

        // Only count updates for the current package's dependencies
        if (Array.isArray(trackIUpdateData)) {
            trackIUpdateData
                .filter(update => update?.packageName && currentPackageDeps[update.packageName])
                .forEach((update: any) => {
                    if (update?.updateType) {
                        const updateType = update.updateType.toLowerCase() as UpdateType;
                        if (updateType in updateCounts) {
                            updateCounts[updateType]++;
                        }
                    }
                });
        }
        
        const data: IUpdateData = {
            dependencies: currentPackageDeps,  // Only send dependencies from current package.json
            trackUpdate: trackIUpdateData.filter(update => update?.packageName && currentPackageDeps[update.packageName]),  // Filter update history
            timestamp: currentTime,
            analytics: updateCounts,
            settings: settings  // Add settings to the data
        };

        webview.postMessage({ type: 'update', data });
    }

    /**
     * Navigate to the line where a package is defined in package.json
     * @param packageName - Name of the package to navigate to
     */
    private async _navigateToPackage(packageName: string) {
        const activeEditor = vscode.window.activeTextEditor;
        if (!activeEditor || !activeEditor.document.fileName.endsWith('package.json')) {
            return;
        }

        const text = activeEditor.document.getText();
        try {
            const packageJson = JSON.parse(text);
            const lines = text.split('\n');
            
            // Search in both dependencies and devDependencies
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i].trim();
                if (line.includes(`"${packageName}"`)) {
                    // Create a selection on the line
                    const position = new vscode.Position(i, 0);
                    activeEditor.selection = new vscode.Selection(position, position);
                    // Reveal the line in editor
                    activeEditor.revealRange(
                        new vscode.Range(position, position),
                        vscode.TextEditorRevealType.InCenter
                    );
                    break;
                }
            }
        } catch (error) {
            console.error('Error parsing package.json:', error);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        const nonce = getNonce();

        const settingsSection = `
            <div class="settings-section">
                <h4 class="group-title">CodeLens settings</h4>
                <div class="settings-group">
                    <p>To reduce the number of CodeLens, you can choose which update types to show.</p>
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="showPatch" class="setting-checkbox">
                            <span class="setting-title">Show CodeLens for Patch updates - ❇️</span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="showMinor" class="setting-checkbox">
                            <span class="setting-title">Show CodeLens for Minor updates - ✴️</span>
                        </label>
                    </div>
                    <div class="setting-item">
                        <label class="setting-label">
                            <input type="checkbox" id="showMajor" class="setting-checkbox">
                            <span class="setting-title">Show CodeLens for Major updates - 🛑</span>
                        </label>
                    </div>
                </div>
            </div>
        `;

        const scriptContent = `
            (function() {
                const vscode = acquireVsCodeApi();
                const content = document.getElementById('content');
                const timestamp = document.querySelector('.timestamp');
                const refreshBtn = document.querySelector('.refresh-btn');
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

                refreshBtn.addEventListener('click', () => {
                    vscode.postMessage({ command: 'refresh' });
                });

                window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'update':
                            updateContent(message.data);
                            break;
                    }
                });

                function updateContent(data) {
                    const availableUpdates = document.getElementById('available-updates');
                    const upToDate = document.getElementById('up-to-date');
                    const historicUpdates = document.getElementById('historic-updates');
                    
                    if (timestamp) {
                        timestamp.textContent = 'Last updated: ' + formatRelativeTime(data.timestamp);
                    }
                    
                    const totalCount = Object.keys(data.dependencies).length;
                    const titleElement = document.querySelector('.upn-title');
                    if (titleElement) {
                        titleElement.textContent = 'Dependencies Data (' + totalCount + ')';
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
                                updateType + '"> Updates</span></h3>';
                             
                            groups[updateType]
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
                                        '<span class="dimmed">⇢</span> ' +
                                        '<strong>' + info.version + '</strong>' +
                                        '</p>' +
                                        '<p class="dimmed">' + (info.description || '') + '</p>';
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
                                div.innerHTML = 
                                    '<p>' +
                                    '<strong>📦 ' + info.name + '</strong> ' +
                                    '<span class="dimmed">@</span> ' +
                                    '<strong>' + info.version + '</strong>' +
                                    '</p>' +
                                    '<p class="dimmed">' + (info.description || '') + '</p>';
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
                            });
                        }
                    });
                }

                setupSettingsListeners();
            })();`;

        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependencies Data</title>
            <style>
                :root { font-size: 10px; --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif; }
                body { padding: 20px; color: var(--vscode-foreground); font-size: 1.3rem; font-family: var(--vscode-font-family); }
                p { margin: 0; line-height: 1.45; word-break: break-word; }
                .dimmed { color: var(--vscode-descriptionForeground); }
                .update-type { display: inline-block; padding: 4px 8px 5px; border-radius: 12px; font-size: 1.2rem; font-weight: 600; line-height: 1; text-transform: uppercase; letter-spacing: 1px; color: color: var(--vscode-foreground);; border: 1px solid var(--vscode-panel-border); }
                .update-type.patch { color: var(--vscode-minimapGutter-addedBackground); }
                .update-type.patch::before { content:"❇️ Patch" }
                .update-type.minor { color: var(--vscode-editorWarning-foreground); }
                .update-type.minor::before { content:"✴️ Minor" }
                .update-type.major { color: var(--vscode-minimapGutter-deletedBackground); }
                .update-type.major::before { content:"🛑 Major" }
                .update-type.latest::before { color: var(--vscode-foreground); content:"✅ Up to date packages" }

                .dependency-item { margin-bottom: -1px; padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 0; }
                .dependency-item:first-of-type { border-radius: 4px 4px 0 0; }
                .dependency-item:last-of-type { border-radius: 0 0 4px 4px; margin-bottom: 16px; }
                .dependency-item strong { font-weight: 600; }
                .upn-to-update .dependency-item:hover { background-color: var(--vscode-editor-background); cursor: pointer; }

                .footer { display: flex; flex-direction: column; align-items: center; margin-bottom: 15px; }
                .refresh-btn { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
                .refresh-btn:hover { background: var(--vscode-button-hoverBackground); }
                
                .group-title { font-size: 1.4rem; font-weight: 600; margin: 0 0 4px 0; padding: 8px 0; background: var(--vscode-editor-lineHighlightBackground); border-radius: 4px; }
                
                .upn-analytics { display: flex; justify-content: space-between; margin: 10px 0 20px; border:1px solid var(--vscode-panel-border);  border-radius: 4px; background-color: var(--vscode-editor-background);  }
                .upn-stat { display: flex; flex:1; flex-direction: column; align-items: center;  padding: 10px; }
                .upn-analytics .label { font-size: 1.2rem; color: var(--vscode-descriptionForeground); }
                .upn-analytics .value { margin: 0 0 1rem; font-size: 2rem; font-weight: 600; }
                
                .upn-title { font-size: 1.6rem; font-weight: 600; margin: 0 0 4px 0; }
                .timestamp { font-size: 1.1rem; color: var(--vscode-descriptionForeground); }
                
                .upn-tab-header { display: flex; border-bottom: 1px solid var(--vscode-panel-border); }
                .upn-tab-item { flex: 1; padding: 8px 16px; cursor: pointer; text-align: center; }
                .upn-tab-item.is-active { border-bottom: 3px solid var(--vscode-focusBorder); }
                .upn-stat-count { display: inline-block; min-width: 16px; font-style: normal; padding: 1px 4px 2px; line-height: 1; background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); border-radius: 16px; }
                .upn-tab-contents { display: flex; }
                .upn-tab-content { flex: 1; padding: 16px 0; display: none; }
                .upn-tab-content.is-active { display: block; }

                .history-item { padding: 6px 0; }
                .time-group { position:relative; padding:0 0 0 16px; margin-bottom: 16px; }
                .time-group::before { content:"" ; position: absolute; top: 12px; left: 0px; width: 8px; bottom: 0px; border: 1px dashed var(--vscode-panel-border); border-right:none; border-radius: 4px 0 0 4px; }
                .time-group .timestamp { list-style:none; padding: 4px 0; margin-bottom: 4px; }
                .updates-container { padding: 0; list-style: none; }

                .settings-section { margin-bottom: 20px; }
                .settings-group { display: flex; flex-wrap: wrap; }
                .setting-item { margin: 10px; }
                .setting-label { display: flex; align-items: center; cursor: pointer; }
                .setting-checkbox { margin-right: 10px; }
            </style>
        </head>
        <body>
            
            <div class="upn-tab">
                <div class="upn-tab-header">
                    <span class="upn-tab-item is-active">To update <i class="upn-stat-count">0</i></span>
                    <span class="upn-tab-item">Latest <i class="upn-stat-count">0</i></span>
                    <span class="upn-tab-item">History <i class="upn-stat-count">0</i></span>
                </div>
                <div class="upn-tab-contents">
                    <div class="upn-tab-content upn-to-update is-active">
                        <div id="available-updates"></div>
                    </div>
                    <div class="upn-tab-content">
                        <div id="up-to-date"></div>
                    </div>
                    <div class="upn-tab-content">
                        <p class="dimmed">Statistics (performed updates)</p>
                        <div class="upn-analytics">
                            <div class="upn-patches upn-stat">
                                <h2 class="value upn-stat-patch">0</h2>
                                <span class="label">❇️ Patch updates</span>
                            </div>
                            <div class="upn-minor upn-stat">
                                <h2 class="value upn-stat-minor">0</h2>
                                <span class="label">✴️ Minor updates</span>
                            </div>
                            <div class="upn-major upn-stat">
                                <h2 class="value upn-stat-major">0</h2>
                                <span class="label">🛑 Major updates</span>
                            </div>
                        </div>
                        <div id="historic-updates"></div>
                    </div>
                </div>
            </div>
            <div class="footer">
                <h3 class="upn-footer-title">⚙️ Update Now Settings</h3>
                <div class="upn-footer-section">
                    <div class="settings-section">
                        ${settingsSection}
                    </div>
                </div>
                <div class="upn-footer-section">
                    <h4 class="upn-title">Cached Dependencies (0)</h4>
                    <div class="timestamp"></div>
                    <div class="upn-cache-size"></div>
                    <button class="refresh-btn">Update packages data</button>
                </div>
            </div>

            <script>${scriptContent}</script>
        </body>
        </html>`;
    }
}
