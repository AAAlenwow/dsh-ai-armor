/**
 * dsh-ai-armor — host half.
 *
 * Five production-grade tools in one bundle:
 *   - dsh-when-broke:     4 git regression-finder tools
 *   - dsh-stackdecoder:   1 stack-trace → file:line → context tool
 *   - dsh-config-guard:   1 YAML/ENV/properties validator
 *   - dsh-cmd-shield:     1 cross-platform shell escape
 *   - dsh-mp-auditor:     1 MyBatis Plus SQL static auditor
 *
 * Total: 8 tools. Each sub-plugin keeps its own lib/, tests/, docs/,
 * README.md, and can be installed/used standalone if needed.
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pluginRoot = dirname(fileURLToPath(import.meta.url));
const pluginsRoot = join(pluginRoot, "..", "plugins");

// Sub-plugins (relative path → expected tool count)
const subPlugins = [
  { name: "dsh-when-broke", path: join(pluginsRoot, "dsh-when-broke", "lib", "index.js") },
  { name: "dsh-stackdecoder", path: join(pluginsRoot, "dsh-stackdecoder", "lib", "index.js") },
  { name: "dsh-config-guard", path: join(pluginsRoot, "dsh-config-guard", "lib", "index.js") },
  { name: "dsh-cmd-shield", path: join(pluginsRoot, "dsh-cmd-shield", "lib", "index.js") },
  { name: "dsh-mp-auditor", path: join(pluginsRoot, "dsh-mp-auditor", "lib", "index.js") },
];

export const name = "dsh-ai-armor";
export const inject = ["tools"];

export async function apply(ctx) {
  for (const sp of subPlugins) {
    try {
      const mod = await import(sp.path);
      const tools = mod.tools || [];
      for (const t of tools) ctx.tools.register(t);
      ctx.logger?.info?.(
        `dsh-ai-armor: registered ${tools.length} tools from ${sp.name} (${tools.map((t) => t.name).join(", ")})`
      );
    } catch (e) {
      ctx.logger?.error?.(`dsh-ai-armor: failed to load ${sp.name}: ${e.message}`);
    }
  }
}
