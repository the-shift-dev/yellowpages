import { readAll } from "./store.js";
import type { Owner, Service, System } from "./types.js";

/**
 * Load and cross-reference the entire catalog.
 * This is the single place where relations are stitched together.
 */
export interface CatalogData {
  services: Service[];
  systems: System[];
  owners: Owner[];
}

export interface ResolvedService {
  service: Service;
  owner: Owner | null;
  system: System | null;
  dependents: { service: Service; api?: string; description?: string }[];
}

export interface ResolvedSystem {
  system: System;
  owner: Owner | null;
  services: Service[];
}

export interface ResolvedOwner {
  owner: Owner;
  services: Service[];
  systems: System[];
}

/**
 * Load the full catalog from disk.
 */
export function loadCatalog(root: string): CatalogData {
  return {
    services: readAll<Service>(root, "services"),
    systems: readAll<System>(root, "systems"),
    owners: readAll<Owner>(root, "owners"),
  };
}

/**
 * Resolve all relations for a service.
 */
export function resolveService(
  serviceId: string,
  catalog: CatalogData,
): ResolvedService | null {
  const service = catalog.services.find((s) => s.id === serviceId);
  if (!service) return null;

  return {
    service,
    owner: service.owner
      ? (catalog.owners.find((o) => o.id === service.owner) ?? null)
      : null,
    system: service.system
      ? (catalog.systems.find((s) => s.id === service.system) ?? null)
      : null,
    dependents: catalog.services
      .filter((s) => (s.dependsOn ?? []).some((d) => d.service === serviceId))
      .map((s) => {
        const dep = s.dependsOn?.find((d) => d.service === serviceId);
        if (!dep) return null;
        return { service: s, api: dep.api, description: dep.description };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null),
  };
}

/**
 * Resolve all relations for a system.
 */
export function resolveSystem(
  systemId: string,
  catalog: CatalogData,
): ResolvedSystem | null {
  const system = catalog.systems.find((s) => s.id === systemId);
  if (!system) return null;

  return {
    system,
    owner: system.owner
      ? (catalog.owners.find((o) => o.id === system.owner) ?? null)
      : null,
    services: catalog.services.filter((s) => s.system === systemId),
  };
}

/**
 * Resolve all relations for an owner.
 */
export function resolveOwner(
  ownerId: string,
  catalog: CatalogData,
): ResolvedOwner | null {
  const owner = catalog.owners.find((o) => o.id === ownerId);
  if (!owner) return null;

  return {
    owner,
    services: catalog.services.filter((s) => s.owner === ownerId),
    systems: catalog.systems.filter((s) => s.owner === ownerId),
  };
}

/**
 * Get services filtered by various criteria.
 */
export function filterServices(
  catalog: CatalogData,
  filters: {
    systemId?: string;
    ownerId?: string;
    lifecycle?: string;
    tag?: string;
  },
): Service[] {
  let services = catalog.services;
  if (filters.systemId) {
    services = services.filter((s) => s.system === filters.systemId);
  }
  if (filters.ownerId) {
    services = services.filter((s) => s.owner === filters.ownerId);
  }
  if (filters.lifecycle) {
    services = services.filter((s) => s.lifecycle === filters.lifecycle);
  }
  if (filters.tag) {
    services = services.filter((s) => s.tags?.includes(filters.tag as string));
  }
  return services;
}
