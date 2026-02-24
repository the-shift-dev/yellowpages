import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { nanoid } from "nanoid";
import type { Collection, Config } from "./types.js";
import { COLLECTIONS, DEFAULT_CONFIG } from "./types.js";

const YELLOWPAGES_DIR = ".yellowpages";
const GITIGNORE_ENTRIES = [".search-index.json", ".search-hash"];

/**
 * Ensure .yellowpages/.gitignore contains required entries.
 * Creates the file if missing, appends missing entries if it exists.
 */
export function ensureGitignore(root: string): void {
  const gitignorePath = join(root, ".gitignore");
  const existing = existsSync(gitignorePath)
    ? readFileSync(gitignorePath, "utf-8")
    : "";
  const lines = existing.split("\n").map((l) => l.trim());
  const missing = GITIGNORE_ENTRIES.filter((e) => !lines.includes(e));
  if (missing.length === 0) return;
  const append = `${missing.join("\n")}\n`;
  writeFileSync(
    gitignorePath,
    existing ? `${existing.trimEnd()}\n${append}` : append,
  );
}

/**
 * Find the .yellowpages directory by walking up from cwd.
 */
export function findRoot(): string | null {
  let dir = process.cwd();
  while (true) {
    if (existsSync(join(dir, YELLOWPAGES_DIR))) {
      return join(dir, YELLOWPAGES_DIR);
    }
    const parent = join(dir, "..");
    if (parent === dir) return null;
    dir = parent;
  }
}

export function requireRoot(): string {
  const root = findRoot();
  if (!root) {
    console.error("Not a yellowpages project. Run: yp init");
    process.exit(1);
  }
  return root;
}

/**
 * Initialize a new .yellowpages directory.
 */
export function initStore(): string {
  const root = join(process.cwd(), YELLOWPAGES_DIR);
  if (existsSync(root)) {
    return root;
  }
  mkdirSync(root, { recursive: true });
  for (const col of COLLECTIONS) {
    mkdirSync(join(root, col), { recursive: true });
  }
  writeFileSync(
    join(root, "config.json"),
    `${JSON.stringify(DEFAULT_CONFIG, null, 2)}\n`,
  );
  ensureGitignore(root);
  return root;
}

/**
 * Read config.
 */
export function readConfig(root: string): Config {
  const configPath = join(root, "config.json");
  if (!existsSync(configPath)) return { ...DEFAULT_CONFIG };
  return JSON.parse(readFileSync(configPath, "utf-8"));
}

/**
 * Write config.
 */
export function writeConfig(root: string, config: Config): void {
  writeFileSync(
    join(root, "config.json"),
    `${JSON.stringify(config, null, 2)}\n`,
  );
}

/**
 * Generate a short ID.
 */
export function newId(): string {
  return nanoid(8);
}

/**
 * Read all records from a collection.
 */
export function readAll<T>(root: string, collection: Collection): T[] {
  const dir = join(root, collection);
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  return files.map((f) => JSON.parse(readFileSync(join(dir, f), "utf-8")));
}

/**
 * Read a single record by ID.
 */
export function readOne<T>(
  root: string,
  collection: Collection,
  id: string,
): T | null {
  const filePath = join(root, collection, `${id}.json`);
  if (!existsSync(filePath)) return null;
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

/**
 * Find a record by name (case-insensitive).
 */
export function findByName<T extends { id: string; name: string }>(
  root: string,
  collection: Collection,
  name: string,
): T | null {
  const all = readAll<T>(root, collection);
  return all.find((r) => r.name.toLowerCase() === name.toLowerCase()) ?? null;
}

/**
 * Resolve an ID-or-name to an ID. Returns the input if it looks like an ID,
 * otherwise searches by name.
 */
export function resolveId<T extends { id: string; name: string }>(
  root: string,
  collection: Collection,
  idOrName: string,
): string {
  // If a record with this exact ID exists, use it
  const byId = readOne<T>(root, collection, idOrName);
  if (byId) return idOrName;

  // Otherwise, search by name
  const byName = findByName<T>(root, collection, idOrName);
  if (byName) return byName.id;

  return idOrName; // Return as-is, let caller handle missing
}

/**
 * Write a record to a collection.
 */
export function writeRecord<T extends { id: string }>(
  root: string,
  collection: Collection,
  record: T,
): void {
  const dir = join(root, collection);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, `${record.id}.json`),
    `${JSON.stringify(record, null, 2)}\n`,
  );
}

/**
 * Delete a record by ID.
 */
export function deleteRecord(
  root: string,
  collection: Collection,
  id: string,
): boolean {
  const filePath = join(root, collection, `${id}.json`);
  if (!existsSync(filePath)) return false;
  unlinkSync(filePath);
  return true;
}
