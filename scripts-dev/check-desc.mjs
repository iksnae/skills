import { readdirSync, readFileSync, existsSync } from "node:fs";

for (const d of readdirSync("skills")) {
  const p = `skills/${d}/SKILL.md`;
  if (!existsSync(p)) continue;
  const t = readFileSync(p, "utf8");
  const fm = t.split(/^---$/m)[1] || "";
  let desc = "";
  const single = fm.match(/^description:\s*(\S.*)$/m);
  if (single && !/^[>|][+-]?$/.test(single[1].trim())) {
    desc = single[1].trim().replace(/^['"]|['"]$/g, "");
  } else {
    const idx = fm.search(/^description:/m);
    const after = fm.slice(idx).split("\n").slice(1);
    const lines = [];
    for (const l of after) {
      if (/^\S/.test(l)) break; // next top-level key
      lines.push(l.trim());
    }
    desc = lines.filter(Boolean).join(" ");
  }
  console.log(`${desc.length > 1024 ? "OVER " : "ok   "}${String(desc.length).padStart(5)}  ${d}`);
}
