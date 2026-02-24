#!/usr/bin/env node

import { createRequire } from "node:module";
import { Command } from "commander";
import { deps } from "./commands/deps.js";
import { discover } from "./commands/discover.js";
import { init } from "./commands/init.js";
import { lint } from "./commands/lint.js";
import { onboard } from "./commands/onboard.js";
import { ownerCommand } from "./commands/owner.js";
import { search } from "./commands/search.js";
import { serviceCommand } from "./commands/service.js";
import { systemCommand } from "./commands/system.js";

const require = createRequire(import.meta.url);
const { version } = require("../package.json");

const program = new Command();

program
  .name("yp")
  .description(
    "📒 Service catalog for AI coding agents. Look it up before you break it.",
  )
  .version(`yp 📒 ${version}`, "-v, --version")
  .option("--json", "Output as JSON")
  .option("-q, --quiet", "Suppress output");

program
  .command("init")
  .description("Create .yellowpages/ in current repo")
  .action(async (_opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await init([], { json: root.json, quiet: root.quiet });
  });

program
  .command("lint")
  .description("Validate catalog integrity")
  .action(async (_opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await lint([], { json: root.json, quiet: root.quiet });
  });

program
  .command("search [query...]")
  .description("Search across all entities")
  .option("--kind <kind>", "Filter by entity kind (service, system, owner)")
  .option("--unowned", "Find services with no owner")
  .option("--unassigned", "Find services with no system")
  .option("--lifecycle <stage>", "Filter by lifecycle stage")
  .action(async (query: string[], opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await search(query, {
      json: root.json,
      quiet: root.quiet,
      kind: opts.kind,
      noOwner: opts.unowned,
      noSystem: opts.unassigned,
      lifecycle: opts.lifecycle,
    });
  });

program
  .command("deps [service]")
  .description("Show dependency graph for a service")
  .option("--direction <dir>", "up (dependents) or down (dependencies)")
  .option("--depth <n>", "Max depth for transitive deps", parseInt)
  .option("--tree", "ASCII tree view")
  .option("--orphans", "Find services with no deps in or out")
  .action(async (service: string | undefined, opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await deps(service ? [service] : [], {
      json: root.json,
      quiet: root.quiet,
      direction: opts.direction,
      depth: opts.depth,
      tree: opts.tree,
      orphans: opts.orphans,
    });
  });

program
  .command("discover")
  .description("Auto-discover services from GitHub org or local directories")
  .option("--github-org <org>", "Scan a GitHub organization")
  .option("--dir <path>", "Scan a local directory")
  .option("--topic <topic>", "Filter GitHub repos by topic")
  .option("--language <lang>", "Filter GitHub repos by language")
  .option("--dry-run", "Show what would be added without making changes")
  .action(async (opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await discover([], {
      json: root.json,
      quiet: root.quiet,
      githubOrg: opts.githubOrg,
      dir: opts.dir,
      topic: opts.topic,
      language: opts.language,
      dryRun: opts.dryRun,
    });
  });

program
  .command("onboard")
  .description("Add agent instructions to CLAUDE.md")
  .action(async (_opts, cmd) => {
    const root = cmd.optsWithGlobals();
    await onboard([], { json: root.json, quiet: root.quiet });
  });

program.addCommand(serviceCommand);
program.addCommand(systemCommand);
program.addCommand(ownerCommand);

program.parseAsync(process.argv).catch((err) => {
  if (err instanceof Error) {
    console.error("Fatal error:", err.message);
  }
  process.exit(1);
});
