// Helper function to check if version is a URL
export function isURL(version: string): boolean {
    return /^https?:/.test(version) ||
        /^git(\+ssh|\+https|\+file)?:/.test(version) ||
        /^git@/.test(version) ||
        /^[^\/]+\/[^\/]+$/.test(version);
}

// Helper function to clean version, remove v prefix (eg. v1.0.0 -> 1.0.0)
export function cleanVersion(version: string): string {
    return version.trim().replace(/^v/, '');
}