import Foundation
import ARKit
import RoomPlan
import SceneKit
import CoreImage
import ImageIO
import UIKit

/// Ett bilde fra skanningen, med kameraet som tok det.
struct Fotobilde {
    let jpeg: Data
    let kamera: ARCamera
    /// Kameraets fulle oppløsning. JPEG-en er skalert ned med `skala`.
    let opplosning: CGSize
    let skala: CGFloat
}

/// Samler bilder under skanningen: et nytt bilde når kameraet har flyttet seg
/// eller snudd seg nok, så bildene dekker rommet fra ulike vinkler.
final class Bildesamler {
    private(set) var bilder: [Fotobilde] = []
    private var siste: simd_float4x4?
    private var opptatt = false
    private let ko = DispatchQueue(label: "romskanner.bildesamler", qos: .utility)
    private let ci = CIContext()
    private let maks = 45
    private let skala: CGFloat = 0.5

    /// Kalles fra hovedtråden med det siste kamerabildet.
    func vurder(_ frame: ARFrame) {
        guard bilder.count < maks, !opptatt else { return }
        guard case .normal = frame.camera.trackingState else { return }
        let t = frame.camera.transform
        if let s = siste {
            let flytt = simd_distance(SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z), SIMD3(s.columns.3.x, s.columns.3.y, s.columns.3.z))
            let retning = simd_dot(SIMD3(t.columns.2.x, t.columns.2.y, t.columns.2.z), SIMD3(s.columns.2.x, s.columns.2.y, s.columns.2.z))
            if flytt < 0.3 && retning > 0.97 { return } // nesten samme sted og retning
        }
        siste = t
        opptatt = true
        let buffer = frame.capturedImage
        let kamera = frame.camera
        let opplosning = kamera.imageResolution
        let skala = self.skala
        ko.async { [weak self] in
            guard let self else { return }
            let bilde = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: skala, y: skala))
            let data = self.ci.jpegRepresentation(
                of: bilde,
                colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.7])
            DispatchQueue.main.async {
                if let data { self.bilder.append(Fotobilde(jpeg: data, kamera: kamera, opplosning: opplosning, skala: skala)) }
                self.opptatt = false
            }
        }
    }
}

/// 3D-modell der veggene og gulvet har bilder fra skanningen.
enum Fotomodell {
    static func url(_ id: UUID) -> URL { Modell.mappe.appendingPathComponent(id.uuidString + "-foto.usdz") }
    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: url(id).path) }
    static func slett(_ id: UUID) { try? FileManager.default.removeItem(at: url(id)) }

    private static let pikslerPerMeter: CGFloat = 160
    private static let rute: Float = 0.5 // meter

    /// Lager modellen og lagrer den som USDZ. Tar noen sekunder; kjør den i bakgrunnen.
    static func lag(rom: CapturedRoom, bilder: [Fotobilde], til url: URL) {
        let ci = CIContext()
        let kilder = bilder.map { CIImage(data: $0.jpeg) }
        let scene = SCNScene()

        // Veggene: én flate per vegg, med bilde
        for vegg in rom.walls {
            let w = vegg.dimensions.x, h = vegg.dimensions.y
            guard w > 0.1, h > 0.1 else { continue }
            let tekstur = teksturer(transform: vegg.transform, bredde: w, hoyde: h, bilder: bilder, kilder: kilder, ci: ci)
            let flate = SCNPlane(width: CGFloat(w), height: CGFloat(h))
            flate.materials = [materiale(tekstur)]
            let node = SCNNode(geometry: flate)
            node.simdTransform = vegg.transform
            scene.rootNode.addChildNode(node)
        }

        // Gulvet: mangekanten fra RoomPlan, med bilde ovenfra
        if let gulv = gulvnode(rom: rom, bilder: bilder, kilder: kilder, ci: ci) {
            scene.rootNode.addChildNode(gulv)
        }

        // Møbler som lyse klosser
        for o in rom.objects {
            let boks = SCNBox(width: CGFloat(o.dimensions.x), height: CGFloat(o.dimensions.y), length: CGFloat(o.dimensions.z), chamferRadius: 0.02)
            let m = SCNMaterial()
            m.diffuse.contents = UIColor(white: 0.82, alpha: 1)
            boks.materials = [m]
            let node = SCNNode(geometry: boks)
            node.simdTransform = o.transform
            scene.rootNode.addChildNode(node)
        }

        try? FileManager.default.removeItem(at: url)
        _ = scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    }

    private static func materiale(_ tekstur: CGImage?) -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = tekstur ?? UIColor(white: 0.88, alpha: 1)
        m.isDoubleSided = true
        m.lightingModel = .constant // vis bildet slik det er, uten ekstra skygge
        return m
    }

    /// Bilde for en flate i flatens eget plan (x langs bredden, y opp, sentrert i origo).
    /// Flaten deles i ruter; hver rute får bildet som ser den best.
    static func teksturer(transform t: simd_float4x4, bredde w: Float, hoyde h: Float,
                          bilder: [Fotobilde], kilder: [CIImage?], ci: CIContext) -> CGImage? {
        guard !bilder.isEmpty else { return nil }
        let kolonner = max(1, Int((w / rute).rounded(.up))), rader = max(1, Int((h / rute).rounded(.up)))
        let tw = w / Float(kolonner), th = h / Float(rader)
        var bredPx = CGFloat(w) * pikslerPerMeter, hoyPx = CGFloat(h) * pikslerPerMeter
        let maksPx: CGFloat = 2048
        if bredPx > maksPx { hoyPx *= maksPx / bredPx; bredPx = maksPx }
        if hoyPx > maksPx { bredPx *= maksPx / hoyPx; hoyPx = maksPx }
        let ruteB = bredPx / CGFloat(kolonner), ruteH = hoyPx / CGFloat(rader)
        let normal = simd_normalize(SIMD3(t.columns.2.x, t.columns.2.y, t.columns.2.z))
        func verden(_ x: Float, _ y: Float) -> SIMD3<Float> {
            let p = simd_mul(t, SIMD4<Float>(x, y, 0, 1))
            return SIMD3(p.x, p.y, p.z)
        }

        var lerret = CIImage(color: CIColor(red: 0.88, green: 0.88, blue: 0.88)).cropped(to: CGRect(x: 0, y: 0, width: bredPx, height: hoyPx))
        var noeFunnet = false
        for r in 0..<rader {
            for k in 0..<kolonner {
                let x0 = -w / 2 + Float(k) * tw, x1 = x0 + tw
                let yTopp = h / 2 - Float(r) * th, yBunn = yTopp - th
                let hjorner = [verden(x0, yTopp), verden(x1, yTopp), verden(x0, yBunn), verden(x1, yBunn)]
                let midt = verden((x0 + x1) / 2, (yTopp + yBunn) / 2)
                guard let treff = beste(hjorner: hjorner, midt: midt, normal: normal, bilder: bilder),
                      let kilde = kilder[treff.0] else { continue }
                let i = treff.0, punkter = treff.1
                let b = bilder[i]
                // Fra kameraets pikselkoordinater (origo oppe til venstre) til JPEG-ens Core Image-koordinater (origo nede til venstre)
                let hoyde = b.opplosning.height * b.skala
                let v = punkter.map { CIVector(x: $0.x * b.skala, y: hoyde - $0.y * b.skala) }
                let rettet = kilde.clampedToExtent().applyingFilter("CIPerspectiveCorrection", parameters: [
                    "inputTopLeft": v[0], "inputTopRight": v[1], "inputBottomLeft": v[2], "inputBottomRight": v[3],
                ])
                let e = rettet.extent
                guard e.width > 1, e.height > 1, e.width.isFinite, e.height.isFinite else { continue }
                let plassert = rettet
                    .transformed(by: CGAffineTransform(translationX: -e.minX, y: -e.minY))
                    .transformed(by: CGAffineTransform(scaleX: ruteB / e.width, y: ruteH / e.height))
                    .transformed(by: CGAffineTransform(translationX: CGFloat(k) * ruteB, y: CGFloat(rader - 1 - r) * ruteH))
                    .cropped(to: CGRect(x: CGFloat(k) * ruteB, y: CGFloat(rader - 1 - r) * ruteH, width: ruteB, height: ruteH))
                lerret = plassert.composited(over: lerret)
                noeFunnet = true
            }
        }
        guard noeFunnet else { return nil }
        return ci.createCGImage(lerret, from: CGRect(x: 0, y: 0, width: bredPx, height: hoyPx))
    }

    /// Bildet som ser ruta best: alle hjørner i bildet, så mest rett forfra, så nærmest.
    private static func beste(hjorner: [SIMD3<Float>], midt: SIMD3<Float>, normal: SIMD3<Float>,
                              bilder: [Fotobilde]) -> (Int, [CGPoint])? {
        var best: (Int, [CGPoint], Float)?
        for (i, b) in bilder.enumerated() {
            let kam = b.kamera.transform
            let fraKamera = simd_inverse(kam)
            // Alle hjørnene må være foran kameraet (kameraet ser langs −z)
            let foran = hjorner.allSatisfy { p in simd_mul(fraKamera, SIMD4<Float>(p.x, p.y, p.z, 1)).z < -0.15 }
            guard foran else { continue }
            let punkter = hjorner.map { b.kamera.projectPoint($0, orientation: .landscapeRight, viewportSize: b.opplosning) }
            let marg = 0.02 * b.opplosning.width
            let inne = punkter.filter { $0.x >= -marg && $0.y >= -marg && $0.x <= b.opplosning.width + marg && $0.y <= b.opplosning.height + marg }.count
            guard inne >= 3 else { continue }
            let kamPos = SIMD3(kam.columns.3.x, kam.columns.3.y, kam.columns.3.z)
            let mot = simd_normalize(kamPos - midt)
            let forfra = abs(simd_dot(mot, normal))
            let avstand = simd_distance(kamPos, midt)
            let poeng = Float(inne) * 10 + forfra * 4 - avstand * 0.5
            if best == nil || poeng > best!.2 { best = (i, punkter, poeng) }
        }
        return best.map { ($0.0, $0.1) }
    }

    /// Gulvet som egen flate: hjørnene fra RoomPlan i rommets koordinater, triangulert, med bilde ovenfra.
    private static func gulvnode(rom: CapturedRoom, bilder: [Fotobilde], kilder: [CIImage?], ci: CIContext) -> SCNNode? {
        guard let g = rom.floors.first, g.polygonCorners.count >= 3 else { return nil }
        let punkter = g.polygonCorners.map { c -> SIMD3<Float> in
            let w = simd_mul(g.transform, SIMD4<Float>(c.x, c.y, c.z, 1))
            return SIMD3(w.x, w.y, w.z)
        }
        let gulvY = rom.walls.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min() ?? (punkter.map(\.y).min() ?? 0)
        let xs = punkter.map(\.x), zs = punkter.map(\.z)
        guard let minX = xs.min(), let maxX = xs.max(), let minZ = zs.min(), let maxZ = zs.max() else { return nil }
        let w = maxX - minX, d = maxZ - minZ
        guard w > 0.2, d > 0.2 else { return nil }
        let cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2

        // Flatens plan: lokal x = verdens x, lokal y = −z, normal opp.
        var t = matrix_identity_float4x4
        t.columns.0 = SIMD4(1, 0, 0, 0)
        t.columns.1 = SIMD4(0, 0, -1, 0)
        t.columns.2 = SIMD4(0, 1, 0, 0)
        t.columns.3 = SIMD4(cx, gulvY, cz, 1)
        let tekstur = teksturer(transform: t, bredde: w, hoyde: d, bilder: bilder, kilder: kilder, ci: ci)

        // Egen geometri: hjørnene som trekanter, med teksturkoordinater fra x og z.
        let hjorner = punkter.map { SIMD3<Float>($0.x, gulvY + 0.005, $0.z) }
        let trekanter = triangulerXZ(hjorner)
        guard !trekanter.isEmpty else { return nil }
        let posisjoner = hjorner.map { SCNVector3($0.x, $0.y, $0.z) }
        let normaler = hjorner.map { _ in SCNVector3(0, 1, 0) }
        let uv = hjorner.map { CGPoint(x: CGFloat(($0.x - minX) / w), y: CGFloat(($0.z - minZ) / d)) }
        let geometri = SCNGeometry(
            sources: [SCNGeometrySource(vertices: posisjoner), SCNGeometrySource(normals: normaler), SCNGeometrySource(textureCoordinates: uv)],
            elements: [SCNGeometryElement(indices: trekanter.map { Int32($0) }, primitiveType: .triangles)])
        geometri.materials = [materiale(tekstur)]
        return SCNNode(geometry: geometri)
    }

    /// Øreklipping av en enkel mangekant sett ovenfra (x, z).
    static func triangulerXZ(_ p: [SIMD3<Float>]) -> [Int] {
        var idx = Array(p.indices)
        guard idx.count >= 3 else { return [] }
        func areal() -> Float {
            var a: Float = 0
            for i in idx.indices { let j = (i + 1) % idx.count; a += p[idx[i]].x * p[idx[j]].z - p[idx[j]].x * p[idx[i]].z }
            return a
        }
        if areal() < 0 { idx.reverse() }
        func kryss(_ a: SIMD3<Float>, _ b: SIMD3<Float>, _ c: SIMD3<Float>) -> Float { (b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x) }
        func inni(_ q: SIMD3<Float>, _ a: SIMD3<Float>, _ b: SIMD3<Float>, _ c: SIMD3<Float>) -> Bool {
            kryss(a, b, q) >= 0 && kryss(b, c, q) >= 0 && kryss(c, a, q) >= 0
        }
        var ut: [Int] = []
        var vakt = 0
        while idx.count > 3 && vakt < 500 {
            vakt += 1
            var klipt = false
            for i in idx.indices {
                let a = idx[(i + idx.count - 1) % idx.count], b = idx[i], c = idx[(i + 1) % idx.count]
                guard kryss(p[a], p[b], p[c]) > 0 else { continue }
                let andre = idx.filter { $0 != a && $0 != b && $0 != c }
                if andre.contains(where: { inni(p[$0], p[a], p[b], p[c]) }) { continue }
                ut += [a, b, c]
                idx.remove(at: i)
                klipt = true
                break
            }
            if !klipt { break }
        }
        if idx.count == 3 { ut += idx }
        return ut
    }
}
