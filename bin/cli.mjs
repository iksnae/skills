#!/usr/bin/env node
// iksnae-skills — install reusable agent skills into any compatible harness.
//
//   npx @iksnae/skills list
//   npx @iksnae/skills add <skill...> [--project] [--to <dir>]
//   npx @iksnae/skills add --all [--project] [--to <dir>]
//
// Skills follow the Agent Skills standard (agentskills.io) and work with
// Claude Code, Codex, pi, Cursor, Copilot, Gemini CLI, opencode, Goose, Amp,
// and any other SKILL.md-compatible harness.
//
// Default targets (auto-detected):
//   ~/.claude/skills   — Claude Code
//   ~/.agents/skills   — shared path read by Codex, pi, Cursor, Copilot,
//                        Gemini, opencode, Goose, Amp, ...
// --project targets ./.claude/skills and ./.agents/skills instead.
// --to <dir> installs into exactly that directory.

import { cp, mkdir, readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsSrc = join(pkgRoot, "skills");

async function listSkills() {
  const entries = await readdir(skillsSrc, { withFileTypes: true });
  const names = [];
  for (const e of entries) {
    if (e.isDirectory() && existsSync(join(skillsSrc, e.name, "SKILL.md"))) {
      names.push(e.name);
    }
  }
  return names.sort();
}

async function descriptionOf(name) {
  const text = await readFile(join(skillsSrc, name, "SKILL.md"), "utf8");
  const m = text.match(/^description:\s*(.*)$/m);
  if (!m) return "";
  let d = m[1].trim();
  if (d === ">" || d === "|" || d === ">-" || d === "|-") {
    // folded/literal block scalar: take the first indented line that follows
    const after = text.slice(m.index + m[0].length);
    const line = after.split("\n").find((l) => l.trim().length > 0);
    d = line ? line.trim() : "";
  }
  d = d.replace(/^['"]|['"]$/g, "");
  return d.length > 100 ? d.slice(0, 97) + "..." : d;
}

function targetDirs({ project, to }) {
  if (to) return [to];
  const root = project ? process.cwd() : homedir();
  const targets = [];
  // Claude Code reads .claude/skills; everything else reads .agents/skills.
  // Globally: only install where the harness (or shared dir) is present,
  // falling back to .agents/skills so at least one portable target exists.
  const claude = join(root, ".claude", "skills");
  const agents = join(root, ".agents", "skills");
  if (project) return [claude, agents];
  if (existsSync(join(root, ".claude"))) targets.push(claude);
  const otherHarness = [
    ".agents",
    ".codex",
    ".cursor",
    ".pi",
    ".copilot",
    ".gemini",
    join(".config", "opencode"),
    join(".config", "goose"),
  ].some((d) => existsSync(join(root, d)));
  if (otherHarness || targets.length === 0) targets.push(agents);
  return targets;
}

async function installSkill(name, dirs) {
  const src = join(skillsSrc, name);
  if (!existsSync(join(src, "SKILL.md"))) {
    console.error(`unknown skill: ${name} (try \`npx @iksnae/skills list\`)`);
    process.exitCode = 1;
    return;
  }
  for (const dir of dirs) {
    const dest = join(dir, name);
    await mkdir(dir, { recursive: true });
    await cp(src, dest, { recursive: true });
    console.log(`  + ${name} -> ${dest}`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const project = args.includes("--project");
  const all = args.includes("--all");
  const toIdx = args.indexOf("--to");
  const to = toIdx !== -1 ? args[toIdx + 1] : undefined;
  const positional = args.filter(
    (a, i) => !a.startsWith("--") && (toIdx === -1 || i !== toIdx + 1),
  );
  const cmd = positional.shift();

  if (cmd === "list") {
    const names = await listSkills();
    console.log("Available skills:\n");
    for (const n of names) {
      console.log(`  ${n.padEnd(28)} ${await descriptionOf(n)}`);
    }
    console.log(
      "\nInstall: npx @iksnae/skills add <name...> [--project] [--to <dir>]" +
        "\n         npx @iksnae/skills add --all [--project]" +
        "\n\nAlso works with the universal installer: npx skills add iksnae/skills" +
        "\nOr as a Claude Code plugin: /plugin marketplace add iksnae/skills",
    );
    return;
  }

  if (cmd === "add") {
    const names = all ? await listSkills() : positional;
    if (names.length === 0) {
      console.error("nothing to add — pass skill names or --all");
      process.exitCode = 1;
      return;
    }
    const dirs = targetDirs({ project, to });
    console.log(`Installing into: ${dirs.join(", ")}`);
    for (const n of names) await installSkill(n, dirs);
    console.log("done.");
    return;
  }

  console.log(
    "iksnae-skills — reusable agent skills (Claude Code, Codex, pi, Cursor, ...)\n\n" +
      "  npx @iksnae/skills list\n" +
      "  npx @iksnae/skills add <skill...> [--project] [--to <dir>]\n" +
      "  npx @iksnae/skills add --all [--project]\n\n" +
      "Other install paths:\n" +
      "  npx skills add iksnae/skills            # universal installer (70+ agents)\n" +
      "  /plugin marketplace add iksnae/skills   # Claude Code plugin\n",
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
