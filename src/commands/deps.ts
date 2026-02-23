import { type DepNode, type DepsResult, findOrphans, resolveDeps } from "../deps.js";
import { readAll, requireRoot, resolveId } from "../store.js";
import type { Service } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import { bold, bullet, dim, error, info, output } from "../utils/output.js";

const DEFAULT_DEPTH = 10;

function renderTree(nodes: DepNode[], prefix: string): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const isLast = i === nodes.length - 1;
    const connector = isLast ? "└── " : "├── ";
    const childPrefix = isLast ? "    " : "│   ";

    const parts = [node.name];
    if (node.api) parts.push(dim(`(${node.api})`));
    if (node.description) parts.push(dim(`— ${node.description}`));
    console.log(`${prefix}${connector}${parts.join(" ")}`);

    if (node.children.length > 0) {
      renderTree(node.children, prefix + childPrefix);
    }
  }
}

export async function deps(
  args: string[],
  options: OutputOptions & {
    direction?: "up" | "down";
    depth?: number;
    tree?: boolean;
    orphans?: boolean;
  },
): Promise<void> {
  const root = requireRoot();
  const services = readAll<Service>(root, "services");

  // --orphans mode
  if (options.orphans) {
    const orphans = findOrphans(services);
    output(options, {
      json: () => ({
        orphans: orphans.map((s) => ({ id: s.id, name: s.name })),
        count: orphans.length,
      }),
      human: () => {
        if (orphans.length === 0) {
          info("No isolated services found — everything is connected.");
          return;
        }
        console.log();
        console.log(bold(`Isolated services (${orphans.length})`));
        console.log(dim("No dependencies in or out"));
        console.log();
        for (const s of orphans) {
          bullet(`${s.name}  ${dim(s.id)}`);
        }
        console.log();
      },
    });
    return;
  }

  // Service-specific mode
  if (args.length === 0) {
    output(options, {
      json: () => ({ success: false, error: "missing_service" }),
      human: () => {
        error("Service name or ID required");
        console.log(dim("  Usage: yp deps <service> [--direction up|down] [--depth N]"));
        console.log(dim("         yp deps --orphans"));
      },
    });
    process.exit(1);
  }

  const idOrName = args[0];
  const id = resolveId<Service>(root, "services", idOrName);
  const service = services.find((s) => s.id === id);

  if (!service) {
    output(options, {
      json: () => ({ success: false, error: "not_found" }),
      human: () => error(`Service not found: ${idOrName}`),
    });
    process.exit(1);
  }

  const maxDepth = options.depth ?? DEFAULT_DEPTH;
  const result = resolveDeps(id, services, maxDepth, options.direction);

  output(options, {
    json: () => result,
    human: () => {
      console.log();
      console.log(bold(result.service.name));

      if (options.direction !== "down") {
        console.log();
        if (result.dependents.length === 0) {
          console.log(dim("  ↑ No dependents"));
        } else {
          console.log(bold("  ↑ Dependents") + dim(" (what depends on me)"));
          renderTree(result.dependents, "    ");
        }
      }

      if (options.direction !== "up") {
        console.log();
        if (result.dependencies.length === 0) {
          console.log(dim("  ↓ No dependencies"));
        } else {
          console.log(bold("  ↓ Dependencies") + dim(" (what I depend on)"));
          renderTree(result.dependencies, "    ");
        }
      }

      console.log();
    },
  });
}
