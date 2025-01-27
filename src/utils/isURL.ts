/**
 * Cached regex pattern for URL-based dependencies
 * Matches the following formats:
 * - HTTP/HTTPS URLs (e.g., https://github.com/user/repo)
 * - Git URLs (e.g., git+ssh://git@github.com/user/repo)
 * - Git SSH URLs (e.g., git@github.com:user/repo)
 * - GitHub shortcuts (e.g., user/repo#branch)
 */
const URL_PATTERN = /^(?:(?<http>https?:\/\/)|(?<git>git(?:\+ssh|\+https|\+file)?:\/\/)|(?<ssh>git@[^:]+:.+\.git$)|(?<github>[^\/]+\/[^\/]+#.+$))/;

/**
 * Checks if a dependency version string is a URL-based dependency
 * @param version The dependency version string to check
 * @returns boolean indicating if the version is a URL-based dependency
 */
export function isURL(version: string): boolean {
    return URL_PATTERN.test(version);
}

/**
 * Gets the type of URL if it matches any of the supported formats
 * @param version The dependency version string to check
 * @returns The type of URL ('http', 'git', 'ssh', 'github') or null if not a URL
 */
export function getURLType(version: string): 'http' | 'git' | 'ssh' | 'github' | null {
    const match = URL_PATTERN.exec(version);
    if (!match?.groups) { return null; }
    
    return (Object.entries(match.groups).find(([_, value]) => value !== undefined)?.[0] as 'http' | 'git' | 'ssh' | 'github') || null;
}
