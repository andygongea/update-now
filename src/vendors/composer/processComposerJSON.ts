import vscode from "vscode";
import { getUpdateType } from "../../utils/getUpdateType";
import { getPackagePosition } from "../../utils/getPackagePosition";
import { getLatestComposer } from "./getLatestComposer";

/**
 * Processes the given dependencies data and generates the code lenses for each dependency.
 *
 * @param {any} dependenciesData - The data representing the dependencies.
 * @param {vscode.TextDocument} document - The vscode document that is being analyzed (composer.json)
 * @return {vscode.CodeLens[]} The generated code lenses.
 */
export async function processComposerJSON(document: vscode.TextDocument, context: vscode.ExtensionContext) {
  interface ComposerPackage {
    version: string;
    description: string;
    authors: Record<string, string>[];
  }

  interface ComposerInfo {
    packages: Record<string, ComposerPackage[]>;
  }

  let dependenciesData: any = {};
  const codeLenses: vscode.CodeLens[] = [];

  const documentPath = document.fileName;

  // Check if the data is available and up-to-date in local storage
  const storedData: any = context.globalState.get(documentPath);
  if (storedData) {
    const { data, timestamp } = JSON.parse(storedData);
    const oneDay = 86400000; // milliseconds in a day
    if (Date.now() - timestamp < oneDay) {
      // Data is less than a day old, use it
      console.log('citire din localStorage');
      return processDependenciesData(data, document);
    }
  }

  const composerJson = JSON.parse(document.getText());
  let dependencies =
    composerJson.require || composerJson["require-dev"]
      ? Object.assign(composerJson.require, composerJson["require-dev"])
      : {};

  if (Object.keys(dependencies).length === 0) {
    return []; // No dependencies to process
  }

  // Parallel fetch of latest versions
  const composerPromises = Object.keys(dependencies).map(async (packageName) => {
    const latestVersionData = (await getLatestComposer(packageName)) as ComposerInfo | null;
    const currentVersion = dependencies[packageName];
    const position = getPackagePosition(document, packageName);
    const latestVersion = latestVersionData ? latestVersionData.packages[packageName][0].version : null;

    if (latestVersion === null) {
      return null;
    }

    return {
      packageName,
      currentVersion,
      latestVersion,
      updateType: getUpdateType(currentVersion, latestVersion!),
      line: position.line,
      character: position.character,
      description: latestVersionData?.packages[packageName][0]?.description,
      author: latestVersionData?.packages[packageName][0]?.authors[0]?.name || "various contributors",
    };
  });

  const composerResults = await Promise.all(composerPromises);

  // Process the results
  composerResults.forEach((dependencyData) => {
    if (dependencyData !== null && dependencyData.latestVersion !== null) {
      dependenciesData[dependencyData!.packageName] = dependencyData;
    }
  });

  // Save the current dependenciesData and timestamp to local storage
  context.globalState.update(
    documentPath,
    JSON.stringify({
      data: dependenciesData,
      timestamp: Date.now(),
    })
  );
  /**
   * Processes the given dependencies data and generates the code lenses for each dependency.
   *
   * @param {any} dependenciesData - The data representing the dependencies.
   * @param {vscode.TextDocument} document - The vscode document that is being analyzed (composer.json)
   * @return {vscode.CodeLens[]} The generated code lenses.
   */
  function processDependenciesData(dependenciesData: any, document: vscode.TextDocument) {
    let patches = 0;
    let minors = 0;
    let majors = 0;

    // Loop through all dependencies
    for (const packageName in dependenciesData) {
      const data = dependenciesData[packageName];
      const { line, character, currentVersion, latestVersion, updateType, description, author } = data;

      if (line === -1 || updateType === "latest" || currentVersion === "latest" || updateType === "dev") {
        continue;
      }

      // Construct CodeLens
      const range = new vscode.Range(line, character, line, character);
      let title: string = "";
      let tooltip: string = "";

      switch (updateType) {
        case "patch":
          patches++;
          title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
          tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
          break;
        case "minor":
          minors++;
          title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
          tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
          break;
        case "major":
          majors++;
          title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
          tooltip = `📦 ${packageName} \n  ├  by ${author} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
          break;
      }

      codeLenses.push(
        new vscode.CodeLens(range, {
          title: title,
          tooltip: tooltip,
          command: "update-now.updateDependency",
          arguments: [document.uri, packageName, latestVersion],
        })
      );
    }

    const summaryRange = new vscode.Range(0, 0, 0, 0);
    if (patches + minors + majors > 0) {
      const summaryTitle = `Update Now: ${
        patches + minors + majors
      } updates available (❇️ ${patches} x patch, ✴️ ${minors} x minor, 🛑 ${majors} x major)`;

      codeLenses.unshift(
        new vscode.CodeLens(summaryRange, {
          title: summaryTitle,
          tooltip:
            "Please be careful when updating all dependencies at once. \nMINOR ✴️ and MAJOR 🛑 updates can break your code functionality. ",
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

    return codeLenses;
  }
}
