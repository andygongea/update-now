"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPackageJson = void 0;
// Function to check if the current document is a package.json file
function isPackageJson(document) {
    const fileName = document.uri.fsPath;
    return fileName.endsWith("package.json");
}
exports.isPackageJson = isPackageJson;
//# sourceMappingURL=isPackageJson.js.map