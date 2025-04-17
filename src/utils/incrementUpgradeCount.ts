import * as vscode from "vscode";
import { showRatingNotification } from "../commands/showRatingNotification";

export async function incrementUpgradeCount(context: vscode.ExtensionContext): Promise<void> {
  const upgradeCountKey = "dependencyUpgradeCount";
  const count = (context.globalState.get<number>(upgradeCountKey) || 0) + 1;
  await context.globalState.update(upgradeCountKey, count);
  // Month-based notification threshold
  const monthThresholds = [12, 10, 8, 10, 7, 9, 11, 5, 7, 8, 9, 10];
  // Months are 0-indexed: 0=January, 1=February, ...
  const now = new Date();
  const currentMonth = now.getMonth();
  const threshold = monthThresholds[currentMonth];
  if (count === threshold) {
    setTimeout(showRatingNotification, 2500);
  }
}
