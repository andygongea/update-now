import * as semver from "semver";
import { isURL } from './isURL';

export function getUpdateType(currentValue: string | undefined, newValue: string): "major" | "minor" | "patch" | "latest" | "invalid" | "invalid latest" | "url" {
  if (!currentValue) {
    return "invalid";
  }

  const isRange = currentValue.startsWith("^") || currentValue.startsWith("~");
  const isLatest = currentValue === "latest";
  const isValidCurrent = isLatest || (isRange ? semver.validRange(currentValue) !== null : semver.valid(currentValue) !== null);
  const isValidNew = isRange ? semver.validRange(newValue) !== null : semver.valid(newValue) !== null;

  if (!isValidCurrent) {
    return "invalid";
  }

  if (!isValidNew) {
    return isLatest ? "invalid latest" : "invalid";
  }

  if (isURL(currentValue) || isURL(newValue)) {
    return "url";
  }

  const currentSemver = isLatest ? semver.coerce(newValue) : semver.coerce(currentValue);
  const newSemver = semver.coerce(newValue);

  if (!currentSemver || !newSemver) {
    return "invalid latest";
  }

  // Check if the current version is actually older than the new version
  if (semver.gte(currentSemver, newSemver)) {
    return "invalid";
  }

  // Compare versions using semver.diff for more accurate comparison
  const diff = semver.diff(currentSemver, newSemver);
  
  switch (diff) {
    case 'major':
      return "major";
    case 'minor':
      return "minor";
    case 'patch':
      return "patch";
    case null:
      return "latest";
    default:
      return isLatest ? "latest" : "patch";
  }
}