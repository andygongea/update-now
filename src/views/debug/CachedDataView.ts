import * as vscode from 'vscode';
import { IDependencyData } from '../../utils/types';

/**
 * Provides a webview panel for debugging dependency data cache.
 * This view shows the raw data stored in the extension's state.
 */
export class CachedDataView implements vscode.Disposable {
  public static readonly viewType = 'cachedDataDebug';
  
  private _panel: vscode.WebviewPanel | undefined;
  private _disposables: vscode.Disposable[] = [];

  /**
   * Creates a new instance of the CachedDataView
   * @param _extensionUri - The URI of the extension
   * @param _context - The extension context for state management
   */
  constructor(
    private readonly _extensionUri: vscode.Uri,
    private readonly _context: vscode.ExtensionContext
  ) {}

  /**
   * Shows the cached data view panel
   */
  public show() {
    // Create panel if it doesn't exist, or focus it if it does
    if (!this._panel) {
      this._panel = vscode.window.createWebviewPanel(
        CachedDataView.viewType,
        'Dependency Cache Data',
        vscode.ViewColumn.Two, // Open in the second editor column
        {
          enableScripts: true,
          retainContextWhenHidden: true,
          localResourceRoots: [this._extensionUri]
        }
      );

      // Clean up resources when panel is closed
      this._panel.onDidDispose(
        () => {
          this._panel = undefined;
          this.dispose();
        },
        null,
        this._disposables
      );

      // Handle messages from the webview
      this._panel.webview.onDidReceiveMessage(
        message => {
          switch (message.command) {
            case 'refresh':
              this._updateContent();
              return;
          }
        },
        null,
        this._disposables
      );
    } else {
      // If panel already exists, bring it to front
      this._panel.reveal(vscode.ViewColumn.Two);
    }

    // Update content
    this._updateContent();
  }

  /**
   * Updates the content of the webview with the latest dependency data
   */
  private _updateContent() {
    if (!this._panel) {
      return;
    }

    const dependenciesData = this._context.workspaceState.get<Record<string, IDependencyData>>('dependenciesData', {});
    this._panel.webview.html = this._getHtmlForWebview(dependenciesData);
  }

  private stripHtml(html: string | undefined) {
    if (!html) {
      return '';
    }
    return html.replace(/<[^>]*>/g, '');
  }

  /**
   * Generates the HTML content for the webview
   * @param dependenciesData - The dependencies data to display
   * @returns HTML content for the webview
   */
  private _getHtmlForWebview(dependenciesData: Record<string, IDependencyData>): string {
    // Create table rows for each dependency
    const tableRows = Object.entries(dependenciesData).map(([packageName, data]) => {
      const { version, description, author, timestamp, updateType } = data;
      const date = new Date(timestamp);
      const formattedDate = date.toLocaleString();
      
      return `
        <tr>
          <td class="description">
            <strong>${packageName}</strong>
            <p>${this.stripHtml(description)}</p>
          </td>
          <td>${version || 'N/A'}</td>
          <td>${author || 'N/A'}</td>
          <td>${formattedDate}</td>
        </tr>
      `;
    }).join('');

    // Return HTML for the webview
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Dependency Cache Data</title>
        <style>
          body {
            font-family: var(--vscode-font-family);
            padding: 10px;
            color: var(--vscode-editor-foreground);
          }
          .info {
            margin-bottom: 1rem;
            color: var(--vscode-descriptionForeground);
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 1rem;
          }
          th, td {
            text-align: left;
            padding: 0.5rem;
            border-bottom: 1px solid var(--vscode-panel-border);
          }
          th {
            position: sticky;
            top: 0;
            background-color: var(--vscode-editor-background);
            font-weight: bold;
          }
          tr:hover {
            background-color: var(--vscode-list-hoverBackground);
          }
          .description {
            max-width: 300px;
          }
          .description p {
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
            opacity: .75;
            margin: 5px 0 0;
          }
          .actions {
            margin-top: 1rem;
            display: flex;
            gap: 0.5rem;
          }
          button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 0.3rem 0.8rem;
            cursor: pointer;
            border-radius: 2px;
          }
          button:hover {
            background-color: var(--vscode-button-hoverBackground);
          }
          .count {
            margin-bottom: 1rem;
            font-weight: bold;
          }
          .empty-state {
            margin: 2rem 0;
            text-align: center;
            color: var(--vscode-descriptionForeground);
          }
        </style>
      </head>
      <body>
        <div class="info">
          This view shows the raw data stored in the extension's state.
        </div>
        <button id="refresh-btn">Refresh Data</button>
        <div class="count">
          ${Object.keys(dependenciesData).length} dependencies cached
        </div>
        ${Object.keys(dependenciesData).length === 0 
          ? '<div class="empty-state">No dependency data in cache.</div>' 
          : `<table>
              <thead>
                <tr>
                  <th>Package Name</th>
                  <th>Latest Version</th>
                  <th>Author</th>
                  <th>Last Updated</th>
                </tr>
              </thead>
              <tbody>
                ${tableRows}
              </tbody>
            </table>`
        }
        <script>
          (function() {
            const vscode = acquireVsCodeApi();
            
            // Handle refresh button
            document.getElementById('refresh-btn').addEventListener('click', () => {
              vscode.postMessage({ command: 'refresh' });
            });
          })();
        </script>
      </body>
      </html>`;
  }

  /**
   * Dispose of resources
   */
  public dispose() {
    if (this._panel) {
      this._panel.dispose();
    }
    
    this._disposables.forEach(d => d.dispose());
    this._disposables = [];
  }
}
