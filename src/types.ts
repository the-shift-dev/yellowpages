// --- Core entities ---

export interface Service {
  id: string;
  name: string;
  description?: string;
  system?: string; // system id
  owner?: string; // owner id
  lifecycle?: Lifecycle;
  repo?: string;
  tags?: string[];
  apis?: Api[];
  dependsOn?: Dependency[];
  custom?: Record<string, string>;
  created: string;
  updated: string;
}

export interface System {
  id: string;
  name: string;
  description?: string;
  owner?: string; // owner id
  custom?: Record<string, string>;
  created: string;
  updated: string;
}

export interface Owner {
  id: string;
  name: string;
  type: OwnerType;
  email?: string;
  slack?: string;
  custom?: Record<string, string>;
  created: string;
  updated: string;
}

// --- Embedded types ---

export interface Api {
  name: string;
  type: ApiType;
  spec?: string; // path to OpenAPI/proto/GraphQL schema
  description?: string;
}

export interface Dependency {
  service: string; // service id or name
  api?: string; // optional: which API it consumes
  description?: string;
}

// --- Enums ---

export type Lifecycle =
  | "experimental"
  | "production"
  | "deprecated"
  | "decommissioned";

export type OwnerType = "team" | "person";

export type ApiType = "rest" | "grpc" | "graphql" | "event" | "other";

// --- Config ---

export interface Config {
  version: number;
}

export const DEFAULT_CONFIG: Config = {
  version: 1,
};

// --- Collections ---

export const COLLECTIONS = ["services", "systems", "owners"] as const;
export type Collection = (typeof COLLECTIONS)[number];
