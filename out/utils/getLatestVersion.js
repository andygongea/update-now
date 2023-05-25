"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getLatestVersion = void 0;
const axios_1 = __importDefault(require("axios"));
// Function to fetch the latest version of a package from the NPM registry
async function getLatestVersion(packageName) {
    try {
        const url = `https://registry.npmjs.org/${packageName}/latest`;
        const response = await axios_1.default.get(url);
        const data = response.data;
        return data.version;
    }
    catch (error) {
        console.error(error);
        return null;
    }
}
exports.getLatestVersion = getLatestVersion;
//# sourceMappingURL=getLatestVersion.js.map