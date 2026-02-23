import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type DiscoveredService,
  type GitHubRepo,
  diffServices,
  discoverFromDir,
  discoverFromRepo,
  parseCatalogFile,
} from "./discover";
import type { Service } from "./types";

const TEST_DIR = join(import.meta.dir, "..", ".test-discover-tmp");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

function makeService(overrides: Partial<Service> & { id: string; name: string }): Service {
  return {
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- parseCatalogFile ---

describe("parseCatalogFile", () => {
  test("parses a full catalog file", () => {
    const yaml = `
apiVersion: yellowpages/v1
kind: Service
metadata:
  name: checkout-api
  description: Handles checkout flow
spec:
  system: payments
  owner: platform-team
  lifecycle: production
  repo: https://github.com/co/checkout
  tags:
    - backend
    - critical
  apis:
    - name: Checkout REST API
      type: rest
      spec: ./openapi.yaml
      description: Public endpoints
  dependsOn:
    - payment-processor
    - service: auth-service
      api: OAuth
      description: Token validation
`;
    const result = parseCatalogFile(yaml, "test.yaml");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("checkout-api");
    expect(result!.description).toBe("Handles checkout flow");
    expect(result!.system).toBe("payments");
    expect(result!.owner).toBe("platform-team");
    expect(result!.lifecycle).toBe("production");
    expect(result!.repo).toBe("https://github.com/co/checkout");
    expect(result!.tags).toEqual(["backend", "critical"]);
    expect(result!.apis).toHaveLength(1);
    expect(result!.apis![0].name).toBe("Checkout REST API");
    expect(result!.apis![0].type).toBe("rest");
    expect(result!.dependsOn).toHaveLength(2);
    expect(result!.dependsOn![0]).toEqual({ service: "payment-processor" });
    expect(result!.dependsOn![1]).toEqual({
      service: "auth-service",
      api: "OAuth",
      description: "Token validation",
    });
    expect(result!.source).toBe("catalog-file");
  });

  test("parses minimal catalog file", () => {
    const yaml = `
metadata:
  name: simple-svc
`;
    const result = parseCatalogFile(yaml, "test.yaml");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("simple-svc");
    expect(result!.apis).toBeUndefined();
    expect(result!.dependsOn).toBeUndefined();
  });

  test("returns null for missing name", () => {
    const yaml = `
metadata:
  description: no name here
`;
    expect(parseCatalogFile(yaml, "test.yaml")).toBeNull();
  });

  test("returns null for invalid YAML", () => {
    expect(parseCatalogFile("{{invalid", "test.yaml")).toBeNull();
  });

  test("returns null for empty content", () => {
    expect(parseCatalogFile("", "test.yaml")).toBeNull();
  });

  test("returns null for non-object YAML", () => {
    expect(parseCatalogFile("just a string", "test.yaml")).toBeNull();
  });

  test("handles string-only dependsOn", () => {
    const yaml = `
metadata:
  name: svc
spec:
  dependsOn:
    - svc-a
    - svc-b
`;
    const result = parseCatalogFile(yaml, "test.yaml");
    expect(result!.dependsOn).toEqual([
      { service: "svc-a" },
      { service: "svc-b" },
    ]);
  });
});

// --- discoverFromRepo ---

describe("discoverFromRepo", () => {
  test("discovers from catalog-info.yaml", () => {
    const repoDir = join(TEST_DIR, "my-repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    writeFileSync(
      join(repoDir, "catalog-info.yaml"),
      `metadata:\n  name: my-service\n  description: From catalog\n`,
    );
    const result = discoverFromRepo(repoDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("my-service");
    expect(result!.source).toBe("catalog-file");
  });

  test("discovers from .yellowpages/catalog.yaml", () => {
    const repoDir = join(TEST_DIR, "my-repo");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    mkdirSync(join(repoDir, ".yellowpages"), { recursive: true });
    writeFileSync(
      join(repoDir, ".yellowpages", "catalog.yaml"),
      `metadata:\n  name: yp-service\n`,
    );
    const result = discoverFromRepo(repoDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("yp-service");
  });

  test("infers from git repo when no catalog file", () => {
    const repoDir = join(TEST_DIR, "inferred-svc");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    const result = discoverFromRepo(repoDir);
    expect(result).not.toBeNull();
    expect(result!.name).toBe("inferred-svc");
    expect(result!.source).toBe("inferred");
  });

  test("reads description from package.json when inferring", () => {
    const repoDir = join(TEST_DIR, "node-svc");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    writeFileSync(
      join(repoDir, "package.json"),
      JSON.stringify({ name: "node-svc", description: "A node service" }),
    );
    const result = discoverFromRepo(repoDir);
    expect(result!.description).toBe("A node service");
  });

  test("returns null for non-git directory without catalog", () => {
    const repoDir = join(TEST_DIR, "not-a-repo");
    mkdirSync(repoDir, { recursive: true });
    expect(discoverFromRepo(repoDir)).toBeNull();
  });

  test("catalog-info.yaml takes priority over inference", () => {
    const repoDir = join(TEST_DIR, "has-both");
    mkdirSync(join(repoDir, ".git"), { recursive: true });
    writeFileSync(
      join(repoDir, "catalog-info.yaml"),
      `metadata:\n  name: explicit-name\n`,
    );
    const result = discoverFromRepo(repoDir);
    expect(result!.name).toBe("explicit-name");
    expect(result!.source).toBe("catalog-file");
  });
});

// --- discoverFromDir ---

describe("discoverFromDir", () => {
  test("discovers multiple repos from a directory", () => {
    for (const name of ["svc-a", "svc-b", "svc-c"]) {
      const repoDir = join(TEST_DIR, name);
      mkdirSync(join(repoDir, ".git"), { recursive: true });
    }
    const results = discoverFromDir(TEST_DIR);
    expect(results).toHaveLength(3);
    const names = results.map((r) => r.name).sort();
    expect(names).toEqual(["svc-a", "svc-b", "svc-c"]);
  });

  test("skips non-repo directories", () => {
    mkdirSync(join(TEST_DIR, "just-a-dir"), { recursive: true });
    mkdirSync(join(TEST_DIR, "real-repo", ".git"), { recursive: true });
    const results = discoverFromDir(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("real-repo");
  });

  test("skips hidden directories", () => {
    mkdirSync(join(TEST_DIR, ".hidden", ".git"), { recursive: true });
    mkdirSync(join(TEST_DIR, "visible", ".git"), { recursive: true });
    const results = discoverFromDir(TEST_DIR);
    expect(results).toHaveLength(1);
    expect(results[0].name).toBe("visible");
  });

  test("skips node_modules", () => {
    mkdirSync(join(TEST_DIR, "node_modules", ".git"), { recursive: true });
    const results = discoverFromDir(TEST_DIR);
    expect(results).toHaveLength(0);
  });

  test("returns empty for nonexistent directory", () => {
    expect(discoverFromDir("/nonexistent/path")).toEqual([]);
  });

  test("mixes catalog and inferred services", () => {
    // Repo with catalog file
    const withCatalog = join(TEST_DIR, "explicit");
    mkdirSync(join(withCatalog, ".git"), { recursive: true });
    writeFileSync(
      join(withCatalog, "catalog-info.yaml"),
      `metadata:\n  name: explicit-service\n  description: From file\n`,
    );

    // Repo without catalog
    const withoutCatalog = join(TEST_DIR, "inferred");
    mkdirSync(join(withoutCatalog, ".git"), { recursive: true });

    const results = discoverFromDir(TEST_DIR);
    expect(results).toHaveLength(2);
    const catalogSvc = results.find((r) => r.source === "catalog-file");
    const inferredSvc = results.find((r) => r.source === "inferred");
    expect(catalogSvc!.name).toBe("explicit-service");
    expect(inferredSvc!.name).toBe("inferred");
  });
});

// --- diffServices ---

describe("diffServices", () => {
  test("all new when catalog is empty", () => {
    const discovered: DiscoveredService[] = [
      { name: "svc-a", source: "inferred" },
      { name: "svc-b", source: "inferred" },
    ];
    const diff = diffServices(discovered, []);
    expect(diff.added).toHaveLength(2);
    expect(diff.updated).toHaveLength(0);
  });

  test("detects unchanged services", () => {
    const discovered: DiscoveredService[] = [
      { name: "svc-a", description: "Same", source: "inferred" },
    ];
    const existing = [makeService({ id: "s1", name: "svc-a", description: "Same" })];
    const diff = diffServices(discovered, existing);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
  });

  test("detects updated services", () => {
    const discovered: DiscoveredService[] = [
      { name: "svc-a", description: "New desc", source: "inferred" },
    ];
    const existing = [makeService({ id: "s1", name: "svc-a", description: "Old desc" })];
    const diff = diffServices(discovered, existing);
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].discovered.description).toBe("New desc");
    expect(diff.updated[0].existing.id).toBe("s1");
  });

  test("case-insensitive name matching", () => {
    const discovered: DiscoveredService[] = [
      { name: "Checkout-API", description: "Updated", source: "inferred" },
    ];
    const existing = [makeService({ id: "s1", name: "checkout-api", description: "Old" })];
    const diff = diffServices(discovered, existing);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(1);
  });

  test("mixed add and update", () => {
    const discovered: DiscoveredService[] = [
      { name: "existing-svc", description: "Changed", source: "inferred" },
      { name: "new-svc", source: "inferred" },
    ];
    const existing = [
      makeService({ id: "s1", name: "existing-svc", description: "Original" }),
    ];
    const diff = diffServices(discovered, existing);
    expect(diff.added).toHaveLength(1);
    expect(diff.added[0].name).toBe("new-svc");
    expect(diff.updated).toHaveLength(1);
    expect(diff.updated[0].existing.name).toBe("existing-svc");
  });

  test("detects lifecycle change as update", () => {
    const discovered: DiscoveredService[] = [
      { name: "svc-a", lifecycle: "deprecated", source: "inferred" },
    ];
    const existing = [makeService({ id: "s1", name: "svc-a", lifecycle: "production" })];
    const diff = diffServices(discovered, existing);
    expect(diff.updated).toHaveLength(1);
  });

  test("detects repo change as update", () => {
    const discovered: DiscoveredService[] = [
      { name: "svc-a", repo: "https://new-url", source: "inferred" },
    ];
    const existing = [makeService({ id: "s1", name: "svc-a", repo: "https://old-url" })];
    const diff = diffServices(discovered, existing);
    expect(diff.updated).toHaveLength(1);
  });

  test("empty discovered returns no changes", () => {
    const existing = [makeService({ id: "s1", name: "svc-a" })];
    const diff = diffServices([], existing);
    expect(diff.added).toHaveLength(0);
    expect(diff.updated).toHaveLength(0);
    expect(diff.unchanged).toHaveLength(1);
  });
});
