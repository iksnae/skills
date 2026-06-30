// FamiliarOverlay — a native always-on-top desktop pet for the `familiar` prototype.
//
// One renderer that SUBSCRIBES to runtime state (it never drives it): it reads
// ~/.familiar/state.json (written by `familiar reduce`), resolves the semantic
// state (with render-time flash decay), and plays that state's animation loop
// from a sprite bundle. All motion comes from the frames themselves. A faithful
// scale-model of ambisphere's renderer-as-consumer principle and Apple
// flagship-renderer tier. See ambisphere/runtime#10.
//
// Animation: an optional anim.json in the frames dir maps each semantic state to
// an ordered frame list + frame duration + loop mode. A state with no entry
// falls back to a single <state>.png; no frames at all falls back to a
// text+color placeholder card. Frames authored on green are chroma-keyed to
// transparent in-app, so the bundle stays renderer-agnostic and the pet floats.

import AppKit
import Foundation
import QuartzCore
import SwiftUI
import UniformTypeIdentifiers

// MARK: - State (read side)

struct Resolved { let state: String; let attention: String; let message: String? }

final class StateReader {
    let url: URL
    init() {
        let env = ProcessInfo.processInfo.environment
        let homeDir = env["FAMILIAR_HOME"].map { URL(fileURLWithPath: $0) }
            ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".familiar")
        url = homeDir.appendingPathComponent("state.json")
    }

    func read() -> Resolved {
        guard let data = try? Data(contentsOf: url),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return Resolved(state: "idle", attention: "none", message: nil) }
        let base = (obj["base"] as? String) ?? "idle"
        var state = base
        if let flash = obj["flash"] as? [String: Any],
           let fs = flash["state"] as? String,
           let until = flash["until"] as? Double {
            if Date().timeIntervalSince1970 * 1000.0 < until { state = fs }
        }
        // `message` is its own render-time-decaying channel (a speech bubble).
        var message: String? = nil
        if let m = obj["message"] as? [String: Any],
           let text = m["text"] as? String,
           let until = m["until"] as? Double,
           Date().timeIntervalSince1970 * 1000.0 < until {
            message = text
        }
        return Resolved(state: state, attention: Self.attention(for: state), message: message)
    }

    static func attention(for s: String) -> String {
        switch s {
        case "awaiting-human", "errored", "failed", "rate-limited": return "interrupt"
        case "milestone", "succeeded": return "glance"
        default: return "none"
        }
    }
}

func fallbackState(_ s: String) -> String {
    switch s {
    case "succeeded": return "milestone"
    case "reviewing": return "working"
    case "errored": return "failed"
    case "rate-limited": return "awaiting-human"
    default: return "idle"
    }
}

// MARK: - Animation bundle (renderer assets, separate + swappable from manifest)

struct AnimSpec { let frames: [String]; let durations: [Double] }

final class AnimManifest {
    private var states: [String: AnimSpec] = [:]
    private var defaultMs: Double = 200
    let dir: URL?

    init(_ dir: URL?) {
        self.dir = dir
        guard let dir = dir,
              let data = try? Data(contentsOf: dir.appendingPathComponent("anim.json")),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else { return }
        if let d = obj["frameMs"] as? Double { defaultMs = d }
        if let s = obj["states"] as? [String: Any] {
            for (k, v) in s {
                guard let e = v as? [String: Any], let fr = e["frames"] as? [String] else { continue }
                let fms = (e["frameMs"] as? Double) ?? defaultMs
                // Per-frame durations (Codex carries these; long holds + a quick
                // blink read as calm). Fall back to a uniform frameMs.
                var durs = Array(repeating: fms, count: fr.count)
                if let arr = e["durations"] as? [NSNumber], arr.count == fr.count {
                    durs = arr.map { $0.doubleValue }
                }
                states[k] = AnimSpec(frames: fr, durations: durs)
            }
        }
    }

    // Resolve the frame list for a state: manifest entry, else a single
    // <state>.png, else the fallback state's single frame.
    func spec(for state: String) -> AnimSpec? {
        if let s = states[state] { return s }
        guard let dir = dir else { return nil }
        let direct = "\(state).png"
        if FileManager.default.fileExists(atPath: dir.appendingPathComponent(direct).path) {
            return AnimSpec(frames: [direct], durations: [defaultMs])
        }
        let fb = "\(fallbackState(state)).png"
        if FileManager.default.fileExists(atPath: dir.appendingPathComponent(fb).path) {
            return AnimSpec(frames: [fb], durations: [defaultMs])
        }
        return nil
    }
}

// MARK: - Familiar home, pets root, and config (~/.familiar/config.json)
//
// The active pet and on-screen size are settings the user can change live (from
// the settings window or by editing config.json). The overlay polls config and
// hot-swaps. Resolution priority: config.json, then env, then a default.

func familiarHome() -> URL {
    let env = ProcessInfo.processInfo.environment
    return env["FAMILIAR_HOME"].map { URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath) }
        ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".familiar")
}

// Pet bundles live in the repo pets dir (FAMILIAR_PETS_DIR, when launched via
// the CLI) AND in ~/.familiar/pets (where `familiar hatch` writes user pets).
func petsRoots() -> [URL] {
    var roots: [URL] = []
    if let p = ProcessInfo.processInfo.environment["FAMILIAR_PETS_DIR"] {
        roots.append(URL(fileURLWithPath: (p as NSString).expandingTildeInPath))
    }
    roots.append(familiarHome().appendingPathComponent("pets"))
    var seen = Set<String>()
    return roots.filter { seen.insert($0.standardizedFileURL.path).inserted }
}

func petBundle(_ pet: String) -> URL? {
    for root in petsRoots() {
        let b = root.appendingPathComponent(pet)
        if FileManager.default.fileExists(atPath: b.appendingPathComponent("pet.json").path) { return b }
    }
    return nil
}

func listPetIds() -> [String] {
    var ids = Set<String>()
    for root in petsRoots() {
        guard let entries = try? FileManager.default.contentsOfDirectory(atPath: root.path) else { continue }
        for e in entries where FileManager.default.fileExists(
            atPath: root.appendingPathComponent(e).appendingPathComponent("pet.json").path) {
            ids.insert(e)
        }
    }
    return ids.sorted()
}

func readConfig() -> [String: Any] {
    guard let data = try? Data(contentsOf: familiarHome().appendingPathComponent("config.json")),
          let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else { return [:] }
    return o
}

func writeConfig(_ updates: [String: Any]) {
    var o = readConfig()
    for (k, v) in updates { o[k] = v }
    let home = familiarHome()
    try? FileManager.default.createDirectory(at: home, withIntermediateDirectories: true)
    if let data = try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys]) {
        try? data.write(to: home.appendingPathComponent("config.json"))
    }
}

// Active pet/size: config wins, then env, then default.
func activePet() -> String {
    if let p = readConfig()["pet"] as? String, !p.isEmpty { return p }
    return ProcessInfo.processInfo.environment["FAMILIAR_PET"] ?? "fox"
}

func activeSize() -> Double {
    if let s = (readConfig()["size"] as? NSNumber)?.doubleValue, s >= 80 { return s }
    return ProcessInfo.processInfo.environment["FAMILIAR_SIZE"].flatMap { Double($0) } ?? 150
}

// Resolve a pet bundle's sprite frames dir from its pet.json renderer `dir`.
func petFramesDir(_ pet: String) -> URL? {
    guard let bundle = petBundle(pet) else { return nil }
    guard let data = try? Data(contentsOf: bundle.appendingPathComponent("pet.json")),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let renderers = obj["renderers"] as? [String: Any] else { return nil }
    let preferred = renderers["ascii-green-sprites"] as? [String: Any]
    let chosen = preferred
        ?? renderers.values.compactMap { $0 as? [String: Any] }.first { $0["dir"] is String }
    guard let sub = chosen?["dir"] as? String else { return nil }
    let dir = bundle.appendingPathComponent(sub)
    return FileManager.default.fileExists(atPath: dir.path) ? dir : nil
}

// Frames dir for a pet: FAMILIAR_FRAMES override wins (dev), else the bundle.
func framesDirectory(forPet pet: String) -> URL? {
    if let f = ProcessInfo.processInfo.environment["FAMILIAR_FRAMES"] {
        return URL(fileURLWithPath: (f as NSString).expandingTildeInPath).standardizedFileURL
    }
    return petFramesDir(pet)
}

// green-screen chroma key -> transparent (a no-op if the frame already has alpha)
func keyGreenCG(_ cg: CGImage) -> CGImage {
    let w = cg.width, h = cg.height
    var buf = [UInt8](repeating: 0, count: w * h * 4)
    let cs = CGColorSpaceCreateDeviceRGB()
    guard let ctx = CGContext(data: &buf, width: w, height: h, bitsPerComponent: 8,
                              bytesPerRow: w * 4, space: cs,
                              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return cg }
    ctx.draw(cg, in: CGRect(x: 0, y: 0, width: w, height: h))
    var i = 0
    while i < buf.count {
        let r = Int(buf[i]), g = Int(buf[i + 1]), b = Int(buf[i + 2])
        if g > 90 && g > r + 40 && g > b + 40 {
            buf[i] = 0; buf[i + 1] = 0; buf[i + 2] = 0; buf[i + 3] = 0
        }
        i += 4
    }
    return ctx.makeImage() ?? cg
}

func cgImage(of ns: NSImage) -> CGImage? {
    var rect = NSRect(origin: .zero, size: ns.size)
    return ns.cgImage(forProposedRect: &rect, context: nil, hints: nil)
}

// An optional packed sprite sheet: one decode, frames cropped by name. Derived
// from the discrete frames (sheet.json maps name -> pixel rect, top-left origin
// matching the packer). Present => the renderer crops the sheet; absent => it
// loads the discrete <name>.png files. Either way anim.json stays the truth.
struct Sheet { let image: CGImage; let rects: [String: CGRect] }

func loadSheet(_ dir: URL?) -> Sheet? {
    guard let dir = dir,
          let data = try? Data(contentsOf: dir.appendingPathComponent("sheet.json")),
          let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
          let frames = obj["frames"] as? [String: Any],
          let ns = NSImage(contentsOf: dir.appendingPathComponent("sheet.png")),
          let cg = cgImage(of: ns) else { return nil }
    var rects: [String: CGRect] = [:]
    for (name, v) in frames {
        guard let e = v as? [String: Any],
              let x = e["x"] as? Double, let y = e["y"] as? Double,
              let w = e["w"] as? Double, let h = e["h"] as? Double else { continue }
        rects[name] = CGRect(x: x, y: y, width: w, height: h)
    }
    return rects.isEmpty ? nil : Sheet(image: cg, rects: rects)
}

final class FrameCache {
    private var cache: [String: CGImage] = [:]
    let dir: URL?
    let sheet: Sheet?
    init(_ dir: URL?) { self.dir = dir; self.sheet = loadSheet(dir) }

    func cgFrames(_ files: [String]) -> [CGImage] {
        var out: [CGImage] = []
        for f in files {
            if let c = cache[f] { out.append(c); continue }
            var raw: CGImage?
            if let sheet = sheet, let r = sheet.rects[f] {
                raw = sheet.image.cropping(to: r)        // packed-sheet path
            } else if let dir = dir, let ns = NSImage(contentsOf: dir.appendingPathComponent(f)) {
                raw = cgImage(of: ns)                     // discrete-PNG fallback
            }
            guard let cg = raw else { continue }
            let keyed = keyGreenCG(cg)
            cache[f] = keyed
            out.append(keyed)
        }
        return out
    }
}

// MARK: - Placeholder presentation (when no frames exist at all)

func hexColor(_ hex: UInt32) -> NSColor {
    NSColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255.0, green: CGFloat((hex >> 8) & 0xff) / 255.0,
            blue: CGFloat(hex & 0xff) / 255.0, alpha: 1.0)
}
func accent(for s: String) -> NSColor {
    switch s {
    case "thinking": return hexColor(0x7FB3FF)
    case "reviewing": return hexColor(0xC9A0FF)
    case "succeeded", "milestone": return hexColor(0x7EC07E)
    case "failed", "errored": return hexColor(0xE06666)
    case "rate-limited": return hexColor(0xE8A23F)
    case "sleeping": return hexColor(0x888888)
    default: return hexColor(0xFFCC00)
    }
}
func face(for s: String) -> String {
    switch s {
    case "thinking": return "( ·_· ) ?"
    case "working": return "( >ω< )"
    case "awaiting-human": return "( ·o· ) ?"
    case "reviewing": return "( o.o )"
    case "succeeded", "milestone": return "\\( ^_^ )/"
    case "failed": return "( ;_; )"
    case "errored": return "( x_x )"
    case "rate-limited": return "( -.- ) z"
    case "sleeping": return "( u.u ) z"
    default: return "( ·ω· )"
    }
}

// MARK: - Pet view (frame-loop playback + procedural motion, or placeholder)

final class PetView: NSView {
    private let content = CALayer()
    private let imageLayer = CALayer()
    private let card = CALayer()
    private let faceLayer = CATextLayer()
    private let labelLayer = CATextLayer()

    private var frames: [CGImage] = []
    private var durations: [Double] = [200]
    private var totalMs: Double = 200
    private var phase: CGFloat = 0
    private var attention = "none"
    private var usingFrames = false
    private var lastFrameIndex = -1

    override init(frame: NSRect) {
        super.init(frame: frame)
        wantsLayer = true
        layer?.backgroundColor = .clear
        let scale = NSScreen.main?.backingScaleFactor ?? 2.0
        content.frame = bounds
        layer?.addSublayer(content)

        imageLayer.contentsGravity = .resizeAspect
        imageLayer.contentsScale = scale  // render frames at native retina px, not 1x
        imageLayer.isHidden = true
        content.addSublayer(imageLayer)

        card.backgroundColor = NSColor(srgbRed: 0.07, green: 0.07, blue: 0.08, alpha: 0.92).cgColor
        card.cornerRadius = 18
        card.borderWidth = 1.5
        card.isHidden = true
        content.addSublayer(card)

        faceLayer.alignmentMode = .center
        faceLayer.font = NSFont.monospacedSystemFont(ofSize: 26, weight: .medium)
        faceLayer.fontSize = 26
        faceLayer.contentsScale = scale
        card.addSublayer(faceLayer)
        labelLayer.alignmentMode = .center
        labelLayer.font = NSFont.monospacedSystemFont(ofSize: 12, weight: .semibold)
        labelLayer.fontSize = 12
        labelLayer.contentsScale = scale
        labelLayer.foregroundColor = NSColor(white: 0.8, alpha: 1).cgColor
        card.addSublayer(labelLayer)

        Timer.scheduledTimer(withTimeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in self?.tick() }
    }
    required init?(coder: NSCoder) { fatalError("not used") }

    override func layout() {
        super.layout()
        content.frame = bounds
        imageLayer.frame = bounds
        let cw: CGFloat = 168, ch: CGFloat = 96
        card.frame = CGRect(x: (bounds.width - cw) / 2, y: (bounds.height - ch) / 2, width: cw, height: ch)
        faceLayer.frame = CGRect(x: 0, y: ch - 56, width: cw, height: 40)
        labelLayer.frame = CGRect(x: 0, y: 12, width: cw, height: 18)
    }

    func show(state: String, attention: String, frames: [CGImage], durations: [Double]) {
        self.attention = attention
        if frames.isEmpty {
            usingFrames = false
            imageLayer.isHidden = true
            card.isHidden = false
            let a = accent(for: state)
            faceLayer.string = face(for: state)
            faceLayer.foregroundColor = a.cgColor
            labelLayer.string = state.uppercased() + (attention == "interrupt" ? "  !" : "")
            card.borderColor = a.cgColor
            return
        }
        usingFrames = true
        card.isHidden = true
        imageLayer.isHidden = false
        let durs = durations.count == frames.count ? durations.map { max(40, $0) }
                                                    : Array(repeating: 200.0, count: frames.count)
        if frames.count != self.frames.count { lastFrameIndex = -1 }   // reset only on a new set
        self.frames = frames
        self.durations = durs
        self.totalMs = max(1, durs.reduce(0, +))
    }

    private func tick() {
        phase += 1.0 / 60.0
        let interrupt = (attention == "interrupt")

        // The view itself stays put — motion comes only from the sprite frames.
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        if usingFrames && !frames.isEmpty {
            // Walk the per-frame durations: long holds + a quick blink read calm.
            var t = (Double(phase) * 1000.0).truncatingRemainder(dividingBy: totalMs)
            var idx = 0
            for (i, d) in durations.enumerated() {
                if t < d { idx = i; break }
                t -= d
                idx = i
            }
            if idx != lastFrameIndex {
                lastFrameIndex = idx
                imageLayer.contents = frames[idx]
            }
        } else {
            card.borderWidth = interrupt ? (2.0 + 1.5 * (sin(phase * 8) * 0.5 + 0.5)) : 1.5
        }
        CATransaction.commit()
    }
}

// MARK: - Speech bubble (a separate floating panel that tracks the pet)
//
// The `message` channel is orthogonal to state: a transient bubble that floats
// above the pet and points down at it. Its own borderless panel (rather than
// drawing inside the pet panel) lets it size to its text and overflow the pet's
// square without clipping. It ignores mouse events so the pet stays draggable.

final class BubbleView: NSView {
    var text: String = "" { didSet { needsDisplay = true } }
    private let maxTextWidth: CGFloat = 200
    private let pad = NSSize(width: 12, height: 9)
    private let corner: CGFloat = 11
    private let tailH: CGFloat = 9
    private let tailW: CGFloat = 16
    private let font = NSFont.systemFont(ofSize: 12.5, weight: .medium)

    private func attr() -> NSAttributedString {
        let para = NSMutableParagraphStyle()
        para.alignment = .center
        para.lineBreakMode = .byWordWrapping
        return NSAttributedString(string: text, attributes: [
            .font: font, .foregroundColor: NSColor.white, .paragraphStyle: para])
    }
    private func textBounds() -> NSRect {
        attr().boundingRect(with: NSSize(width: maxTextWidth, height: 600),
                            options: [.usesLineFragmentOrigin, .usesFontLeading])
    }
    // The view size needed for the current text (rounded body + downward tail).
    func fittingSize() -> NSSize {
        let tb = textBounds()
        return NSSize(width: max(ceil(tb.width) + pad.width * 2, 44),
                      height: ceil(tb.height) + pad.height * 2 + tailH)
    }
    override func draw(_ dirty: NSRect) {
        guard !text.isEmpty else { return }
        let b = bounds
        let bodyRect = NSRect(x: 0, y: tailH, width: b.width, height: b.height - tailH)
        let body = NSBezierPath(roundedRect: bodyRect, xRadius: corner, yRadius: corner)
        let cx = b.midX
        let tail = NSBezierPath()
        tail.move(to: NSPoint(x: cx - tailW / 2, y: tailH))
        tail.line(to: NSPoint(x: cx, y: 0))
        tail.line(to: NSPoint(x: cx + tailW / 2, y: tailH))
        tail.close()
        NSColor(srgbRed: 0.08, green: 0.08, blue: 0.10, alpha: 0.94).setFill()
        body.fill(); tail.fill()
        NSColor(white: 1, alpha: 0.12).setStroke()
        body.lineWidth = 1; body.stroke()
        let textRect = NSRect(x: pad.width, y: tailH + pad.height,
                              width: b.width - pad.width * 2,
                              height: bodyRect.height - pad.height * 2)
        attr().draw(with: textRect, options: [.usesLineFragmentOrigin, .usesFontLeading])
    }
}

// MARK: - Settings window (SwiftUI; writes config.json, which the overlay polls)

final class SettingsWindowController: NSWindowController {
    convenience init() {
        let win = NSWindow(contentRect: NSRect(x: 0, y: 0, width: 440, height: 360),
                           styleMask: [.titled, .closable], backing: .buffered, defer: false)
        win.title = "Familiar Settings"
        win.contentViewController = NSHostingController(rootView: SettingsView())
        win.center()
        win.isReleasedWhenClosed = false
        self.init(window: win)
    }
}

struct SettingsView: View {
    var body: some View {
        TabView {
            GeneralTab().tabItem { Label("General", systemImage: "gearshape") }
            PetsTab().tabItem { Label("Pets", systemImage: "pawprint") }
            CreatePetTab().tabItem { Label("Create", systemImage: "wand.and.stars") }
            ImportTab().tabItem { Label("Import", systemImage: "square.and.arrow.down") }
        }
        .frame(width: 440, height: 360)
    }
}

struct GeneralTab: View {
    @State private var size: Double = activeSize()
    var body: some View {
        Form {
            VStack(alignment: .leading, spacing: 6) {
                Text("Pet size: \(Int(size)) px").font(.subheadline)
                Slider(value: $size, in: 90...300, step: 2)
                    .onChange(of: size) { _, v in writeConfig(["size": v]) }
                Text("Drag the pet anywhere on screen to reposition it.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .padding()
        }
    }
}

struct PetsTab: View {
    @State private var pets: [String] = listPetIds()
    @State private var selected: String = activePet()
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Active pet").font(.headline)
            ForEach(pets, id: \.self) { pet in
                HStack(spacing: 8) {
                    Image(systemName: pet == selected ? "largecircle.fill.circle" : "circle")
                        .foregroundStyle(pet == selected ? Color.accentColor : .secondary)
                    Text(pet).font(.body)
                    Spacer()
                }
                .contentShape(Rectangle())
                .onTapGesture { selected = pet; writeConfig(["pet": pet]) }
            }
            Spacer()
            Button("Refresh list") { pets = listPetIds() }
                .controlSize(.small)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

// Runs `familiar hatch` as a child process and streams its progress.
final class Hatcher: ObservableObject {
    @Published var running = false
    @Published var lines: [String] = []
    @Published var newPet: String?

    func hatch(name: String, prompt: String, refs: [URL]) {
        var sub = ["hatch", "--name", name, "--prompt", prompt]
        for r in refs { sub.append(contentsOf: ["--reference", r.path]) }
        run(sub, startMessage: "Hatching “\(name)” — this takes a few minutes…")
    }

    func importCodex(path: String, generateMissing: Bool) {
        var sub = ["import-codex", "--path", path]
        if generateMissing { sub.append("--generate-missing") }
        run(sub, startMessage: "Importing \(URL(fileURLWithPath: path).lastPathComponent)…"
            + (generateMissing ? " (generating missing states — a few minutes)" : ""))
    }

    private func run(_ sub: [String], startMessage: String) {
        guard let cli = ProcessInfo.processInfo.environment["FAMILIAR_CLI"] else {
            lines = ["error: FAMILIAR_CLI not set — relaunch the overlay via `familiar overlay`"]
            return
        }
        running = true; newPet = nil
        lines = [startMessage]
        let args = ["node", cli] + sub
        let proc = Process()
        proc.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        proc.arguments = args
        let pipe = Pipe()
        proc.standardOutput = pipe
        proc.standardError = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] h in
            let d = h.availableData
            guard !d.isEmpty, let s = String(data: d, encoding: .utf8) else { return }
            DispatchQueue.main.async { self?.ingest(s) }
        }
        proc.terminationHandler = { [weak self] p in
            DispatchQueue.main.async {
                pipe.fileHandleForReading.readabilityHandler = nil
                self?.running = false
                self?.lines.append(p.terminationStatus == 0 ? "✓ done" : "✗ failed (exit \(p.terminationStatus))")
            }
        }
        do { try proc.run() }
        catch { running = false; lines.append("error: \(error.localizedDescription)") }
    }

    private func ingest(_ s: String) {
        for line in s.split(whereSeparator: { $0 == "\n" }) {
            if let data = line.data(using: .utf8),
               let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let step = o["step"] as? String {
                let status = o["status"] as? String ?? ""
                if step == "done", let id = o["id"] as? String { newPet = id }
                if let m = o["message"] as? String { lines.append("\(step): \(status) — \(m)") }
                else { lines.append("\(step): \(status)") }
            } else {
                lines.append(String(line))
            }
        }
    }
}

struct CreatePetTab: View {
    @StateObject private var hatcher = Hatcher()
    @State private var name = ""
    @State private var prompt = ""
    @State private var refs: [URL] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            TextField("Pet name", text: $name)
            Text("Describe your pet").font(.caption).foregroundStyle(.secondary)
            TextEditor(text: $prompt)
                .font(.callout)
                .frame(height: 56)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.gray.opacity(0.3)))
            HStack {
                Button("Add reference image…") { pickRefs() }.controlSize(.small)
                if !refs.isEmpty {
                    Text("\(refs.count) image(s)").font(.caption).foregroundStyle(.secondary)
                    Button("clear") { refs = [] }.controlSize(.small)
                }
            }
            HStack {
                Button(hatcher.running ? "Hatching…" : "Hatch pet") {
                    hatcher.hatch(name: name, prompt: prompt, refs: refs)
                }
                .disabled(hatcher.running || name.isEmpty || prompt.isEmpty)
                if let id = hatcher.newPet {
                    Button("Use “\(id)”") { writeConfig(["pet": id]) }
                }
            }
            if !hatcher.lines.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(hatcher.lines.indices, id: \.self) { i in
                            Text(hatcher.lines[i]).font(.caption2.monospaced())
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 96)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.gray.opacity(0.2)))
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func pickRefs() {
        let panel = NSOpenPanel()
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.allowedContentTypes = [.image]
        if panel.runModal() == .OK { refs = panel.urls }
    }
}

struct ImportTab: View {
    @StateObject private var runner = Hatcher()
    @State private var src: URL?
    @State private var generateMissing = false

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Import a Codex pet").font(.headline)
            HStack {
                Button("Choose Codex pet…") { pick() }.controlSize(.small)
                if let s = src { Text(s.lastPathComponent).font(.caption).foregroundStyle(.secondary) }
            }
            Text("Pick a Codex pet folder (with spritesheet.webp) or a spritesheet file.")
                .font(.caption2).foregroundStyle(.secondary)
            Toggle("Generate missing sequences (e.g. sleeping)", isOn: $generateMissing)
                .font(.callout)
            Text("Codex pets don't cover every state. Generating fills the gaps in the pet's own style — slower, uses image generation. Off = missing states reuse idle.")
                .font(.caption2).foregroundStyle(.secondary)
            HStack {
                Button(runner.running ? "Importing…" : "Import") {
                    if let s = src { runner.importCodex(path: s.path, generateMissing: generateMissing) }
                }
                .disabled(runner.running || src == nil)
                if let id = runner.newPet { Button("Use “\(id)”") { writeConfig(["pet": id]) } }
            }
            if !runner.lines.isEmpty {
                ScrollView {
                    VStack(alignment: .leading, spacing: 1) {
                        ForEach(runner.lines.indices, id: \.self) { i in
                            Text(runner.lines[i]).font(.caption2.monospaced())
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                }
                .frame(maxHeight: 84)
                .overlay(RoundedRectangle(cornerRadius: 4).stroke(.gray.opacity(0.2)))
            }
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    private func pick() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        if panel.runModal() == .OK { src = panel.urls.first }
    }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NSPanel!
    private var petView: PetView!
    private var bubblePanel: NSPanel!
    private var bubbleView: BubbleView!
    private var bubbleVisible = false
    private let reader = StateReader()
    private var anim: AnimManifest!
    private var frameCache: FrameCache!
    private var current = ""
    private var loadedPet = ""
    private var loadedSize: Double = 0
    private var settings: SettingsWindowController?

    func applicationDidFinishLaunching(_ note: Notification) {
        let size = activeSize()
        loadedSize = size

        panel = NSPanel(contentRect: NSRect(origin: .zero, size: NSSize(width: size, height: size)),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        petView = PetView(frame: NSRect(origin: .zero, size: NSSize(width: size, height: size)))
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Preferences…", action: #selector(openPreferences), keyEquivalent: ","))
        menu.addItem(.separator())
        menu.addItem(NSMenuItem(title: "Quit Familiar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        menu.items.forEach { $0.target = $0.action == #selector(openPreferences) ? self : nil }
        petView.menu = menu
        panel.contentView = petView

        if let screen = NSScreen.main {
            let v = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(x: v.maxX - size - 24, y: v.minY + 24))
        }
        panel.orderFrontRegardless()

        // Speech-bubble panel: floats above the pet, click-through, tracks drags.
        bubbleView = BubbleView(frame: NSRect(x: 0, y: 0, width: 220, height: 60))
        bubblePanel = NSPanel(contentRect: bubbleView.frame,
                              styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        bubblePanel.isOpaque = false
        bubblePanel.backgroundColor = .clear
        bubblePanel.hasShadow = false
        bubblePanel.level = .floating
        bubblePanel.ignoresMouseEvents = true
        bubblePanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        bubblePanel.contentView = bubbleView
        bubblePanel.alphaValue = 0

        loadPet(activePet())
        update()
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.tick() }
    }

    @objc func openPreferences() {
        if settings == nil { settings = SettingsWindowController() }
        settings?.showWindow(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    // (Re)load a pet bundle's frames + manifest.
    private func loadPet(_ pet: String) {
        let dir = framesDirectory(forPet: pet)
        anim = AnimManifest(dir)
        frameCache = FrameCache(dir)
        loadedPet = pet
        current = ""   // force a reshow on the next tick
        let src = frameCache.sheet.map { "sheet (\($0.rects.count) frames)" } ?? "discrete PNGs"
        FileHandle.standardError.write(Data("familiar-overlay: pet=\(pet) frames=\(dir?.path ?? "none") source=\(src)\n".utf8))
    }

    private func applySize(_ size: Double) {
        loadedSize = size
        let origin = panel.frame.origin
        panel.setFrame(NSRect(x: origin.x, y: origin.y, width: size, height: size), display: true)
        petView.frame = NSRect(origin: .zero, size: NSSize(width: size, height: size))
        petView.needsLayout = true
    }

    private func tick() {
        // Live-apply settings changes (pet swap, resize) from config.json.
        let pet = activePet()
        if pet != loadedPet { loadPet(pet) }
        let size = activeSize()
        if abs(size - loadedSize) > 0.5 { applySize(size) }
        update()
    }

    private func update() {
        let r = reader.read()
        if r.state != current { current = r.state }
        if let spec = anim.spec(for: r.state) {
            petView.show(state: r.state, attention: r.attention,
                         frames: frameCache.cgFrames(spec.frames), durations: spec.durations)
        } else {
            petView.show(state: r.state, attention: r.attention, frames: [], durations: [200])
        }
        showBubble(r.message)
    }

    // Show/track/hide the speech bubble for the current message (nil => hide).
    private func showBubble(_ text: String?) {
        guard let text = text, !text.isEmpty else {
            if bubbleVisible {
                bubbleVisible = false
                NSAnimationContext.runAnimationGroup({ ctx in
                    ctx.duration = 0.25
                    bubblePanel.animator().alphaValue = 0
                }, completionHandler: { [weak self] in
                    if self?.bubbleVisible == false { self?.bubblePanel.orderOut(nil) }
                })
            }
            return
        }
        if bubbleView.text != text { bubbleView.text = text }
        positionBubble()   // every tick, so the bubble follows the pet when dragged
        if !bubbleVisible {
            bubbleVisible = true
            bubblePanel.orderFront(nil)
            NSAnimationContext.runAnimationGroup({ ctx in
                ctx.duration = 0.2
                bubblePanel.animator().alphaValue = 1
            })
        }
    }

    private func positionBubble() {
        let size = bubbleView.fittingSize()
        let pet = panel.frame
        var x = pet.midX - size.width / 2
        let y = pet.maxY - loadedSize * 0.16   // overlap the pet's head so the tail meets it
        if let screen = NSScreen.main {
            let vf = screen.visibleFrame
            x = min(max(x, vf.minX + 6), vf.maxX - size.width - 6)
        }
        bubblePanel.setFrame(NSRect(x: x, y: y, width: size.width, height: size.height), display: true)
        bubbleView.frame = NSRect(origin: .zero, size: size)
        bubbleView.needsDisplay = true
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
