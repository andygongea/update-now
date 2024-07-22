import * as semver from "semver";

export function getUpdateType(currentValue: string | undefined, newValue: string): "major" | "minor" | "patch" | "latest" | "invalid" | "invalid latest" | "url" {
  if (!currentValue) {
    return "invalid";
  }

  // Check if the current version or new version is a URL or GitHub shortcut
  const isURL = (version: string) => /^https?:/.test(version) || /^git(\+ssh|\+https|\+file)?:/.test(version) || /^git@/.test(version) || /^[^\/]+\/[^\/]+$/.test(version);
  
  if (isURL(currentValue) || isURL(newValue)) {
    return "url";
  }

  const isRange = currentValue.startsWith("^") || currentValue.startsWith("~");
  const isLatest = currentValue === "latest";
  const isValidCurrent = (isRange && semver.validRange(currentValue) !== null) || isLatest || (!isRange && semver.valid(currentValue) !== null);
  const isValidNew = semver.valid(newValue);

  if (!isValidCurrent) {
    return "invalid";
  }

  if (!isValidNew) {
    return "invalid latest";
  }

  const semver1 = isLatest ? semver.coerce(newValue) : semver.coerce(currentValue);
  const semver2 = semver.coerce(newValue);

  if (!semver2) {
    return "invalid latest";
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