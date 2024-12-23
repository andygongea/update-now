import * as vscode from 'vscode';

type UpdateType = 'patch' | 'minor' | 'major' | 'latest';

export class CacheViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dependenciesData';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    private _webview?: vscode.Webview;

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

        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.command) {
                case 'refresh':
                    this._updateContent(webviewView.webview);
                    return;
            }
        });

        // Handle visibility changes
        webviewView.onDidChangeVisibility(() => {
            if (webviewView.visible) {
                this._updateContent(webviewView.webview);
            }
        });

        // Initial content update
        this._updateContent(webviewView.webview);
    }

    public refresh() {
        if (this._webview) {
            this._updateContent(this._webview);
        }
    }

    private _updateContent(webview: vscode.Webview) {
        const dependenciesData = this._context.workspaceState.get<Record<string, any>>('dependenciesData', {});
        const trackUpdateData = this._context.workspaceState.get<any[]>('trackUpdate', []);
        const currentTime = "2024-12-22T23:18:56+02:00";
        
        // Count updates by type
        const updateCounts: Record<UpdateType, number> = {
            patch: 0,
            minor: 0,
            major: 0,
            latest: 0
        };

        if (Array.isArray(trackUpdateData)) {
            trackUpdateData.forEach((update: any) => {
                if (update && update.updateType) {
                    const updateType = update.updateType.toLowerCase() as UpdateType;
                    if (updateType in updateCounts) {
                        updateCounts[updateType]++;
                    }
                }
            });
        }
        
        webview.postMessage({
            type: 'update',
            data: {
                dependencies: dependenciesData,
                trackUpdate: trackUpdateData,
                timestamp: currentTime,
                analytics: updateCounts
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependencies Data</title>
            <style>
                :root { font-size: 10px; --vscode-font-family: -apple-system, BlinkMacSystemFont, "Segoe WPC", "Segoe UI", "Ubuntu", "Droid Sans", sans-serif; }
                body { padding: 20px; color: var(--vscode-foreground); font-size: 1.3rem; font-family: var(--vscode-font-family); }
                p { margin: 0; line-height: 1.45; }
                .dimmed { color: var(--vscode-descriptionForeground); }
                .update-type { display: inline-block; padding: 4px 8px 5px; border-radius: 12px; font-size: 1.2rem; font-weight: 600; line-height: 1; text-transform: uppercase; letter-spacing: 1px; color: color: var(--vscode-foreground);; border: 1px solid var(--vscode-panel-border); }
                .update-type.patch { color: var(--vscode-minimapGutter-addedBackground); }
                .update-type.patch::before { content:"❇️ Patch" }
                .update-type.minor { color: var(--vscode-editorWarning-foreground); }
                .update-type.minor::before { content:"✴️ Minor" }
                .update-type.major { color: var(--vscode-minimapGutter-deletedBackground); }
                .update-type.major::before { content:"🛑 Major" }
                .update-type.latest::before { color: var(--vscode-foreground); content:"🔥 Latest updates" }

                .dependency-item { margin-bottom: -1px; padding: 10px; border: 1px solid var(--vscode-panel-border); border-radius: 0; }
                .dependency-item:first-of-type { border-radius: 4px 4px 0 0; }
                .dependency-item:last-of-type { border-radius: 0 0 4px 4px; margin-bottom: 16px; }
                .dependency-item strong { font-weight: 600; }

                .footer { display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px; }
                .refresh-btn { padding: 4px 12px; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; border-radius: 4px; cursor: pointer; }
                .refresh-btn:hover { background: var(--vscode-button-hoverBackground); }
                
                .group-title { font-size: 1.4rem; font-weight: 600; margin: 0 0 4px 0; padding: 8px 0; background: var(--vscode-editor-lineHighlightBackground); border-radius: 4px; }
                
                .upn-analytics { display: flex; justify-content: space-between; gap: 1rem; margin-bottom: 15px; }
                .upn-stat { display: flex; flex:1; margin:8px 0; flex-direction: column; align-items: center; border:1px solid var(--vscode-panel-border); border-radius: 4px; padding: 10px; background-color: var(--vscode-editor-background); }
                .upn-analytics .label { font-size: 1.2rem; color: var(--vscode-descriptionForeground); }
                .upn-analytics .value { margin: 1rem 0; font-size: 2rem; font-weight: 600; }
                
                .upn-title { font-size: 1.6rem; font-weight: 600; margin: 0 0 4px 0; }
                .timestamp { font-size: 1.1rem; color: var(--vscode-descriptionForeground); }

                .upn-tab {  }
                .upn-tab-header { display: flex; border-bottom: 1px solid var(--vscode-panel-border); }
                .upn-tab-item { flex: 1; padding: 8px 16px; cursor: pointer; text-align: center; }
                .upn-tab-item.is-active { border-bottom: 3px solid var(--vscode-focusBorder); }
                .upn-tab-contents { display: flex; }
                .upn-tab-content { flex: 1; padding: 16px 0; display: none; }
                .upn-tab-content.is-active { display: block; }

                .history-item p { display: flex; border-bottom: }
                .history-item .update-type { margin-left: auto;  }

                .upn-stat-count { padding:2px 4px; background: var(--vscode-editor-background); border-radius: 4px; font-size:1.1rem; font-style: normal; border: 1px solid var(--vscode-panel-border); }
            </style>
        </head>
        <body>
            <p class="dimmed">Statistics (performed updates)</p>
            <div class="upn-analytics">
                <div class="upn-patches upn-stat">
                    <h2 class="value upn-stat-patches">0</h2>
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
            <div class="upn-tab">
                <div class="upn-tab-header">
                    <span class="upn-tab-item is-active">To update <i class="upn-stat-count">0</i></span>
                    <span class="upn-tab-item">Latest versions <i class="upn-stat-count">0</i></span>
                    <span class="upn-tab-item">History <i class="upn-stat-count">0</i></span>
                </div>
                <div class="upn-tab-contents">
                    <div id="availabe-updates" class="upn-tab-content is-active"></div>
                    <div id="up-to-date" class="upn-tab-content"></div>
                    <div id="historic-updates" class="upn-tab-content"></div>
                </div>
            </div>
            <div class="footer">
                <h3 class="upn-title">Cached Dependencies (0)</h3>
                <button class="refresh-btn">Update packages data</button>
            </div>
            <div class="timestamp"></div>

            <script>
                (function() {
                    const vscode = acquireVsCodeApi();
                    const content = document.getElementById('content');
                    const timestamp = document.querySelector('.timestamp');
                    const refreshBtn = document.querySelector('.refresh-btn');
                    const analytics = document.querySelector('.upn-analytics');
                    const tabItems = document.querySelectorAll('.upn-tab-item');
                    const tabContents = document.querySelectorAll('.upn-tab-content');

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
                        const availableUpdates = document.getElementById('availabe-updates');
                        const upToDate = document.getElementById('up-to-date');
                        const historicUpdates = document.getElementById('historic-updates');
                        
                        timestamp.textContent = 'Last updated: ' + data.timestamp;
                        
                        const totalCount = Object.keys(data.dependencies).length;
                        document.querySelector('.upn-title').textContent = 'Dependencies Data (' + totalCount + ')';
                        
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
                        availableUpdates.innerHTML = '';
                        upToDate.innerHTML = '';
                        historicUpdates.innerHTML = '';

                        // Render available updates
                        ['patch', 'minor', 'major'].forEach(updateType => {
                            if (groups[updateType].length > 0) {
                                const groupDiv = document.createElement('div');
                                groupDiv.className = 'update-group';
                                groupDiv.innerHTML = '<h3 class="group-title"><span class="update-type ' + 
                                    updateType + '"></span></h3>';
                                
                                groups[updateType]
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .forEach(info => {
                                        const div = document.createElement('div');
                                        div.className = 'dependency-item';
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
                        if (groups.latest.length > 0) {
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
                        if (data.trackUpdate && data.trackUpdate.length > 0) {
                            const historyDiv = document.createElement('div');
                            historyDiv.className = 'update-group';
                            historyDiv.innerHTML = '<h3 class="group-title"><span class="update-type">⌛ Update history</span></h3>';
                            
                            data.trackUpdate
                                .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
                                .forEach(update => {
                                    const div = document.createElement('div');
                                    div.className = 'dependency-item history-item';
                                    div.innerHTML = 
                                        '<p>' +
                                        '<span class="update">' +
                                        '<strong>📦 ' + update.packageName + '</strong> ' +
                                        '<span class="dimmed">from</span> ' +
                                        '<strong>' + update.currentVersion + '</strong> ' +
                                        '<span class="dimmed">to</span> ' +
                                        '<strong>' + update.latestVersion + '</strong> ' +
                                        '</span>' +
                                        '<span class="update-type ' + update.updateType.toLowerCase() + '"></span>' +
                                        '</p>' +
                                        '<p class="timestamp dimmed">' + new Date(update.timestamp).toLocaleString() + '</p>';
                                    historyDiv.appendChild(div);
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
                    }
                })();
            </script>
        </body>
        </html>`;
    }
}
