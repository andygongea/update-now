import * as vscode from 'vscode';

interface DependencyData {
    version: string | null;
    timestamp: number;
}

interface ProcessPackageJsonResult {
    dependenciesData: Record<string, DependencyData>;
    codeLenses: vscode.CodeLens[];
}

export async function processPackageJson(
    document: vscode.TextDocument,
    context: vscode.ExtensionContext
): Promise<ProcessPackageJsonResult> {
    const codeLenses: vscode.CodeLens[] = [];
    let dependenciesData: Record<string, DependencyData> = {};
    const promises: Promise<any>[] = [];

    const packageJson = JSON.parse(document.getText());
    const dependencies = packageJson.dependencies || {};
    const devDependencies = packageJson.devDependencies || {};

    const storedDependencies = context.workspaceState.get<Record<string, DependencyData>>('dependenciesData', {});

    if (Object.keys(storedDependencies).length !== 0) {
        dependenciesData = storedDependencies;
    }

    const currentTime = Date.now();
    for (const packageName in { ...dependencies, ...devDependencies }) {
        const currentVersion = dependencies[packageName] || devDependencies[packageName];
        const storedDependency = storedDependencies[packageName];
        if (!storedDependency || currentTime - storedDependency.timestamp >= ONE_DAY_IN_MS || storedDependency.version === null) {
            promises.push(updateDependencyData(document, packageName, currentVersion));
        } else {
            dependenciesData[packageName] = storedDependency;
        }
    }

    if (promises.length > 0) {
        await Promise.all(promises);
        await context.workspaceState.update('dependenciesData', dependenciesData);
    }

    addCodeLenses(codeLenses, document, dependenciesData);

    return { dependenciesData, codeLenses };
}
