import vscode from "vscode";

// Function to check if the current document is a package.json file
export function isPackageJson(document: vscode.TextDocument): boolean {
  const fileName = document.uri.fsPath;
  return fileName.endsWith("package.json");
}