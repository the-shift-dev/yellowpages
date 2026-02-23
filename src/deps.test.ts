import { describe, expect, test } from "bun:test";
import type { Service } from "./types.js";
import {
  buildReverseIndex,
  findOrphans,
  resolveDeps,
  walkDown,
  walkUp,
} from "./deps.js";

function makeService(
  overrides: Partial<Service> & { id: string; name: string },
): Service {
  return {
    created: "2026-01-01T00:00:00Z",
    updated: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const services = [
  makeService({
    id: "gw",
    name: "gateway",
    dependsOn: [
      { service: "auth", api: "OAuth" },
      { service: "payments", api: "Checkout API" },
    ],
  }),
  makeService({
    id: "auth",
    name: "auth",
  }),
  makeService({
    id: "payments",
    name: "payments",
    dependsOn: [
      { service: "stripe", description: "Processes events" },
      { service: "auth", api: "Service tokens" },
    ],
  }),
  makeService({ id: "stripe", name: "stripe-webhook" }),
  makeService({ id: "notifications", name: "notifications" }),
];

const serviceMap = new Map(services.map((s) => [s.id, s]));

// --- buildReverseIndex ---

describe("buildReverseIndex", () => {
  test("builds correct reverse mapping", () => {
    const reverse = buildReverseIndex(services);
    // auth is depended on by gateway and payments
    expect(reverse.get("auth")).toHaveLength(2);
    // payments is depended on by gateway
    expect(reverse.get("payments")).toHaveLength(1);
    // stripe is depended on by payments
    expect(reverse.get("stripe")).toHaveLength(1);
    // gateway and notifications have no dependents
    expect(reverse.get("gw")).toBeUndefined();
    expect(reverse.get("notifications")).toBeUndefined();
  });

  test("preserves api and description", () => {
    const reverse = buildReverseIndex(services);
    const authDeps = reverse.get("auth")!;
    const fromGateway = authDeps.find((d) => d.service.id === "gw");
    expect(fromGateway?.api).toBe("OAuth");
    const fromPayments = authDeps.find((d) => d.service.id === "payments");
    expect(fromPayments?.api).toBe("Service tokens");
  });

  test("handles empty services", () => {
    expect(buildReverseIndex([])).toEqual(new Map());
  });
});

// --- walkDown ---

describe("walkDown", () => {
  test("walks one level by default depth 1", () => {
    const nodes = walkDown("gw", serviceMap, 1);
    expect(nodes).toHaveLength(2);
    expect(nodes[0].name).toBe("auth");
    expect(nodes[0].api).toBe("OAuth");
    expect(nodes[1].name).toBe("payments");
    // depth 1 means no children
    expect(nodes[0].children).toEqual([]);
    expect(nodes[1].children).toEqual([]);
  });

  test("walks multiple levels", () => {
    const nodes = walkDown("gw", serviceMap, 10);
    expect(nodes).toHaveLength(2);
    // payments should have children (stripe, auth)
    const payments = nodes.find((n) => n.name === "payments");
    expect(payments?.children).toHaveLength(2);
  });

  test("handles cycles without infinite loop", () => {
    const cyclicServices = [
      makeService({ id: "a", name: "a", dependsOn: [{ service: "b" }] }),
      makeService({ id: "b", name: "b", dependsOn: [{ service: "a" }] }),
    ];
    const map = new Map(cyclicServices.map((s) => [s.id, s]));
    // Should terminate and not throw — that's the test
    const nodes = walkDown("a", map, 10);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("b");
    // b's child (a) may or may not appear depending on visit order,
    // but the key assertion is: this terminates
  });

  test("returns empty for service with no deps", () => {
    expect(walkDown("auth", serviceMap, 10)).toEqual([]);
  });

  test("returns empty for unknown service", () => {
    expect(walkDown("ghost", serviceMap, 10)).toEqual([]);
  });
});

// --- walkUp ---

describe("walkUp", () => {
  const reverseIndex = buildReverseIndex(services);

  test("finds direct dependents", () => {
    const nodes = walkUp("auth", reverseIndex, 1);
    expect(nodes).toHaveLength(2);
    const names = nodes.map((n) => n.name).sort();
    expect(names).toEqual(["gateway", "payments"]);
  });

  test("walks multiple levels up", () => {
    // stripe-webhook ← payments ← gateway
    const nodes = walkUp("stripe", reverseIndex, 10);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("payments");
    expect(nodes[0].children).toHaveLength(1);
    expect(nodes[0].children[0].name).toBe("gateway");
  });

  test("handles cycles without infinite loop", () => {
    const cyclicServices = [
      makeService({ id: "a", name: "a", dependsOn: [{ service: "b" }] }),
      makeService({ id: "b", name: "b", dependsOn: [{ service: "a" }] }),
    ];
    const rev = buildReverseIndex(cyclicServices);
    // Should terminate and not throw
    const nodes = walkUp("a", rev, 10);
    expect(nodes).toHaveLength(1);
    expect(nodes[0].name).toBe("b");
  });

  test("returns empty for service with no dependents", () => {
    expect(walkUp("gw", reverseIndex, 10)).toEqual([]);
  });

  test("returns empty for unknown service", () => {
    expect(walkUp("ghost", reverseIndex, 10)).toEqual([]);
  });
});

// --- findOrphans ---

describe("findOrphans", () => {
  test("finds isolated services", () => {
    const orphans = findOrphans(services);
    expect(orphans).toHaveLength(1);
    expect(orphans[0].name).toBe("notifications");
  });

  test("returns empty when all connected", () => {
    const connected = services.filter((s) => s.name !== "notifications");
    expect(findOrphans(connected)).toEqual([]);
  });

  test("all orphans when no deps", () => {
    const isolated = [
      makeService({ id: "a", name: "a" }),
      makeService({ id: "b", name: "b" }),
    ];
    expect(findOrphans(isolated)).toHaveLength(2);
  });
});

// --- resolveDeps ---

describe("resolveDeps", () => {
  test("returns both directions by default", () => {
    const result = resolveDeps("payments", services, 10);
    expect(result.service.name).toBe("payments");
    expect(result.dependents.length).toBeGreaterThan(0);
    expect(result.dependencies.length).toBeGreaterThan(0);
  });

  test("direction up returns only dependents", () => {
    const result = resolveDeps("payments", services, 10, "up");
    expect(result.dependents.length).toBeGreaterThan(0);
    expect(result.dependencies).toEqual([]);
  });

  test("direction down returns only dependencies", () => {
    const result = resolveDeps("payments", services, 10, "down");
    expect(result.dependents).toEqual([]);
    expect(result.dependencies.length).toBeGreaterThan(0);
  });

  test("respects depth limit", () => {
    // gateway → payments → stripe-webhook, depth 1 should not reach stripe
    const result = resolveDeps("gw", services, 1, "down");
    const payments = result.dependencies.find((n) => n.name === "payments");
    expect(payments?.children).toEqual([]);
  });

  test("handles unknown service gracefully", () => {
    const result = resolveDeps("ghost", services, 10);
    expect(result.service.name).toBe("ghost");
    expect(result.dependents).toEqual([]);
    expect(result.dependencies).toEqual([]);
  });
});
