import * as vscode from "vscode";

export function getPosition(document: vscode.TextDocument, packageName: string) {
  const regex = new RegExp(`"${packageName}"\\s*:`);
  const line = document
    .getText()
    .split("\n")
    .findIndex((line) => regex.test(line));

  // Return early if package not found
  if (line === -1) {
    return { line: -1, character: -1 };
  }

  const character = document.lineAt(line).text.indexOf(`"${packageName}":`);
  return { line, character };
}
