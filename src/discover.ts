import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import yaml from "js-yaml";
import type { Api, Dependency, Lifecycle, Service } from "./types.js";

// --- Catalog file parsing ---

export interface CatalogFileSpec {
  apiVersion?: string;
  kind?: string;
  metadata?: {
    name?: string;
    description?: string;
  };
  spec?: {
    system?: string;
    owner?: string;
    lifecycle?: string;
    repo?: string;
    tags?: string[];
    apis?: { name: string; type: string; spec?: string; description?: string }[];
    dependsOn?: (string | { service: string; api?: string; description?: string })[];
  };
}

export interface DiscoveredService {
  name: string;
  description?: string;
  system?: string; // name, not ID
  owner?: string; // name, not ID
  lifecycle?: Lifecycle;
  repo?: string;
  tags?: string[];
  apis?: Api[];
  dependsOn?: Dependency[];
  source: "catalog-file" | "inferred";
  sourcePath?: string;
}

/**
 * Parse a catalog YAML file into a DiscoveredService.
 */
export function parseCatalogFile(
  content: string,
  sourcePath: string,
): DiscoveredService | null {
  let doc: CatalogFileSpec;
  try {
    doc = yaml.load(content) as CatalogFileSpec;
  } catch {
    return null;
  }

  if (!doc || typeof doc !== "object") return null;
  if (!doc.metadata?.name) return null;

  const deps: Dependency[] = (doc.spec?.dependsOn ?? []).map((d) =>
    typeof d === "string" ? { service: d } : d,
  );

  const apis: Api[] = (doc.spec?.apis ?? []).map((a) => ({
    name: a.name,
    type: (a.type ?? "other") as Api["type"],
    spec: a.spec,
    description: a.description,
  }));

  return {
    name: doc.metadata.name,
    description: doc.metadata.description,
    system: doc.spec?.system,
    owner: doc.spec?.owner,
    lifecycle: doc.spec?.lifecycle as Lifecycle | undefined,
    repo: doc.spec?.repo,
    tags: doc.spec?.tags,
    apis: apis.length > 0 ? apis : undefined,
    dependsOn: deps.length > 0 ? deps : undefined,
    source: "catalog-file",
    sourcePath,
  };
}

// --- Local directory discovery ---

const CATALOG_FILENAMES = ["catalog-info.yaml", "catalog-info.yml"];
const YELLOWPAGES_CATALOG = [".yellowpages/catalog.yaml", ".yellowpages/catalog.yml"];

/**
 * Discover services from a local directory tree.
 * Walks subdirectories looking for catalog files or git repos.
 */
export function discoverFromDir(dir: string): DiscoveredService[] {
  if (!existsSync(dir)) return [];

  const results: DiscoveredService[] = [];
  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (entry.name.startsWith(".")) continue;
    if (entry.name === "node_modules") continue;

    const subdir = join(dir, entry.name);
    const discovered = discoverFromRepo(subdir);
    if (discovered) {
      results.push(discovered);
    }
  }

  return results;
}

/**
 * Try to discover a service from a single directory.
 * Checks for catalog files first, then infers from the directory itself.
 */
export function discoverFromRepo(repoDir: string): DiscoveredService | null {
  // Check for catalog files
  for (const filename of [...CATALOG_FILENAMES, ...YELLOWPAGES_CATALOG]) {
    const filePath = join(repoDir, filename);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      const parsed = parseCatalogFile(content, filePath);
      if (parsed) return parsed;
    }
  }

  // Check if this looks like a git repo
  if (!existsSync(join(repoDir, ".git"))) return null;

  // Infer service from directory
  const name = basename(repoDir);
  let description: string | undefined;

  // Try to read description from package.json
  const pkgPath = join(repoDir, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.description) description = pkg.description;
    } catch {
      // ignore
    }
  }

  return {
    name,
    description,
    source: "inferred",
    sourcePath: repoDir,
  };
}

// --- GitHub org discovery ---

export interface GitHubRepo {
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  topics: string[];
  language: string | null;
  fork: boolean;
  archived: boolean;
  private: boolean;
}

export interface GitHubDiscoverOptions {
  org: string;
  topic?: string;
  language?: string;
  token?: string;
  includeForks?: boolean;
  includeArchived?: boolean;
}

/**
 * Fetch public repos from a GitHub org via the API.
 */
export async function fetchGitHubRepos(
  options: GitHubDiscoverOptions,
): Promise<GitHubRepo[]> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "yellowpages-cli",
  };
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  if (token) headers.Authorization = `token ${token}`;

  const repos: GitHubRepo[] = [];
  let page = 1;

  while (true) {
    const url = `https://api.github.com/orgs/${options.org}/repos?per_page=100&page=${page}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    const batch = (await res.json()) as GitHubRepo[];
    if (batch.length === 0) break;
    repos.push(...batch);
    page++;
  }

  return repos.filter((r) => {
    if (r.fork && !options.includeForks) return false;
    if (r.archived && !options.includeArchived) return false;
    if (options.topic && !r.topics.includes(options.topic)) return false;
    if (options.language && r.language?.toLowerCase() !== options.language.toLowerCase()) return false;
    return true;
  });
}

/**
 * Try to fetch a catalog file from a GitHub repo.
 */
export async function fetchCatalogFromGitHub(
  repo: GitHubRepo,
  token?: string,
): Promise<string | null> {
  const headers: Record<string, string> = {
    Accept: "application/vnd.github.v3.raw",
    "User-Agent": "yellowpages-cli",
  };
  if (token) headers.Authorization = `token ${token}`;

  const filenames = [...CATALOG_FILENAMES, ...YELLOWPAGES_CATALOG];
  for (const filename of filenames) {
    const url = `https://api.github.com/repos/${repo.full_name}/contents/${filename}`;
    const res = await fetch(url, { headers });
    if (res.ok) {
      return await res.text();
    }
  }
  return null;
}

/**
 * Discover services from a GitHub org.
 */
export async function discoverFromGitHub(
  options: GitHubDiscoverOptions,
): Promise<DiscoveredService[]> {
  const repos = await fetchGitHubRepos(options);
  const token = options.token ?? process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  const results: DiscoveredService[] = [];

  for (const repo of repos) {
    const catalogContent = await fetchCatalogFromGitHub(repo, token);

    if (catalogContent) {
      const parsed = parseCatalogFile(
        catalogContent,
        `github:${repo.full_name}`,
      );
      if (parsed) {
        parsed.repo = parsed.repo ?? repo.html_url;
        results.push(parsed);
        continue;
      }
    }

    // Infer from repo metadata
    results.push({
      name: repo.name,
      description: repo.description ?? undefined,
      repo: repo.html_url,
      tags: repo.topics.length > 0 ? repo.topics : undefined,
      source: "inferred",
      sourcePath: `github:${repo.full_name}`,
    });
  }

  return results;
}

// --- Diff logic ---

export interface DiscoverDiff {
  added: DiscoveredService[];
  updated: { existing: Service; discovered: DiscoveredService }[];
  unchanged: Service[];
}

/**
 * Diff discovered services against existing catalog.
 * Matches on service name (case-insensitive).
 */
export function diffServices(
  discovered: DiscoveredService[],
  existing: Service[],
): DiscoverDiff {
  const existingByName = new Map(
    existing.map((s) => [s.name.toLowerCase(), s]),
  );

  const added: DiscoveredService[] = [];
  const updated: { existing: Service; discovered: DiscoveredService }[] = [];
  const matchedNames = new Set<string>();

  for (const d of discovered) {
    const key = d.name.toLowerCase();
    const ex = existingByName.get(key);
    if (ex) {
      matchedNames.add(key);
      // Check if anything meaningful changed
      const changed =
        d.description !== (ex.description ?? undefined) ||
        d.lifecycle !== (ex.lifecycle ?? undefined) ||
        d.repo !== (ex.repo ?? undefined);
      if (changed) {
        updated.push({ existing: ex, discovered: d });
      }
    } else {
      added.push(d);
    }
  }

  const unchanged = existing.filter(
    (s) => !matchedNames.has(s.name.toLowerCase()) || 
           !updated.some((u) => u.existing.id === s.id),
  );

  return { added, updated, unchanged };
}
