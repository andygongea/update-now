import axios from "axios";
import * as fs from "fs";
import * as path from "path";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const CACHE_FILE_PATH = path.join(__dirname, "dependenciesCacheNPM.json");

interface CachedData {
  version: string;
  description?: string;
  author?: {
    name: string;
  };
  timestamp: number;
}

let inMemoryCache: Record<string, CachedData> = {};

// Load cache from file into memory at the start
function loadCache() {
  if (fs.existsSync(CACHE_FILE_PATH)) {
    const cacheContent = fs.readFileSync(CACHE_FILE_PATH, "utf8");
    inMemoryCache = JSON.parse(cacheContent);
  }
}

// Save the in-memory cache to file
function saveCache() {
  console.log(`Saving cache to file: ${CACHE_FILE_PATH}`);
  fs.writeFileSync(CACHE_FILE_PATH, JSON.stringify(inMemoryCache, null, 2), "utf8");
}

// Load cache when the module is loaded
loadCache();

export async function getLatestVersion(packageName: string): Promise<CachedData | null> {
  try {
    // Check if the package is already cached and if the cached version is recent
    if (inMemoryCache[packageName] && Date.now() - inMemoryCache[packageName].timestamp < ONE_DAY_IN_MS) {
      console.log(`Using cached data for package: ${JSON.stringify(inMemoryCache[packageName])}`);
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
        timestamp: Date.now(),
      };

      console.log(`${Date.now()} - Fetched data from registry for package: ${packageName}`);
      return inMemoryCache[packageName];
    }
  } catch (error) {
    console.error(`Failed to fetch latest version for ${packageName}:`, error);
    return null;
  }
}

// Save the cache to file periodically (e.g., on exit or after a set interval)
process.on("exit", saveCache);
process.on("SIGINT", () => {
  saveCache();
  process.exit();
});

export { inMemoryCache };
