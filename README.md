# Update Now - Update your deps

**Update Now** is a powerful Visual Studio Code extension that manages your dependency updates in an effective and efficient way. It provides multiple update actions for the dependencies specified in your `package.json` file, making it an essential tool for modern software development.

*This extension and the content in this page was written together with ChatGPT. Prompts by* **Andy Gongea😁**

## Features

1. ⇡ **Patch Update**: Shows the available patch updates for your dependencies. Patch updates generally include bug fixes and are fully backward compatible.
2. ⇡ **Minor Update**: Reveals the possible minor updates for your dependencies. Minor updates typically introduce new features but are designed to be backward compatible.
3. ⇪ **Major Update**: Displays the available major updates for your dependencies. Major updates can make changes that are not backward compatible, and hence may require additional modifications in your project.
4. ⇪ **Range Update**: Exhibits the updates that will keep your dependencies within a specific version range.

## Importance of Updating Dependencies

Updating dependencies is crucial in software development for several reasons:

1. 🐞 **Bug Fixes**: Updates usually include fixes for bugs found in previous versions, leading to more stable and reliable software.
2. 🏃‍♀️ **Performance Improvements**: New versions of dependencies can include optimizations that improve performance, making your software faster and more efficient.
3. 🆕 **New Features**: Updates may introduce new features, which can enable your software to do more and stay competitive.
4. 🔒 **Security**: Updates often include patches for security vulnerabilities. Keeping dependencies updated ensures your software remains secure against known issues.


However, updating dependencies can introduce risks if not properly managed. It's essential that after every update, developers rigorously test their code to ensure the updates have not caused any regressions or issues. Proper testing allows developers to take advantage of the benefits of updates while minimizing any potential risks.

## Installation

You can install this extension from the [Visual Studio Code Marketplace](https://marketplace.visualstudio.com/VSCode). Search for "Update Now".

## Usage

Open your `package.json` file within Visual Studio Code. Update Now will identify the dependencies and display update actions in the form of a code lens.

1. Each dependency can be updated individually, depending on your project's needs and requirements.
2. There is also a global update command and action to update all dependencies at once.
    - the command can be accessed by clicking on 
      - **🚀 Update now: Update all depencies**
    - the second option is the code lens that is on top of each package.json file: 
      - **🚀 Update now: 25 available updates (5 x patch, 10 x minor, 5 x major, 5 x out of range )**


For any feedback or issues, please open an [issue on GitHub](https://github.com/andygongea/update-now/issues).
