import { readAll, readOne, requireRoot } from "../store.js";
import { getSearchIndex, parseDocId } from "../search-index.js";
import type { Owner, Service, System } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, bullet, dim, info, output, warn } from "../utils/output.js";

interface SearchResultItem {
  kind: string;
  id: string;
  name: string;
  description?: string;
  score: number;
}

export async function search(
  args: string[],
  options: OutputOptions & {
    kind?: string;
    noOwner?: boolean;
    noSystem?: boolean;
    lifecycle?: string;
  },
): Promise<void> {
  const root = requireRoot();

  const query = args.join(" ").trim();

  // If no query and no filters, show help
  if (!query && !options.noOwner && !options.noSystem && !options.lifecycle) {
    output(options, {
      json: () => ({ success: false, error: "no_query" }),
      human: () => {
        warn("No search query or filters provided.");
        console.log(dim('  Usage: yp search "authentication"'));
        console.log(dim("         yp search --no-owner"));
        console.log(dim("         yp search --lifecycle deprecated"));
      },
    });
    return;
  }

  let results: SearchResultItem[] = [];

  if (query) {
    // Full-text search via MiniSearch
    const index = getSearchIndex(root);
    const hits = index.search(query);

    results = hits.map((hit) => {
      const { kind, id } = parseDocId(hit.id as string);
      return {
        kind,
        id,
        name: (hit as any).name ?? "",
        description: (hit as any).description ?? "",
        score: hit.score,
      };
    });
  } else {
    // Filter-only mode (no query text)
    // If service-specific filters are active, only search services
    const serviceFiltersActive = options.noOwner || options.noSystem || options.lifecycle;
    const effectiveKind = options.kind ?? (serviceFiltersActive ? "service" : undefined);

    const services = readAll<Service>(root, "services");
    const systems = readAll<System>(root, "systems");
    const owners = readAll<Owner>(root, "owners");

    if (!effectiveKind || effectiveKind === "service") {
      for (const s of services) {
        results.push({
          kind: "service",
          id: s.id,
          name: s.name,
          description: s.description,
          score: 0,
        });
      }
    }
    if (!effectiveKind || effectiveKind === "system") {
      for (const s of systems) {
        results.push({
          kind: "system",
          id: s.id,
          name: s.name,
          description: s.description,
          score: 0,
        });
      }
    }
    if (!effectiveKind || effectiveKind === "owner") {
      for (const o of owners) {
        results.push({
          kind: "owner",
          id: o.id,
          name: o.name,
          score: 0,
        });
      }
    }
  }

  // Apply kind filter
  if (options.kind) {
    results = results.filter((r) => r.kind === options.kind);
  }

  // Apply special filters (only apply to services)
  if (options.noOwner) {
    const services = readAll<Service>(root, "services");
    const unowned = new Set(services.filter((s) => !s.owner).map((s) => s.id));
    results = results.filter(
      (r) => r.kind !== "service" || unowned.has(r.id),
    );
  }

  if (options.noSystem) {
    const services = readAll<Service>(root, "services");
    const orphaned = new Set(services.filter((s) => !s.system).map((s) => s.id));
    results = results.filter(
      (r) => r.kind !== "service" || orphaned.has(r.id),
    );
  }

  if (options.lifecycle) {
    const services = readAll<Service>(root, "services");
    const matching = new Set(
      services.filter((s) => s.lifecycle === options.lifecycle).map((s) => s.id),
    );
    results = results.filter(
      (r) => r.kind !== "service" || matching.has(r.id),
    );
  }

  output(options, {
    json: () => ({
      query: query || null,
      count: results.length,
      results: results.map(({ kind, id, name, description, score }) => ({
        kind,
        id,
        name,
        description,
        score,
      })),
    }),
    human: () => {
      if (results.length === 0) {
        info(query ? `No results for "${query}"` : "No results matching filters");
        return;
      }

      // Group by kind
      const grouped = new Map<string, SearchResultItem[]>();
      for (const r of results) {
        const list = grouped.get(r.kind) ?? [];
        list.push(r);
        grouped.set(r.kind, list);
      }

      const kindOrder = ["service", "system", "owner"];
      for (const kind of kindOrder) {
        const items = grouped.get(kind);
        if (!items) continue;

        console.log();
        console.log(bold(`${kind}s`));
        for (const item of items) {
          const parts = [bold(item.name), dim(item.id)];
          if (item.score > 0) parts.push(dim(`(${item.score.toFixed(1)})`));
          bullet(parts.join("  "));
          if (item.description) console.log(`    ${dim(item.description)}`);
        }
      }
      console.log();
      info(`${results.length} result(s)`);
    },
  });
}
