"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showUpdateNotification = void 0;
const vscode_1 = __importDefault(require("vscode"));
async function showUpdateNotification() {
    const updateButton = "Update all dependencies";
    const cancelButton = "Cancel";
    const message = 'Be aware! ✋ You are about to update all dependencies. Proceeding might cause your code to fail, so act carefully.';
    const result = await vscode_1.default.window.showWarningMessage(message, updateButton, cancelButton);
    if (result === updateButton) {
        vscode_1.default.commands.executeCommand("update-now.updateAllDependencies");
    }
}
exports.showUpdateNotification = showUpdateNotification;
//# sourceMappingURL=showNotification.js.map