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

// MARK: - State (read side)

struct Resolved { let state: String; let attention: String }

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
        else { return Resolved(state: "idle", attention: "none") }
        let base = (obj["base"] as? String) ?? "idle"
        var state = base
        if let flash = obj["flash"] as? [String: Any],
           let fs = flash["state"] as? String,
           let until = flash["until"] as? Double {
            if Date().timeIntervalSince1970 * 1000.0 < until { state = fs }
        }
        return Resolved(state: state, attention: Self.attention(for: state))
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

struct AnimSpec { let frames: [String]; let frameMs: Double }

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
                states[k] = AnimSpec(frames: fr, frameMs: (e["frameMs"] as? Double) ?? defaultMs)
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
            return AnimSpec(frames: [direct], frameMs: defaultMs)
        }
        let fb = "\(fallbackState(state)).png"
        if FileManager.default.fileExists(atPath: dir.appendingPathComponent(fb).path) {
            return AnimSpec(frames: [fb], frameMs: defaultMs)
        }
        return nil
    }
}

// Resolve the sprite frames dir, in priority order:
//   1. FAMILIAR_FRAMES — an explicit dir (absolute or ~-expanded).
//   2. FAMILIAR_PET (+ optional FAMILIAR_PETS_DIR) — read the pet bundle's
//      pet.json and follow its renderer's `dir`, so callers pass a pet id and
//      the renderer finds the frames itself (no path juggling).
//   3. a positional argv[1] dir.
//   4. the default fox bundle under ~/.familiar/pets.
func framesDirectory() -> URL? {
    let env = ProcessInfo.processInfo.environment
    if let f = env["FAMILIAR_FRAMES"] {
        return URL(fileURLWithPath: (f as NSString).expandingTildeInPath).standardizedFileURL
    }
    if let dir = petFramesDirectory(env: env) { return dir }
    if CommandLine.arguments.count > 1 {
        return URL(fileURLWithPath: CommandLine.arguments[1]).standardizedFileURL
    }
    let def = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent(".familiar/pets/fox/frames")
    return FileManager.default.fileExists(atPath: def.path) ? def : nil
}

// Resolve a pet bundle's sprite frames dir from its pet.json. The pets root is
// FAMILIAR_PETS_DIR (else ~/.familiar/pets); the pet id is FAMILIAR_PET. We
// follow the green-sprite renderer's `dir`, falling back to any renderer that
// declares a `dir`.
func petFramesDirectory(env: [String: String]) -> URL? {
    guard let pet = env["FAMILIAR_PET"] else { return nil }
    let petsRoot: URL = env["FAMILIAR_PETS_DIR"].map {
        URL(fileURLWithPath: ($0 as NSString).expandingTildeInPath)
    } ?? FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".familiar/pets")
    let bundle = petsRoot.appendingPathComponent(pet)
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
    private var frameMs: Double = 200
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

    func show(state: String, attention: String, frames: [CGImage], frameMs: Double) {
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
        // only reset the strip when the frame set actually changes
        if frames.count != self.frames.count {
            self.frames = frames
            self.frameMs = max(40, frameMs)
            lastFrameIndex = -1
        } else {
            self.frames = frames
            self.frameMs = max(40, frameMs)
        }
    }

    private func tick() {
        phase += 1.0 / 60.0
        let interrupt = (attention == "interrupt")

        // The view itself stays put — motion comes only from the sprite frames.
        CATransaction.begin()
        CATransaction.setDisableActions(true)

        if usingFrames && !frames.isEmpty {
            let idx = Int((Double(phase) * 1000.0) / frameMs) % frames.count
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

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var panel: NSPanel!
    private var petView: PetView!
    private let reader = StateReader()
    private var anim: AnimManifest!
    private var frameCache: FrameCache!
    private var current = ""

    func applicationDidFinishLaunching(_ note: Notification) {
        let dir = framesDirectory()
        anim = AnimManifest(dir)
        frameCache = FrameCache(dir)
        let src = frameCache.sheet.map { "sheet (\($0.rects.count) frames)" } ?? "discrete PNGs"
        FileHandle.standardError.write(Data("familiar-overlay: frames=\(dir?.path ?? "none") source=\(src)\n".utf8))
        let size = NSSize(width: 220, height: 200)

        panel = NSPanel(contentRect: NSRect(origin: .zero, size: size),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isOpaque = false
        panel.backgroundColor = .clear
        panel.hasShadow = false
        panel.level = .floating
        panel.isMovableByWindowBackground = true
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        petView = PetView(frame: NSRect(origin: .zero, size: size))
        let menu = NSMenu()
        menu.addItem(NSMenuItem(title: "Quit Familiar", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q"))
        petView.menu = menu
        panel.contentView = petView

        if let screen = NSScreen.main {
            let v = screen.visibleFrame
            panel.setFrameOrigin(NSPoint(x: v.maxX - size.width - 24, y: v.minY + 24))
        }
        panel.orderFrontRegardless()

        update()
        Timer.scheduledTimer(withTimeInterval: 0.25, repeats: true) { [weak self] _ in self?.update() }
    }

    private func update() {
        let r = reader.read()
        if r.state != current {
            current = r.state
            if let spec = anim.spec(for: r.state) {
                petView.show(state: r.state, attention: r.attention,
                             frames: frameCache.cgFrames(spec.frames), frameMs: spec.frameMs)
            } else {
                petView.show(state: r.state, attention: r.attention, frames: [], frameMs: 200)
            }
        } else {
            // refresh attention without resetting the running animation
            if let spec = anim.spec(for: r.state) {
                petView.show(state: r.state, attention: r.attention,
                             frames: frameCache.cgFrames(spec.frames), frameMs: spec.frameMs)
            } else {
                petView.show(state: r.state, attention: r.attention, frames: [], frameMs: 200)
            }
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
