import { afterEach, beforeEach, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  deleteRecord,
  ensureGitignore,
  findByName,
  findRoot,
  initStore,
  newId,
  readAll,
  readConfig,
  readOne,
  resolveId,
  writeConfig,
  writeRecord,
} from "./store";
import type { Config, Owner, Service } from "./types";

const TEST_DIR = join(import.meta.dir, "..", ".test-tmp");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

test("initStore creates .yellowpages directory structure", () => {
  const root = initStore();
  expect(existsSync(join(root, "config.json"))).toBe(true);
  expect(existsSync(join(root, "services"))).toBe(true);
  expect(existsSync(join(root, "systems"))).toBe(true);
  expect(existsSync(join(root, "owners"))).toBe(true);
  expect(existsSync(join(root, ".gitignore"))).toBe(true);
});

test("initStore is idempotent", () => {
  const root1 = initStore();
  const root2 = initStore();
  expect(root1).toBe(root2);
});

test("findRoot finds .yellowpages directory", () => {
  initStore();
  const root = findRoot();
  expect(root).not.toBeNull();
  expect(root?.endsWith(".yellowpages")).toBe(true);
});

test("findRoot returns null when no .yellowpages exists", () => {
  expect(findRoot()).toBeNull();
});

test("readConfig returns default config", () => {
  const root = initStore();
  const config = readConfig(root);
  expect(config.version).toBe(1);
});

test("newId generates 8-char string", () => {
  const id = newId();
  expect(id.length).toBe(8);
  expect(typeof id).toBe("string");
});

test("newId generates unique IDs", () => {
  const ids = new Set(Array.from({ length: 100 }, () => newId()));
  expect(ids.size).toBe(100);
});

test("writeRecord and readOne roundtrip", () => {
  const root = initStore();
  const service: Service = {
    id: newId(),
    name: "test-service",
    description: "A test service",
    lifecycle: "production",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  };
  writeRecord(root, "services", service);
  const result = readOne<Service>(root, "services", service.id);
  expect(result).not.toBeNull();
  expect(result?.name).toBe("test-service");
  expect(result?.description).toBe("A test service");
  expect(result?.lifecycle).toBe("production");
});

test("readOne returns null for nonexistent ID", () => {
  const root = initStore();
  expect(readOne(root, "services", "nonexistent")).toBeNull();
});

test("readAll returns all records", () => {
  const root = initStore();
  for (let i = 0; i < 3; i++) {
    writeRecord(root, "services", {
      id: newId(),
      name: `svc-${i}`,
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
    });
  }
  const all = readAll<Service>(root, "services");
  expect(all.length).toBe(3);
});

test("readAll returns empty array for empty collection", () => {
  const root = initStore();
  expect(readAll(root, "services")).toEqual([]);
});

test("deleteRecord removes file", () => {
  const root = initStore();
  const id = newId();
  writeRecord(root, "services", {
    id,
    name: "to-delete",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  expect(deleteRecord(root, "services", id)).toBe(true);
  expect(readOne(root, "services", id)).toBeNull();
});

test("deleteRecord returns false for nonexistent", () => {
  const root = initStore();
  expect(deleteRecord(root, "services", "nonexistent")).toBe(false);
});

test("findByName finds by exact name (case-insensitive)", () => {
  const root = initStore();
  const id = newId();
  writeRecord<Service>(root, "services", {
    id,
    name: "Checkout-API",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  const result = findByName<Service>(root, "services", "checkout-api");
  expect(result).not.toBeNull();
  expect(result?.id).toBe(id);
});

test("findByName returns null when not found", () => {
  const root = initStore();
  expect(findByName<Service>(root, "services", "ghost")).toBeNull();
});

test("resolveId returns ID when record exists by ID", () => {
  const root = initStore();
  const id = newId();
  writeRecord<Service>(root, "services", {
    id,
    name: "my-service",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  expect(resolveId<Service>(root, "services", id)).toBe(id);
});

test("resolveId resolves name to ID", () => {
  const root = initStore();
  const id = newId();
  writeRecord<Service>(root, "services", {
    id,
    name: "my-service",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  expect(resolveId<Service>(root, "services", "my-service")).toBe(id);
});

test("resolveId returns input as-is when nothing matches", () => {
  const root = initStore();
  expect(resolveId<Service>(root, "services", "ghost")).toBe("ghost");
});

test("writeConfig persists and readConfig reads back", () => {
  const root = initStore();
  const config: Config = { version: 42 };
  writeConfig(root, config);
  const result = readConfig(root);
  expect(result.version).toBe(42);
});

test("ensureGitignore creates file with entries if missing", () => {
  const root = initStore();
  const gitignorePath = join(root, ".gitignore");
  // initStore already creates it, so remove it to test from scratch
  rmSync(gitignorePath);
  expect(existsSync(gitignorePath)).toBe(false);

  ensureGitignore(root);
  const content = readFileSync(gitignorePath, "utf-8");
  expect(content).toContain(".search-index.json");
  expect(content).toContain(".search-hash");
});

test("ensureGitignore does not duplicate entries", () => {
  const root = initStore();
  const gitignorePath = join(root, ".gitignore");

  // Run it twice
  ensureGitignore(root);
  ensureGitignore(root);

  const content = readFileSync(gitignorePath, "utf-8");
  const indexCount = content.split(".search-index.json").length - 1;
  expect(indexCount).toBe(1);
});

test("ensureGitignore appends missing entries to existing file", () => {
  const root = initStore();
  const gitignorePath = join(root, ".gitignore");

  // Write a file with only one of the entries
  writeFileSync(gitignorePath, ".search-index.json\n");
  ensureGitignore(root);

  const content = readFileSync(gitignorePath, "utf-8");
  expect(content).toContain(".search-index.json");
  expect(content).toContain(".search-hash");
  // Should not duplicate
  const indexCount = content.split(".search-index.json").length - 1;
  expect(indexCount).toBe(1);
});

test("ensureGitignore preserves existing content", () => {
  const root = initStore();
  const gitignorePath = join(root, ".gitignore");

  writeFileSync(gitignorePath, "node_modules/\n.env\n");
  ensureGitignore(root);

  const content = readFileSync(gitignorePath, "utf-8");
  expect(content).toContain("node_modules/");
  expect(content).toContain(".env");
  expect(content).toContain(".search-index.json");
  expect(content).toContain(".search-hash");
});

test("collections are independent", () => {
  const root = initStore();
  writeRecord<Service>(root, "services", {
    id: "shared-id",
    name: "svc",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  writeRecord<Owner>(root, "owners", {
    id: "shared-id",
    name: "owner",
    type: "team",
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
  });
  const svc = readOne<Service>(root, "services", "shared-id");
  const owner = readOne<Owner>(root, "owners", "shared-id");
  expect(svc?.name).toBe("svc");
  expect(owner?.name).toBe("owner");
});
