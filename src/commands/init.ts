import { findRoot, initStore } from "../store.js";
import type { OutputOptions } from "../utils/output.js";
import { cmd, hint, info, output, success } from "../utils/output.js";

export async function init(
  _args: string[],
  options: OutputOptions,
): Promise<void> {
  const existing = findRoot();
  if (existing) {
    output(options, {
      json: () => ({ success: true, path: existing, created: false }),
      human: () => info(`Already initialized at ${existing}`),
    });
    return;
  }

  const root = initStore();

  output(options, {
    json: () => ({ success: true, path: root, created: true }),
    human: () => {
      success("Initialized .yellowpages/");
      console.log();
      hint("Next steps:");
      console.log(`  ${cmd("yp owner add --name platform-team --type team")}`);
      console.log(
        `  ${cmd("yp system add --name payments --owner platform-team")}`,
      );
      console.log(
        `  ${cmd("yp service add --name checkout-api --system payments")}`,
      );
      console.log();
      hint("Commit .yellowpages/ to git — it's your service catalog.");
    },
  });
}
