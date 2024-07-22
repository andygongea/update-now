import * as vscode from "vscode";
import { showRatingNotification } from "../commands/showRatingNotification";

export async function incrementUpgradeCount(context: vscode.ExtensionContext): Promise<void> {
  const upgradeCountKey = "dependencyUpgradeCount";
  const count = (context.globalState.get<number>(upgradeCountKey) || 0) + 1;
  await context.globalState.update(upgradeCountKey, count);
  console.log(count);
  if (count === 5) {
    setTimeout(showRatingNotification, 2000);
  }
}
