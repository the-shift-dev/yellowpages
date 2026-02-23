import { Command } from "commander";
import { filterServices, loadCatalog, resolveService } from "../relations.js";
import {
  deleteRecord,
  newId,
  readOne,
  requireRoot,
  resolveId,
  writeRecord,
} from "../store.js";
import type { Api, Dependency, Owner, Service, System } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, bullet, dim, error, output, success } from "../utils/output.js";

function getOutputOptions(cmd: Command): OutputOptions {
  const root = cmd.optsWithGlobals();
  return { json: root.json, quiet: root.quiet };
}

export const serviceCommand = new Command("service").description(
  "Manage services",
);

// --- add ---
serviceCommand
  .command("add")
  .requiredOption("--name <name>", "Service name")
  .option("--description <desc>", "What this service does")
  .option("--system <id-or-name>", "System this service belongs to")
  .option("--owner <id-or-name>", "Team or person who owns this")
  .option("--lifecycle <stage>", "experimental | production | deprecated | decommissioned")
  .option("--repo <url>", "Repository URL")
  .option("--tag <tags...>", "Tags")
  .action((opts, cmd) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const now = new Date().toISOString();
    const service: Service = {
      id: newId(),
      name: opts.name,
      description: opts.description,
      system: opts.system
        ? resolveId<System>(root, "systems", opts.system)
        : undefined,
      owner: opts.owner
        ? resolveId<Owner>(root, "owners", opts.owner)
        : undefined,
      lifecycle: opts.lifecycle,
      repo: opts.repo,
      tags: opts.tag,
      apis: [],
      dependsOn: [],
      created: now,
      updated: now,
    };

    writeRecord(root, "services", service);

    output(options, {
      json: () => ({ success: true, service }),
      human: () => success(`Service ${bold(service.name)} added (${dim(service.id)})`),
    });
  });

// --- list ---
serviceCommand
  .command("list")
  .option("--system <id-or-name>", "Filter by system")
  .option("--owner <id-or-name>", "Filter by owner")
  .option("--lifecycle <stage>", "Filter by lifecycle")
  .option("--tag <tag>", "Filter by tag")
  .action((opts, cmd) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();
    const catalog = loadCatalog(root);

    const services = filterServices(catalog, {
      systemId: opts.system
        ? resolveId<System>(root, "systems", opts.system)
        : undefined,
      ownerId: opts.owner
        ? resolveId<Owner>(root, "owners", opts.owner)
        : undefined,
      lifecycle: opts.lifecycle,
      tag: opts.tag,
    });

    output(options, {
      json: () => ({ services }),
      human: () => {
        if (services.length === 0) {
          console.log(dim("No services found."));
          return;
        }
        for (const s of services) {
          const parts = [bold(s.name), dim(s.id)];
          if (s.lifecycle) parts.push(dim(`[${s.lifecycle}]`));
          bullet(parts.join("  "));
          if (s.description) console.log(`    ${dim(s.description)}`);
        }
      },
    });
  });

// --- show ---
serviceCommand
  .command("show <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Service>(root, "services", idOrName);
    const catalog = loadCatalog(root);
    const resolved = resolveService(id, catalog);

    if (!resolved) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`Service not found: ${idOrName}`),
      });
      process.exit(1);
    }

    const { service, system, owner } = resolved;

    output(options, {
      json: () => ({ service, system, owner }),
      human: () => {
        console.log();
        console.log(bold(service.name), dim(service.id));
        if (service.description) console.log(dim(service.description));
        console.log();
        if (owner) console.log(`  Owner:     ${owner.name}`);
        if (system) console.log(`  System:    ${system.name}`);
        if (service.lifecycle) console.log(`  Lifecycle: ${service.lifecycle}`);
        if (service.repo) console.log(`  Repo:      ${service.repo}`);
        if (service.tags?.length) console.log(`  Tags:      ${service.tags.join(", ")}`);

        if (service.apis?.length) {
          console.log();
          console.log(bold("  APIs"));
          for (const api of service.apis) {
            console.log(`    ${api.name} (${api.type})${api.description ? ` — ${api.description}` : ""}`);
          }
        }

        if (service.dependsOn?.length) {
          console.log();
          console.log(bold("  Dependencies"));
          for (const dep of service.dependsOn) {
            const depService = catalog.services.find((s) => s.id === dep.service);
            const name = depService?.name ?? dep.service;
            console.log(`    → ${name}${dep.api ? ` (${dep.api})` : ""}${dep.description ? ` — ${dep.description}` : ""}`);
          }
        }

        if (resolved.dependents.length > 0) {
          console.log();
          console.log(bold("  Dependents"));
          for (const dep of resolved.dependents) {
            console.log(`    ← ${dep.service.name}${dep.api ? ` (${dep.api})` : ""}${dep.description ? ` — ${dep.description}` : ""}`);
          }
        }

        console.log();
      },
    });
  });

// --- rm ---
serviceCommand
  .command("rm <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Service>(root, "services", idOrName);
    const deleted = deleteRecord(root, "services", id);

    if (!deleted) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`Service not found: ${idOrName}`),
      });
      process.exit(1);
    }

    output(options, {
      json: () => ({ success: true, deleted: id }),
      human: () => success(`Removed service ${dim(id)}`),
    });
  });

// --- api add ---
serviceCommand
  .command("api-add <service-id-or-name>")
  .requiredOption("--name <name>", "API name")
  .requiredOption("--type <type>", "rest | grpc | graphql | event | other")
  .option("--spec <path>", "Path to API spec file")
  .option("--description <desc>", "API description")
  .action((serviceIdOrName: string, opts: Record<string, string>, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Service>(root, "services", serviceIdOrName);
    const service = readOne<Service>(root, "services", id);

    if (!service) {
      output(options, {
        json: () => ({ success: false, error: "service_not_found" }),
        human: () => error(`Service not found: ${serviceIdOrName}`),
      });
      process.exit(1);
    }

    const api: Api = {
      name: opts.name,
      type: opts.type as Api["type"],
      spec: opts.spec,
      description: opts.description,
    };

    service.apis = service.apis ?? [];
    service.apis.push(api);
    service.updated = new Date().toISOString();
    writeRecord(root, "services", service);

    output(options, {
      json: () => ({ success: true, service }),
      human: () => success(`Added API ${bold(api.name)} to ${bold(service.name)}`),
    });
  });

// --- dep add ---
serviceCommand
  .command("dep-add <service-id-or-name>")
  .requiredOption("--on <target-service>", "Service this depends on")
  .option("--api <api-name>", "Which API it consumes")
  .option("--description <desc>", "Dependency description")
  .action((serviceIdOrName: string, opts: Record<string, string>, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Service>(root, "services", serviceIdOrName);
    const service = readOne<Service>(root, "services", id);

    if (!service) {
      output(options, {
        json: () => ({ success: false, error: "service_not_found" }),
        human: () => error(`Service not found: ${serviceIdOrName}`),
      });
      process.exit(1);
    }

    const targetId = resolveId<Service>(root, "services", opts.on);
    const dep: Dependency = {
      service: targetId,
      api: opts.api,
      description: opts.description,
    };

    service.dependsOn = service.dependsOn ?? [];
    service.dependsOn.push(dep);
    service.updated = new Date().toISOString();
    writeRecord(root, "services", service);

    output(options, {
      json: () => ({ success: true, service }),
      human: () => success(`${bold(service.name)} now depends on ${bold(opts.on)}`),
    });
  });
