import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { requireRoot } from "../store.js";
import type { OutputOptions } from "../utils/output.js";
import { hint, info, output, success } from "../utils/output.js";

const ONBOARD_BLOCK = `<yellowpages>
Use \`yp\` to explore the service catalog before making changes. Data is stored in \`.yellowpages/\` as JSON files, tracked by git.

<commands>
- \`yp service list\` — List all services
- \`yp service show <id-or-name>\` — Full service profile (owner, deps, APIs, dependents)
- \`yp service list --system <name>\` — Services in a system
- \`yp service list --owner <name>\` — Services owned by a team
- \`yp system list\` — List all systems
- \`yp system show <id-or-name>\` — System details with its services
- \`yp owner list\` — List all owners
- \`yp owner show <id-or-name>\` — Owner details with their services and systems
- \`yp deps <service>\` — Dependency graph: what depends on it AND what it depends on
- \`yp deps <service> --direction up\` — Only what depends on this service
- \`yp deps --orphans\` — Find isolated services (no deps in or out)
- \`yp search <query>\` — Full-text search across all entities
- \`yp search --unowned\` — Find services with no owner
- \`yp lint\` — Validate catalog integrity (orphaned refs, circular deps, etc.)
- \`yp discover --dir <path>\` — Auto-discover services from local repos
- \`yp discover --github-org <org>\` — Auto-discover from GitHub org
- \`yp discover --dry-run\` — Preview what would be added without changing anything
</commands>

<rules>
- ALWAYS use \`--json\` flag to get structured output for parsing
- Check the service catalog before modifying infrastructure
- Respect ownership — check who owns a service before changing it
- ALWAYS check \`yp deps <service> --direction up --json\` before modifying a service — know what depends on it
- Run \`yp lint --json\` after making catalog changes to verify integrity
</rules>
</yellowpages>`;

const AGENT_FILES = ["CLAUDE.md", "AGENTS.md", "COPILOT.md"];

export async function onboard(
  _args: string[],
  options: OutputOptions,
): Promise<void> {
  requireRoot(); // Ensure we're in a yellowpages project

  // Find the repo root (parent of .yellowpages/)
  let dir = process.cwd();
  while (dir !== "/") {
    if (existsSync(join(dir, ".yellowpages"))) break;
    dir = join(dir, "..");
  }

  // Check if any agent file already has the block
  for (const file of AGENT_FILES) {
    const filePath = join(dir, file);
    if (existsSync(filePath)) {
      const content = readFileSync(filePath, "utf-8");
      if (content.includes("<yellowpages>")) {
        output(options, {
          json: () => ({ success: true, file, created: false }),
          human: () => info(`${file} already has yellowpages instructions.`),
        });
        return;
      }
    }
  }

  // Append to CLAUDE.md (create if needed)
  const targetFile = "CLAUDE.md";
  const targetPath = join(dir, targetFile);
  const existing = existsSync(targetPath)
    ? readFileSync(targetPath, "utf-8")
    : "";

  const newContent = existing
    ? `${existing.trimEnd()}\n\n${ONBOARD_BLOCK}\n`
    : `# CLAUDE.md\n\n${ONBOARD_BLOCK}\n`;

  writeFileSync(targetPath, newContent);

  output(options, {
    json: () => ({ success: true, file: targetFile, created: !existing }),
    human: () => {
      success(`Added yellowpages instructions to ${targetFile}`);
      hint("Your agent now knows how to use the service catalog.");
    },
  });
}
