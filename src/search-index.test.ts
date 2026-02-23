import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSearchIndex, parseDocId } from "./search-index";
import { initStore, writeRecord } from "./store";
import type { Owner, Service, System } from "./types";

const TEST_DIR = join(import.meta.dir, "..", ".test-search-tmp");

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  process.chdir(TEST_DIR);
  initStore();
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseDocId", () => {
  test("parses service:abc123", () => {
    expect(parseDocId("service:abc123")).toEqual({ kind: "service", id: "abc123" });
  });

  test("parses system:xyz", () => {
    expect(parseDocId("system:xyz")).toEqual({ kind: "system", id: "xyz" });
  });

  test("parses owner:o1", () => {
    expect(parseDocId("owner:o1")).toEqual({ kind: "owner", id: "o1" });
  });
});

describe("getSearchIndex", () => {
  test("indexes services by name", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "checkout-api",
      description: "Handles checkout",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("checkout");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("service:s1");
  });

  test("indexes services by description", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "payment-svc",
      description: "Processes payments via Stripe",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("stripe");
    expect(results.length).toBe(1);
  });

  test("indexes services by tags", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "my-service",
      tags: ["backend", "critical"],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("critical");
    expect(results.length).toBe(1);
  });

  test("indexes services by API names", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "gateway",
      apis: [{ name: "Admin gRPC API", type: "grpc", description: "Internal admin endpoints" }],
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("grpc");
    expect(results.length).toBe(1);
  });

  test("indexes systems", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<System>(root, "systems", {
      id: "sys1",
      name: "payments",
      description: "Everything money-related",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("money");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("system:sys1");
  });

  test("indexes owners", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Owner>(root, "owners", {
      id: "o1",
      name: "platform-team",
      type: "team",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    const index = getSearchIndex(root);
    const results = index.search("platform");
    expect(results.length).toBe(1);
    expect(results[0].id).toBe("owner:o1");
  });

  test("returns cached index when catalog unchanged", () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "my-service",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    // Build index
    const index1 = getSearchIndex(root);
    expect(index1.search("my-service").length).toBe(1);

    // Second call should use cache
    const index2 = getSearchIndex(root);
    expect(index2.search("my-service").length).toBe(1);
  });

  test("rebuilds index when catalog changes", async () => {
    const root = join(TEST_DIR, ".yellowpages");
    writeRecord<Service>(root, "services", {
      id: "s1",
      name: "checkout",
      description: "Handles checkout flow",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    // Build initial index
    const index1 = getSearchIndex(root);
    expect(index1.search("checkout").length).toBe(1);
    expect(index1.search("zebra").length).toBe(0);

    // Wait a tick so mtime changes (filesystem resolution)
    await new Promise((r) => setTimeout(r, 50));

    // Add a new service with a completely different name
    writeRecord<Service>(root, "services", {
      id: "s2",
      name: "zebra-processor",
      description: "Processes zebras",
      created: "2026-01-01T00:00:00Z",
      updated: "2026-01-01T00:00:00Z",
    });

    // Should rebuild and find the new service
    const index2 = getSearchIndex(root);
    expect(index2.search("zebra").length).toBe(1);
  });

  test("handles empty catalog", () => {
    const root = join(TEST_DIR, ".yellowpages");
    const index = getSearchIndex(root);
    expect(index.search("anything")).toEqual([]);
  });
});
