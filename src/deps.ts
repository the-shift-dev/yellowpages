import type { Service } from "./types.js";

export interface DepNode {
  id: string;
  name: string;
  api?: string;
  description?: string;
  children: DepNode[];
}

export interface DepsResult {
  service: { id: string; name: string };
  dependents: DepNode[];
  dependencies: DepNode[];
}

/**
 * Build a map of service ID → services that depend on it (reverse index).
 */
export function buildReverseIndex(
  services: Service[],
): Map<string, { service: Service; api?: string; description?: string }[]> {
  const reverse = new Map<
    string,
    { service: Service; api?: string; description?: string }[]
  >();

  for (const s of services) {
    for (const dep of s.dependsOn ?? []) {
      const list = reverse.get(dep.service) ?? [];
      list.push({ service: s, api: dep.api, description: dep.description });
      reverse.set(dep.service, list);
    }
  }
  return reverse;
}

/**
 * Walk dependency tree downward (what this service depends on).
 */
export function walkDown(
  serviceId: string,
  serviceMap: Map<string, Service>,
  maxDepth: number,
  visited?: Set<string>,
  depth?: number,
): DepNode[] {
  const d = depth ?? 0;
  const v = visited ?? new Set<string>();

  if (d >= maxDepth || v.has(serviceId)) return [];
  v.add(serviceId);

  const service = serviceMap.get(serviceId);
  if (!service) return [];

  return (service.dependsOn ?? []).map((dep) => {
    const target = serviceMap.get(dep.service);
    return {
      id: dep.service,
      name: target?.name ?? dep.service,
      api: dep.api,
      description: dep.description,
      children: walkDown(dep.service, serviceMap, maxDepth, v, d + 1),
    };
  });
}

/**
 * Walk dependency tree upward (what depends on this service).
 */
export function walkUp(
  serviceId: string,
  reverseIndex: Map<
    string,
    { service: Service; api?: string; description?: string }[]
  >,
  maxDepth: number,
  visited?: Set<string>,
  depth?: number,
): DepNode[] {
  const d = depth ?? 0;
  const v = visited ?? new Set<string>();

  if (d >= maxDepth || v.has(serviceId)) return [];
  v.add(serviceId);

  const dependents = reverseIndex.get(serviceId) ?? [];
  return dependents.map((dep) => ({
    id: dep.service.id,
    name: dep.service.name,
    api: dep.api,
    description: dep.description,
    children: walkUp(dep.service.id, reverseIndex, maxDepth, v, d + 1),
  }));
}

/**
 * Find services with no dependencies in or out (isolated).
 */
export function findOrphans(services: Service[]): Service[] {
  const reverseIndex = buildReverseIndex(services);
  return services.filter((s) => {
    const hasDepsDown = (s.dependsOn ?? []).length > 0;
    const hasDepsUp = (reverseIndex.get(s.id) ?? []).length > 0;
    return !hasDepsDown && !hasDepsUp;
  });
}

/**
 * Resolve full deps for a service (both directions).
 */
export function resolveDeps(
  serviceId: string,
  services: Service[],
  maxDepth: number,
  direction?: "up" | "down",
): DepsResult {
  const serviceMap = new Map(services.map((s) => [s.id, s]));
  const reverseIndex = buildReverseIndex(services);
  const service = serviceMap.get(serviceId);

  return {
    service: { id: serviceId, name: service?.name ?? serviceId },
    dependents:
      direction === "down" ? [] : walkUp(serviceId, reverseIndex, maxDepth),
    dependencies:
      direction === "up" ? [] : walkDown(serviceId, serviceMap, maxDepth),
  };
}
