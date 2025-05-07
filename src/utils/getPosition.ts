import * as vscode from "vscode";
import { IPackagePosition } from './types';
import { logger } from '../utils/logger';

export function getPosition(document: vscode.TextDocument, packageName: string): IPackagePosition[] {
  const text = document.getText();
  const lines = text.split("\n");
  const positions: IPackagePosition[] = [];
  
  logger.info(`Searching for package positions: ${packageName}`);
  
  // Define valid dependency section names - exact names only
  const validSections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'bundleDependencies',
    'bundledDependencies',
    'optionalDependencies'
  ];
  
  // First pass: find all valid dependency sections and their line ranges
  const sectionRanges: {section: string, startLine: number, endLine: number}[] = [];
  let currentSection = '';
  let sectionStartLine = -1;
  let braceCount = 0;
  let inSection = false;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // When we're in a section, track braces to determine when the section ends
    if (inSection) {
      braceCount += (line.match(/{/g) || []).length;
      braceCount -= (line.match(/}/g) || []).length;
      
      // When brace count reaches 0, the section has ended
      if (braceCount === 0) {
        sectionRanges.push({
          section: currentSection,
          startLine: sectionStartLine,
          endLine: i
        });
        inSection = false;
        currentSection = '';
      }
    }
    
    // Look for section headers - make sure to match exact section names
    const sectionMatch = line.match(/"([^"]+)"\s*:\s*{/);
    if (sectionMatch && validSections.includes(sectionMatch[1])) {
      currentSection = sectionMatch[1];
      sectionStartLine = i;
      inSection = true;
      braceCount = 1; // Count the opening brace we just found
    }
  }
  
  logger.info(`Found ${sectionRanges.length} dependency sections: ${JSON.stringify(sectionRanges)}`);
  
  // Second pass: find packages within the identified section ranges
  // Regex to find the package name as a key in JSON
  const regex = new RegExp(`"${packageName}"\\s*:`);
  
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    if (regex.test(lines[lineIndex])) {
      // Check if this line falls within any of our valid dependency sections
      const containingSection = sectionRanges.find(range => 
        lineIndex >= range.startLine && lineIndex <= range.endLine);
        
      if (containingSection) {
        // Found the package in a valid dependency section
        logger.info(`Found package ${packageName} at line ${lineIndex} in section ${containingSection.section}: ${lines[lineIndex].trim()}`);
        
        // Get the exact position within the line
        const match = lines[lineIndex].match(regex);
        const character = match ? lines[lineIndex].indexOf(match[0]) : 0;
        
        // Add the position with all required metadata
        positions.push({
          line: lineIndex,
          character,
          inDependencies: true, // Always true since we've confirmed it's in a valid section
          sectionType: containingSection.section // Store section name for more precise handling
        });
      } else {
        // The package appears in a non-dependency section like peerDependenciesMeta
        logger.info(`Skipping position for ${packageName} at line ${lineIndex} - not in a valid dependency section`);
      }
    }
  }
  
  // If no positions found, return a single invalid position for backward compatibility
  if (positions.length === 0) {
    logger.info(`No valid positions found for package ${packageName}`);
    return [{ line: -1, character: -1, inDependencies: false }];
  }
  
  logger.info(`Found ${positions.length} valid positions for package ${packageName}`);
  return positions;
}