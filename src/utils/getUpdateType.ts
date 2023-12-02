import * as semver from "semver";

export function getUpdateType(currentValue: string, newValue: string): "major" | "minor" | "patch" | "latest" | "dev" | "other" {
  const isRange = currentValue.includes("^") || currentValue.includes("~") || currentValue.includes(">") || currentValue.includes("<") || 
    currentValue.includes("=") || currentValue.includes("|") || currentValue.includes("*") ||
    currentValue.includes("x") || currentValue.includes("X");
  const isDev = currentValue.indexOf("dev") !== -1 ? true : false;
  const isLatest = currentValue === "latest";
  const isValidCurrent =
    (isRange && semver.validRange(currentValue) !== null) ||
    isLatest ||
    (!isRange && semver.valid(currentValue) !== null);
  const isValidNew = semver.valid(newValue);

  if (isDev) {
    return "dev";
  }
  
  if (!isValidCurrent || !isValidNew) {
    console.log(`Current ${currentValue} / New ${newValue}`);
    return "other";
    //throw new Error("Invalid semver string");
  }

  const semver1 = isLatest ? semver.coerce(newValue) : semver.coerce(currentValue);
  const semver2 = semver.coerce(newValue);

  if (!semver2) {
    console.log(`Current ${currentValue} / Semver2 ${newValue}`);
    return "other";
    throw new Error("Invalid semver2 string");
  }


  if (semver1!.major !== semver2.major) {
    return "major";
  } else if (semver1!.minor !== semver2.minor) {
    return "minor";
  } else if (semver1!.patch !== semver2.patch) {
    return "patch";
  } else {
    return "latest";
  }
}