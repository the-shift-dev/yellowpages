import { readAll, requireRoot } from "../store.js";
import type { Owner, Service, System } from "../types.js";
import type { OutputOptions } from "../utils/output.js";
import {
  bold,
  dim,
  error,
  info,
  output,
  success,
  warn,
} from "../utils/output.js";

export type Severity = "error" | "warning";

export interface LintResult {
  type: string;
  severity: Severity;
  entity: string;
  entityKind: string;
  message: string;
  fix?: string;
}

export function findOrphanedSystemRefs(
  services: Service[],
  systemIds: Set<string>,
): LintResult[] {
  const results: LintResult[] = [];
  for (const s of services) {
    if (s.system && !systemIds.has(s.system)) {
      results.push({
        type: "orphaned_system_ref",
        severity: "error",
        entity: s.name,
        entityKind: "service",
        message: `References system "${s.system}" which does not exist`,
        fix: `yp service rm ${s.name}  OR  yp system add --name <name>`,
      });
    }
  }
  return results;
}

export function findOrphanedOwnerRefs(
  services: Service[],
  systems: System[],
  ownerIds: Set<string>,
): LintResult[] {
  const results: LintResult[] = [];
  for (const s of services) {
    if (s.owner && !ownerIds.has(s.owner)) {
      results.push({
        type: "orphaned_owner_ref",
        severity: "error",
        entity: s.name,
        entityKind: "service",
        message: `References owner "${s.owner}" which does not exist`,
      });
    }
  }
  for (const sys of systems) {
    if (sys.owner && !ownerIds.has(sys.owner)) {
      results.push({
        type: "orphaned_owner_ref",
        severity: "error",
        entity: sys.name,
        entityKind: "system",
        message: `References owner "${sys.owner}" which does not exist`,
      });
    }
  }
  return results;
}

export function findMissingOwners(services: Service[]): LintResult[] {
  return services
    .filter((s) => !s.owner)
    .map((s) => ({
      type: "missing_owner",
      severity: "warning" as Severity,
      entity: s.name,
      entityKind: "service",
      message: "Has no owner assigned",
      fix: `yp service add --name ${s.name} --owner <owner>`,
    }));
}

export function findDanglingDeps(
  services: Service[],
  serviceIds: Set<string>,
): LintResult[] {
  const results: LintResult[] = [];
  for (const s of services) {
    for (const dep of s.dependsOn ?? []) {
      if (!serviceIds.has(dep.service)) {
        results.push({
          type: "dangling_dependency",
          severity: "error",
          entity: s.name,
          entityKind: "service",
          message: `Depends on "${dep.service}" which does not exist`,
        });
      }
    }
  }
  return results;
}

export function findCircularDeps(services: Service[]): LintResult[] {
  const results: LintResult[] = [];
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const reported = new Set<string>();

  // DFS cycle detection: for each service, walk its dependency tree
  // and track the current path (ancestors). A cycle exists only when
  // we encounter a node that is already on the current path.
  for (const service of services) {
    const ancestors = new Set<string>();

    function walk(id: string): void {
      if (ancestors.has(id)) {
        // Found a cycle back to `service`
        const key = [service.id, id].sort().join(":");
        if (!reported.has(key)) {
          reported.add(key);
          const target = serviceMap.get(id);
          results.push({
            type: "circular_dependency",
            severity: "error",
            entity: service.name,
            entityKind: "service",
            message: `Circular dependency detected: ${service.name} ↔ ${target?.name ?? id}`,
          });
        }
        return;
      }
      ancestors.add(id);
      const s = serviceMap.get(id);
      for (const dep of s?.dependsOn ?? []) {
        walk(dep.service);
      }
      ancestors.delete(id);
    }

    // Start walking from each direct dependency
    ancestors.add(service.id);
    const s = serviceMap.get(service.id);
    for (const dep of s?.dependsOn ?? []) {
      walk(dep.service);
    }
  }
  return results;
}

export function findDuplicateNames(
  services: Service[],
  systems: System[],
  owners: Owner[],
): LintResult[] {
  const results: LintResult[] = [];
  const check = (items: { name: string }[], kind: string) => {
    const seen = new Map<string, number>();
    for (const item of items) {
      const lower = item.name.toLowerCase();
      seen.set(lower, (seen.get(lower) ?? 0) + 1);
    }
    for (const [name, count] of seen) {
      if (count > 1) {
        results.push({
          type: "duplicate_name",
          severity: "error",
          entity: name,
          entityKind: kind,
          message: `${count} ${kind}s share the name "${name}"`,
        });
      }
    }
  };

  check(services, "service");
  check(systems, "system");
  check(owners, "owner");
  return results;
}

export function findEmptySystems(
  systems: System[],
  services: Service[],
): LintResult[] {
  return systems
    .filter((sys) => !services.some((s) => s.system === sys.id))
    .map((sys) => ({
      type: "empty_system",
      severity: "warning" as Severity,
      entity: sys.name,
      entityKind: "system",
      message: "System has no services",
    }));
}

/**
 * Run all lint checks against provided catalog data.
 * Pure function — no I/O, no process.exit.
 */
export function runLintChecks(
  services: Service[],
  systems: System[],
  owners: Owner[],
): LintResult[] {
  const serviceIds = new Set(services.map((s) => s.id));
  const systemIds = new Set(systems.map((s) => s.id));
  const ownerIds = new Set(owners.map((o) => o.id));

  return [
    ...findOrphanedSystemRefs(services, systemIds),
    ...findOrphanedOwnerRefs(services, systems, ownerIds),
    ...findMissingOwners(services),
    ...findDanglingDeps(services, serviceIds),
    ...findCircularDeps(services),
    ...findDuplicateNames(services, systems, owners),
    ...findEmptySystems(systems, services),
  ];
}

export async function lint(
  _args: string[],
  options: OutputOptions,
): Promise<void> {
  const root = requireRoot();

  const services = readAll<Service>(root, "services");
  const systems = readAll<System>(root, "systems");
  const owners = readAll<Owner>(root, "owners");

  const results = runLintChecks(services, systems, owners);
  const errors = results.filter((r) => r.severity === "error");
  const warnings = results.filter((r) => r.severity === "warning");

  output(options, {
    json: () => ({
      success: errors.length === 0,
      errors: errors.length,
      warnings: warnings.length,
      results,
    }),
    human: () => {
      if (results.length === 0) {
        success("Catalog is clean — no issues found");
        console.log(
          dim(
            `  Checked ${services.length} services, ${systems.length} systems, ${owners.length} owners`,
          ),
        );
        return;
      }

      if (errors.length > 0) {
        console.log();
        console.log(bold("Errors"));
        for (const r of errors) {
          error(`${r.entityKind}/${r.entity}: ${r.message}`);
          if (r.fix) console.log(dim(`    Fix: ${r.fix}`));
        }
      }

      if (warnings.length > 0) {
        console.log();
        console.log(bold("Warnings"));
        for (const r of warnings) {
          warn(`${r.entityKind}/${r.entity}: ${r.message}`);
          if (r.fix) console.log(dim(`    Fix: ${r.fix}`));
        }
      }

      console.log();
      const summary = [];
      if (errors.length > 0) summary.push(`${errors.length} error(s)`);
      if (warnings.length > 0) summary.push(`${warnings.length} warning(s)`);
      info(summary.join(", "));
    },
  });

  if (errors.length > 0) {
    process.exit(1);
  }
}
