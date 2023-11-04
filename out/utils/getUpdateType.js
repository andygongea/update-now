"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUpdateType = void 0;
const semver = __importStar(require("semver"));
function getUpdateType(currentValue, newValue) {
    const isRange = currentValue.startsWith("^") || currentValue.startsWith("~");
    const isLatest = currentValue === "latest";
    const isValidCurrent = isRange && semver.validRange(currentValue) !== null || isLatest || !isRange && semver.valid(currentValue) !== null;
    const isValidNew = semver.valid(newValue);
    if (!isValidCurrent || !isValidNew) {
        throw new Error("Invalid semver string");
    }
    const semver1 = isLatest ? semver.coerce(newValue) : semver.coerce(currentValue);
    const semver2 = semver.coerce(newValue);
    if (!semver2) {
        throw new Error("Invalid semver string");
    }
    if (isRange) {
        if (!semver.satisfies(semver2.version, currentValue)) {
            return "out of range";
        }
        else {
            if (semver1.major !== semver2.major) {
                return "major";
            }
            else if (semver1.minor !== semver2.minor) {
                return "minor";
            }
            else if (semver1.patch !== semver2.patch) {
                return "patch";
            }
            else {
                return "latest";
            }
        }
    }
    if (semver1.major !== semver2.major) {
        return "major";
    }
    else if (semver1.minor !== semver2.minor) {
        return "minor";
    }
    else if (semver1.patch !== semver2.patch) {
        return "patch";
    }
    else {
        return "latest";
    }
}
exports.getUpdateType = getUpdateType;
//# sourceMappingURL=getUpdateType.js.map