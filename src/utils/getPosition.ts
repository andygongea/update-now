import * as vscode from "vscode";
import { IPackagePosition } from './types';

export function getPosition(document: vscode.TextDocument, packageName: string): IPackagePosition[] {
  const text = document.getText();
  const lines = text.split("\n");
  const positions: IPackagePosition[] = [];
  
  // Find all lines containing the package
  const regex = new RegExp(`"${packageName}"\\s*:`);
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const lineMatch = lines[lineIndex].match(regex); // Perform match once
    if (lineMatch) { // Check if match occurred
      let inDependencies = false;
      let braceCount = 0;
      
      // Check previous lines to ensure we're in a dependencies block
      for (let i = lineIndex; i >= 0; i--) {
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
      
      // Only add positions that are within dependencies or devDependencies blocks
      if (inDependencies) {
        // Use the existing lineMatch result
        const character = lines[lineIndex].indexOf(lineMatch[0]);
        
        positions.push({
          line: lineIndex,
          character,
          inDependencies
        });
      }
    }
  }
  
  // If no positions found, return a single invalid position for backward compatibility
  if (positions.length === 0) {
    return [{ line: -1, character: -1, inDependencies: false }];
  }
  
  return positions;
}