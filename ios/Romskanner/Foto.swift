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
    /// Avstand i meter fra kameraet for hvert punkt i bildet (LiDAR, lav oppløsning), når den finnes.
    /// Brukes til å se om noe står foran en flate i bildet.
    var dybde: [Float]? = nil
    var dybdeBredde = 0
    var dybdeHoyde = 0
    /// Hvor sikker LiDAR var for hvert punkt: 0 lav, 1 middels, 2 høy.
    var sikkerhet: [UInt8]? = nil

    /// Avstanden LiDAR målte i et punkt i kamerabildet (fulle piksler), eller nil.
    func dybdeVed(x: CGFloat, y: CGFloat) -> Float? {
        guard let dybde, dybdeBredde > 0, dybdeHoyde > 0 else { return nil }
        let i = Int(x / opplosning.width * CGFloat(dybdeBredde)), j = Int(y / opplosning.height * CGFloat(dybdeHoyde))
        guard i >= 0, j >= 0, i < dybdeBredde, j < dybdeHoyde else { return nil }
        // Lav sikkerhet (blanke og hvite flater som porselen, speil, vinduer): ingen måling
        if let sikkerhet, sikkerhet.count == dybde.count, sikkerhet[j * dybdeBredde + i] == 0 { return nil }
        let d = dybde[j * dybdeBredde + i]
        return d.isFinite && d > 0 ? d : nil
    }
}

/// Samler bilder under skanningen: et nytt bilde når kameraet står et sted og peker en vei
/// det ikke har gjort før, så bildene fordeles over hele rommet i stedet for å brukes opp
/// på samme vegg.
/// Bilder tatt mens telefonen beveger seg fort, blir uskarpe og hoppes over.
final class Bildesamler {
    private(set) var bilder: [Fotobilde] = []
    /// Hvor mange bilder som peker opp mot taket.
    private(set) var oppover = 0
    var maksAntall: Int { maks }
    /// Stedene og retningene bildene er tatt fra.
    private var tatt: [simd_float4x4] = []
    private var forrige: (transform: simd_float4x4, tid: TimeInterval)?
    private var opptatt = false
    private let ko = DispatchQueue(label: "romskanner.bildesamler", qos: .utility)
    private let ci = CIContext()
    private let maks: Int
    private let skala: CGFloat
    private let minFlytt: Float
    private let medDybde: Bool

    init(maks: Int = 80, skala: CGFloat = 0.75, minFlytt: Float = 0.3, medDybde: Bool = false) {
        self.maks = maks
        self.skala = skala
        self.minFlytt = minFlytt
        self.medDybde = medDybde
    }

    /// Kalles fra hovedtråden med det siste kamerabildet, gjerne ti ganger i sekundet.
    func vurder(_ frame: ARFrame) {
        let t = frame.camera.transform
        let tid = frame.timestamp
        let fra = forrige
        forrige = (t, tid)
        guard bilder.count < maks, !opptatt else { return }
        guard case .normal = frame.camera.trackingState else { return }

        // Uskarpt? Hvor fort telefonen flyttet og snudde seg siden forrige gang
        guard let fra, tid - fra.tid > 0.02, tid - fra.tid < 1 else { return }
        let dt = Float(tid - fra.tid)
        let fart = simd_distance(posisjon(t), posisjon(fra.transform)) / dt
        let snu = max(vinkel(akse(t, 2), akse(fra.transform, 2)), vinkel(akse(t, 0), akse(fra.transform, 0))) / dt
        if fart > 0.4 || snu > 0.5 { return }

        // Finnes det alt et bilde fra nesten samme sted, pekt nesten samme vei?
        let her = posisjon(t), retning = akse(t, 2)
        if tatt.contains(where: { simd_distance(posisjon($0), her) < minFlytt && simd_dot(akse($0, 2), retning) > 0.95 }) { return }
        tatt.append(t)
        // Kameraet ser langs −z: peker det opp?
        let opp = -retning.y > 0.45
        opptatt = true
        let buffer = frame.capturedImage
        let dybdekart = medDybde ? frame.sceneDepth?.depthMap : nil
        let sikkerhetskart = medDybde ? frame.sceneDepth?.confidenceMap : nil
        let kamera = frame.camera
        let opplosning = kamera.imageResolution
        let skala = self.skala
        ko.async { [weak self] in
            guard let self else { return }
            let bilde = CIImage(cvPixelBuffer: buffer).transformed(by: CGAffineTransform(scaleX: skala, y: skala))
            let data = self.ci.jpegRepresentation(
                of: bilde,
                colorSpace: CGColorSpace(name: CGColorSpace.sRGB)!,
                options: [kCGImageDestinationLossyCompressionQuality as CIImageRepresentationOption: 0.75])
            var foto = data.map { Fotobilde(jpeg: $0, kamera: kamera, opplosning: opplosning, skala: skala) }
            if let dybdekart, foto != nil, let kopi = Bildesamler.kopier(dybdekart) {
                foto?.dybde = kopi.0; foto?.dybdeBredde = kopi.1; foto?.dybdeHoyde = kopi.2
                if let sikkerhetskart, let s = Bildesamler.kopierSikkerhet(sikkerhetskart), s.count == kopi.0.count { foto?.sikkerhet = s }
            }
            DispatchQueue.main.async {
                if let foto { self.bilder.append(foto); if opp { self.oppover += 1 } }
                self.opptatt = false
            }
        }
    }

    private func posisjon(_ t: simd_float4x4) -> SIMD3<Float> { SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z) }
    private func akse(_ t: simd_float4x4, _ i: Int) -> SIMD3<Float> {
        let c = t[i]
        return simd_normalize(SIMD3(c.x, c.y, c.z))
    }
    private func vinkel(_ a: SIMD3<Float>, _ b: SIMD3<Float>) -> Float { acos(min(1, max(-1, simd_dot(a, b)))) }

    /// Kopierer LiDAR-dybden (Float32) ut av bufferen, rad for rad.
    /// Kopierer sikkerheten for LiDAR-dybden (ett tall per punkt) ut av bufferen.
    private static func kopierSikkerhet(_ buffer: CVPixelBuffer) -> [UInt8]? {
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let b = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
        let rad = CVPixelBufferGetBytesPerRow(buffer)
        var ut = [UInt8](repeating: 0, count: b * h)
        for j in 0..<h {
            let p = base.advanced(by: j * rad).assumingMemoryBound(to: UInt8.self)
            for i in 0..<b { ut[j * b + i] = p[i] }
        }
        return ut
    }

    private static func kopier(_ buffer: CVPixelBuffer) -> ([Float], Int, Int)? {
        guard CVPixelBufferGetPixelFormatType(buffer) == kCVPixelFormatType_DepthFloat32 else { return nil }
        CVPixelBufferLockBaseAddress(buffer, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(buffer, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddress(buffer) else { return nil }
        let b = CVPixelBufferGetWidth(buffer), h = CVPixelBufferGetHeight(buffer)
        let rad = CVPixelBufferGetBytesPerRow(buffer)
        var ut = [Float](repeating: 0, count: b * h)
        for j in 0..<h {
            let p = base.advanced(by: j * rad).assumingMemoryBound(to: Float.self)
            for i in 0..<b { ut[j * b + i] = p[i] }
        }
        return (ut, b, h)
    }
}

//// Noe som kan stå mellom kameraet og en flate: en vegg eller et møbel, sett som en kloss.
struct Hindring {
    let fraVerden: simd_float4x4
    let halv: SIMD3<Float>

    /// Går linjen fra a til b gjennom klossen?
    func krysser(fra a: SIMD3<Float>, til b: SIMD3<Float>) -> Bool {
        let p = simd_mul(fraVerden, SIMD4<Float>(a.x, a.y, a.z, 1)), q = simd_mul(fraVerden, SIMD4<Float>(b.x, b.y, b.z, 1))
        let o = SIMD3<Float>(p.x, p.y, p.z), d = SIMD3<Float>(q.x, q.y, q.z) - o
        var t0: Float = 0, t1: Float = 1
        for i in 0..<3 {
            if abs(d[i]) < 1e-6 {
                if abs(o[i]) > halv[i] { return false }
            } else {
                var ta = (-halv[i] - o[i]) / d[i], tb = (halv[i] - o[i]) / d[i]
                if ta > tb { swap(&ta, &tb) }
                t0 = max(t0, ta); t1 = min(t1, tb)
                if t0 > t1 { return false }
            }
        }
        return true
    }
}

/// 3D-modell der vegger, gulv, tak og møbler har bilder fra skanningen.
enum Fotomodell {
    static func url(_ id: UUID) -> URL { Modell.mappe.appendingPathComponent(id.uuidString + "-foto.usdz") }
    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: url(id).path) }
    static func slett(_ id: UUID) { try? FileManager.default.removeItem(at: url(id)) }

    private static let pikslerPerMeter: CGFloat = 220
    private static let rute: Float = 0.4 // meter

    /// Lager modellen og lagrer den som USDZ. Tar noen sekunder; kjør den i bakgrunnen.
    static func lag(rom: CapturedRoom, bilder: [Fotobilde], til url: URL) {
        let ci = CIContext()
        let kilder = bilder.map { CIImage(data: $0.jpeg) }
        let scene = SCNScene()
        // Vegger og møbler kan skjule hverandre: et bilde der noe står i veien, brukes ikke for den biten.
        let hindringer = rom.walls.map { Hindring(fraVerden: simd_inverse($0.transform), halv: SIMD3($0.dimensions.x / 2, $0.dimensions.y / 2, 0.04)) }
            + rom.objects.map { Hindring(fraVerden: simd_inverse($0.transform), halv: $0.dimensions / 2) }

        func flate(_ t: simd_float4x4, _ w: Float, _ h: Float) -> SCNNode? {
            guard w > 0.05, h > 0.05 else { return nil }
            let tekstur = teksturer(transform: t, bredde: w, hoyde: h, bilder: bilder, kilder: kilder, hindringer: hindringer, ci: ci)
            let plan = SCNPlane(width: CGFloat(w), height: CGFloat(h))
            plan.materials = [materiale(tekstur)]
            let node = SCNNode(geometry: plan)
            node.simdTransform = t
            return node
        }

        // Veggene: én flate per vegg, med bilde
        for vegg in rom.walls {
            if let n = flate(vegg.transform, vegg.dimensions.x, vegg.dimensions.y) { scene.rootNode.addChildNode(n) }
        }

        // Gulvet og taket: mangekanten fra RoomPlan, med bilde ovenfra og nedenfra
        let gulvY = rom.walls.map { $0.transform.columns.3.y - $0.dimensions.y / 2 }.min()
        let takY = rom.walls.map { $0.transform.columns.3.y + $0.dimensions.y / 2 }.max()
        if let gulv = flatnode(rom: rom, y: gulvY, tak: false, bilder: bilder, kilder: kilder, hindringer: hindringer, ci: ci) {
            scene.rootNode.addChildNode(gulv)
        }
        if let takY, let tak = flatnode(rom: rom, y: takY, tak: true, bilder: bilder, kilder: kilder, hindringer: hindringer, ci: ci) {
            scene.rootNode.addChildNode(tak)
        }

        // Møblene: hver side med bilde, så du ser hva som står der
        for o in rom.objects {
            for (lokal, w, h) in sider(o.dimensions) {
                if let n = flate(simd_mul(o.transform, lokal), w, h) { scene.rootNode.addChildNode(n) }
            }
        }

        try? FileManager.default.removeItem(at: url)
        _ = scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    }

    /// De fem sidene av en kloss man ser (ikke bunnen), som flater i klossens koordinater:
    /// transform, bredde og høyde. En SCNPlane ligger i xy-planet og vender mot +z.
    static func sider(_ d: SIMD3<Float>) -> [(simd_float4x4, Float, Float)] {
        func flytt(_ x: Float, _ y: Float, _ z: Float) -> simd_float4x4 {
            var m = matrix_identity_float4x4
            m.columns.3 = SIMD4(x, y, z, 1)
            return m
        }
        func snu(_ vinkel: Float, _ akse: SIMD3<Float>) -> simd_float4x4 { simd_float4x4(simd_quatf(angle: vinkel, axis: akse)) }
        let y = SIMD3<Float>(0, 1, 0), x = SIMD3<Float>(1, 0, 0)
        return [
            (flytt(0, 0, d.z / 2), d.x, d.y),
            (simd_mul(flytt(0, 0, -d.z / 2), snu(.pi, y)), d.x, d.y),
            (simd_mul(flytt(d.x / 2, 0, 0), snu(.pi / 2, y)), d.z, d.y),
            (simd_mul(flytt(-d.x / 2, 0, 0), snu(-.pi / 2, y)), d.z, d.y),
            (simd_mul(flytt(0, d.y / 2, 0), snu(-.pi / 2, x)), d.x, d.z),
        ]
    }

    private static func materiale(_ tekstur: CGImage?) -> SCNMaterial {
        let m = SCNMaterial()
        m.diffuse.contents = tekstur ?? UIColor(white: 0.88, alpha: 1)
        m.isDoubleSided = true
        m.lightingModel = .constant // vis bildet slik det er, uten ekstra skygge
        return m
    }

    /// Bilde for en flate i flatens eget plan (x langs bredden, y opp, sentrert i origo).
    /// Flaten deles i ruter; hver rute får bildet som ser den best. Naboruter foretrekker
    /// samme bilde, så det blir færre skjøter.
    static func teksturer(transform t: simd_float4x4, bredde w: Float, hoyde h: Float,
                          bilder: [Fotobilde], kilder: [CIImage?], hindringer: [Hindring], ci: CIContext) -> CGImage? {
        guard !bilder.isEmpty else { return nil }
        let kolonner = max(1, Int((w / rute).rounded(.up))), rader = max(1, Int((h / rute).rounded(.up)))
        let tw = w / Float(kolonner), th = h / Float(rader)
        var bredPx = max(8, CGFloat(w) * pikslerPerMeter), hoyPx = max(8, CGFloat(h) * pikslerPerMeter)
        let maksPx: CGFloat = 2048
        if bredPx > maksPx { hoyPx *= maksPx / bredPx; bredPx = maksPx }
        if hoyPx > maksPx { bredPx *= maksPx / hoyPx; hoyPx = maksPx }
        bredPx = bredPx.rounded(); hoyPx = hoyPx.rounded()
        let ruteB = bredPx / CGFloat(kolonner), ruteH = hoyPx / CGFloat(rader)
        let normal = simd_normalize(SIMD3(t.columns.2.x, t.columns.2.y, t.columns.2.z))
        func verden(_ x: Float, _ y: Float) -> SIMD3<Float> {
            let p = simd_mul(t, SIMD4<Float>(x, y, 0, 1))
            return SIMD3(p.x, p.y, p.z)
        }

        var lerret = CIImage(color: CIColor(red: 0.88, green: 0.88, blue: 0.88)).cropped(to: CGRect(x: 0, y: 0, width: bredPx, height: hoyPx))
        var noeFunnet = false
        var valgt = [Int?](repeating: nil, count: rader * kolonner)
        for r in 0..<rader {
            for k in 0..<kolonner {
                let x0 = -w / 2 + Float(k) * tw, x1 = x0 + tw
                let yTopp = h / 2 - Float(r) * th, yBunn = yTopp - th
                let hjorner = [verden(x0, yTopp), verden(x1, yTopp), verden(x0, yBunn), verden(x1, yBunn)]
                let midt = verden((x0 + x1) / 2, (yTopp + yBunn) / 2)
                let venstre = k > 0 ? valgt[r * kolonner + k - 1] : nil
                let over = r > 0 ? valgt[(r - 1) * kolonner + k] : nil
                let naboer = Set([venstre, over].compactMap { $0 })
                guard let treff = beste(hjorner: hjorner, midt: midt, normal: normal, bilder: bilder, hindringer: hindringer, naboer: naboer),
                      let kilde = kilder[treff.0] else { continue }
                let i = treff.0, punkter = treff.1
                valgt[r * kolonner + k] = i
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

    /// Bildet som ser ruta best: alle hjørner i bildet og ingenting i veien, så mest rett forfra,
    /// så nærmest. Et bilde naboruta brukte, får et lite fortrinn.
    private static func beste(hjorner: [SIMD3<Float>], midt: SIMD3<Float>, normal: SIMD3<Float>,
                              bilder: [Fotobilde], hindringer: [Hindring], naboer: Set<Int>) -> (Int, [CGPoint])? {
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
            // Står en vegg eller et møbel mellom kameraet og ruta?
            let utenfor = midt + mot * 0.08
            if hindringer.contains(where: { $0.krysser(fra: kamPos, til: utenfor) }) { continue }
            // Så LiDAR noe nærmere kameraet enn ruta (en person, en stol RoomPlan ikke fant)?
            let p = b.kamera.projectPoint(midt, orientation: .landscapeRight, viewportSize: b.opplosning)
            let z = -simd_mul(fraKamera, SIMD4<Float>(midt.x, midt.y, midt.z, 1)).z
            if let d = b.dybdeVed(x: p.x, y: p.y), d < z - 0.15 { continue }
            // Så bildet ingen flate her (lenger unna)? Da sto telefonens posisjon for bildet feil.
            if let d = b.dybdeVed(x: p.x, y: p.y), d > z + 0.25 { continue }
            let forfra = abs(simd_dot(mot, normal))
            let avstand = simd_distance(kamPos, midt)
            let poeng = Float(inne) * 10 + forfra * 4 - avstand * 0.5 + (naboer.contains(i) ? 1.5 : 0)
            if best == nil || poeng > best!.2 { best = (i, punkter, poeng) }
        }
        return best.map { ($0.0, $0.1) }
    }

    /// Gulvet eller taket som egen flate: hjørnene fra RoomPlan, triangulert, med bilde ovenfra eller nedenfra.
    private static func flatnode(rom: CapturedRoom, y hoydeY: Float?, tak: Bool, bilder: [Fotobilde], kilder: [CIImage?],
                                 hindringer: [Hindring], ci: CIContext) -> SCNNode? {
        guard let g = rom.floors.first, g.polygonCorners.count >= 3 else { return nil }
        let punkter = g.polygonCorners.map { c -> SIMD3<Float> in
            let w = simd_mul(g.transform, SIMD4<Float>(c.x, c.y, c.z, 1))
            return SIMD3(w.x, w.y, w.z)
        }
        let planY = hoydeY ?? (punkter.map { $0.y }.min() ?? 0)
        let xs = punkter.map { $0.x }, zs = punkter.map { $0.z }
        guard let minX = xs.min(), let maxX = xs.max(), let minZ = zs.min(), let maxZ = zs.max() else { return nil }
        let w = maxX - minX, d = maxZ - minZ
        guard w > 0.2, d > 0.2 else { return nil }
        let cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2

        // Flatens plan: lokal x = verdens x, lokal y = −z, normal opp (taket: ned).
        var t = matrix_identity_float4x4
        t.columns.0 = SIMD4(1, 0, 0, 0)
        t.columns.1 = SIMD4(0, 0, -1, 0)
        t.columns.2 = SIMD4(0, tak ? -1 : 1, 0, 0)
        t.columns.3 = SIMD4(cx, planY, cz, 1)
        let tekstur = teksturer(transform: t, bredde: w, hoyde: d, bilder: bilder, kilder: kilder, hindringer: hindringer, ci: ci)

        // Egen geometri: hjørnene som trekanter, med teksturkoordinater fra x og z.
        let hjorner = punkter.map { SIMD3<Float>($0.x, planY + (tak ? -0.005 : 0.005), $0.z) }
        let trekanter = triangulerXZ(hjorner)
        guard !trekanter.isEmpty else { return nil }
        let posisjoner = hjorner.map { SCNVector3($0.x, $0.y, $0.z) }
        let normaler = hjorner.map { _ in SCNVector3(0, tak ? -1 : 1, 0) }
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
