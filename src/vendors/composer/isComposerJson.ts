import vscode from "vscode";

// Function to check if the current document is a composer.json file
export function isComposerJson(document: vscode.TextDocument): boolean {
  const fileName = document.uri.fsPath;
  return fileName.endsWith("composer.json");
}