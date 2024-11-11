import * as semver from "semver";

export function getUpdateType(currentValue: string | undefined, newValue: string): "major" | "minor" | "patch" | "latest" | "invalid" | "invalid latest" | "url" | "prerelease" {
  if (!currentValue) {
    return "invalid";
  }

  // Check if the current version or new version is a URL or GitHub shortcut
  const isURL = (version: string) =>
    /^https?:/.test(version) ||
    /^git(\+ssh|\+https|\+file)?:/.test(version) ||
    /^git@/.test(version) ||
    /^[^\/]+\/[^\/]+$/.test(version);

  if (isURL(currentValue) || isURL(newValue)) {
    return "url";
  }

  // Check for common version prefixes and special cases
  const isRange = (version: string): boolean => {
    const rangeIndicators = ['^', '~', '>', '<', '>=', '<=', '||', '-'];
    return rangeIndicators.some(indicator => version.includes(indicator)) ||
      /\d+\.x(\.|$)|\d+\.\d+\.x/.test(version) ||  // x-ranges
      /\d+\.\*(\.|$)|\d+\.\d+\.\*/.test(version);   // *-ranges
  };

  const isWildcard = (version: string): boolean =>
    version === '*' ||
    version === 'x' ||
    /^(\d+\.)?x(\.|$)|(\d+\.)?(\d+\.)?x$/.test(version) ||
    /^(\d+\.)?\*(\.|$)|(\d+\.)?(\d+\.)?\*$/.test(version);

  const isLatest = (version: string): boolean =>
    ['latest', 'current', 'master', 'main', 'head'].includes(version.toLowerCase()) ||
    isWildcard(version);

  const isPrerelease = (version: string): boolean =>
    /-(alpha|beta|rc|next|dev|preview|pre|test|build)\.\d+$/i.test(version) ||
    Boolean(semver.prerelease(version));

  // Clean version strings
  const cleanVersion = (version: string): string => {
    // Remove 'v' prefix and whitespace
    version = version.trim().replace(/^v/i, '');
    // Handle npm-style `=` prefix
    version = version.replace(/^=/, '');
    // Return if it's purely numeric or abnormally large
    if (/^\d{10,}$/.test(version)) {
      return "invalid";
    }
    return version;
  };

  const cleanCurrentValue = cleanVersion(currentValue);
  const cleanNewValue = cleanVersion(newValue);

  // Enhanced validation checks
  const isValidCurrent =
    (isRange(cleanCurrentValue) && semver.validRange(cleanCurrentValue) !== null) ||
    isLatest(cleanCurrentValue) ||
    isWildcard(cleanCurrentValue) ||
    (!isRange(cleanCurrentValue) && (
      semver.valid(cleanCurrentValue) !== null ||
      semver.valid(cleanCurrentValue.replace(/^v/, '')) !== null
    ));

  const isValidNew = semver.valid(cleanNewValue);

  if (!isValidCurrent) {
    return "invalid";
  }

  if (!isValidNew) {
    return "invalid latest";
  }

  // Handle prerelease versions
  if (isPrerelease(cleanNewValue)) {
    return "prerelease";
  }

  // Compare versions
  let semver1: semver.SemVer | null;
  if (isLatest(cleanCurrentValue) || isWildcard(cleanCurrentValue)) {
    semver1 = semver.coerce(cleanNewValue);
  } else if (isRange(cleanCurrentValue)) {
    // For ranges, use the minimum satisfying version
    const range = semver.validRange(cleanCurrentValue);
    if (!range) {
      return "invalid";
    }
    const minVersion = semver.minVersion(range);
    semver1 = minVersion;
  } else {
    semver1 = semver.coerce(cleanCurrentValue);
  }

  const semver2 = semver.coerce(cleanNewValue);

  if (!semver1 || !semver2) {
    return "invalid latest";
  }

  // Compare versions
  if (semver1.major !== semver2.major) {
    return "major";
  } else if (semver1.minor !== semver2.minor) {
    return "minor";
  } else if (semver1.patch !== semver2.patch) {
    return "patch";
  } else {
    return "latest";
  }
}