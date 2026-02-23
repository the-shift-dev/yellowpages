import { describe, expect, test } from "bun:test";
import type { Owner, Service, System } from "../types.js";
import {
  findCircularDeps,
  findDanglingDeps,
  findDuplicateNames,
  findEmptySystems,
  findMissingOwners,
  findOrphanedOwnerRefs,
  findOrphanedSystemRefs,
  runLintChecks,
} from "./lint.js";

// --- Helpers ---

function makeService(overrides: Partial<Service> & { id: string; name: string }): Service {
  return {
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeSystem(overrides: Partial<System> & { id: string; name: string }): System {
  return {
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeOwner(overrides: Partial<Owner> & { id: string; name: string }): Owner {
  return {
    type: "team",
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

// --- Orphaned system refs ---

describe("findOrphanedSystemRefs", () => {
  test("no issues when system exists", () => {
    const services = [makeService({ id: "s1", name: "svc-a", system: "sys1" })];
    const systemIds = new Set(["sys1"]);
    expect(findOrphanedSystemRefs(services, systemIds)).toEqual([]);
  });

  test("no issues when service has no system", () => {
    const services = [makeService({ id: "s1", name: "svc-a" })];
    expect(findOrphanedSystemRefs(services, new Set())).toEqual([]);
  });

  test("error when system ID does not exist", () => {
    const services = [makeService({ id: "s1", name: "svc-a", system: "ghost" })];
    const results = findOrphanedSystemRefs(services, new Set());
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("orphaned_system_ref");
    expect(results[0].severity).toBe("error");
    expect(results[0].entity).toBe("svc-a");
  });
});

// --- Orphaned owner refs ---

describe("findOrphanedOwnerRefs", () => {
  test("no issues when owner exists", () => {
    const services = [makeService({ id: "s1", name: "svc-a", owner: "o1" })];
    const systems = [makeSystem({ id: "sys1", name: "sys-a", owner: "o1" })];
    const ownerIds = new Set(["o1"]);
    expect(findOrphanedOwnerRefs(services, systems, ownerIds)).toEqual([]);
  });

  test("error when service references non-existent owner", () => {
    const services = [makeService({ id: "s1", name: "svc-a", owner: "ghost" })];
    const results = findOrphanedOwnerRefs(services, [], new Set());
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("orphaned_owner_ref");
    expect(results[0].entityKind).toBe("service");
  });

  test("error when system references non-existent owner", () => {
    const systems = [makeSystem({ id: "sys1", name: "sys-a", owner: "ghost" })];
    const results = findOrphanedOwnerRefs([], systems, new Set());
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("orphaned_owner_ref");
    expect(results[0].entityKind).toBe("system");
  });

  test("no issues when owner field is unset", () => {
    const services = [makeService({ id: "s1", name: "svc-a" })];
    const systems = [makeSystem({ id: "sys1", name: "sys-a" })];
    expect(findOrphanedOwnerRefs(services, systems, new Set())).toEqual([]);
  });
});

// --- Missing owners ---

describe("findMissingOwners", () => {
  test("warning when service has no owner", () => {
    const services = [makeService({ id: "s1", name: "svc-a" })];
    const results = findMissingOwners(services);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("missing_owner");
    expect(results[0].severity).toBe("warning");
  });

  test("no issues when service has owner", () => {
    const services = [makeService({ id: "s1", name: "svc-a", owner: "o1" })];
    expect(findMissingOwners(services)).toEqual([]);
  });

  test("multiple services without owners", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a" }),
      makeService({ id: "s2", name: "svc-b" }),
      makeService({ id: "s3", name: "svc-c", owner: "o1" }),
    ];
    expect(findMissingOwners(services)).toHaveLength(2);
  });
});

// --- Dangling dependencies ---

describe("findDanglingDeps", () => {
  test("no issues when dependency exists", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s2" }] }),
      makeService({ id: "s2", name: "svc-b" }),
    ];
    const serviceIds = new Set(["s1", "s2"]);
    expect(findDanglingDeps(services, serviceIds)).toEqual([]);
  });

  test("error when dependency does not exist", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "ghost" }] }),
    ];
    const results = findDanglingDeps(services, new Set(["s1"]));
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("dangling_dependency");
    expect(results[0].severity).toBe("error");
    expect(results[0].message).toContain("ghost");
  });

  test("no issues when service has no dependencies", () => {
    const services = [makeService({ id: "s1", name: "svc-a" })];
    expect(findDanglingDeps(services, new Set(["s1"]))).toEqual([]);
  });

  test("multiple dangling deps on one service", () => {
    const services = [
      makeService({
        id: "s1",
        name: "svc-a",
        dependsOn: [{ service: "ghost1" }, { service: "ghost2" }],
      }),
    ];
    expect(findDanglingDeps(services, new Set(["s1"]))).toHaveLength(2);
  });
});

// --- Circular dependencies ---

describe("findCircularDeps", () => {
  test("no issues with no deps", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a" }),
      makeService({ id: "s2", name: "svc-b" }),
    ];
    expect(findCircularDeps(services)).toEqual([]);
  });

  test("no issues with linear deps", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s2" }] }),
      makeService({ id: "s2", name: "svc-b", dependsOn: [{ service: "s3" }] }),
      makeService({ id: "s3", name: "svc-c" }),
    ];
    expect(findCircularDeps(services)).toEqual([]);
  });

  test("detects direct circular dep (A → B → A)", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s2" }] }),
      makeService({ id: "s2", name: "svc-b", dependsOn: [{ service: "s1" }] }),
    ];
    const results = findCircularDeps(services);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("circular_dependency");
    expect(results[0].severity).toBe("error");
  });

  test("detects indirect circular dep (A → B → C → A)", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s2" }] }),
      makeService({ id: "s2", name: "svc-b", dependsOn: [{ service: "s3" }] }),
      makeService({ id: "s3", name: "svc-c", dependsOn: [{ service: "s1" }] }),
    ];
    const results = findCircularDeps(services);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.type === "circular_dependency")).toBe(true);
  });

  test("detects self-dependency", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s1" }] }),
    ];
    const results = findCircularDeps(services);
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].type).toBe("circular_dependency");
  });

  test("handles diamond deps without false positives", () => {
    // A → B, A → C, B → D, C → D (diamond, no cycle)
    const services = [
      makeService({ id: "s1", name: "a", dependsOn: [{ service: "s2" }, { service: "s3" }] }),
      makeService({ id: "s2", name: "b", dependsOn: [{ service: "s4" }] }),
      makeService({ id: "s3", name: "c", dependsOn: [{ service: "s4" }] }),
      makeService({ id: "s4", name: "d" }),
    ];
    const results = findCircularDeps(services);
    expect(results).toEqual([]);
  });

  test("does not duplicate reports for same cycle", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a", dependsOn: [{ service: "s2" }] }),
      makeService({ id: "s2", name: "svc-b", dependsOn: [{ service: "s1" }] }),
    ];
    const results = findCircularDeps(services);
    // Should report at most once per pair
    const keys = results.map((r) => r.entity).sort();
    const unique = [...new Set(keys)];
    expect(unique.length).toBe(keys.length);
  });
});

// --- Duplicate names ---

describe("findDuplicateNames", () => {
  test("no issues with unique names", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a" }),
      makeService({ id: "s2", name: "svc-b" }),
    ];
    expect(findDuplicateNames(services, [], [])).toEqual([]);
  });

  test("error when two services share a name", () => {
    const services = [
      makeService({ id: "s1", name: "svc-a" }),
      makeService({ id: "s2", name: "svc-a" }),
    ];
    const results = findDuplicateNames(services, [], []);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("duplicate_name");
    expect(results[0].entityKind).toBe("service");
    expect(results[0].message).toContain("2");
  });

  test("case-insensitive duplicate detection", () => {
    const services = [
      makeService({ id: "s1", name: "Auth-Service" }),
      makeService({ id: "s2", name: "auth-service" }),
    ];
    const results = findDuplicateNames(services, [], []);
    expect(results).toHaveLength(1);
  });

  test("detects duplicates in systems", () => {
    const systems = [
      makeSystem({ id: "sys1", name: "payments" }),
      makeSystem({ id: "sys2", name: "payments" }),
    ];
    const results = findDuplicateNames([], systems, []);
    expect(results).toHaveLength(1);
    expect(results[0].entityKind).toBe("system");
  });

  test("detects duplicates in owners", () => {
    const owners = [
      makeOwner({ id: "o1", name: "platform" }),
      makeOwner({ id: "o2", name: "Platform" }),
    ];
    const results = findDuplicateNames([], [], owners);
    expect(results).toHaveLength(1);
    expect(results[0].entityKind).toBe("owner");
  });

  test("duplicates across different kinds are independent", () => {
    const services = [makeService({ id: "s1", name: "payments" })];
    const systems = [makeSystem({ id: "sys1", name: "payments" })];
    // Same name in different collections is fine
    expect(findDuplicateNames(services, systems, [])).toEqual([]);
  });
});

// --- Empty systems ---

describe("findEmptySystems", () => {
  test("warning when system has no services", () => {
    const systems = [makeSystem({ id: "sys1", name: "payments" })];
    const results = findEmptySystems(systems, []);
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("empty_system");
    expect(results[0].severity).toBe("warning");
  });

  test("no issues when system has services", () => {
    const systems = [makeSystem({ id: "sys1", name: "payments" })];
    const services = [makeService({ id: "s1", name: "svc-a", system: "sys1" })];
    expect(findEmptySystems(systems, services)).toEqual([]);
  });

  test("only flags systems with zero services", () => {
    const systems = [
      makeSystem({ id: "sys1", name: "payments" }),
      makeSystem({ id: "sys2", name: "identity" }),
    ];
    const services = [makeService({ id: "s1", name: "svc-a", system: "sys1" })];
    const results = findEmptySystems(systems, services);
    expect(results).toHaveLength(1);
    expect(results[0].entity).toBe("identity");
  });
});

// --- runLintChecks (orchestrator) ---

describe("runLintChecks", () => {
  test("returns empty array for clean catalog", () => {
    const owner = makeOwner({ id: "o1", name: "platform" });
    const system = makeSystem({ id: "sys1", name: "payments", owner: "o1" });
    const service = makeService({
      id: "s1", name: "checkout", owner: "o1", system: "sys1",
      dependsOn: [],
    });
    const results = runLintChecks([service], [system], [owner]);
    expect(results).toEqual([]);
  });

  test("aggregates errors and warnings from all checks", () => {
    // service with no owner (warning) + dangling dep (error) + empty system (warning)
    const system = makeSystem({ id: "sys1", name: "empty-sys" });
    const service = makeService({
      id: "s1", name: "broken-svc",
      dependsOn: [{ service: "ghost" }],
    });
    const results = runLintChecks([service], [system], []);
    const errors = results.filter((r) => r.severity === "error");
    const warnings = results.filter((r) => r.severity === "warning");
    expect(errors.length).toBeGreaterThanOrEqual(1);
    expect(warnings.length).toBeGreaterThanOrEqual(1);
    expect(results.some((r) => r.type === "dangling_dependency")).toBe(true);
    expect(results.some((r) => r.type === "missing_owner")).toBe(true);
    expect(results.some((r) => r.type === "empty_system")).toBe(true);
  });

  test("catches all issue types in one pass", () => {
    const owner = makeOwner({ id: "o1", name: "team-a" });
    const services = [
      // orphaned system ref
      makeService({ id: "s1", name: "svc-a", system: "ghost-sys", owner: "o1" }),
      // orphaned owner ref
      makeService({ id: "s2", name: "svc-b", owner: "ghost-owner" }),
      // circular dep
      makeService({ id: "s3", name: "svc-c", owner: "o1", dependsOn: [{ service: "s4" }] }),
      makeService({ id: "s4", name: "svc-d", owner: "o1", dependsOn: [{ service: "s3" }] }),
      // duplicate name
      makeService({ id: "s5", name: "svc-c", owner: "o1" }),
    ];
    const results = runLintChecks(services, [], [owner]);
    const types = new Set(results.map((r) => r.type));
    expect(types.has("orphaned_system_ref")).toBe(true);
    expect(types.has("orphaned_owner_ref")).toBe(true);
    expect(types.has("circular_dependency")).toBe(true);
    expect(types.has("duplicate_name")).toBe(true);
  });
});
