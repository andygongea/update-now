/**
 * Extracts the version prefix (~ or ^) from a given version string.
 * If no prefix is found, it returns an empty string.
 * @param version - The version string to check.
 * @returns The prefix (~ or ^) if present, otherwise an empty string.
 */
export function getVersionPrefix(version: string): string {
  const match = version.match(/^[~^]/);
  return match ? match[0] : "";
}
