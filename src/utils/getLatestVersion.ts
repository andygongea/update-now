import axios from "axios";

const ONE_DAY_IN_MS = 24 * 60 * 60 * 1000;
const RETRY_DELAY = 1000; // 1 second delay between retries
const MAX_RETRIES = 3;

interface ICachedData {
  version: string;
  description?: string;
  author?: {
    name: string;
  };
  timestamp: number;
}

// Simple in-memory rate limiting
const requestTimestamps: number[] = [];
const RATE_LIMIT_WINDOW = 60000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 20;

function canMakeRequest(): boolean {
  const now = Date.now();
  // Remove timestamps older than our window
  while (requestTimestamps.length > 0 && requestTimestamps[0] < now - RATE_LIMIT_WINDOW) {
    requestTimestamps.shift();
  }
  return requestTimestamps.length < MAX_REQUESTS_PER_WINDOW;
}

async function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function getLatestVersion(packageName: string, retryCount = 0): Promise<ICachedData | null> {
  try {
    if (!canMakeRequest()) {
      if (retryCount >= MAX_RETRIES) {
        console.error(`Rate limit exceeded for ${packageName} after ${MAX_RETRIES} retries`);
        return null;
      }
      // Wait before retrying
      await wait(RETRY_DELAY);
      return getLatestVersion(packageName, retryCount + 1);
    }

    console.log(`[🚀Update Now] ` + `Fetching latest version for ${packageName}`);

    // Record this request
    requestTimestamps.push(Date.now());

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
  } catch (error: any) {
    if (axios.isAxiosError(error) && error.response?.status === 429) {
      if (retryCount >= MAX_RETRIES) {
        console.error(`Rate limit exceeded for ${packageName} after ${MAX_RETRIES} retries`);
        return null;
      }
      // Wait before retrying
      await wait(RETRY_DELAY);
      return getLatestVersion(packageName, retryCount + 1);
    }

    console.error(`Error fetching latest version for ${packageName}:`, error);
    return null;
  }
}
