// Draws App/Assets.xcassets/AppIcon.appiconset/AppIcon.png from the Android
// adaptive icon (app/src/main/res/drawable/ic_launcher_foreground.xml, #0B5CAD).
// Usage: swift bin/draw-app-icon.swift App/Assets.xcassets/AppIcon.appiconset/AppIcon.png
import CoreGraphics
import Foundation
import ImageIO
import UniformTypeIdentifiers

// The Android adaptive icon's shapes (108 × 108 viewport), drawn at 1024 px.
let size = 1024
let scale = CGFloat(size) / 108
let space = CGColorSpace(name: CGColorSpace.sRGB)!
let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0, space: space,
    bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)!
// Flip so y grows downward, as in the vector's path data.
ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: scale, y: -scale)
let blue = CGColor(srgbRed: 11 / 255, green: 92 / 255, blue: 173 / 255, alpha: 1)
ctx.setFillColor(blue); ctx.fill(CGRect(x: 0, y: 0, width: 108, height: 108))
func polygon(_ points: [(CGFloat, CGFloat)]) {
    ctx.beginPath(); ctx.move(to: CGPoint(x: points[0].0, y: points[0].1))
    for p in points.dropFirst() { ctx.addLine(to: CGPoint(x: p.0, y: p.1)) }
    ctx.closePath(); ctx.fillPath()
}
ctx.setFillColor(CGColor(srgbRed: 1, green: 1, blue: 1, alpha: 1))
polygon([(38, 30), (62, 30), (72, 40), (72, 78), (38, 78)])
ctx.setFillColor(blue)
polygon([(51, 46), (57, 46), (57, 54), (65, 54), (65, 60), (57, 60), (57, 68), (51, 68), (51, 60), (43, 60), (43, 54), (51, 54)])
let image = ctx.makeImage()!
let url = URL(fileURLWithPath: CommandLine.arguments[1])
let dest = CGImageDestinationCreateWithURL(url as CFURL, UTType.png.identifier as CFString, 1, nil)!
CGImageDestinationAddImage(dest, image, nil); CGImageDestinationFinalize(dest)
