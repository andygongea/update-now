import * as vscode from "vscode";
import { showRatingNotification } from "../commands/showRatingNotification";

export async function incrementUpgradeCount(context: vscode.ExtensionContext): Promise<void> {
  const upgradeCountKey = "dependencyUpgradeCount";
  const count = (context.globalState.get<number>(upgradeCountKey) || 0) + 1;
  await context.globalState.update(upgradeCountKey, count);
  if (count === 8) {
    setTimeout(showRatingNotification, 2500);
  }
}
