import * as vscode from "vscode";
import { IPackagePosition } from './types';

export function getPosition(document: vscode.TextDocument, packageName: string): IPackagePosition[] {
  const text = document.getText();
  const lines = text.split("\n");
  const positions: IPackagePosition[] = [];
  
  // Find all lines containing the package
  const regex = new RegExp(`"${packageName}"\\s*:`);
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (regex.test(lines[lineIndex])) {
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
        const match = lines[lineIndex].match(regex);
        const character = match ? lines[lineIndex].indexOf(match[0]) : 0;
        
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