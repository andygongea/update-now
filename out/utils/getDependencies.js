"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDependencies = void 0;
const vscode_1 = __importDefault(require("vscode"));
const isPackageJson_1 = require("./isPackageJson");
const getLatestVersion_1 = require("./getLatestVersion");
const getUpdateType_1 = require("./getUpdateType");
let promises = [];
let dependenciesData = {};
let j = 1;
async function getDependencies(document) {
    if (document !== vscode_1.default.window.activeTextEditor?.document) {
        return [];
    }
    console.log(`${j} getDependencies: `);
    j++;
    if ((0, isPackageJson_1.isPackageJson)(document)) {
        const packageJson = JSON.parse(document.getText());
        const dependencies = packageJson.dependencies ?? {};
        // If promises have not been created yet, create them
        if (promises.length === 0) {
            promises = Object.keys(dependencies).map(async (packageName) => {
                const latestVersion = await (0, getLatestVersion_1.getLatestVersion)(packageName);
                const currentVersion = dependencies[packageName];
                return {
                    packageName,
                    currentVersion,
                    latestVersion,
                    update: (0, getUpdateType_1.getUpdateType)(currentVersion, latestVersion),
                    line: getLine(document, packageName),
                    character: getCharacter(document, packageName),
                };
            });
        }
        // Wait for all promises to resolve before continuing
        const dependenciesDataArray = await Promise.all(promises);
        // Convert the array of dependencies data to an object
        for (const dependency of dependenciesDataArray) {
            if (dependency.latestVersion !== null) {
                dependenciesData[dependency.packageName] = {
                    version: dependency.currentVersion,
                    latestVersion: dependency.latestVersion,
                    update: dependency.update,
                    line: dependency.line,
                    character: dependency.character,
                };
            }
        }
        console.log('dependenciesData: ', dependenciesData);
        return dependenciesData;
    }
    else {
        return [];
    }
}
exports.getDependencies = getDependencies;
function getLine(document, packageName) {
    const regex = new RegExp(`"${packageName}"\\s*:`);
    const line = document
        .getText()
        .split("\n")
        .findIndex((line) => regex.test(line));
    return line;
}
function getCharacter(document, packageName) {
    const line = getLine(document, packageName);
    const character = document.lineAt(line).text.indexOf(`"${packageName}":`);
    return character;
}
//# sourceMappingURL=getDependencies.js.map