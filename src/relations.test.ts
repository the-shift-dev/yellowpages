import { describe, expect, test } from "bun:test";
import type { CatalogData } from "./relations.js";
import {
  filterServices,
  resolveOwner,
  resolveService,
  resolveSystem,
} from "./relations.js";
import type { Owner, Service, System } from "./types.js";

function makeCatalog(): CatalogData {
  const owners: Owner[] = [
    { id: "o1", name: "platform", type: "team", created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
    { id: "o2", name: "auth-team", type: "team", created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
  ];
  const systems: System[] = [
    { id: "sys1", name: "payments", owner: "o1", created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
    { id: "sys2", name: "identity", owner: "o2", created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
  ];
  const services: Service[] = [
    { id: "s1", name: "checkout", system: "sys1", owner: "o1", lifecycle: "production", tags: ["backend"], dependsOn: [{ service: "s2", api: "OAuth" }], created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
    { id: "s2", name: "auth", system: "sys2", owner: "o2", lifecycle: "production", tags: ["backend", "critical"], dependsOn: [], created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
    { id: "s3", name: "admin-ui", owner: "o1", lifecycle: "experimental", tags: ["frontend"], dependsOn: [{ service: "s1" }, { service: "s2" }], created: "2026-01-01T00:00:00Z", updated: "2026-01-01T00:00:00Z" },
  ];
  return { services, systems, owners };
}

describe("resolveService", () => {
  const catalog = makeCatalog();

  test("resolves owner, system, and dependents", () => {
    const resolved = resolveService("s1", catalog);
    expect(resolved).not.toBeNull();
    expect(resolved!.service.name).toBe("checkout");
    expect(resolved!.owner?.name).toBe("platform");
    expect(resolved!.system?.name).toBe("payments");
    // admin-ui depends on checkout
    expect(resolved!.dependents).toHaveLength(1);
    expect(resolved!.dependents[0].service.name).toBe("admin-ui");
  });

  test("resolves service with multiple dependents", () => {
    const resolved = resolveService("s2", catalog);
    // checkout and admin-ui both depend on auth
    expect(resolved!.dependents).toHaveLength(2);
  });

  test("preserves api info in dependents", () => {
    const resolved = resolveService("s2", catalog);
    const fromCheckout = resolved!.dependents.find((d) => d.service.name === "checkout");
    expect(fromCheckout?.api).toBe("OAuth");
  });

  test("returns null for unknown service", () => {
    expect(resolveService("ghost", catalog)).toBeNull();
  });

  test("handles service with no owner/system", () => {
    const resolved = resolveService("s3", catalog);
    expect(resolved!.system).toBeNull();
  });
});

describe("resolveSystem", () => {
  const catalog = makeCatalog();

  test("resolves owner and services", () => {
    const resolved = resolveSystem("sys1", catalog);
    expect(resolved).not.toBeNull();
    expect(resolved!.system.name).toBe("payments");
    expect(resolved!.owner?.name).toBe("platform");
    expect(resolved!.services).toHaveLength(1);
    expect(resolved!.services[0].name).toBe("checkout");
  });

  test("returns null for unknown system", () => {
    expect(resolveSystem("ghost", catalog)).toBeNull();
  });
});

describe("resolveOwner", () => {
  const catalog = makeCatalog();

  test("resolves services and systems", () => {
    const resolved = resolveOwner("o1", catalog);
    expect(resolved).not.toBeNull();
    expect(resolved!.owner.name).toBe("platform");
    expect(resolved!.services).toHaveLength(2); // checkout + admin-ui
    expect(resolved!.systems).toHaveLength(1); // payments
  });

  test("returns null for unknown owner", () => {
    expect(resolveOwner("ghost", catalog)).toBeNull();
  });
});

describe("filterServices", () => {
  const catalog = makeCatalog();

  test("filter by system", () => {
    const result = filterServices(catalog, { systemId: "sys1" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("checkout");
  });

  test("filter by owner", () => {
    const result = filterServices(catalog, { ownerId: "o1" });
    expect(result).toHaveLength(2);
  });

  test("filter by lifecycle", () => {
    const result = filterServices(catalog, { lifecycle: "experimental" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("admin-ui");
  });

  test("filter by tag", () => {
    const result = filterServices(catalog, { tag: "critical" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("auth");
  });

  test("multiple filters combine", () => {
    const result = filterServices(catalog, { ownerId: "o1", lifecycle: "production" });
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("checkout");
  });

  test("no filters returns all", () => {
    const result = filterServices(catalog, {});
    expect(result).toHaveLength(3);
  });
});
