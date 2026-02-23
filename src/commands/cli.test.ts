import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const TEST_DIR = join(import.meta.dir, "..", "..", ".test-cli-tmp");
const CLI = join(import.meta.dir, "..", "main.ts");

function run(...args: string[]) {
  const result = Bun.spawnSync(["bun", CLI, ...args], {
    cwd: TEST_DIR,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    stdout: result.stdout.toString().trim(),
    stderr: result.stderr.toString().trim(),
    exitCode: result.exitCode,
  };
}

function runJson(...args: string[]) {
  const { stdout, exitCode } = run("--json", ...args);
  try {
    return { data: JSON.parse(stdout), exitCode };
  } catch {
    return { data: null, exitCode, raw: stdout };
  }
}

beforeEach(() => {
  mkdirSync(TEST_DIR, { recursive: true });
  run("init");
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

// --- init ---

describe("init", () => {
  test("creates .yellowpages directory", () => {
    // Already called in beforeEach, verify idempotent
    const { data } = runJson("init");
    expect(data.success).toBe(true);
    expect(data.created).toBe(false);
  });
});

// --- owner ---

describe("owner", () => {
  test("add and list", () => {
    const { data: added } = runJson("owner", "add", "--name", "platform", "--type", "team");
    expect(added.success).toBe(true);
    expect(added.owner.name).toBe("platform");
    expect(added.owner.type).toBe("team");

    const { data: list } = runJson("owner", "list");
    expect(list.owners).toHaveLength(1);
    expect(list.owners[0].name).toBe("platform");
  });

  test("add with email and slack", () => {
    const { data } = runJson(
      "owner", "add", "--name", "infra", "--type", "team",
      "--email", "infra@co.com", "--slack", "#infra",
    );
    expect(data.owner.email).toBe("infra@co.com");
    expect(data.owner.slack).toBe("#infra");
  });

  test("show by name", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    const { data } = runJson("owner", "show", "platform");
    expect(data.owner.name).toBe("platform");
  });

  test("show returns services and systems owned", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    runJson("system", "add", "--name", "payments", "--owner", "platform");
    runJson("service", "add", "--name", "checkout", "--owner", "platform", "--system", "payments");

    const { data } = runJson("owner", "show", "platform");
    expect(data.services).toHaveLength(1);
    expect(data.systems).toHaveLength(1);
  });

  test("rm removes owner", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    const { data: removed } = runJson("owner", "rm", "platform");
    expect(removed.success).toBe(true);

    const { data: list } = runJson("owner", "list");
    expect(list.owners).toHaveLength(0);
  });

  test("rm nonexistent fails", () => {
    const { exitCode } = run("owner", "rm", "ghost");
    expect(exitCode).not.toBe(0);
  });

  test("list with --type filter", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    runJson("owner", "add", "--name", "alice", "--type", "person");

    const { data: teams } = runJson("owner", "list", "--type", "team");
    expect(teams.owners).toHaveLength(1);
    expect(teams.owners[0].name).toBe("platform");

    const { data: people } = runJson("owner", "list", "--type", "person");
    expect(people.owners).toHaveLength(1);
    expect(people.owners[0].name).toBe("alice");
  });
});

// --- system ---

describe("system", () => {
  test("add and list", () => {
    const { data: added } = runJson("system", "add", "--name", "payments");
    expect(added.success).toBe(true);

    const { data: list } = runJson("system", "list");
    expect(list.systems).toHaveLength(1);
    expect(list.systems[0].name).toBe("payments");
  });

  test("add with owner resolution by name", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    const { data } = runJson("system", "add", "--name", "payments", "--owner", "platform");
    expect(data.system.owner).toBeTruthy();
  });

  test("show includes services in system", () => {
    runJson("system", "add", "--name", "payments");
    runJson("service", "add", "--name", "checkout", "--system", "payments");
    runJson("service", "add", "--name", "invoicing", "--system", "payments");

    const { data } = runJson("system", "show", "payments");
    expect(data.system.name).toBe("payments");
    expect(data.services).toHaveLength(2);
  });

  test("rm removes system", () => {
    runJson("system", "add", "--name", "payments");
    const { data } = runJson("system", "rm", "payments");
    expect(data.success).toBe(true);

    const { data: list } = runJson("system", "list");
    expect(list.systems).toHaveLength(0);
  });
});

// --- service ---

describe("service", () => {
  test("add and list", () => {
    const { data: added } = runJson(
      "service", "add", "--name", "checkout-api",
      "--description", "Handles checkout",
      "--lifecycle", "production",
    );
    expect(added.success).toBe(true);
    expect(added.service.name).toBe("checkout-api");
    expect(added.service.lifecycle).toBe("production");

    const { data: list } = runJson("service", "list");
    expect(list.services).toHaveLength(1);
  });

  test("add with owner and system resolution", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    runJson("system", "add", "--name", "payments");
    const { data } = runJson(
      "service", "add", "--name", "checkout",
      "--owner", "platform", "--system", "payments",
    );
    expect(data.service.owner).toBeTruthy();
    expect(data.service.system).toBeTruthy();
  });

  test("add with tags", () => {
    const { data } = runJson(
      "service", "add", "--name", "svc", "--tag", "backend", "critical",
    );
    expect(data.service.tags).toEqual(["backend", "critical"]);
  });

  test("show by name", () => {
    runJson("service", "add", "--name", "checkout-api", "--description", "test");
    const { data } = runJson("service", "show", "checkout-api");
    expect(data.service.name).toBe("checkout-api");
    expect(data.service.description).toBe("test");
  });

  test("show resolves owner and system", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    runJson("system", "add", "--name", "payments");
    runJson("service", "add", "--name", "checkout", "--owner", "platform", "--system", "payments");

    const { data } = runJson("service", "show", "checkout");
    expect(data.owner.name).toBe("platform");
    expect(data.system.name).toBe("payments");
  });

  test("show nonexistent fails", () => {
    const { exitCode } = run("service", "show", "ghost");
    expect(exitCode).not.toBe(0);
  });

  test("rm removes service", () => {
    runJson("service", "add", "--name", "checkout");
    const { data } = runJson("service", "rm", "checkout");
    expect(data.success).toBe(true);

    const { data: list } = runJson("service", "list");
    expect(list.services).toHaveLength(0);
  });

  test("list filters by system", () => {
    runJson("system", "add", "--name", "payments");
    runJson("system", "add", "--name", "identity");
    runJson("service", "add", "--name", "checkout", "--system", "payments");
    runJson("service", "add", "--name", "auth", "--system", "identity");
    runJson("service", "add", "--name", "orphan");

    const { data } = runJson("service", "list", "--system", "payments");
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("checkout");
  });

  test("list filters by owner", () => {
    runJson("owner", "add", "--name", "team-a", "--type", "team");
    runJson("owner", "add", "--name", "team-b", "--type", "team");
    runJson("service", "add", "--name", "svc-a", "--owner", "team-a");
    runJson("service", "add", "--name", "svc-b", "--owner", "team-b");

    const { data } = runJson("service", "list", "--owner", "team-a");
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("svc-a");
  });

  test("list filters by lifecycle", () => {
    runJson("service", "add", "--name", "old", "--lifecycle", "deprecated");
    runJson("service", "add", "--name", "new", "--lifecycle", "production");

    const { data } = runJson("service", "list", "--lifecycle", "deprecated");
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("old");
  });

  test("list filters by tag", () => {
    runJson("service", "add", "--name", "svc-a", "--tag", "backend");
    runJson("service", "add", "--name", "svc-b", "--tag", "frontend");

    const { data } = runJson("service", "list", "--tag", "backend");
    expect(data.services).toHaveLength(1);
    expect(data.services[0].name).toBe("svc-a");
  });

  test("api-add adds API to service", () => {
    runJson("service", "add", "--name", "checkout");
    const { data } = runJson(
      "service", "api-add", "checkout",
      "--name", "REST API", "--type", "rest",
      "--description", "Public endpoints",
    );
    expect(data.success).toBe(true);
    expect(data.service.apis).toHaveLength(1);
    expect(data.service.apis[0].name).toBe("REST API");
    expect(data.service.apis[0].type).toBe("rest");
  });

  test("api-add to nonexistent service fails", () => {
    const { exitCode } = run("service", "api-add", "ghost", "--name", "x", "--type", "rest");
    expect(exitCode).not.toBe(0);
  });

  test("dep-add adds dependency", () => {
    runJson("service", "add", "--name", "checkout");
    runJson("service", "add", "--name", "payments");
    const { data } = runJson(
      "service", "dep-add", "checkout",
      "--on", "payments", "--description", "sends payments",
    );
    expect(data.success).toBe(true);
    expect(data.service.dependsOn).toHaveLength(1);
  });

  test("dep-add to nonexistent service fails", () => {
    const { exitCode } = run("service", "dep-add", "ghost", "--on", "whatever");
    expect(exitCode).not.toBe(0);
  });

  test("multiple APIs on same service", () => {
    runJson("service", "add", "--name", "gateway");
    runJson("service", "api-add", "gateway", "--name", "REST", "--type", "rest");
    runJson("service", "api-add", "gateway", "--name", "gRPC", "--type", "grpc");

    const { data } = runJson("service", "show", "gateway");
    expect(data.service.apis).toHaveLength(2);
  });

  test("multiple deps on same service", () => {
    runJson("service", "add", "--name", "gateway");
    runJson("service", "add", "--name", "auth");
    runJson("service", "add", "--name", "payments");
    runJson("service", "dep-add", "gateway", "--on", "auth");
    runJson("service", "dep-add", "gateway", "--on", "payments");

    const { data } = runJson("service", "show", "gateway");
    expect(data.service.dependsOn).toHaveLength(2);
  });
});

// --- search ---

describe("search", () => {
  test("finds service by name", () => {
    runJson("service", "add", "--name", "checkout-api", "--description", "Handles checkout");
    const { data } = runJson("search", "checkout");
    expect(data.count).toBe(1);
    expect(data.results[0].name).toBe("checkout-api");
  });

  test("finds service by description", () => {
    runJson("service", "add", "--name", "pay-svc", "--description", "Processes payments via Stripe");
    const { data } = runJson("search", "stripe");
    expect(data.count).toBe(1);
    expect(data.results[0].name).toBe("pay-svc");
  });

  test("finds system by name", () => {
    runJson("system", "add", "--name", "payments", "--description", "Money stuff");
    const { data } = runJson("search", "payments");
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.results.some((r: any) => r.kind === "system")).toBe(true);
  });

  test("--kind filters to specific entity type", () => {
    runJson("service", "add", "--name", "payments-svc");
    runJson("system", "add", "--name", "payments");
    const { data } = runJson("search", "payments", "--kind", "system");
    expect(data.results.every((r: any) => r.kind === "system")).toBe(true);
  });

  test("--unowned finds services without owner", () => {
    runJson("owner", "add", "--name", "team-a", "--type", "team");
    runJson("service", "add", "--name", "owned-svc", "--owner", "team-a");
    runJson("service", "add", "--name", "orphan-svc");
    const { data } = runJson("search", "--unowned");
    expect(data.count).toBe(1);
    expect(data.results[0].name).toBe("orphan-svc");
  });

  test("--lifecycle filters services", () => {
    runJson("service", "add", "--name", "old", "--lifecycle", "deprecated");
    runJson("service", "add", "--name", "new", "--lifecycle", "production");
    const { data } = runJson("search", "--lifecycle", "deprecated");
    expect(data.count).toBe(1);
    expect(data.results[0].name).toBe("old");
  });

  test("returns empty results for no match", () => {
    runJson("service", "add", "--name", "checkout");
    const { data } = runJson("search", "xyznonexistent");
    expect(data.count).toBe(0);
  });

  test("rebuilds index after adding new entity", () => {
    runJson("service", "add", "--name", "first-svc");
    runJson("search", "first"); // prime the index
    runJson("service", "add", "--name", "second-svc", "--description", "Brand new");
    const { data } = runJson("search", "brand new");
    expect(data.count).toBeGreaterThanOrEqual(1);
    expect(data.results.some((r: any) => r.name === "second-svc")).toBe(true);
  });
});

// --- lint integration ---

describe("lint", () => {
  test("clean catalog passes", () => {
    const { data, exitCode } = runJson("lint");
    expect(exitCode).toBe(0);
    expect(data.success).toBe(true);
    expect(data.errors).toBe(0);
    expect(data.warnings).toBe(0);
  });

  test("missing owner is a warning", () => {
    runJson("service", "add", "--name", "orphan");
    const { data, exitCode } = runJson("lint");
    expect(exitCode).toBe(0); // warnings don't fail
    expect(data.warnings).toBe(1);
    expect(data.results[0].type).toBe("missing_owner");
  });

  test("dangling dep is an error", () => {
    runJson("service", "add", "--name", "checkout");
    runJson("service", "dep-add", "checkout", "--on", "ghost-service");
    const { data, exitCode } = runJson("lint");
    expect(exitCode).toBe(1);
    expect(data.errors).toBeGreaterThanOrEqual(1);
    expect(data.results.some((r: any) => r.type === "dangling_dependency")).toBe(true);
  });

  test("orphaned owner ref is an error", () => {
    runJson("owner", "add", "--name", "platform", "--type", "team");
    runJson("service", "add", "--name", "checkout", "--owner", "platform");
    runJson("owner", "rm", "platform");
    const { data, exitCode } = runJson("lint");
    expect(exitCode).toBe(1);
    expect(data.results.some((r: any) => r.type === "orphaned_owner_ref")).toBe(true);
  });

  test("empty system is a warning", () => {
    runJson("system", "add", "--name", "empty-sys");
    const { data } = runJson("lint");
    expect(data.warnings).toBeGreaterThanOrEqual(1);
    expect(data.results.some((r: any) => r.type === "empty_system")).toBe(true);
  });
});

// --- deps ---

describe("deps", () => {
  test("shows both directions", () => {
    runJson("service", "add", "--name", "auth");
    runJson("service", "add", "--name", "gateway");
    runJson("service", "dep-add", "gateway", "--on", "auth", "--api", "OAuth");

    const { data } = runJson("deps", "auth");
    expect(data.dependents).toHaveLength(1);
    expect(data.dependents[0].name).toBe("gateway");
    expect(data.dependents[0].api).toBe("OAuth");
    expect(data.dependencies).toEqual([]);
  });

  test("direction up filters to dependents only", () => {
    runJson("service", "add", "--name", "auth");
    runJson("service", "add", "--name", "gateway");
    runJson("service", "dep-add", "gateway", "--on", "auth");

    const { data } = runJson("deps", "gateway", "--direction", "up");
    expect(data.dependents).toEqual([]);
    expect(data.dependencies).toEqual([]);
  });

  test("direction down filters to dependencies only", () => {
    runJson("service", "add", "--name", "auth");
    runJson("service", "add", "--name", "gateway");
    runJson("service", "dep-add", "gateway", "--on", "auth");

    const { data } = runJson("deps", "gateway", "--direction", "down");
    expect(data.dependencies).toHaveLength(1);
    expect(data.dependents).toEqual([]);
  });

  test("transitive deps with depth", () => {
    runJson("service", "add", "--name", "stripe");
    runJson("service", "add", "--name", "payments");
    runJson("service", "add", "--name", "gateway");
    runJson("service", "dep-add", "gateway", "--on", "payments");
    runJson("service", "dep-add", "payments", "--on", "stripe");

    // depth 1 should not reach stripe from gateway
    const { data: shallow } = runJson("deps", "gateway", "--direction", "down", "--depth", "1");
    const payments = shallow.dependencies.find((d: any) => d.name === "payments");
    expect(payments.children).toEqual([]);

    // default depth should reach stripe
    const { data: deep } = runJson("deps", "gateway", "--direction", "down");
    const paymentsDeep = deep.dependencies.find((d: any) => d.name === "payments");
    expect(paymentsDeep.children).toHaveLength(1);
    expect(paymentsDeep.children[0].name).toBe("stripe");
  });

  test("orphans finds isolated services", () => {
    runJson("service", "add", "--name", "auth");
    runJson("service", "add", "--name", "gateway");
    runJson("service", "add", "--name", "lonely");
    runJson("service", "dep-add", "gateway", "--on", "auth");

    const { data } = runJson("deps", "--orphans");
    expect(data.count).toBe(1);
    expect(data.orphans[0].name).toBe("lonely");
  });

  test("no args and no --orphans fails", () => {
    const { exitCode } = run("deps");
    expect(exitCode).not.toBe(0);
  });

  test("nonexistent service fails", () => {
    const { exitCode } = run("deps", "ghost");
    expect(exitCode).not.toBe(0);
  });
});

// --- discover ---

describe("discover", () => {
  const DISCOVER_DIR = join(TEST_DIR, "repos");

  function setupRepos() {
    // Repo with catalog file
    const withCatalog = join(DISCOVER_DIR, "catalog-repo");
    mkdirSync(join(withCatalog, ".git"), { recursive: true });
    const { writeFileSync } = require("node:fs");
    writeFileSync(
      join(withCatalog, "catalog-info.yaml"),
      [
        "apiVersion: yellowpages/v1",
        "kind: Service",
        "metadata:",
        "  name: catalog-service",
        "  description: From catalog file",
        "spec:",
        "  lifecycle: production",
      ].join("\n"),
    );

    // Repo without catalog (inferred)
    const withoutCatalog = join(DISCOVER_DIR, "inferred-repo");
    mkdirSync(join(withoutCatalog, ".git"), { recursive: true });
    writeFileSync(
      join(withoutCatalog, "package.json"),
      JSON.stringify({ description: "An inferred service" }),
    );
  }

  test("requires a source flag", () => {
    const { exitCode } = run("discover");
    expect(exitCode).not.toBe(0);
  });

  test("dry run shows what would be added", () => {
    setupRepos();
    const { data } = runJson("discover", "--dir", DISCOVER_DIR, "--dry-run");
    expect(data.dryRun).toBe(true);
    expect(data.discovered).toBe(2);
    expect(data.added).toBe(2);

    // Verify nothing was actually added
    const { data: list } = runJson("service", "list");
    expect(list.services).toHaveLength(0);
  });

  test("discovers and adds services from local dir", () => {
    setupRepos();
    const { data } = runJson("discover", "--dir", DISCOVER_DIR);
    expect(data.success).toBe(true);
    expect(data.added).toBe(2);

    // Verify services were added
    const { data: list } = runJson("service", "list");
    expect(list.services).toHaveLength(2);
    const names = list.services.map((s: any) => s.name).sort();
    expect(names).toEqual(["catalog-service", "inferred-repo"]);
  });

  test("idempotent — second run does not duplicate", () => {
    setupRepos();
    runJson("discover", "--dir", DISCOVER_DIR);
    const { data } = runJson("discover", "--dir", DISCOVER_DIR);
    expect(data.added).toBe(0);

    const { data: list } = runJson("service", "list");
    expect(list.services).toHaveLength(2);
  });

  test("detects updates on second run", () => {
    setupRepos();
    runJson("discover", "--dir", DISCOVER_DIR);

    // Update the catalog file
    const { writeFileSync } = require("node:fs");
    writeFileSync(
      join(DISCOVER_DIR, "catalog-repo", "catalog-info.yaml"),
      [
        "metadata:",
        "  name: catalog-service",
        "  description: Updated description",
        "spec:",
        "  lifecycle: deprecated",
      ].join("\n"),
    );

    const { data } = runJson("discover", "--dir", DISCOVER_DIR);
    expect(data.updated).toBe(1);

    // Verify the update
    const { data: show } = runJson("service", "show", "catalog-service");
    expect(show.service.description).toBe("Updated description");
    expect(show.service.lifecycle).toBe("deprecated");
  });

  test("nonexistent directory returns no results", () => {
    const { data } = runJson("discover", "--dir", "/nonexistent/path");
    expect(data.success).toBe(true);
    expect(data.discovered).toBe(0);
  });
});
