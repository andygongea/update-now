/**
 * Checks if a dependency version string is a URL-based dependency
 * Matches the following formats:
 * - HTTP/HTTPS URLs (e.g., https://github.com/user/repo)
 * - Git URLs (e.g., git+ssh://git@github.com/user/repo)
 * - Git SSH URLs (e.g., git@github.com:user/repo)
 * - GitHub shortcuts (e.g., user/repo)
 * 
 * @param version The dependency version string to check
 * @returns boolean indicating if the version is a URL-based dependency
 */
export function isURL(version: string): boolean {
    return /^(https?:|git(\+ssh|\+https|\+file)?:|git@|[^\/]+\/[^\/]+$)/.test(version);
}
