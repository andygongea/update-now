import axios from "axios";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;

interface CachedData {
  version: string;
  description?: string;
  author?: {
    name: string;
  };
  timestamp: number;
}

let inMemoryCache: Record<string, CachedData> = {};

export async function getLatestVersion(packageName: string): Promise<CachedData | null> {
  try {
    // Check if the package is already cached and if the cached version is recent
    if (inMemoryCache[packageName] && Date.now() - inMemoryCache[packageName].timestamp < ONE_DAY_IN_MS) {
      console.log(`Using cached data for package: ${packageName}`);
      return inMemoryCache[packageName];
    } else {
      // If the package is not cached or is outdated, fetch the latest version from NPM registry
      const url = `https://registry.npmjs.org/${packageName}/latest`;
      const response = await axios.get(url);
      const latestVersionData = response.data;

      // Update the in-memory cache
      inMemoryCache[packageName] = {
        version: latestVersionData.version,
        description: latestVersionData.description,
        author: latestVersionData.author,
        timestamp: Date.now()
      };

      return inMemoryCache[packageName];
    }
  } catch (error) {
    console.error(`Error fetching latest version for ${packageName}:`, error);
    return null;
  }
}
