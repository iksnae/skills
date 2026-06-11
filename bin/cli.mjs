#!/usr/bin/env node
// iksnae-skills — install reusable Claude Code skills into ~/.claude or a project.
//
//   npx @iksnae/skills list
//   npx @iksnae/skills add <skill...> [--project]
//   npx @iksnae/skills add --all [--project]
//
// --project installs into ./.claude/skills instead of ~/.claude/skills.

import { cp, mkdir, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const skillsSrc = join(pkgRoot, "plugins", "iksnae-skills", "skills");
const commandsSrc = join(pkgRoot, "plugins", "iksnae-skills", "commands");

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

function targetRoot(project) {
  return project ? join(process.cwd(), ".claude") : join(homedir(), ".claude");
}

async function installSkill(name, project) {
  const src = join(skillsSrc, name);
  if (!existsSync(join(src, "SKILL.md"))) {
    console.error(`unknown skill: ${name} (try \`npx @iksnae/skills list\`)`);
    process.exitCode = 1;
    return false;
  }
  const dest = join(targetRoot(project), "skills", name);
  await mkdir(dirname(dest), { recursive: true });
  await cp(src, dest, { recursive: true });
  console.log(`  + ${name} -> ${dest}`);
  return true;
}

async function installCommands(project) {
  if (!existsSync(commandsSrc)) return;
  const dest = join(targetRoot(project), "commands");
  await mkdir(dest, { recursive: true });
  await cp(commandsSrc, dest, { recursive: true });
  console.log(`  + commands -> ${dest}`);
}

async function main() {
  const args = process.argv.slice(2);
  const project = args.includes("--project");
  const all = args.includes("--all");
  const positional = args.filter((a) => !a.startsWith("--"));
  const cmd = positional.shift();

  if (cmd === "list") {
    const names = await listSkills();
    console.log("Available skills:\n");
    for (const n of names) {
      console.log(`  ${n.padEnd(34)} ${await descriptionOf(n)}`);
    }
    console.log(
      "\nInstall: npx @iksnae/skills add <name...> [--project]" +
        "\n         npx @iksnae/skills add --all [--project]" +
        "\n\nOr as a Claude Code plugin: /plugin marketplace add iksnae/skills",
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
    console.log(`Installing into ${targetRoot(project)} ...`);
    for (const n of names) await installSkill(n, project);
    if (all) await installCommands(project);
    console.log("done.");
    return;
  }

  console.log(
    "iksnae-skills — reusable Claude Code skills\n\n" +
      "  npx @iksnae/skills list\n" +
      "  npx @iksnae/skills add <skill...> [--project]\n" +
      "  npx @iksnae/skills add --all [--project]\n\n" +
      "Plugin install (recommended):\n" +
      "  /plugin marketplace add iksnae/skills\n" +
      "  /plugin install iksnae-skills@iksnae\n",
  );
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
