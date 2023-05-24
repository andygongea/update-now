import axios from "axios";

let i=1;
// Function to fetch the latest version of a package from the NPM registry
export async function getLatestVersion(
  packageName: string
): Promise<string | null> {

  
  try {
    const url = `https://registry.npmjs.org/${packageName}/latest`;
    const response = await axios.get(url);
    const data = response.data as { version: string };
    i++;
    return data.version;
  } catch (error) {
    console.error(error);
    return null;
  }
}
