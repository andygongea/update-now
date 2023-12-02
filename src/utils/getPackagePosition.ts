import vscode from "vscode";

/**
 * Retrieves the position of a specific package name in a given document.
 *
 * @param {vscode.TextDocument} document - The text document to search in.
 * @param {string} packageName - The name of the package to find the position of.
 * @return {Object} - An object containing the line and character position of the package name.
 */
export function getPackagePosition(document: vscode.TextDocument, packageName: string) {
  const regex = new RegExp(`"${packageName}"\\s*:`);
  const lines = document.getText().split("\n");
  const line = lines.findIndex((line) => regex.test(line));
  const character = lines[line].indexOf(`"${packageName}":`);

  return { line, character };
}
