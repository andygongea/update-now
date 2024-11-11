import * as vscode from "vscode";

export async function showRatingNotification() {
  const rateButton = "Rate this extension";
  const cancelButton = "Cancel";
  const message = `🙌 AMAZING, you are updating dependencies like a pro! Share your love for Update Now extension! ⭐⭐⭐⭐⭐`;

  const result = await vscode.window.showInformationMessage(
    message,
    rateButton,
    cancelButton,
  );

  if (result === rateButton) {
    const extensionId = "AndyGongea.update-now"; // Replace with your extension's ID
    const marketplaceUrl = `https://marketplace.visualstudio.com/items?itemName=${extensionId}`;
    vscode.env.openExternal(vscode.Uri.parse(marketplaceUrl));
  }
}
