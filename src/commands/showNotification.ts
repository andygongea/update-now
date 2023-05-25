import vscode from "vscode";

export async function showUpdateNotification() {
    const updateButton = "Update";
    const cancelButton = "Cancel";
    const message = 'You are about to update all dependencies! This action might cause your code to fail, so proceed with caution.';
  
    const result = await vscode.window.showWarningMessage(
      message,
      updateButton,
      cancelButton,
    );
  
    if (result === updateButton) {
      vscode.commands.executeCommand("update-now.updateAllDependencies");
    }
  }