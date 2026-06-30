#!/usr/bin/env node
// familiar — a lean, front-end-first ambient-pet prototype.
//
// A deliberate scale-model of the ambisphere runtime pipeline
// (https://github.com/ambisphere/runtime, spike: ambisphere/runtime#10):
//
//   emit (fact)  ->  append-only events.ndjson   (the log is the source of truth)
//   reduce       ->  state.json                   (pure fold; derived + replayable)
//   render       ->  watch / statusline           (renderer-agnostic; reads state only)
//
// Design choices that honor ambisphere's recorded rejections:
//   - The contract is a SEMANTIC state vocabulary, not presentational frames.
//     `running-left`, `jumping`, etc. are renderer animations, never the API.
//   - The manifest (pet.json) describes the entity + named states. Renderer assets
//     (ascii.json here; a sprite atlas later) are SEPARATE, swappable bundles.
//   - State lives under a vendor-neutral home (~/.familiar), never ~/.codex.
//   - Reducers are pure: no wall-clock inside the fold. Time-based "flash" decay
//     is resolved at RENDER time, keeping the fold deterministic + replayable.
//
// Zero dependencies — Node builtins only.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HOME = process.env.FAMILIAR_HOME || path.join(os.homedir(), '.familiar');
const LOG = path.join(HOME, 'events.ndjson');
const STATE = path.join(HOME, 'state.json');

// --- semantic state model: the API between agents and entities ---
const STATES = [
  'idle', 'thinking', 'working', 'awaiting-human', 'reviewing',
  'succeeded', 'failed', 'errored', 'rate-limited', 'milestone', 'sleeping',
];

// canonical event -> sticky base state (persists until the next sticky event)
const STICKY = {
  'session.start': 'idle',
  'prompt.submit': 'thinking',
  'think': 'thinking',
  'tool.start': 'working',
  'tool.end': 'working',
  'file.edit': 'working',
  'review': 'reviewing',
  'await.input': 'awaiting-human',
  'await.approval': 'awaiting-human',
  'turn.stop': 'idle',
  'session.end': 'sleeping',
};

// canonical event -> transient flash [state, ttlMs] (overlays the base briefly)
const FLASH = {
  'tool.fail': ['failed', 4000],
  'run.ok': ['succeeded', 1500],
  'run.fail': ['failed', 4000],
  'test.pass': ['succeeded', 3000],
  'test.fail': ['failed', 5000],
  'commit': ['milestone', 4000],
  'push': ['milestone', 4000],
  'error': ['errored', 6000],
  'rate.limited': ['rate-limited', 8000],
  'milestone': ['milestone', 4000],
};

// resolved state -> attention level (runtime concern: glanceable vs interrupt)
const ATTENTION = {
  'awaiting-human': 'interrupt',
  'errored': 'interrupt',
  'failed': 'interrupt',
  'rate-limited': 'interrupt',
  'milestone': 'glance',
  'succeeded': 'glance',
};
const attentionFor = (s) => ATTENTION[s] || 'none';

// --- log + reduce ---
const nowMs = () => Date.now();
const ensureHome = () => fs.mkdirSync(HOME, { recursive: true });

// The log is append-only and the source of truth, but a long-lived session
// would grow it without bound and make each reduce O(events). We keep it
// replayable for recent history and compact the tail when it gets large: the
// fold only needs the last sticky event + short-lived flash/message/tool, all
// well within the retained window. A deliberate size-for-full-history trade.
const LOG_MAX_BYTES = 1_000_000;   // compact once the log passes ~1 MB
const LOG_KEEP = 1500;             // events retained after compaction

function compactLogIfNeeded() {
  let size = 0;
  try { size = fs.statSync(LOG).size; } catch { return; }
  if (size < LOG_MAX_BYTES) return;
  const events = readLog();
  if (events.length <= LOG_KEEP) return;
  const tmp = LOG + '.tmp';
  fs.writeFileSync(tmp, events.slice(-LOG_KEEP).map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.renameSync(tmp, LOG);  // atomic on the same filesystem
}

function emit(type, data) {
  ensureHome();
  const rec = { ts: nowMs(), type };
  if (data !== undefined) rec.data = data;
  fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
  compactLogIfNeeded();
  reduce();
}

function readLog() {
  let raw;
  try { raw = fs.readFileSync(LOG, 'utf8'); } catch { return []; }
  const out = [];
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* skip a torn line */ }
  }
  return out;
}

// pure fold: deterministic over the log; no clock, no IO, no randomness.
function fold(events) {
  let base = 'sleeping';   // before any session has started
  let flash = null;        // { state, until }  — `until` is a value, not a comparison
  let message = null;      // { text, until }   — a transient speech bubble (own channel)
  let tool = null;         // { cat, until }    — the active tool, for a visual badge
  let lastType = null;
  let seq = 0;
  // events that mean "no tool is running" — clear the badge.
  const CLEARS_TOOL = new Set(['turn.stop', 'await.input', 'await.approval',
    'prompt.submit', 'session.start', 'session.end', 'review']);
  for (const ev of events) {
    seq++;
    lastType = ev.type;
    if (Object.prototype.hasOwnProperty.call(STICKY, ev.type)) base = STICKY[ev.type];
    if (Object.prototype.hasOwnProperty.call(FLASH, ev.type)) {
      const [st, ttl] = FLASH[ev.type];
      flash = { state: st, until: ev.ts + ttl };
    }
    // `message` is orthogonal to state: the pet keeps its animation and speaks.
    // Text may arrive as a bare string or { text }. TTL scales with length so a
    // longer line lingers — derived from ev.ts only, keeping the fold pure.
    if (ev.type === 'message' || ev.type === 'say') {
      const text = (typeof ev.data === 'string' ? ev.data : (ev.data && ev.data.text) || '').trim();
      if (text) {
        const words = text.split(/\s+/).length;
        const ttl = Math.min(12000, Math.max(3500, words * 320));
        message = { text: text.slice(0, 240), until: ev.ts + ttl };
      }
    }
    // `tool` indicator: a tool.* event carrying a category lights the badge and
    // KEEPS it lit through the working period (each event refreshes the window,
    // showing the current/last tool). A turn/await/session boundary clears it.
    // The long TTL is only a safety net for a turn that never stops. Render-time
    // decay keeps the fold pure.
    const cat = ev.data && typeof ev.data === 'object' ? ev.data.tool : null;
    if (ev.type === 'tool.start' || ev.type === 'tool.end') {
      const c = cat || (tool && tool.cat);
      if (c) tool = { cat: c, until: ev.ts + 45000 };
    } else if (CLEARS_TOOL.has(ev.type)) tool = null;
  }
  return { base, flash, message, tool, seq, lastType };
}

function writeState(s) {
  ensureHome();
  const tmp = STATE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(s, null, 2));
  fs.renameSync(tmp, STATE); // atomic on same filesystem
}

function reduce() {
  const folded = fold(readLog());
  writeState({ ...folded, updated: nowMs(), pet: activePetId() });
  return folded;
}

function readState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); }
  catch { return { base: 'idle', flash: null, seq: 0, lastType: null, pet: activePetId() }; }
}

// resolve the rendered state for a given instant (flash overlays base while live)
function resolve(s, now = nowMs()) {
  let state = s.base || 'idle';
  if (s.flash && now < s.flash.until) state = s.flash.state;
  return {
    state,
    attention: attentionFor(state),
    base: s.base || 'idle',
    flashing: !!(s.flash && now < s.flash.until),
    message: (s.message && now < s.message.until) ? s.message.text : null,
    tool: (s.tool && now < s.tool.until) ? s.tool.cat : null,
  };
}

// --- pet bundles: renderer assets, separate + swappable from the manifest ---
function readConfig() {
  try { return JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8')); }
  catch { return {}; }
}
function activePetId() {
  return process.env.FAMILIAR_PET || readConfig().pet || 'default';
}
function resolvePetDir(id) {
  for (const c of [path.join(HOME, 'pets', id), path.join(__dirname, 'pets', id)]) {
    if (fs.existsSync(path.join(c, 'pet.json'))) return c;
  }
  return null;
}
function loadAscii(id) {
  const dir = resolvePetDir(id);
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'ascii.json'), 'utf8')); }
  catch { return null; }
}
function loadManifest(id) {
  const dir = resolvePetDir(id);
  if (!dir) return null;
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'pet.json'), 'utf8')); }
  catch { return null; }
}
function listPets() {
  const ids = new Set();
  for (const base of [path.join(HOME, 'pets'), path.join(__dirname, 'pets')]) {
    try {
      for (const d of fs.readdirSync(base)) {
        if (fs.existsSync(path.join(base, d, 'pet.json'))) ids.add(d);
      }
    } catch { /* dir may not exist */ }
  }
  return [...ids];
}

// renderer-side graceful fallback when a bundle lacks art for a state
function fallbackState(state) {
  const map = {
    'succeeded': 'idle', 'milestone': 'idle', 'reviewing': 'working',
    'errored': 'failed', 'rate-limited': 'awaiting-human', 'sleeping': 'idle',
  };
  return map[state] || 'idle';
}
function framesFor(ascii, state) {
  if (!ascii) return ['( o.o )'];
  return ascii[state] || ascii[fallbackState(state)] || ascii['idle'] || ['( o.o )'];
}

const AMBER = '\x1b[38;5;220m';
const DIM = '\x1b[2m';
const RST = '\x1b[0m';

const GLYPH = {
  idle: '·', thinking: '…', working: '⚙', 'awaiting-human': '?',
  reviewing: 'o', succeeded: '✓', failed: '✗', errored: '!',
  'rate-limited': '⏳', milestone: '★', sleeping: 'z',
};

function render(petId) {
  const r = resolve(readState());
  const frames = framesFor(loadAscii(petId), r.state);
  const man = loadManifest(petId);
  const idx = Math.floor(nowMs() / 420) % frames.length;
  const name = (man && man.displayName) || petId;
  const att = r.attention === 'interrupt' ? `${AMBER}! needs you${RST}`
    : r.attention === 'glance' ? `${DIM}* fyi${RST}` : '';
  const bubble = r.message ? `${DIM}💬 ${r.message}${RST}\n` : '';
  return `${bubble}${AMBER}${frames[idx]}${RST}\n${DIM}${name}${RST}  ${AMBER}${r.state}${RST} ${att}`;
}

function watch(petId) {
  process.stdout.write('\x1b[?25l'); // hide cursor
  const draw = () => {
    process.stdout.write('\x1b[2J\x1b[H'); // clear + home
    process.stdout.write(render(petId) + '\n');
  };
  draw();
  const iv = setInterval(draw, 250);
  const cleanup = () => {
    clearInterval(iv);
    process.stdout.write('\x1b[?25h\x1b[0m\n'); // show cursor, reset
    process.exit(0);
  };
  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

function statusline(petId) {
  const r = resolve(readState());
  const man = loadManifest(petId);
  const name = (man && man.displayName) || petId;
  const mark = r.attention === 'interrupt' ? ' !' : r.attention === 'glance' ? ' *' : '';
  process.stdout.write(`${AMBER}${GLYPH[r.state] || '·'}${RST} ${name} ${DIM}${r.state}${RST}${mark}`);
}

// --- Claude Code adapter: map host lifecycle hooks -> canonical events ---
function installClaudeCode(write) {
  const dir = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
  const file = path.join(dir, 'settings.json');
  const self = path.join(__dirname, 'familiar.mjs');
  // `hook` (not `emit`): the wrapper also speaks + flashes from the payload.
  const emitHook = (ev) => ({ hooks: [{ type: 'command', command: `node ${self} hook ${ev}`, timeout: 5 }] });
  const MAP = {
    SessionStart: 'session.start',
    UserPromptSubmit: 'prompt.submit',
    PreToolUse: 'tool.start',
    PostToolUse: 'tool.end',
    Notification: 'await.input',
    Stop: 'turn.stop',
    SessionEnd: 'session.end',
  };
  const hooks = {};
  for (const [evt, canon] of Object.entries(MAP)) hooks[evt] = [emitHook(canon)];
  const statusLine = { type: 'command', command: `node ${self} statusline` };

  if (!write) {
    process.stdout.write(JSON.stringify({ hooks, statusLine }, null, 2) + '\n');
    process.stderr.write(`\n(dry run) merge the above into ${file}, or re-run with --write\n`);
    return;
  }

  let cfg = {};
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* fresh */ }
  fs.mkdirSync(dir, { recursive: true });
  if (fs.existsSync(file)) fs.copyFileSync(file, file + '.familiar.bak');
  cfg.hooks = cfg.hooks || {};
  for (const [evt, arr] of Object.entries(hooks)) {
    const existing = cfg.hooks[evt] || [];
    if (!JSON.stringify(existing).includes('familiar.mjs')) cfg.hooks[evt] = existing.concat(arr);
  }
  let note = '';
  if (!cfg.statusLine) cfg.statusLine = statusLine;
  else if (!JSON.stringify(cfg.statusLine).includes('familiar.mjs')) {
    note = `\nnote: left your existing statusLine untouched. To show Pip inline, point it at:\n  node ${self} statusline\n`;
  }
  fs.writeFileSync(file, JSON.stringify(cfg, null, 2));
  process.stdout.write(`installed familiar hooks into ${file} (backup: ${file}.familiar.bak)${note}\n`);
  process.stdout.write('restart Claude Code for the hooks to take effect.\n');
}

// --- git adapter: a second, structurally-different harness ---
//
// Proof that the semantic contract isn't Claude-Code-specific: git hooks are a
// totally separate event SOURCE (the VCS, driven by ANY tool) feeding the SAME
// log -> reduce -> render pipeline. post-commit/pre-push call `familiar
// git-event`, which emits the milestone events + speaks (the commit subject).
function installGit(args, write) {
  const repoArg = args.find((a) => !a.startsWith('--'));
  const repo = repoArg ? path.resolve(repoArg) : process.cwd();
  const r = spawnSync('git', ['-C', repo, 'rev-parse', '--git-path', 'hooks'], { encoding: 'utf8' });
  if (r.status !== 0) { process.stderr.write(`familiar install git: not a git repository: ${repo}\n`); process.exit(2); }
  const hooksDir = path.resolve(repo, (r.stdout || '').trim());
  const self = path.join(__dirname, 'familiar.mjs');
  const SENTINEL = '# familiar-hook';
  const MAP = { 'post-commit': 'commit', 'pre-push': 'push' };

  fs.mkdirSync(hooksDir, { recursive: true });
  const plan = [];
  for (const [hook, kind] of Object.entries(MAP)) {
    const p = path.join(hooksDir, hook);
    let existing = '';
    try { existing = fs.readFileSync(p, 'utf8'); } catch { /* none yet */ }
    if (existing.includes(SENTINEL)) { plan.push(`${hook}: already wired`); continue; }
    plan.push(`${hook} -> familiar emit ${kind}`);
    if (!write) continue;
    // `|| true` so a missing node never blocks a commit/push; quiet, fast.
    const line = `node ${self} git-event ${kind} >/dev/null 2>&1 || true  ${SENTINEL}`;
    const content = existing.trim() ? existing.replace(/\s*$/, '\n') + line + '\n'
                                    : `#!/bin/sh\n${line}\n`;
    fs.writeFileSync(p, content);
    fs.chmodSync(p, 0o755);
  }
  if (!write) {
    process.stdout.write(`(dry run) would wire git hooks in ${hooksDir}:\n  ${plan.join('\n  ')}\n  re-run with --write to apply\n`);
    return;
  }
  process.stdout.write(`familiar: wired git hooks in ${hooksDir}:\n  ${plan.join('\n  ')}\ncommit or push from anywhere — the pet reacts.\n`);
}

// install dispatch: the adapter registry. New harness = one more case.
function install(target, args) {
  const write = args.includes('--write');
  switch (target) {
    case 'claude-code': return installClaudeCode(write);
    case 'git': return installGit(args, write);
    default:
      process.stderr.write('usage: familiar install <claude-code|git> [path] [--write]\n');
      process.exit(2);
  }
}

// --- live activity adapter: derive flash events + speech from a hook payload ---
//
// A host hook calls `familiar hook <canonical-event>` and pipes its JSON payload
// on stdin. We always emit the canonical state event (idle/thinking/working/…),
// and for noteworthy moments we ALSO derive a richer flash (milestone/succeeded/
// failed) and a short spoken message — so the pet reacts to real work, not just
// abstract state. The derivation is the only host-specific knowledge; the
// semantic events it emits stay the renderer-agnostic contract.

const SAY = {
  ack: ['On it.', 'Let me look…', 'Digging in.', 'Got it — working.', 'Sure thing.'],
  done: ['Done — back to you.', 'Wrapped up.', 'All yours.', 'That’s done.'],
};
const pick = (arr) => arr[Math.floor(nowMs() / 1000) % arr.length];
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

function bashOutput(resp) {
  if (!resp) return '';
  if (typeof resp === 'string') return resp;
  return [resp.stdout, resp.stderr, resp.output, resp.error].filter(Boolean).join(' ').toString();
}

// A Bash command + its result -> an optional { event, message }.
function deriveBash(p) {
  const cmd = String((p.tool_input || {}).command || '').toLowerCase();
  const out = bashOutput(p.tool_response).toLowerCase();
  const failed = /\b(fail|failed|error|exception|traceback|not ok|✗)\b/.test(out);
  if (/\bgit\s+commit\b/.test(cmd)) return { event: 'commit', message: 'Committed ✓' };
  if (/\bgit\s+push\b/.test(cmd)) return { event: 'push', message: 'Pushed it up ✓' };
  if (/\b(pytest|swift test|go test|cargo test|jest|vitest|rspec)\b/.test(cmd)
      || /\b(npm|yarn|pnpm)\s+(run\s+)?test\b/.test(cmd)) {
    return failed ? { event: 'test.fail', message: 'Tests failed — on it.' }
                  : { event: 'test.pass', message: 'Tests passed ✓' };
  }
  return {};
}

// Map a host tool name -> a coarse category the renderer has a glyph for.
function toolCategory(name) {
  const n = String(name || '');
  if (n.startsWith('mcp__')) return 'mcp';
  if (/^(Bash|BashOutput|KillShell|KillBash)$/.test(n)) return 'shell';
  if (/^(Edit|Write|MultiEdit|NotebookEdit)$/.test(n)) return 'edit';
  if (n === 'Read') return 'read';
  if (/^(Grep|Glob|LS)$/.test(n)) return 'search';
  if (/^(WebFetch|WebSearch)$/.test(n)) return 'web';
  if (n === 'Task' || n === 'Agent' || n.endsWith('Agent')) return 'agent';
  return 'tool';
}

// The agent's last spoken line, pulled from a Claude Code transcript (JSONL of
// {type:'assistant', message:{content:[{type:'text',text}]}}). Read from the
// end so we stop at the first assistant text we find.
function lastAssistantLine(transcriptPath) {
  if (!transcriptPath) return '';
  let raw;
  try { raw = fs.readFileSync(transcriptPath, 'utf8'); } catch { return ''; }
  const lines = raw.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    if (o.type === 'assistant' && o.message && Array.isArray(o.message.content)) {
      const txt = o.message.content.filter((c) => c && c.type === 'text')
        .map((c) => c.text).join(' ').trim();
      if (txt) return txt;
    }
  }
  return '';
}

// First sentence (or a clipped lead), so a long reply stays a glanceable bubble.
function firstSentence(s) {
  const m = String(s).replace(/\s+/g, ' ').trim();
  const idx = m.search(/[.!?](\s|$)/);
  return clip(idx >= 0 ? m.slice(0, idx + 1) : m, 140);
}

function deriveFromHook(canon, p) {
  switch (canon) {
    case 'prompt.submit': return { message: pick(SAY.ack) };
    case 'turn.stop': {
      const line = lastAssistantLine(p && p.transcript_path);
      return { message: line ? firstSentence(line) : pick(SAY.done) };
    }
    case 'await.input': {
      const m = String((p && p.message) || '').trim();
      return { message: m ? clip(m, 120) : 'I need you on this 👀' };
    }
    case 'session.start':
      return (p && p.source === 'resume') ? { message: 'Back at it — watching your session.' } : {};
    case 'tool.end':
      return (p && p.tool_name === 'Bash') ? deriveBash(p) : {};
    default: return {};
  }
}

function runHook(rest) {
  const canon = rest[0];
  let p = {};
  try {
    // Hooks pipe JSON on stdin; skip the read on a TTY so manual calls don't hang.
    if (!process.stdin.isTTY) {
      const raw = fs.readFileSync(0, 'utf8');
      if (raw && raw.trim()) p = JSON.parse(raw);
    }
  } catch { /* no/invalid stdin — fall back to the bare event */ }
  // Attach the tool category to tool.* events so the reducer can drive the badge.
  let data;
  if ((canon === 'tool.start' || canon === 'tool.end') && p && p.tool_name) {
    data = { tool: toolCategory(p.tool_name) };
  }
  if (canon) emit(canon, data);
  let d = {};
  try { d = deriveFromHook(canon, p) || {}; } catch { d = {}; }
  if (d.event) emit(d.event);
  if (d.message) emit('message', d.message);
  process.exit(0);
}

// git hook entry: emit the milestone event + speak (the commit subject).
function gitEvent(rest) {
  const kind = rest[0];
  if (kind === 'commit') {
    let subject = '';
    try {
      const r = spawnSync('git', ['log', '-1', '--pretty=%s'], { encoding: 'utf8' });
      if (r.status === 0) subject = (r.stdout || '').trim();
    } catch { /* not fatal */ }
    emit('commit');
    emit('message', subject ? clip(`Committed: ${subject}`, 120) : 'Committed ✓');
  } else if (kind === 'push') {
    emit('push');
    emit('message', 'Pushed it up ✓');
  } else if (kind) {
    emit(kind);
  }
  process.exit(0);
}

function runDemo() {
  const seq = [
    ['session.start', 0], ['prompt.submit', 1000], ['message', 600, 'On it — let me look.'],
    ['think', 700], ['tool.start', 900], ['file.edit', 800], ['tool.end', 700],
    ['run.ok', 700], ['message', 400, 'Build passed ✓'], ['tool.start', 1000],
    ['test.fail', 800], ['message', 400, 'A test broke — fixing it.'], ['tool.start', 1300],
    ['run.ok', 800], ['review', 1000], ['await.input', 1400],
    ['message', 300, 'Ready for your review.'], ['commit', 1600], ['turn.stop', 1000],
  ];
  process.stdout.write('familiar demo: scripting a session. Run `familiar watch` in another pane to see Pip react.\n');
  let t = 0;
  for (const [ev, gap, data] of seq) {
    t += gap;
    setTimeout(() => { emit(ev, data); process.stdout.write(`emit ${ev}${data ? ` "${data}"` : ''}\n`); }, t);
  }
  setTimeout(() => process.exit(0), t + 800);
}

// --- native overlay renderer: launch/stop the SwiftUI desktop pet ---
const OVERLAY_DIR = path.join(__dirname, 'overlay');
const PETS_DIR = path.join(__dirname, 'pets');

function overlayBinary() {
  for (const cfg of ['release', 'debug']) {
    const p = path.join(OVERLAY_DIR, '.build', cfg, 'FamiliarOverlay');
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildOverlay() {
  // Prepend the system toolchain so /usr/bin/ld is used — a conda `ld` on PATH
  // shadows it and fails linking with `-no_warn_duplicate_libraries`.
  const env = { ...process.env, PATH: `/usr/bin:/usr/sbin:/bin:/sbin:${process.env.PATH || ''}` };
  process.stdout.write('familiar overlay: building (first run, ~minute)...\n');
  const r = spawnSync('swift', ['build', '-c', 'release'], { cwd: OVERLAY_DIR, env, stdio: 'inherit' });
  return r.status === 0 ? overlayBinary() : null;
}

function overlayPids() {
  const r = spawnSync('pgrep', ['-f', 'FamiliarOverlay'], { encoding: 'utf8' });
  return (r.stdout || '').split('\n').map((s) => s.trim()).filter(Boolean);
}

function petHasSprites(id) {
  const man = loadManifest(id);
  return !!(man && man.renderers && Object.values(man.renderers).some((r) => r && r.dir));
}

function launchOverlay(args) {
  if (args.includes('--stop')) {
    const pids = overlayPids();
    if (!pids.length) { process.stdout.write('familiar overlay: not running\n'); return; }
    spawnSync('pkill', ['-f', 'FamiliarOverlay']);
    process.stdout.write(`familiar overlay: stopped (pid ${pids.join(', ')})\n`);
    return;
  }
  const restart = args.includes('--restart');
  const running = overlayPids();
  if (running.length && !restart) {
    process.stdout.write(`familiar overlay: already running (pid ${running.join(', ')}); --restart to relaunch, --stop to quit\n`);
    return;
  }
  if (running.length) spawnSync('pkill', ['-f', 'FamiliarOverlay']);

  // pet: explicit arg, else the active pet — but fall back to one with a sprite
  // bundle, since the overlay is graphical (ASCII-only pets render a placeholder).
  let pet = args.find((a) => !a.startsWith('--')) || activePetId();
  if (!petHasSprites(pet)) {
    const candidate = ['fox', ...listPets()].find(petHasSprites);
    if (candidate && candidate !== pet) {
      process.stdout.write(`familiar overlay: '${pet}' has no sprite bundle; using '${candidate}'\n`);
      pet = candidate;
    }
  }

  const bin = overlayBinary() || buildOverlay();
  if (!bin) {
    process.stderr.write(`familiar overlay: no binary and build failed.\n  build it: (cd ${OVERLAY_DIR} && swift build -c release)\n`);
    process.exit(1);
  }

  ensureHome();
  const logPath = path.join(HOME, 'overlay.log');
  const out = fs.openSync(logPath, 'a');
  const env = {
    ...process.env, FAMILIAR_PET: pet, FAMILIAR_PETS_DIR: PETS_DIR,
    FAMILIAR_HOME: HOME, FAMILIAR_CLI: path.join(__dirname, 'familiar.mjs'),
  };
  const child = spawn(bin, [], { detached: true, stdio: ['ignore', out, out], env });
  child.unref();
  process.stdout.write(`familiar overlay: launched '${pet}' (pid ${child.pid})\n  log: ${logPath}\n`);
}

// --- hatch a new pet: base image -> per-state strips -> sheet -> pet.json ---
const REPO_ROOT = path.join(__dirname, '..', '..');
const GEN_IMG = path.join(REPO_ROOT, 'skills/image-generate/scripts/generate_image.py');
const STRIP_PY = path.join(REPO_ROOT, 'skills/pet-hatch/scripts/strip.py');
const PACK_PY = path.join(REPO_ROOT, 'skills/pet-hatch/scripts/pack.py');
const IMPORT_CODEX = path.join(REPO_ROOT, 'skills/pet-hatch/scripts/import_codex.py');
const USER_PETS_DIR = path.join(HOME, 'pets');

// The proven stable base style (Codex's house style) — compact pixel-art reads
// cleanly at small size and stays stable under the deterministic extraction.
const PIXEL_STYLE =
  'Codex-style digital pet sprite: pixel-art-adjacent low-resolution mascot, compact chibi ' +
  'proportions, chunky whole-body silhouette, thick dark 1-2px outline, visible stepped/pixel ' +
  'edges, limited palette, flat cel shading with at most one highlight and one shadow step, ' +
  'simple readable face, tiny limbs, no fine detail that disappears when small. Avoid polished ' +
  'illustration, painterly rendering, 3D, soft gradients, realistic texture, anti-aliased high-detail edges.';

// Agent states plus the two interaction states (held/poked) the overlay plays
// when the human grabs or pokes the pet — generated so hatched pets have them.
const PET_STATES = ['idle', 'thinking', 'working', 'reviewing', 'awaiting-human', 'milestone', 'failed', 'sleeping', 'held', 'poked'];

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'pet';
}

function hatchPet(rest) {
  const o = { quality: 'high', references: [] };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--name') o.name = rest[++i];
    else if (a === '--prompt') o.prompt = rest[++i];
    else if (a === '--reference') o.references.push(rest[++i]);
    else if (a === '--quality') o.quality = rest[++i];
    else if (a === '--pets-dir') o.petsDir = rest[++i];
  }
  const log = (step, status, extra) =>
    process.stdout.write(JSON.stringify({ step, status, ...(extra || {}) }) + '\n');

  if (!o.name || !o.prompt) {
    process.stderr.write('usage: familiar hatch --name <name> --prompt <description> [--reference img]...\n');
    process.exit(2);
  }
  if (!process.env.OPENAI_API_KEY) { log('error', 'fail', { message: 'OPENAI_API_KEY not set' }); process.exit(2); }

  const id = slug(o.name);
  const petsDir = o.petsDir || USER_PETS_DIR;
  const bundle = path.join(petsDir, id);
  const framesDir = path.join(bundle, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const basePng = path.join(bundle, 'base.png');

  // 1. canonical base sprite (pixel-art; on green so the pipeline keys it)
  log('base', 'start');
  const basePrompt =
    `Create a single clean reference sprite for a digital pet named ${o.name}. ` +
    `Pet: ${o.prompt}. Style: ${PIXEL_STYLE} ` +
    'Output one centered full-body pet sprite, seated and facing forward, on a perfectly flat ' +
    'pure chroma green #00b140 background. Fully visible and readable as a tiny digital pet. ' +
    'No scenery, text, borders, shadows, glows, or extra props. Do not use green or near-green on the pet itself.';
  const baseCmd = [GEN_IMG, '--no-style', '--size', '1024x1024', '--quality', o.quality, '--out', basePng, '--prompt', basePrompt];
  for (const r of o.references) { baseCmd.push('--reference', r); }
  let r = spawnSync('python3', baseCmd, { encoding: 'utf8' });
  if (r.status !== 0 || !fs.existsSync(basePng)) { log('base', 'fail', { err: (r.stderr || '').slice(-400) }); process.exit(1); }
  log('base', 'ok', { path: basePng });

  // 2. per-state strips + frames + anim.json (Codex extraction)
  log('strips', 'start');
  r = spawnSync('python3', [STRIP_PY, '--frames-dir', framesDir, '--base', basePng, '--workers', '3'],
    { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { log('strips', 'fail'); process.exit(1); }
  log('strips', 'ok');

  // 3. pack into a sheet
  log('pack', 'start');
  r = spawnSync('python3', [PACK_PY, '--frames-dir', framesDir], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { log('pack', 'fail'); process.exit(1); }
  log('pack', 'ok');

  // 4. pet.json
  fs.writeFileSync(path.join(bundle, 'pet.json'), JSON.stringify({
    id, displayName: o.name, description: o.prompt, states: PET_STATES,
    renderers: { 'ascii-green-sprites': { dir: 'frames', manifest: 'anim.json', chromaKey: '#00b140', note: 'hatched via pet-hatch strip pipeline' } },
  }, null, 2));
  log('done', 'ok', { id, bundle });
}

// --- import a Codex pet atlas; optionally generate the states it lacks ---
function importCodex(rest) {
  const o = { quality: 'high', generateMissing: false };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--path') o.srcPath = rest[++i];
    else if (a === '--name') o.name = rest[++i];
    else if (a === '--generate-missing') o.generateMissing = true;
    else if (a === '--quality') o.quality = rest[++i];
    else if (a === '--pets-dir') o.petsDir = rest[++i];
  }
  const log = (step, status, extra) =>
    process.stdout.write(JSON.stringify({ step, status, ...(extra || {}) }) + '\n');

  if (!o.srcPath) {
    process.stderr.write('usage: familiar import-codex --path <codex pet dir or sheet> [--name N] [--generate-missing]\n');
    process.exit(2);
  }
  if (!fs.existsSync(o.srcPath)) { log('error', 'fail', { message: `not found: ${o.srcPath}` }); process.exit(2); }

  // Resolve the spritesheet + name/description from a pet dir or a direct sheet.
  let sheet = o.srcPath, name = o.name, desc = 'Imported Codex pet.';
  if (fs.statSync(o.srcPath).isDirectory()) {
    for (const f of ['spritesheet.webp', 'spritesheet.png']) {
      if (fs.existsSync(path.join(o.srcPath, f))) { sheet = path.join(o.srcPath, f); break; }
    }
    const pj = path.join(o.srcPath, 'pet.json');
    if (fs.existsSync(pj)) {
      try { const m = JSON.parse(fs.readFileSync(pj, 'utf8')); name = name || m.displayName || m.id; desc = m.description || desc; } catch { /* */ }
    }
  }
  if (!name) name = path.basename(o.srcPath).replace(/\.(webp|png)$/i, '');
  const id = slug(name);
  const bundle = path.join(o.petsDir || USER_PETS_DIR, id);
  const framesDir = path.join(bundle, 'frames');
  fs.mkdirSync(framesDir, { recursive: true });
  const basePng = path.join(bundle, 'base.png');

  // 1. slice + map the Codex rows into our frames + anim.json
  log('import', 'start');
  let r = spawnSync('python3', [IMPORT_CODEX, '--sheet', sheet, '--frames-dir', framesDir, '--base-out', basePng], { encoding: 'utf8' });
  if (r.status !== 0) { log('import', 'fail', { err: (r.stderr || '').slice(-400) }); process.exit(1); }
  let info = {};
  try { info = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* */ }
  log('import', 'ok', { states: info.states, missing: info.missing });

  // 2. generate the missing states from the imported pet's base — ONLY if asked
  const gen = info.generatable || [];
  if (o.generateMissing && gen.length) {
    log('generate', 'start', { states: gen });
    r = spawnSync('python3', [STRIP_PY, '--frames-dir', framesDir, '--base', basePng, '--states', gen.join(','), '--workers', '3'],
      { stdio: ['ignore', 'inherit', 'inherit'] });
    if (r.status !== 0) { log('generate', 'fail'); process.exit(1); }
    log('generate', 'ok');
  } else if (gen.length) {
    log('generate', 'skipped', { message: `missing states aliased to idle: ${gen.join(', ')}` });
  }

  // 3. pack
  log('pack', 'start');
  r = spawnSync('python3', [PACK_PY, '--frames-dir', framesDir], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { log('pack', 'fail'); process.exit(1); }
  log('pack', 'ok');

  // 4. pet.json
  fs.writeFileSync(path.join(bundle, 'pet.json'), JSON.stringify({
    id, displayName: name, description: desc, states: info.states || PET_STATES,
    renderers: { 'ascii-green-sprites': { dir: 'frames', manifest: 'anim.json', chromaKey: '#00b140',
      note: 'imported from a Codex atlas' + (o.generateMissing ? ' + generated missing states' : '') } },
  }, null, 2));
  log('done', 'ok', { id, bundle });
}

function printHelp() {
  process.stdout.write(`familiar — a lean ambient-pet prototype (front-end for ambisphere)

usage:
  familiar emit <event> [json]              append a fact to the log, then reduce
  familiar emit message "text"              make the pet speak (a transient bubble)
  familiar state                            print the resolved current state (json)
  familiar watch                            animate the pet for the current state (Ctrl-C quits)
  familiar statusline                       print a one-line pet (for Claude Code statusLine)
  familiar install claude-code [--write]    wire lifecycle hooks (+statusline) into settings.json
  familiar install git [path] [--write]     wire git hooks (post-commit, pre-push) in a repo
  familiar hook <event>                     host-hook entry: emit <event> + derived speech/flash (stdin payload)
  familiar pets                             list available pet bundles
  familiar overlay [pet] [--restart|--stop] launch the native desktop pet (auto-builds first run)
  familiar hatch --name N --prompt "..."    hatch a new pet (base -> strips -> sheet); [--reference img]...
  familiar import-codex --path <dir|sheet>  import a Codex pet atlas; [--generate-missing] to fill gaps
  familiar demo                             emit a scripted session (watch in another pane)

canonical events (semantic): session.start prompt.submit think tool.start tool.end
  file.edit run.ok run.fail test.pass test.fail review await.input await.approval
  commit push error rate.limited turn.stop session.end  message (carries text)

home: ${HOME}
`);
}

// --- entrypoint ---
const [, , cmd, ...rest] = process.argv;
try {
  switch (cmd) {
    case 'emit': {
      const ev = rest[0];
      if (!ev) { process.stderr.write('usage: familiar emit <event> [json]\n'); process.exit(0); }
      let data;
      if (rest[1]) { try { data = JSON.parse(rest.slice(1).join(' ')); } catch { data = rest.slice(1).join(' '); } }
      emit(ev, data);
      process.exit(0);
      break;
    }
    case 'hook': { runHook(rest); break; } // host hook: emit event (+derived speech/flash) from stdin payload
    case 'state': {
      const s = readState();
      process.stdout.write(JSON.stringify({ ...s, ...resolve(s) }, null, 2) + '\n');
      break;
    }
    case 'reduce': { reduce(); process.stdout.write('ok\n'); break; }
    case 'watch': { watch(activePetId()); break; } // does not return
    case 'statusline': { statusline(activePetId()); break; }
    case 'install': { install(rest[0], rest.slice(1)); break; }
    case 'git-event': { gitEvent(rest); break; }
    case 'pets': { process.stdout.write(listPets().join('\n') + '\n'); break; }
    case 'overlay': { launchOverlay(rest); break; }
    case 'hatch': { hatchPet(rest); break; }
    case 'import-codex': { importCodex(rest); break; }
    case 'demo': { runDemo(); break; }
    case 'help': case undefined: { printHelp(); break; }
    default: { process.stderr.write(`unknown command: ${cmd}\n`); printHelp(); process.exit(2); }
  }
} catch (e) {
  if (cmd === 'emit' || cmd === 'hook' || cmd === 'git-event') process.exit(0); // never block a host hook
  process.stderr.write(String((e && e.stack) || e) + '\n');
  process.exit(1);
}
