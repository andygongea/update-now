# Update Now - Update your dependencies

**Update Now** is a powerful Visual Studio Code extension that manages your dependency updates in an effective and efficient way. It provides multiple update actions for the dependencies specified in your `package.json` file, making it an essential tool for modern software development.

![update-now-vscode-extensions-update-dependencies](https://github.com/andygongea/update-now/assets/818805/2bed1cfa-3748-47cb-949d-dd33941c6b64)
*This extension and the content on this page were written together with ChatGPT. Prompts by* **Andy Gongea😁**

## Features

1. ❇️ **Patch Update**: Shows the latest patch updates for your dependencies. Patch updates generally include bug fixes and are fully backward compatible.
2. ✴️ **Minor Update**: Reveals the latest minor updates for your dependencies. Minor updates typically introduce new features but are designed to be backward compatible.
3. 🛑 **Major Update**: Displays the latest major updates for your dependencies. Major updates can make changes that are not backward compatible and may require additional modifications in your project.

## Importance of Updating Dependencies
![update-now-vscode-extensions](https://github.com/andygongea/update-now/assets/818805/703334ce-6d38-41dc-8af7-9accadc0c6d0)

Updating dependencies to their latest version is crucial in software development for several reasons:

1. 🐞 **Bug Fixes**: Updates usually include fixes for bugs found in previous versions, leading to more stable and reliable software.
2. 🏃‍♀️ **Performance Improvements**: New versions of dependencies can include optimizations that improve performance, making your software faster and more efficient.
3. 🆕 **New Features**: Updates may introduce new features, enabling your software to do more and stay competitive.
4. 🔒 **Security**: Updates often include patches for security vulnerabilities. Keeping dependencies updated ensures your software remains secure against known issues.


*It is essential that after every update, developers rigorously test their code to ensure the updates have not caused any regressions or issues. Proper testing allows developers to take advantage of the benefits of updates while minimizing any potential risks.*

## Installation

You can install this extension from the Visual Studio Code Marketplace. Search for ["Update Now"](https://marketplace.visualstudio.com/search?term=update%20now&target=VSCode&category=All%20categories&sortBy=Relevance).

## Usage

Open your `package.json` file within Visual Studio Code. Update Now will identify the dependencies and display update actions as code lenses.

### How do I update a dependency?

Each dependency can be updated individually, depending on your project's needs and requirements.
1. Open `package.json` file
2. Scroll down to the dependencies list
3. Click on the Codelens (annotation on top of the package name)
4. Run `npm install`.

### How do I update all outdated dependencies?

There is a global update command and action to update all dependencies simultaneously.
1. The command can be executed by searching for it in the Command Pallete:  
  - **⇪ Update now: Update all dependencies**.
2. The second option is the code lens that is at the top of each package.json file: 
  - **⇪ Update now: 25 available updates (❇️ 5 x patch, ✴️ 10 x minor, 🛑 5 x major)**

### Which are the supported package managers?
For now, the only package manager supported is NPM. There is a work in progress to support multiple package managers, the upcoming one being Packagist for the PHP ecosystem.

![npm-logo](https://github.com/andygongea/update-now/assets/818805/d05e2127-af59-4cf2-b33e-d755d42a1dd2)

### Wanna suggest a new feature/package manager?
Ask for a new feature or enhancement by starting a new discussion: ["Request feature"](https://github.com/andygongea/update-now/discussions/new?category=ideas)

