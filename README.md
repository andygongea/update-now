# Update Now - Update your deps

**Update Now** is a powerful Visual Studio Code extension that manages your dependency updates in an effective and efficient way. It provides multiple update actions for the dependencies specified in your `package.json` file, making it an essential tool for modern software development.

## Features

1. **Patch Update Actions**: Shows the available patch updates for your dependencies. Patch updates generally include bug fixes and are fully backward compatible.
2. **Minor Update Actions**: Reveals the possible minor updates for your dependencies. Minor updates typically introduce new features but are designed to be backward compatible.
3. **Major Update Actions**: Displays the available major updates for your dependencies. Major updates can make changes that are not backward compatible, and hence may require additional modifications in your project.
4. **Range Update Actions**: Exhibits the updates that will keep your dependencies within a specific version range.

## Importance of Updating Dependencies

Updating dependencies is crucial in software development for several reasons:

1. **Security**: Updates often include patches for security vulnerabilities. Keeping dependencies updated ensures your software remains secure against known issues.
2. **Bug Fixes**: Updates usually include fixes for bugs found in previous versions, leading to more stable and reliable software.
3. **Performance Improvements**: New versions of dependencies can include optimizations that improve performance, making your software faster and more efficient.
4. **New Features**: Updates may introduce new features, which can enable your software to do more and stay competitive.

However, updating dependencies can introduce risks if not properly managed. It's essential that after every update, developers rigorously test their code to ensure the updates have not caused any regressions or issues. Proper testing allows developers to take advantage of the benefits of updates while minimizing any potential risks.

## Installation

You can install this extension from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/VSCode). Search for "Update Now".

## Usage

Open your `package.json` file within Visual Studio Code. Update Now will identify the dependencies and display update actions in the context menu when you right-click on a dependency.


For any feedback or issues, please open an [issue on GitHub](https://github.com/andygongea/update-now/issues).
