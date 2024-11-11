import * as vscode from "vscode";
import { getPosition } from "../envs/npm/getPosition"; // Adjust the import path as necessary

export function addCodeLenses(codeLenses: vscode.CodeLens[], document: vscode.TextDocument, dependenciesData: Record<string, any>) {
    const deps = dependenciesData;
    let patches = 0;
    let minors = 0;
    let majors = 0;

    for (const packageName in deps) {
        const { version, description, author, updateType } = deps[packageName];
        const packageJson = JSON.parse(document.getText());
        const currentVersion = packageJson.dependencies[packageName] || packageJson.devDependencies[packageName];
        const latestVersion = version;
        if (!currentVersion) {
            continue;
        }

        const position = getPosition(document, packageName);
        const { line, character } = position;

        if (line === -1) { continue; }

        if (updateType !== "latest" && currentVersion !== "latest") {
            const range = new vscode.Range(line, character, line, character);
            let title = "";
            let tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n`;

            if (updateType === "patch") {
                patches++;
                title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
                tooltip += `❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
            } else if (updateType === "minor") {
                minors++;
                title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
                tooltip += `✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
            } else if (updateType === "major") {
                majors++;
                title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
                tooltip += `🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
            }

            codeLenses.push(
                new vscode.CodeLens(range, {
                    title,
                    tooltip,
                    command: "update-now.updateDependency",
                    arguments: [document.uri, packageName, currentVersion],
                })
            );
        }
    }

    const summaryRange = new vscode.Range(0, 0, 0, 0);
    if (patches + minors + majors > 0) {
        const summaryTitle = `Update Now: ${patches + minors + majors
            } updates available (❇️ ${patches} x patch, ✴️ ${minors} x minor, 🛑 ${majors} x major)`;

        codeLenses.unshift(
            new vscode.CodeLens(summaryRange, {
                title: summaryTitle,
                tooltip: "Please be careful when updating all dependencies at once. \nMINOR ✴️ and MAJOR 🛑 updates can break your code functionality.",
                command: "update-now.showNotification",
            })
        );
    } else {
        codeLenses.unshift(
            new vscode.CodeLens(summaryRange, {
                title: "Congrats! 🙌 Your dependencies are up to date.",
                command: "",
            })
        );
    }
}
