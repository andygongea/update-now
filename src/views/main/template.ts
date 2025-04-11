import * as vscode from 'vscode';

/**
 * Returns the HTML template for the cache view webview
 * @param webview The webview to generate HTML for
 * @param getMediaUrl Function to get media URLs
 * @param settingsSection The settings section HTML
 * @param scriptContent The script content
 * @param warningMessage The warning message section HTML
 * @returns The complete HTML template
 */
export function getCacheViewTemplate(
    webview: vscode.Webview,
    getMediaUrl: (fileName: string) => vscode.Uri,
    settingsSection: string,
    scriptContent: string,
    warningMessage: string,
    emptyStateMessage: string
): string {
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Dependencies Data</title>
            <link rel="stylesheet" href="${getMediaUrl('main/style.css')}">
        </head>
        <body>
            <header class="upn-header">
                <h1 class="upn-heading"><span class="upn-logo"></span>Update Now</h1>
            </header>
            <!--${warningMessage}-->
            ${emptyStateMessage}

            <div class="upn-view-content">
                <div class="upn-tab">
                    <div class="upn-tab-header">
                        <span class="upn-tab-item is-active">To update <i class="upn-stat-count">0</i></span>
                        <span class="upn-tab-item">Latest <i class="upn-stat-count">0</i></span>
                        <span class="upn-tab-item">Stats <i class="upn-stat-count">0</i></span>
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
                <div class="upn-footer">
                    <h3 class="upn-footer-title">⚙️ Settings</h3>

                    <div class="upn-footer-section">
                        <div class="settings-section">
                            ${settingsSection}
                        </div>
                    </div>

                    <div class="upn-footer-section">
                        <div class="settings-section">
                            <h3 id="upn-cached-count" class="settings-title upn-title">Cached Dependencies (0)</h3>
                            <div class="timestamp upn-cache-age"></div>
                            <div class="upn-warning">
                                <p class="upn-message">⚠️ Clearing the cache will delete the dependencies data stored in the extension. The fetching mechanism will request batches of 20 dependencies every 25 seconds to avoid NPM rate limits.</p>
                                <div class="upn-button-group">
                                    <button class="upn-button upn-button-ghost upn-show-cache-data">Show Cache Data</button>
                                    <button class="upn-button upn-button-ghost upn-clear-cache">Clear Cache</button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="upn-footer-section">
                        <div class="settings-section">
                            <h3 class="settings-title upn-title">Rate this extension! </h3>
                            <p>I hope you find it useful! Please support the project by giving it stars on the VSCode marketplace: ⭐⭐⭐⭐⭐</p>

                            <a href="https://marketplace.visualstudio.com/items?itemName=AndyGongea.update-now&ssr=false#review-details" class="upn-button upn-rate-me">Rate this extension</a>
                            
                        </div>
                    </div>
                    
                </div>
            </div>
            <script>${scriptContent}</script>
        </body>
        </html>`;
}
