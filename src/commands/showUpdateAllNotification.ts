import vscode from "vscode";

export async function showUpdateAllNotification() {
    const updateButton = "Update all dependencies";
    const cancelButton = "Cancel";
    const message = 'Be aware! ✋ You are about to update all dependencies. Proceeding might cause your code to fail, so act carefully.';
  
    const result = await vscode.window.showWarningMessage(
      message,
      updateButton,
      cancelButton,
    );
  
    if (result === updateButton) {
      vscode.commands.executeCommand("update-now.updateAllDependencies");
    }
  }