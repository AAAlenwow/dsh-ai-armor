#!/usr/bin/env node
// tests/run.mjs — bundle-level smoke test for dsh-ai-armor.
// Loads each sub-plugin's lib/index.js, registers all tools with a mock ctx,
// and verifies the tool list is complete and non-conflicting.

import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const bundleRoot = join(__dirname, "..");
const pluginsRoot = join(bundleRoot, "plugins");

const require = createRequire(import.meta.url);

// Track registered tools
const registered = [];
const errors = [];

const mockCtx = {
  tools: {
    register(tool) {
      if (!tool?.name) {
        errors.push("tool registered without a name");
        return;
      }
      if (registered.some(r => r.name === tool.name)) {
        errors.push(`duplicate tool name: ${tool.name}`);
        return;
      }
      registered.push(tool);
    }
  },
  logger: {
    info: (...args) => console.log("  [info]", ...args),
    error: (...args) => { console.error("  [error]", ...args); errors.push(args.join(" ")); }
  }
};

// 1. Load ESM sub-plugins
const esmPlugins = [
  ["dsh-when-broke", join(pluginsRoot, "dsh-when-broke", "lib", "index.js")],
  ["dsh-stackdecoder", join(pluginsRoot, "dsh-stackdecoder", "lib", "index.js")],
];
for (const [name, path] of esmPlugins) {
  try {
    const mod = await import(path);
    for (const t of (mod.tools || [])) {
      mockCtx.tools.register({ ...t, _from: name });
    }
  } catch (e) {
    errors.push(`${name} failed to import: ${e.message}`);
  }
}

// 2. ESM sub-plugins loaded via createRequire (config-guard, cmd-shield, mp-auditor)
const cjsPlugins = [
  ["dsh-config-guard", join(pluginsRoot, "dsh-config-guard", "lib", "index.js")],
  ["dsh-cmd-shield", join(pluginsRoot, "dsh-cmd-shield", "lib", "index.js")],
  ["dsh-mp-auditor", join(pluginsRoot, "dsh-mp-auditor", "lib", "index.js")],
];
for (const [name, path] of cjsPlugins) {
  try {
    const mod = require(path);
    for (const t of (mod.tools || [])) {
      mockCtx.tools.register({ ...t, _from: name });
    }
  } catch (e) {
    errors.push(`${name} failed to require: ${e.message}`);
  }
}

// 3. Verify expected tools
const expectedTools = [
  "when_broke_find_introducer",
  "when_broke_recent_changes",
  "when_broke_bisect_with_repro",
  "when_broke_blame_age",
  "decode_stack",
  "validate_config",
  "build_shell_invocation",
  "audit_mp_code",
];
const registeredNames = registered.map(r => r.name).sort();
const missingTools = expectedTools.filter(t => !registeredNames.includes(t));
const extraTools = registeredNames.filter(t => !expectedTools.includes(t));

console.log(`\n=== dsh-ai-armor bundle smoke test ===\n`);
console.log(`Registered ${registered.length} tools:`);
for (const t of registered) {
  const ok = t.description && t.parameters && t.execute ? "✅" : "❌";
  console.log(`  ${ok} [${t._from}] ${t.name} — ${t.description?.slice(0, 60)}…`);
}
console.log();

let allOk = errors.length === 0 && missingTools.length === 0 && extraTools.length === 0;

if (errors.length) {
  console.log(`❌ ${errors.length} errors:`);
  for (const e of errors) console.log(`   - ${e}`);
}
if (missingTools.length) {
  console.log(`❌ Missing tools: ${missingTools.join(", ")}`);
}
if (extraTools.length) {
  console.log(`⚠️  Extra tools (not in expected list): ${extraTools.join(", ")}`);
}
if (allOk) {
  console.log(`✅ All ${expectedTools.length} expected tools registered. Bundle is loadable.`);
  process.exit(0);
} else {
  process.exit(1);
}
