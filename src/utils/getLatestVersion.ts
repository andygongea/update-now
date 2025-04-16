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
const RATE_LIMIT_WINDOW = 25000; // 25 seconds
const MAX_REQUESTS_PER_WINDOW = 20;
const BATCH_DELAY = 5000; // 5 second delay between batches

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

// Validates npm package names (scoped or unscoped)
function isValidPackageName(name: string): boolean {
  // NPM package name rules: https://docs.npmjs.com/cli/v10/configuring-npm/package-json#name
  // - Length 1-214
  // - Lowercase letters, digits, hyphens, underscores, dots
  // - Scoped: @scope/name
  // - Cannot start with dot or underscore, no spaces, no uppercase
  // - No leading/trailing spaces
  // - No consecutive dots
  const npmNamePattern = /^(?:@[a-z0-9-_]+\/)?[a-z0-9][a-z0-9-._]{0,213}$/;
  if (!name || typeof name !== 'string') {
    return false;
  }
  if (name.length > 214 || name.length < 1) {
    return false;
  }
  if (name.startsWith('.') || name.startsWith('_')) {
    return false;
  }
  if (/\s/.test(name)) {
    return false;
  }
  if (/[A-Z]/.test(name)) {
    return false;
  }
  if (/\.\./.test(name)) {
    return false;
  }
  if (!npmNamePattern.test(name)) {
    return false;
  }
  return true;
}

export async function getLatestVersion(packageName: string): Promise<ICachedData | null> {
  const startTime = Date.now();
  
  try {
    // Validate and sanitize packageName
    if (!isValidPackageName(packageName)) {
      // Optionally, log or handle invalid package name here
      return null;
    }
    if (!canMakeRequest()) {
      // Wait for the batch delay before proceeding
      await wait(BATCH_DELAY);
      return getLatestVersion(packageName);
    }

    // Record this request and get current batch number
    const currentRequestNumber = requestTimestamps.length + 1;
    requestTimestamps.push(Date.now());

    console.log(`[⇪ Update Now] ${currentRequestNumber}. Fetching ${packageName}@latest`);

    // Fetch the latest version from NPM registry
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const response = await axios.get(url);
    const latestVersionData = response.data;
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Convert to seconds

    console.log(`[⇪ Update Now] ✅ Received ${packageName}@${latestVersionData.version} - ${duration.toFixed(2)}s`);

    return {
      version: latestVersionData.version,
      description: latestVersionData.description,
      author: latestVersionData.author,
      timestamp: Date.now()
    };
  } catch (error: any) {
    const endTime = Date.now();
    const duration = (endTime - startTime) / 1000;

    if (axios.isAxiosError(error) && error.response?.status === 429) {
      console.error(`[⇪ Update Now] ⛔ Rate Limit (429) - ${packageName} failed after ${duration.toFixed(2)}s`);
      return null;
    }

    console.error(`[⇪ Update Now] ❌ Error fetching ${packageName}@latest after ${duration.toFixed(2)}s:`, error);
    return null;
  }
}
