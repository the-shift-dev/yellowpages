import { Command } from "commander";
import { loadCatalog, resolveOwner } from "../relations.js";
import {
  deleteRecord,
  newId,
  requireRoot,
  resolveId,
  writeRecord,
} from "../store.js";
import type { Owner } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, bullet, dim, error, output, success } from "../utils/output.js";

function getOutputOptions(cmd: Command): OutputOptions {
  const root = cmd.optsWithGlobals();
  return { json: root.json, quiet: root.quiet };
}

export const ownerCommand = new Command("owner").description(
  "Manage owners (teams and people)",
);

// --- add ---
ownerCommand
  .command("add")
  .requiredOption("--name <name>", "Owner name")
  .requiredOption("--type <type>", "team | person")
  .option("--email <email>", "Contact email")
  .option("--slack <channel>", "Slack channel or handle")
  .action((opts, cmd) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const now = new Date().toISOString();
    const owner: Owner = {
      id: newId(),
      name: opts.name,
      type: opts.type,
      email: opts.email,
      slack: opts.slack,
      created: now,
      updated: now,
    };

    writeRecord(root, "owners", owner);

    output(options, {
      json: () => ({ success: true, owner }),
      human: () =>
        success(`Owner ${bold(owner.name)} added (${dim(owner.id)})`),
    });
  });

// --- list ---
ownerCommand
  .command("list")
  .option("--type <type>", "Filter by type (team | person)")
  .action((opts, cmd) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();
    const catalog = loadCatalog(root);

    let owners = catalog.owners;
    if (opts.type) {
      owners = owners.filter((o) => o.type === opts.type);
    }

    output(options, {
      json: () => ({ owners }),
      human: () => {
        if (owners.length === 0) {
          console.log(dim("No owners found."));
          return;
        }
        for (const o of owners) {
          bullet(`${bold(o.name)}  ${dim(o.type)}  ${dim(o.id)}`);
        }
      },
    });
  });

// --- show ---
ownerCommand
  .command("show <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Owner>(root, "owners", idOrName);
    const catalog = loadCatalog(root);
    const resolved = resolveOwner(id, catalog);

    if (!resolved) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`Owner not found: ${idOrName}`),
      });
      process.exit(1);
    }

    const { owner, services, systems } = resolved;

    output(options, {
      json: () => ({ owner, services, systems }),
      human: () => {
        console.log();
        console.log(bold(owner.name), dim(`${owner.type}  ${owner.id}`));
        if (owner.email) console.log(`  Email: ${owner.email}`);
        if (owner.slack) console.log(`  Slack: ${owner.slack}`);
        console.log();
        if (systems.length > 0) {
          console.log(bold("  Systems"));
          for (const s of systems) {
            bullet(`${s.name}  ${dim(s.id)}`);
          }
          console.log();
        }
        if (services.length > 0) {
          console.log(bold("  Services"));
          for (const s of services) {
            bullet(`${s.name}  ${dim(s.id)}`);
          }
          console.log();
        }
        if (systems.length === 0 && services.length === 0) {
          console.log(dim("  No systems or services owned."));
          console.log();
        }
      },
    });
  });

// --- rm ---
ownerCommand
  .command("rm <id-or-name>")
  .action((idOrName: string, _opts: unknown, cmd: Command) => {
    const options = getOutputOptions(cmd);
    const root = requireRoot();

    const id = resolveId<Owner>(root, "owners", idOrName);
    const deleted = deleteRecord(root, "owners", id);

    if (!deleted) {
      output(options, {
        json: () => ({ success: false, error: "not_found" }),
        human: () => error(`Owner not found: ${idOrName}`),
      });
      process.exit(1);
    }

    output(options, {
      json: () => ({ success: true, deleted: id }),
      human: () => success(`Removed owner ${dim(id)}`),
    });
  });
