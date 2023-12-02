import axios from "axios";

// Function to fetch the latest version of a package from the NPM registry
export async function getLatestComposer(packageName: string): Promise<object | null> {
  try {
    const vendor = packageName.split("/")[0];
    const pck = packageName.split("/")[1];
    if (pck) {
      const url = `https://repo.packagist.org/p2/${vendor}/${pck}.json`;
      const response = await axios.get(url);
      return response.data;
    } else {
      return null;
    } 
  } catch (error) {
    console.error(error);
    return null;
  }
}