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

export async function getLatestVersion(packageName: string): Promise<CachedData | null> {
  try {
    // Fetch the latest version from NPM registry
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const response = await axios.get(url);
    const latestVersionData = response.data;

    return {
      version: latestVersionData.version,
      description: latestVersionData.description,
      author: latestVersionData.author,
      timestamp: Date.now()
    };
  } catch (error) {
    console.error(`Error fetching latest version for ${packageName}:`, error);
    return null;
  }
}
