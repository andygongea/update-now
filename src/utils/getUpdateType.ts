import * as semver from "semver";

export function getUpdateType(
  currentValue: string,
  newValue: string
): "major" | "minor" | "patch" | "identical" | "out of range" | "within range" {

  const isRange = currentValue.startsWith("^") || currentValue.startsWith("~");
  const isLatest = currentValue === "latest";
  const isValidCurrent =
    isRange && semver.validRange(currentValue) !== null ||
    isLatest ||
    !isRange && semver.valid(currentValue) !== null;
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
    } else {
      const current = currentValue.replace("^", "").replace("~", "");
      if (current === semver2.version) {
        return "identical";
      } else {
        return "within range";
      }
    } 
  }

  if (semver1!.major !== semver2.major) {
    return "major";
  } else if (semver1!.minor !== semver2.minor) {
    return "minor";
  } else if (semver1!.patch !== semver2.patch) {
    return "patch";
  } else {
    return "identical";
  }
}
