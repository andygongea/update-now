import vscode from "vscode";

export function getManifestFile(document: vscode.TextDocument): string | boolean {
  const fileName = document.uri.fsPath;
  
  if (fileName.endsWith("package.json")) {
    return "package.json";
  } else if (fileName.endsWith("composer.json")) {
    return "composer.json";
  }

  return false;
}