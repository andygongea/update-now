export type VersionInfo = {
  version: string;
  description: string;
  author: Record<string, string>;
  dependencies: Record<string, string>;
};

export interface DependencyData {
  version: string | null;
  description?: string;
  author?: string;
  timestamp: number;
  updateType?: "major" | "minor" | "patch" | "latest" | "invalid" | "invalid latest" | "url";
}