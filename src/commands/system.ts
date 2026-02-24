import { Command } from "commander";
import { loadCatalog, resolveSystem } from "../relations.js";
import {
  deleteRecord,
  newId,
  requireRoot,
  resolveId,
  writeRecord,
} from "../store.js";
import type { Owner, System } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, bullet, dim, error, output, success } from "../utils/output.js";

function getOutputOptions(cmd: Command): OutputOptions {
  const root = cmd.optsWithGlobals();
  return { json: root.json, quiet: root.quiet };
}

export const systemCommand = new Command("system").description(
  "Manage systems (groups of services)",
);

// --- add ---
systemCommand
  .command("add")
  .requiredOption("--name <name>", "System name")
  .option("--description <desc>", "What this system does")
  .option("--owner <id-or-name>", "Team or person who owns this system")
  .action((opts, cmd) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const now = new Date().toISOString();
    const system: System = {
      id: newId(),
      name: opts.name,
      description: opts.description,
      owner: opts.owner
        ? resolveId<Owner>(root, "owners", opts.owner)
        : undefined,
      created: now,
      updated: now,
    };

    writeRecord(root, "systems", system);

    output(options, {
      json: () => ({ success: true, system }),
      human: () =>
        success(`System ${bold(system.name)} added (${dim(system.id)})`),
    });
  });

// --- list ---
systemCommand.command("list").action((_opts, cmd) => {
  const options = getOutputOptions(cmd);
  const root = requireRoot();
  const catalog = loadCatalog(root);

  output(options, {
    json: () => ({ systems: catalog.systems }),
    human: () => {
      if (catalog.systems.length === 0) {
        console.log(dim("No systems found."));
        return;
      }
      for (const s of catalog.systems) {
        bullet(`${bold(s.name)}  ${dim(s.id)}`);
        if (s.description) console.log(`    ${dim(s.description)}`);
      }
    },
  });
});

// --- show ---
systemCommand
  .command("show <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<System>(root, "systems", idOrName);
    const catalog = loadCatalog(root);
    const resolved = resolveSystem(id, catalog);

    if (!resolved) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`System not found: ${idOrName}`),
      });
      process.exit(1);
    }

    const { system, owner, services } = resolved;

    output(options, {
      json: () => ({ system, owner, services }),
      human: () => {
        console.log();
        console.log(bold(system.name), dim(system.id));
        if (system.description) console.log(dim(system.description));
        console.log();
        if (owner) console.log(`  Owner: ${owner.name}`);
        console.log(`  Services: ${services.length}`);
        if (services.length > 0) {
          console.log();
          for (const s of services) {
            bullet(`${s.name}  ${dim(s.id)}`);
          }
        }
        console.log();
      },
    });
  });

// --- rm ---
systemCommand
  .command("rm <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<System>(root, "systems", idOrName);
    const deleted = deleteRecord(root, "systems", id);

    if (!deleted) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`System not found: ${idOrName}`),
      });
      process.exit(1);
    }

    output(options, {
      json: () => ({ success: true, deleted: id }),
      human: () => success(`Removed system ${dim(id)}`),
    });
  });
