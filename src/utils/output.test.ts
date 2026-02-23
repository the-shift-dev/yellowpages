import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  bold,
  bullet,
  bulletDim,
  cmd,
  dim,
  error,
  header,
  hint,
  info,
  jsonOutput,
  nextStep,
  output,
  success,
  warn,
} from "./output";

let logged: string[] = [];
let errorLogged: string[] = [];
const origLog = console.log;
const origError = console.error;

beforeEach(() => {
  logged = [];
  errorLogged = [];
  console.log = (...args: unknown[]) => logged.push(args.join(" "));
  console.error = (...args: unknown[]) => errorLogged.push(args.join(" "));
});

afterEach(() => {
  console.log = origLog;
  console.error = origError;
});

describe("output", () => {
  test("json mode calls json handler and prints JSON", () => {
    output({ json: true }, {
      json: () => ({ foo: "bar" }),
      human: () => { throw new Error("should not be called"); },
    });
    expect(logged).toHaveLength(1);
    expect(JSON.parse(logged[0])).toEqual({ foo: "bar" });
  });

  test("quiet mode calls quiet handler", () => {
    let quietCalled = false;
    output({ quiet: true }, {
      quiet: () => { quietCalled = true; },
      human: () => { throw new Error("should not be called"); },
    });
    expect(quietCalled).toBe(true);
  });

  test("human mode is default", () => {
    let humanCalled = false;
    output({}, {
      json: () => ({ nope: true }),
      human: () => { humanCalled = true; },
    });
    expect(humanCalled).toBe(true);
  });

  test("falls through to human when json option set but no json handler", () => {
    let humanCalled = false;
    output({ json: true }, {
      human: () => { humanCalled = true; },
    });
    expect(humanCalled).toBe(true);
  });

  test("falls through to human when quiet option set but no quiet handler", () => {
    let humanCalled = false;
    output({ quiet: true }, {
      human: () => { humanCalled = true; },
    });
    expect(humanCalled).toBe(true);
  });
});

describe("formatting helpers", () => {
  test("success logs with checkmark", () => {
    success("done");
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("done");
  });

  test("info logs", () => {
    info("note");
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("note");
  });

  test("warn logs", () => {
    warn("careful");
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain("careful");
  });

  test("error logs to stderr", () => {
    error("bad");
    expect(errorLogged.length).toBe(1);
    expect(errorLogged[0]).toContain("bad");
  });

  test("bold returns string", () => {
    expect(typeof bold("text")).toBe("string");
  });

  test("dim returns string", () => {
    expect(typeof dim("text")).toBe("string");
  });

  test("cmd returns string", () => {
    expect(typeof cmd("text")).toBe("string");
  });

  test("bullet logs", () => {
    bullet("item");
    expect(logged.length).toBe(1);
  });

  test("bulletDim logs", () => {
    bulletDim("item");
    expect(logged.length).toBe(1);
  });

  test("hint logs indented", () => {
    hint("try this");
    expect(logged.length).toBe(1);
  });

  test("nextStep logs command", () => {
    nextStep("yp init");
    expect(logged.length).toBe(1);
  });

  test("header logs with spacing", () => {
    header("Title");
    expect(logged.length).toBe(3); // empty line, title, empty line
  });

  test("jsonOutput prints valid JSON", () => {
    jsonOutput({ a: 1 });
    expect(JSON.parse(logged[0])).toEqual({ a: 1 });
  });
});
