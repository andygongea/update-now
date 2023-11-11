import axios from "axios";

// Function to fetch the latest version of a package from the NPM registry
export async function getLatestVersion(
  packageName: string
): Promise<object | null> {
  try {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const response = await axios.get(url);
    return response.data;
  } catch (error) {
    console.error(error);
    return null;
  }
}
