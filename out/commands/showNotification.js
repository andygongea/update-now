"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.showUpdateNotification = void 0;
const vscode_1 = __importDefault(require("vscode"));
async function showUpdateNotification() {
    const updateButton = "Update";
    const cancelButton = "Cancel";
    const message = 'You are about to update all dependencies! This action might cause your code to fail, so proceed with caution.*** ';
    const result = await vscode_1.default.window.showWarningMessage(message, updateButton, cancelButton);
    if (result === updateButton) {
        vscode_1.default.commands.executeCommand("update-now.updateAllDependencies");
    }
}
exports.showUpdateNotification = showUpdateNotification;
//# sourceMappingURL=showNotification.js.map