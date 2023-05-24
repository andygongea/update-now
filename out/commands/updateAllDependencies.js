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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateAllDependencies = void 0;
const axios_1 = __importDefault(require("axios"));
const vscode = __importStar(require("vscode"));
// Function to fetch the latest version of a package from the NPM registry
async function getLatestVersion(packageName) {
    try {
        const response = await axios_1.default.get(`https://registry.npmjs.org/${packageName}/latest`);
        return response?.data?.version || null;
    }
    catch (error) {
        console.error(error);
        return null;
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
async function updateAllDependencies(documentUri) {
    const document = await vscode.workspace.openTextDocument(documentUri);
    const packageJson = JSON.parse(document.getText());
    const dependencies = packageJson.dependencies || {};
    const dependenciesToUpdate = [];
    for (const packageName in dependencies) {
        const latestVersion = await getLatestVersion(packageName);
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
exports.updateAllDependencies = updateAllDependencies;
//# sourceMappingURL=updateAllDependencies.js.map