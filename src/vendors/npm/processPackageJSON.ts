import vscode from "vscode";
import { getUpdateType } from "../../utils/getUpdateType";
import { getPackagePosition } from "../../utils/getPackagePosition";
import { getLatestPackageVersion } from "./getLatestPackageVersion";

export async function processPackageJSON(document: vscode.TextDocument, context: vscode.ExtensionContext) {
  type VersionInfo = {
    version: string; // assuming 'version' is a string
    description: string; // assuming 'description' is a string
    author: Record<string, string>; // assuming 'author' is a string
  };

  let dependenciesData: any = {};
  const codeLenses: vscode.CodeLens[] = [];

  const documentPath = document.fileName;

  // Check if the data is available and up-to-date in local storage
  // const storedData: any = context.globalState.get(documentPath);
  // if (storedData) {
  //   const { data, timestamp } = JSON.parse(storedData);
  //   const oneDay = 86400000; // milliseconds in a day
  //   if (Date.now() - timestamp < oneDay) {
  //     // Data is less than a day old, use it
  //     return processDependenciesData(data, document);
  //   }
  // }

  const packageJson = JSON.parse(document.getText());
  let dependencies = Object.assign(packageJson.dependencies || {}, packageJson.devDependencies || {});

  if (Object.keys(dependencies).length === 0) {
    return []; // No dependencies to process
  }

  // If promises have not been created yet, create them
  const npmPromises = Object.keys(dependencies).map(async (packageName) => {
    const latestVersionData = (await getLatestPackageVersion(packageName)) as VersionInfo | null;
    const currentVersion = dependencies[packageName];
    const position = getPackagePosition(document, packageName);
    const latestVersion = latestVersionData ? latestVersionData.version : null;

    if (latestVersion === null) {
      return null;
    }

    return {
      packageName,
      currentVersion,
      latestVersion,
      updateType: getUpdateType(currentVersion, latestVersion!),
      line: position["line"],
      character: position["character"],
      description: latestVersionData?.description,
      author: latestVersionData?.author?.name || "various contributors",
    };
  });

  const npmResults = await Promise.all(npmPromises);

  // Process the results
  npmResults.forEach((dependencyData) => {
    if (dependencyData !== null && dependencyData.latestVersion !== null) {
      dependenciesData[dependencyData!.packageName] = dependencyData;
    }
  });

  // Save the current dependenciesData and timestamp to local storage
  // context.globalState.update(
  //   documentPath,
  //   JSON.stringify({
  //     data: dependenciesData,
  //     timestamp: Date.now(),
  //   })
  // );

  processDependenciesData(dependenciesData, document);

  function processDependenciesData(dependenciesData: any, document: vscode.TextDocument) {
    let patches = 0;
    let minors = 0;
    let majors = 0;

    // Loop through all dependencies in the package.json file
    for (const packageName in dependenciesData) {
      const currentVersion = dependenciesData[packageName].currentVersion;
      const line = dependenciesData[packageName].line;

      if (line === -1) {
        continue;
      }

      const character = dependenciesData[packageName].character;
      const latestVersion = dependenciesData[packageName].latestVersion;
      const updateType = dependenciesData[packageName].updateType;
      const description = dependenciesData[packageName].description;
      const creator = dependenciesData[packageName].author;

      // Skip when the current version is already the latest version
      if (updateType !== "latest" && currentVersion !== "latest") {
        const range = new vscode.Range(line, character, line, character);
        let tooltip: string = "";
        let title: string = "";

        if (updateType === "patch") {
          patches++;
          title = `❇️ ${packageName} ⇢ ${latestVersion} (patch)`;
          tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ❇️ This is a PATCH update. \n  Patches usually cover bug fixes or small changes and they are safe to update.`;
        } else if (updateType === "minor") {
          minors++;
          title = `✴️ ${packageName} ⇢ ${latestVersion} (minor update)`;
          tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  ✴️ This is a MINOR update. \n  Minor versions contain backward compatible API changes/additions. \n  Test the functionality after updating.`;
        } else if (updateType === "major") {
          majors++;
          title = `🛑 ${packageName} ⇢ ${latestVersion} (major update)`;
          tooltip = `📦 ${packageName} \n  ├  by ${creator} \n  ╰  ${description}  \n \n  •  ${packageName}@${currentVersion} (current version) \n  •  ${packageName}@${latestVersion} (latest version) \n \n  🛑 This is a MAJOR update. \n  Major versions contain backward incompatible changes, which could break your code. \n  Test the functionality thoroughly after updating.`;
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

// function checkStoredDependencies(document: vscode.TextDocument) {

//   const packageJson = JSON.parse(document.getText());
//   let currentDeps = Object.assign(packageJson.dependencies || {}, packageJson.devDependencies || {});

//   currentDeps.forEach((packageName) => {
//     storedDeps.find(packageName)
//   });

// }
