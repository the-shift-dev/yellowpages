import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import MiniSearch from "minisearch";
import { readAll } from "./store.js";
import type { Owner, Service, System } from "./types.js";

const INDEX_FILE = ".yellowpages/.search-index.json";
const HASH_FILE = ".yellowpages/.search-hash";

interface SearchDocument {
  id: string;
  kind: "service" | "system" | "owner";
  name: string;
  description: string;
  tags: string;
  apis: string;
  lifecycle: string;
  ownerType: string;
}

function createMiniSearch(): MiniSearch<SearchDocument> {
  return new MiniSearch<SearchDocument>({
    fields: ["name", "description", "tags", "apis", "lifecycle", "ownerType"],
    storeFields: ["kind", "name", "description"],
    searchOptions: {
      boost: { name: 3, description: 2, tags: 1.5 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
}

/**
 * Compute a hash of all catalog files' mtimes + sizes.
 * If this changes, the index needs rebuilding.
 */
function computeCatalogHash(root: string): string {
  const parts: string[] = [];
  for (const collection of ["services", "systems", "owners"]) {
    const dir = join(root, collection);
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
    for (const file of files) {
      const stat = statSync(join(dir, file));
      parts.push(`${collection}/${file}:${stat.mtimeMs}:${stat.size}`);
    }
  }
  return parts.join("|");
}

function serviceToDoc(s: Service): SearchDocument {
  return {
    id: `service:${s.id}`,
    kind: "service",
    name: s.name,
    description: s.description ?? "",
    tags: (s.tags ?? []).join(" "),
    apis: (s.apis ?? []).map((a) => `${a.name} ${a.description ?? ""}`).join(" "),
    lifecycle: s.lifecycle ?? "",
    ownerType: "",
  };
}

function systemToDoc(s: System): SearchDocument {
  return {
    id: `system:${s.id}`,
    kind: "system",
    name: s.name,
    description: s.description ?? "",
    tags: "",
    apis: "",
    lifecycle: "",
    ownerType: "",
  };
}

function ownerToDoc(o: Owner): SearchDocument {
  return {
    id: `owner:${o.id}`,
    kind: "owner",
    name: o.name,
    description: "",
    tags: "",
    apis: "",
    lifecycle: "",
    ownerType: o.type,
  };
}

/**
 * Get or rebuild the search index. Rebuilds only when catalog files change.
 */
export function getSearchIndex(root: string): MiniSearch<SearchDocument> {
  const hashFile = join(root, ".search-hash");
  const indexFile = join(root, ".search-index.json");
  const currentHash = computeCatalogHash(root);

  // Try loading cached index
  if (existsSync(hashFile) && existsSync(indexFile)) {
    const storedHash = readFileSync(hashFile, "utf-8").trim();
    if (storedHash === currentHash) {
      const index = createMiniSearch();
      const data = JSON.parse(readFileSync(indexFile, "utf-8"));
      return MiniSearch.loadJSON<SearchDocument>(JSON.stringify(data), {
        fields: ["name", "description", "tags", "apis", "lifecycle", "ownerType"],
        storeFields: ["kind", "name", "description"],
        searchOptions: {
          boost: { name: 3, description: 2, tags: 1.5 },
          fuzzy: 0.2,
          prefix: true,
        },
      });
    }
  }

  // Rebuild index
  const index = createMiniSearch();

  const services = readAll<Service>(root, "services");
  const systems = readAll<System>(root, "systems");
  const owners = readAll<Owner>(root, "owners");

  const docs: SearchDocument[] = [
    ...services.map(serviceToDoc),
    ...systems.map(systemToDoc),
    ...owners.map(ownerToDoc),
  ];

  index.addAll(docs);

  // Cache to disk
  writeFileSync(indexFile, JSON.stringify(index.toJSON()));
  writeFileSync(hashFile, currentHash);

  return index;
}

/**
 * Extract the real entity ID from a search document ID.
 * "service:abc123" → "abc123"
 */
export function parseDocId(docId: string): { kind: string; id: string } {
  const [kind, id] = docId.split(":");
  return { kind, id };
}
