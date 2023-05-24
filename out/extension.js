"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = __importStar(require("vscode"));
const isPackageJson_1 = require("./utils/isPackageJson");
const getLatestVersion_1 = require("./utils/getLatestVersion");
const showNotification_1 = require("./commands/showNotification");
const debounce_1 = require("./utils/debounce");
const getUpdateType_1 = require("./utils/getUpdateType");
let i = 1;
// CodeLensProvider class responsible for providing CodeLens annotations
class DependencyCodeLensProvider {
    constructor() {
        // Event emitter to notify VS Code when CodeLens annotations need to be updated
        this._onDidChangeCodeLenses = new vscode.EventEmitter();
        this.onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;
        this.promises = [];
        this.dependenciesData = {};
        // Refresh the CodeLenses when the package.json file is saved
        this.refreshCodeLenses = (0, debounce_1.debounce)(async (document) => {
            // Clear the existing CodeLenses
            this._onDidChangeCodeLenses.fire();
            // Reset the promises and dependenciesData
            this.promises = [];
            this.dependenciesData = {};
            // Provide new CodeLenses based on the updated package.json
            await this.provideCodeLenses(document);
        }, 50);
    }
    // Function to provide CodeLens annotations for a given TextDocument
    async provideCodeLenses(document) {
        const codeLenses = [];
        if ((0, isPackageJson_1.isPackageJson)(document)) {
            const packageJson = JSON.parse(document.getText());
            const dependencies = packageJson.dependencies || {};
            // If promises have not been created yet, create them
            if (this.promises.length === 0) {
                this.promises = Object.keys(dependencies).map(async (packageName) => {
                    const latestVersion = await (0, getLatestVersion_1.getLatestVersion)(packageName);
                    const currentVersion = dependencies[packageName];
                    const position = getPosition(document, packageName);
                    return {
                        packageName,
                        currentVersion,
                        latestVersion,
                        update: (0, getUpdateType_1.getUpdateType)(currentVersion, latestVersion),
                        line: position['line'],
                        character: position['character'],
                    };
                });
            }
            // Convert the array of dependencies data to an object
            for (const promise of this.promises) {
                const dependencyData = await promise;
                if (dependencyData.latestVersion !== null) {
                    this.dependenciesData[dependencyData.packageName] = {
                        version: dependencyData.currentVersion,
                        latestVersion: dependencyData.latestVersion,
                        update: dependencyData.update,
                        line: dependencyData.line,
                        character: dependencyData.character,
                    };
                }
            }
            const deps = this.dependenciesData;
            let patches = 0;
            let minors = 0;
            let majors = 0;
            let outOfRange = 0;
            // Loop through all dependencies in the package.json file
            for (const packageName in deps) {
                const currentVersion = deps[packageName].version;
                const line = deps[packageName].line;
                if (line === -1) {
                    continue;
                }
                const character = deps[packageName].character;
                const latestVersion = deps[packageName].latestVersion;
                const updateType = deps[packageName].update;
                // Skip when the current version is already the latest version
                if (updateType !== 'identical' && currentVersion !== "latest") {
                    const range = new vscode.Range(line, character, line, character);
                    let tooltip = "";
                    let title = "";
                    if (updateType === "patch") {
                        patches++;
                        title = `⇡ Patch to ${latestVersion}`;
                        tooltip = `✅ Click to patch ${packageName} from ${currentVersion} to ${latestVersion}`;
                    }
                    else if (updateType === "minor") {
                        minors++;
                        title = `⇡ Minor update to ${latestVersion}`;
                        tooltip = `👉 Click to update ${packageName} from ${currentVersion} to ${latestVersion}`;
                    }
                    else if (updateType === "within range") {
                        minors++;
                        title = `⇡ Minor update to ${latestVersion} (within range)`;
                        tooltip = `👉 Click to update ${packageName} from ${currentVersion} to ${latestVersion}`;
                    }
                    else if (updateType === "major") {
                        majors++;
                        title = `⇪ Major update to ${latestVersion}`;
                        tooltip = `⚠️ Click to update ${packageName} from ${currentVersion} to ${latestVersion}\nPlease check for any breaking changes before updating.`;
                    }
                    else if (updateType === "out of range") {
                        outOfRange++;
                        title = `⇪ Major update to ${latestVersion} (out of specified range)`;
                        tooltip = `⚠️ The latest ${packageName} version: ${latestVersion} is not part of the ${currentVersion} range.\nPlease check for any breaking changes before updating.`;
                    }
                    codeLenses.push(new vscode.CodeLens(range, {
                        title: title,
                        tooltip: tooltip,
                        command: "update-now.updateDependency",
                        arguments: [document.uri, packageName, latestVersion],
                    }));
                }
            }
            if (patches + minors + majors + outOfRange > 0) {
                const summaryRange = new vscode.Range(0, 0, 0, 0);
                const summaryTitle = `🚀 Update Now: ${patches + minors + majors + outOfRange} available updates (${patches} x patch, ${minors} x minor, ${majors} x major, ${outOfRange} x out of range)`;
                codeLenses.unshift(new vscode.CodeLens(summaryRange, {
                    title: summaryTitle,
                    tooltip: "Please be careful when updating all dependencies at once.",
                    command: "update-now.showNotification",
                }));
            }
        }
        return codeLenses;
    }
}
// Function to update the version of a dependency in the package.json file
async function updateDependency(documentUri, packageName, latestVersion) {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const text = document.getText();
    const updatedText = text.replace(new RegExp(`("${packageName}":\\s*")([^"]+)`, "g"), `$1${latestVersion}`);
    const edit = new vscode.WorkspaceEdit();
    edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(text.length)), updatedText);
    await vscode.workspace.applyEdit(edit);
}
function getPosition(document, packageName) {
    const regex = new RegExp(`"${packageName}"\\s*:`);
    const line = document
        .getText()
        .split("\n")
        .findIndex((line) => regex.test(line));
    const character = document.lineAt(line).text.indexOf(`"${packageName}":`);
    return { 'line': line, 'character': character };
}
// Function to update all dependencies in the package.json file
async function updateAllDependencies(documentUri) {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const packageJson = JSON.parse(document.getText());
    const dependencies = packageJson.dependencies || {};
    const dependenciesToUpdate = [];
    for (const packageName in dependencies) {
        const latestVersion = await (0, getLatestVersion_1.getLatestVersion)(packageName);
        if (latestVersion) {
            dependenciesToUpdate.push(packageName);
            packageJson.dependencies[packageName] = latestVersion; // update the version number
        }
    }
    if (dependenciesToUpdate.length !== 0) {
        const updatedText = JSON.stringify(packageJson, null, 2);
        const edit = new vscode.WorkspaceEdit();
        edit.replace(document.uri, new vscode.Range(document.positionAt(0), document.positionAt(document.getText().length)), updatedText);
        await vscode.workspace.applyEdit(edit);
        vscode.window.showInformationMessage("All dependencies updated to their latest version.");
    }
    else {
        vscode.window.showInformationMessage("All dependencies are up to date.");
        return;
    }
}
// Extension activation function, called when the extension is activated
function activate(context) {
    context.subscriptions.push(vscode.commands.registerCommand("update-now.updateDependency", updateDependency));
    // Register the updateAllDependencies command
    const updateAllDependenciesCommand = vscode.commands.registerCommand("update-now.updateAllDependencies", async () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (0, isPackageJson_1.isPackageJson)(editor.document)) {
            await updateAllDependencies(editor.document.uri);
        }
    });
    context.subscriptions.push(updateAllDependenciesCommand);
    // Register the CodeLens provider
    const codeLensProvider = new DependencyCodeLensProvider();
    const selector = [
        { language: "json", pattern: "**/package.json" },
        { language: "jsonc", pattern: "**/package.json" },
    ];
    context.subscriptions.push(vscode.languages.registerCodeLensProvider(selector, codeLensProvider));
    // Add event listener for document save
    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document) => {
        if ((0, isPackageJson_1.isPackageJson)(document)) {
            codeLensProvider.refreshCodeLenses(document);
        }
    }));
    // Register the showNotification command
    context.subscriptions.push(vscode.commands.registerCommand("update-now.showNotification", () => {
        const editor = vscode.window.activeTextEditor;
        if (editor && (0, isPackageJson_1.isPackageJson)(editor.document)) {
            (0, showNotification_1.showUpdateNotification)();
        }
    }));
}
exports.activate = activate;
// Extension deactivation function, called when the extension is deactivated
function deactivate() { }
exports.deactivate = deactivate;
//# sourceMappingURL=extension.js.map