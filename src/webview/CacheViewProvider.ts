import * as vscode from 'vscode';

export class CacheViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'dependenciesCache';

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
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

        // Initial content update
        this._updateContent(webviewView.webview);
    }

    private _updateContent(webview: vscode.Webview) {
        const dependenciesData = this._context.workspaceState.get<Record<string, any>>('dependenciesData', {});
        const currentTime = "2024-12-22T18:04:55+02:00";
        
        webview.postMessage({
            type: 'update',
            data: {
                dependencies: dependenciesData,
                timestamp: currentTime
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependencies Cache</title>
            <style>
                body {
                    padding: 20px;
                    color: var(--vscode-foreground);
                    font-family: var(--vscode-font-family);
                }
                p { margin: 0; font-size: 13px; line-height: 1.45; }
                .dimmed { color: var(--vscode-descriptionForeground); }
                .update-type {
                    display: inline-block;
                    padding: 2px 6px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                    line-height: 1;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                    color: var(--vscode-editor-background);
                    background-image: linear-gradient(transparent, rgba(0,0,0,.15))
                }
                .update-type.patch { background-color: var(--vscode-minimapGutter-addedBackground); }
                .update-type.minor { background-color: var(--vscode-editorWarning-foreground); }
                .update-type.major { background-color: var(--vscode-minimapGutter-deletedBackground); }
                .update-type.latest { background-color: transparent; color: var(--vscode-foreground); }
                .dependency-item {
                    margin-bottom: -1px;
                    padding: 10px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 0;
                }
                
                .dependency-item:first-of-type { border-radius: 4px 4px 0 0; }
                .dependency-item:last-of-type { border-radius: 0 0 4px 4px; }

                .dependency-item strong { font-weight: 600; }
                .header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 15px;
                }
                .refresh-btn {
                    padding: 8px 12px;
                    background: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                .refresh-btn:hover {
                    background: var(--vscode-button-hoverBackground);
                }
                .timestamp {
                    font-size: 0.9em;
                    color: var(--vscode-descriptionForeground);
                }
                .update-group {
                    margin-bottom: 16px;
                }
                .group-title {
                    font-size: 14px;
                    font-weight: 600;
                    margin: 0 0 4px 0;
                    padding: 8px 0;
                    background: var(--vscode-editor-lineHighlightBackground);
                    border-radius: 4px;
                }
            </style>
        </head>
        <body>
            <div class="header">
                <h3 class="un-title">Dependencies Cache (0)</h3>
                <button class="refresh-btn">Refresh</button>
            </div>
            <div id="content"></div>
            <div class="timestamp"></div>

            <script>
                const vscode = acquireVsCodeApi();
                const content = document.getElementById('content');
                const timestamp = document.querySelector('.timestamp');
                const refreshBtn = document.querySelector('.refresh-btn');

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
                    content.innerHTML = '';
                    timestamp.textContent = \`Last updated: \${data.timestamp}\`;
                    
                    const totalCount = Object.keys(data.dependencies).length;
                    document.querySelector('.un-title').textContent = \`Dependencies Cache (\${totalCount})\`;
                    
                    // Group dependencies by update type
                    const groups = {
                        patch: [],
                        minor: [],
                        major: [],
                        latest: []
                    };

                    // Sort dependencies into groups
                    Object.entries(data.dependencies).forEach(([name, info]) => {
                        if (info.updateType in groups) {
                            groups[info.updateType].push({ name, ...info });
                        }
                    });

                    // Sort each group alphabetically and render
                    const updateOrder = ['patch', 'minor', 'major', 'latest'];
                    updateOrder.forEach(updateType => {
                        if (groups[updateType].length > 0) {
                            const groupDiv = document.createElement('div');
                            groupDiv.className = 'update-group';
                            groupDiv.innerHTML = \`<h3 class="group-title"><span class="update-type \${updateType}">\${updateType.toUpperCase()}</span></h3>\`;
                            
                            // Sort alphabetically by package name
                            groups[updateType]
                                .sort((a, b) => a.name.localeCompare(b.name))
                                .forEach(info => {
                                    const div = document.createElement('div');
                                    div.className = 'dependency-item';
                                    div.innerHTML = \`
                                        <p>
                                            📦 <strong>\${info.name}</strong> <span class="dimmed">⇢</span> <strong>\${info.version}</strong>
                                        </p>
                                        <p class="dimmed">\${info.description}</p>
                                    \`;
                                    groupDiv.appendChild(div);
                                });
                            
                            content.appendChild(groupDiv);
                        }
                    });
                }
            </script>
        </body>
        </html>`;
    }
}
