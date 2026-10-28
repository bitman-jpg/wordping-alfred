import AppKit

// Regenerate the command tiles with: swift scripts/generate-icons.swift
// The symbols are drawn into PNGs because Alfred's Script Filter expects file paths.
let directory = URL(fileURLWithPath: CommandLine.arguments.dropFirst().first ?? "assets", isDirectory: true)
try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)

struct Tile {
    let name: String
    let symbol: String
    let start: NSColor
    let end: NSColor
}

func color(_ hex: UInt32) -> NSColor {
    NSColor(calibratedRed: CGFloat((hex >> 16) & 255) / 255,
            green: CGFloat((hex >> 8) & 255) / 255,
            blue: CGFloat(hex & 255) / 255, alpha: 1)
}

let tiles = [
    Tile(name: "saved", symbol: "bookmark.fill", start: color(0x2563EB), end: color(0x16B8D9)),
    Tile(name: "review", symbol: "rectangle.stack.fill", start: color(0x6552EA), end: color(0xB35AE8)),
    Tile(name: "reverse", symbol: "arrow.left.arrow.right", start: color(0x873DE0), end: color(0xD956BD)),
    Tile(name: "browse", symbol: "book.closed.fill", start: color(0x1689D7), end: color(0x16C2C0)),
    Tile(name: "remind", symbol: "bell.fill", start: color(0xB45DDB), end: color(0xF483A1)),
    Tile(name: "files", symbol: "folder.fill", start: color(0x3C66D8), end: color(0x7C5DE5)),
    Tile(name: "backup", symbol: "square.and.arrow.up.fill", start: color(0x3969D9), end: color(0x20A5DD)),
    Tile(name: "restore", symbol: "square.and.arrow.down.fill", start: color(0x3B79CE), end: color(0x28B9A7)),
    Tile(name: "export", symbol: "tablecells.fill", start: color(0x168FBA), end: color(0x18B88F)),
    Tile(name: "update", symbol: "arrow.triangle.2.circlepath", start: color(0x078B91), end: color(0x3BC6A5)),
]

func draw(_ tile: Tile, size: Int) throws {
    let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size,
        bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false,
        colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
    let context = NSGraphicsContext(bitmapImageRep: bitmap)!
    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    let s = CGFloat(size)
    let outer = NSBezierPath(roundedRect: NSRect(x: s * 0.065, y: s * 0.065,
        width: s * 0.87, height: s * 0.87), xRadius: s * 0.23, yRadius: s * 0.23)
    NSGradient(starting: tile.start, ending: tile.end)!.draw(in: outer, angle: -35)
    NSColor.white.withAlphaComponent(0.18).setStroke()
    outer.lineWidth = s * 0.012
    outer.stroke()
    let shine = NSBezierPath(roundedRect: NSRect(x: s * 0.16, y: s * 0.53,
        width: s * 0.68, height: s * 0.29), xRadius: s * 0.14, yRadius: s * 0.14)
    NSColor.white.withAlphaComponent(0.075).setFill()
    shine.fill()
    let config = NSImage.SymbolConfiguration(pointSize: s * 0.45, weight: .semibold)
    if let symbol = NSImage(systemSymbolName: tile.symbol, accessibilityDescription: tile.name)?
        .withSymbolConfiguration(config) {
        let box = NSRect(x: s * 0.255, y: s * 0.255, width: s * 0.49, height: s * 0.49)
        let tinted = NSImage(size: box.size, flipped: false) { rect in
            symbol.draw(in: rect)
            NSColor.white.setFill()
            rect.fill(using: .sourceIn)
            return true
        }
        tinted.draw(in: box)
    } else {
        fatalError("Missing SF Symbol: \(tile.symbol)")
    }
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
    let output = directory.appendingPathComponent("\(tile.name).png")
    try bitmap.representation(using: .png, properties: [:])!.write(to: output)
}

for tile in tiles { try draw(tile, size: 128) }
