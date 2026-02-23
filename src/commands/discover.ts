import {
  type DiscoverDiff,
  type DiscoveredService,
  diffServices,
  discoverFromDir,
  discoverFromGitHub,
} from "../discover.js";
import { loadCatalog } from "../relations.js";
import {
  findByName,
  newId,
  readAll,
  requireRoot,
  resolveId,
  writeRecord,
} from "../store.js";
import type { Owner, Service, System } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import {
  bold,
  bullet,
  bulletDim,
  dim,
  error,
  info,
  output,
  success,
  warn,
} from "../utils/output.js";

export interface DiscoverOptions extends OutputOptions {
  githubOrg?: string;
  dir?: string;
  topic?: string;
  language?: string;
  dryRun?: boolean;
}

/**
 * Apply a discovered service to the catalog — create or update.
 */
function applyService(
  root: string,
  discovered: DiscoveredService,
  existingService?: Service,
): Service {
  const now = new Date().toISOString();

  // Resolve owner/system names to IDs if they exist
  const ownerId = discovered.owner
    ? resolveId<Owner>(root, "owners", discovered.owner)
    : existingService?.owner;
  const systemId = discovered.system
    ? resolveId<System>(root, "systems", discovered.system)
    : existingService?.system;

  // Resolve dependency names to IDs
  const deps = (discovered.dependsOn ?? []).map((d) => ({
    ...d,
    service: resolveId<Service>(root, "services", d.service),
  }));

  const service: Service = {
    id: existingService?.id ?? newId(),
    name: discovered.name,
    description: discovered.description ?? existingService?.description,
    system: systemId,
    owner: ownerId,
    lifecycle: discovered.lifecycle ?? existingService?.lifecycle,
    repo: discovered.repo ?? existingService?.repo,
    tags: discovered.tags ?? existingService?.tags,
    apis: discovered.apis ?? existingService?.apis ?? [],
    dependsOn: deps.length > 0 ? deps : existingService?.dependsOn ?? [],
    created: existingService?.created ?? now,
    updated: now,
  };

  writeRecord(root, "services", service);
  return service;
}

export async function discover(
  _args: string[],
  options: DiscoverOptions,
): Promise<void> {
  const root = requireRoot();

  if (!options.githubOrg && !options.dir) {
    output(options, {
      json: () => ({ success: false, error: "no_source" }),
      human: () => {
        error("Specify a source: --github-org <org> or --dir <path>");
      },
    });
    process.exit(1);
  }

  // Discover
  let discovered: DiscoveredService[] = [];

  if (options.githubOrg) {
    try {
      discovered = await discoverFromGitHub({
        org: options.githubOrg,
        topic: options.topic,
        language: options.language,
      });
    } catch (err) {
      output(options, {
        json: () => ({
          success: false,
          error: "github_error",
          message: (err as Error).message,
        }),
        human: () => error(`GitHub discovery failed: ${(err as Error).message}`),
      });
      process.exit(1);
    }
  }

  if (options.dir) {
    const local = discoverFromDir(options.dir);
    discovered.push(...local);
  }

  if (discovered.length === 0) {
    output(options, {
      json: () => ({ success: true, added: 0, updated: 0, discovered: 0 }),
      human: () => info("No services discovered."),
    });
    return;
  }

  // Diff against existing catalog
  const existing = readAll<Service>(root, "services");
  const diff = diffServices(discovered, existing);

  // Dry run — just show what would happen
  if (options.dryRun) {
    output(options, {
      json: () => ({
        success: true,
        dryRun: true,
        discovered: discovered.length,
        added: diff.added.length,
        updated: diff.updated.length,
        services: {
          added: diff.added.map((d) => d.name),
          updated: diff.updated.map((u) => u.discovered.name),
        },
      }),
      human: () => {
        console.log();
        info(
          `Discovered ${bold(String(discovered.length))} service(s)`,
        );
        console.log();

        if (diff.added.length > 0) {
          console.log(bold("Would add:"));
          for (const d of diff.added) {
            bullet(
              `${d.name}${d.description ? `  ${dim(d.description)}` : ""}  ${dim(`[${d.source}]`)}`,
            );
          }
          console.log();
        }

        if (diff.updated.length > 0) {
          console.log(bold("Would update:"));
          for (const u of diff.updated) {
            bullet(`${u.discovered.name}  ${dim(`[${u.discovered.source}]`)}`);
          }
          console.log();
        }

        const unchanged =
          discovered.length - diff.added.length - diff.updated.length;
        if (unchanged > 0) {
          console.log(dim(`${unchanged} service(s) unchanged`));
        }

        console.log();
        warn("Dry run — no changes made. Remove --dry-run to apply.");
      },
    });
    return;
  }

  // Apply changes
  const addedServices: Service[] = [];
  for (const d of diff.added) {
    const svc = applyService(root, d);
    addedServices.push(svc);
  }

  const updatedServices: Service[] = [];
  for (const u of diff.updated) {
    const svc = applyService(root, u.discovered, u.existing);
    updatedServices.push(svc);
  }

  output(options, {
    json: () => ({
      success: true,
      discovered: discovered.length,
      added: addedServices.length,
      updated: updatedServices.length,
      services: {
        added: addedServices.map((s) => ({ id: s.id, name: s.name })),
        updated: updatedServices.map((s) => ({ id: s.id, name: s.name })),
      },
    }),
    human: () => {
      console.log();
      if (addedServices.length > 0) {
        for (const s of addedServices) {
          success(`Added ${bold(s.name)}  ${dim(s.id)}`);
        }
      }
      if (updatedServices.length > 0) {
        for (const s of updatedServices) {
          info(`Updated ${bold(s.name)}  ${dim(s.id)}`);
        }
      }

      const unchanged =
        discovered.length - addedServices.length - updatedServices.length;
      if (unchanged > 0) {
        console.log(dim(`\n${unchanged} service(s) unchanged`));
      }

      console.log();
      success(
        `Discovered ${discovered.length}, added ${addedServices.length}, updated ${updatedServices.length}`,
      );
    },
  });
}
