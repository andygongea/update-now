import * as vscode from "vscode";

export function getPosition(document: vscode.TextDocument, packageName: string) {
  const text = document.getText();
  const lines = text.split("\n");
  
  let inDependencies = false;
  let braceCount = 0;
  
  // Find the line containing the package
  const regex = new RegExp(`"${packageName}"\\s*:`);
  const line = lines.findIndex((line) => regex.test(line));

  // Return early if package not found
  if (line === -1) {
    return { line: -1, character: -1 };
  }

  // Check previous lines to ensure we're in a dependencies block
  for (let i = line; i >= 0; i--) {
    const currentLine = lines[i].trim();
    
    braceCount += (currentLine.match(/\{/g) || []).length;
    braceCount -= (currentLine.match(/\}/g) || []).length;
    
    if (/"(dev)?dependencies"\s*:\s*\{/.test(currentLine)) {
      inDependencies = true;
      break;
    }
    
    // If we reach root level, stop searching
    if (braceCount < 0) {
      break;
    }
  }

  // Only return position if we're in a dependencies block
  if (!inDependencies) {
    return { line: -1, character: -1 };
  }

  const character = document.lineAt(line).text.indexOf(`"${packageName}":`);
  return { line, character };
}