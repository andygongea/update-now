import * as vscode from 'vscode';

const outputChannel = vscode.window.createOutputChannel('Dependencies Update');

export const logger = {
    info: (message: string) => {
        outputChannel.appendLine(`[INFO] ${message}`);
    },
    error: (message: string, error?: any) => {
        const errorMessage = error ? `${message}: ${error.message || error}` : message;
        outputChannel.appendLine(`[❌ ERROR] ${errorMessage}`);
        if (error?.stack) {
            outputChannel.appendLine(`[STACK] ${error.stack}`);
        }
    },
    debug: (message: string, data?: any) => {
        outputChannel.appendLine(`[🔍 DEBUG] ${message}`);
        if (data) {
            outputChannel.appendLine(JSON.stringify(data, null, 2));
        }
    },
    show: () => {
        outputChannel.show();
    }
};
