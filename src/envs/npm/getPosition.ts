import * as vscode from 'vscode';

export function getPosition(document: vscode.TextDocument, packageName: string) {
    const text = document.getText();
    const lines = text.split("\n");

    // Find the boundaries of dependencies and devDependencies
    const depsStart = lines.findIndex(line => line.includes('"dependencies"'));
    const depsEnd = lines.findIndex((line, i) => i > depsStart && line.includes('}'));
    const devDepsStart = lines.findIndex(line => line.includes('"devDependencies"'));
    const devDepsEnd = lines.findIndex((line, i) => i > devDepsStart && line.includes('}'));

    const regex = new RegExp(`"${packageName}"\\s*:`);
    let line = -1;
    let character = -1;

    // Check within dependencies block
    if (depsStart !== -1) {
        const depsMatch = lines
            .slice(depsStart, depsEnd + 1)
            .findIndex(line => regex.test(line));
        if (depsMatch !== -1) {
            line = depsStart + depsMatch;
            character = lines[line].indexOf(`"${packageName}":`);
        }
    }

    // Check within devDependencies block if not found in dependencies
    if (line === -1 && devDepsStart !== -1) {
        const devDepsMatch = lines
            .slice(devDepsStart, devDepsEnd + 1)
            .findIndex(line => regex.test(line));
        if (devDepsMatch !== -1) {
            line = devDepsStart + devDepsMatch;
            character = lines[line].indexOf(`"${packageName}":`);
        }
    }

    return { line, character };
}