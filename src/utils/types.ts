export type VersionInfo = {
  version: string;
  description: string;
  author: Record<string, string>;
  dependencies: Record<string, string>;
};

export enum UpdateType {
  major = "major",
  minor = "minor",
  patch = "patch",
  latest = "latest",
  invalid = "invalid",
  invalidLatest = "invalid latest",
  url = "url",
}

export interface IPackagePosition {
  line: number;
  character: number;
  inDependencies: boolean;
}

export interface IDependencyData {
  version: string | null;
  description?: string;
  author?: string;
  timestamp: number;
  updateType?: UpdateType;
  positions?: IPackagePosition[];
}