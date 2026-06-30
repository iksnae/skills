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

function emit(type, data) {
  ensureHome();
  const rec = { ts: nowMs(), type };
  if (data !== undefined) rec.data = data;
  fs.appendFileSync(LOG, JSON.stringify(rec) + '\n');
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
  let lastType = null;
  let seq = 0;
  for (const ev of events) {
    seq++;
    lastType = ev.type;
    if (Object.prototype.hasOwnProperty.call(STICKY, ev.type)) base = STICKY[ev.type];
    if (Object.prototype.hasOwnProperty.call(FLASH, ev.type)) {
      const [st, ttl] = FLASH[ev.type];
      flash = { state: st, until: ev.ts + ttl };
    }
  }
  return { base, flash, seq, lastType };
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
  return `${AMBER}${frames[idx]}${RST}\n${DIM}${name}${RST}  ${AMBER}${r.state}${RST} ${att}`;
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
  const emitHook = (ev) => ({ hooks: [{ type: 'command', command: `node ${self} emit ${ev}`, timeout: 5 }] });
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

function runDemo() {
  const seq = [
    ['session.start', 0], ['prompt.submit', 1000], ['think', 700], ['tool.start', 900],
    ['file.edit', 800], ['tool.end', 700], ['run.ok', 700], ['tool.start', 1000],
    ['test.fail', 800], ['tool.start', 1300], ['run.ok', 800], ['review', 1000],
    ['await.input', 1400], ['commit', 1600], ['turn.stop', 1000],
  ];
  process.stdout.write('familiar demo: scripting a session. Run `familiar watch` in another pane to see Pip react.\n');
  let t = 0;
  for (const [ev, gap] of seq) {
    t += gap;
    setTimeout(() => { emit(ev); process.stdout.write(`emit ${ev}\n`); }, t);
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
  const env = { ...process.env, FAMILIAR_PET: pet, FAMILIAR_PETS_DIR: PETS_DIR, FAMILIAR_HOME: HOME };
  const child = spawn(bin, [], { detached: true, stdio: ['ignore', out, out], env });
  child.unref();
  process.stdout.write(`familiar overlay: launched '${pet}' (pid ${child.pid})\n  log: ${logPath}\n`);
}

function printHelp() {
  process.stdout.write(`familiar — a lean ambient-pet prototype (front-end for ambisphere)

usage:
  familiar emit <event> [json]              append a fact to the log, then reduce
  familiar state                            print the resolved current state (json)
  familiar watch                            animate the pet for the current state (Ctrl-C quits)
  familiar statusline                       print a one-line pet (for Claude Code statusLine)
  familiar install claude-code [--write]    wire lifecycle hooks (+statusline) into settings.json
  familiar pets                             list available pet bundles
  familiar overlay [pet] [--restart|--stop] launch the native desktop pet (auto-builds first run)
  familiar demo                             emit a scripted session (watch in another pane)

canonical events (semantic): session.start prompt.submit think tool.start tool.end
  file.edit run.ok run.fail test.pass test.fail review await.input await.approval
  commit push error rate.limited turn.stop session.end

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
    case 'state': {
      const s = readState();
      process.stdout.write(JSON.stringify({ ...s, ...resolve(s) }, null, 2) + '\n');
      break;
    }
    case 'reduce': { reduce(); process.stdout.write('ok\n'); break; }
    case 'watch': { watch(activePetId()); break; } // does not return
    case 'statusline': { statusline(activePetId()); break; }
    case 'install': {
      if (rest[0] === 'claude-code') installClaudeCode(rest.includes('--write'));
      else { process.stderr.write('usage: familiar install claude-code [--write]\n'); process.exit(2); }
      break;
    }
    case 'pets': { process.stdout.write(listPets().join('\n') + '\n'); break; }
    case 'overlay': { launchOverlay(rest); break; }
    case 'demo': { runDemo(); break; }
    case 'help': case undefined: { printHelp(); break; }
    default: { process.stderr.write(`unknown command: ${cmd}\n`); printHelp(); process.exit(2); }
  }
} catch (e) {
  if (cmd === 'emit') process.exit(0); // an emitter must never block a host hook
  process.stderr.write(String((e && e.stack) || e) + '\n');
  process.exit(1);
}
