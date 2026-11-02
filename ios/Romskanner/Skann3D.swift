import SwiftUI
import ARKit
import RealityKit
import SceneKit
import ImageIO
import CoreImage
import UIKit

/// Hvordan et rom skannes. Valgt før skanningen starter.
enum Skannemodus: String, CaseIterable, Identifiable {
    case hurtig, noyaktig, ekte3D
    var id: String { rawValue }

    var tittel: String {
        switch self {
        case .hurtig: return "Hurtig"
        case .noyaktig: return "Nøyaktig med bilder"
        case .ekte3D: return "Nøyaktig + ekte 3D med farger"
        }
    }

    var forklaring: String {
        switch self {
        case .hurtig: return "Mål, plantegning og møbler. Ingen bilder."
        case .noyaktig: return "Som hurtig, pluss 3D der vegger, gulv, tak og møbler har bilder. Gå litt roligere."
        case .ekte3D: return "Som nøyaktig, og så en runde til der LiDAR lager hele rommet i ekte 3D med farger: lister, karmer, skap og alt som står."
        }
    }

    var medBilder: Bool { self != .hurtig }
}

/// En bit av LiDAR-nettet, i verdens koordinater.
struct Nettbit {
    var punkter: [SIMD3<Float>]
    var trekanter: [UInt32]
}

/// Skanning av hele rommet som et ekte 3D-nett fra LiDAR, med bilder til fargene.
/// `ferdig` får nettet og bildene, eller tomme lister når brukeren avbryter.
struct Skann3DView: UIViewControllerRepresentable {
    var ferdig: ([Nettbit], [Fotobilde]) -> Void

    static var stottet: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) }

    func makeUIViewController(context: Context) -> Skann3DKontroller { Skann3DKontroller(ferdig: ferdig) }
    func updateUIViewController(_ vc: Skann3DKontroller, context: Context) {}
}

final class Skann3DKontroller: UIViewController {
    private var arView: ARView!
    private let ferdig: ([Nettbit], [Fotobilde]) -> Void
    private let samler = Bildesamler(maks: 110, skala: 0.5, minFlytt: 0.3, medDybde: true)
    private var timer: Timer?
    private var avsluttet = false
    private let hovedknapp = UIButton(configuration: .filled())
    private let avbrytknapp = UIButton(configuration: .gray())
    private let info = UILabel()
    private var start = Date()

    init(ferdig: @escaping ([Nettbit], [Fotobilde]) -> Void) {
        self.ferdig = ferdig
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) brukes ikke") }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        arView = ARView(frame: view.bounds, cameraMode: .ar, automaticallyConfigureSession: false)
        arView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        // Viser nettet som bygges, så du ser hva som mangler
        arView.debugOptions.insert(.showSceneUnderstanding)
        arView.renderOptions.insert(.disableMotionBlur)
        view.addSubview(arView)

        var hoved = UIButton.Configuration.filled()
        hoved.title = "Ferdig"
        hoved.cornerStyle = .capsule
        hoved.buttonSize = .large
        hoved.baseBackgroundColor = UIColor(red: 0.73, green: 0.28, blue: 0.16, alpha: 1)
        hovedknapp.configuration = hoved
        hovedknapp.addAction(UIAction { [weak self] _ in self?.fullfor() }, for: .touchUpInside)

        var avbryt = UIButton.Configuration.gray()
        avbryt.title = "Hopp over"
        avbryt.cornerStyle = .capsule
        avbryt.buttonSize = .large
        avbrytknapp.configuration = avbryt
        avbrytknapp.addAction(UIAction { [weak self] _ in self?.avslutt([], []) }, for: .touchUpInside)

        let rad = UIStackView(arrangedSubviews: [avbrytknapp, hovedknapp])
        rad.axis = .horizontal
        rad.spacing = 12
        rad.distribution = .fillProportionally
        rad.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(rad)

        info.font = .preferredFont(forTextStyle: .subheadline)
        info.textColor = .white
        info.numberOfLines = 0
        info.textAlignment = .center
        info.backgroundColor = UIColor.black.withAlphaComponent(0.55)
        info.layer.cornerRadius = 12
        info.layer.masksToBounds = true
        info.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(info)

        NSLayoutConstraint.activate([
            rad.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 20),
            rad.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -20),
            rad.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -16),
            info.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 8),
            info.leadingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            info.trailingAnchor.constraint(equalTo: view.safeAreaLayoutGuide.trailingAnchor, constant: -16),
        ])
        oppdaterInfo()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        let oppsett = ARWorldTrackingConfiguration()
        oppsett.sceneReconstruction = .mesh
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) { oppsett.frameSemantics.insert(.sceneDepth) }
        oppsett.environmentTexturing = .none
        arView.session.run(oppsett, options: [.resetTracking, .removeExistingAnchors])
        start = Date()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self, let frame = self.arView.session.currentFrame else { return }
            self.samler.vurder(frame)
            self.oppdaterInfo()
        }
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        timer?.invalidate()
        arView.session.pause()
    }

    private func oppdaterInfo() {
        let n = samler.bilder.count, maks = samler.maksAntall
        let tekst: String
        if n < 8 {
            tekst = "  Gå sakte langs veggene. Pek mot gulv, tak og hjørner, og hold telefonen rolig. Bilder: \(n)  "
        } else if n >= maks {
            tekst = "  Bilder: \(n), fullt. Skann ferdig resten og trykk «Ferdig».  "
        } else if n >= 15 && samler.oppover < 3 {
            tekst = "  Pek opp mot taket også, så taket får bilder. Bilder: \(n) av \(maks)  "
        } else {
            tekst = "  Bilder: \(n) av \(maks). Rutenettet viser det som er skannet. Trykk «Ferdig» når alt er dekket.  "
        }
        if info.text != tekst { info.text = tekst }
    }

    private func fullfor() {
        guard !avsluttet else { return }
        let ankre = arView.session.currentFrame?.anchors.compactMap { $0 as? ARMeshAnchor } ?? []
        let bitene = ankre.map(Skann3DKontroller.nettbit)
        guard !bitene.isEmpty else {
            info.text = "  Fant ikke noe 3D ennå. Gå litt rundt og prøv igjen.  "
            return
        }
        avslutt(bitene, samler.bilder)
    }

    private func avslutt(_ bitene: [Nettbit], _ bilder: [Fotobilde]) {
        guard !avsluttet else { return }
        avsluttet = true
        timer?.invalidate()
        arView.session.pause()
        hovedknapp.isEnabled = false
        avbrytknapp.isEnabled = false
        ferdig(bitene, bilder)
    }

    /// Kopierer nettet ut av ARKit (punktene i verdens koordinater).
    private static func nettbit(_ a: ARMeshAnchor) -> Nettbit {
        let g = a.geometry
        let t = a.transform
        let v = g.vertices
        let vp = v.buffer.contents()
        var punkter: [SIMD3<Float>] = []
        punkter.reserveCapacity(v.count)
        for i in 0..<v.count {
            let f = vp.advanced(by: v.offset + v.stride * i).assumingMemoryBound(to: Float.self)
            let w = simd_mul(t, SIMD4<Float>(f[0], f[1], f[2], 1))
            punkter.append(SIMD3(w.x, w.y, w.z))
        }
        let f = g.faces
        let fp = f.buffer.contents()
        let antall = f.count * f.indexCountPerPrimitive
        var trekanter: [UInt32] = []
        trekanter.reserveCapacity(antall)
        for i in 0..<antall {
            let p = fp.advanced(by: i * f.bytesPerIndex)
            trekanter.append(f.bytesPerIndex == 4 ? p.assumingMemoryBound(to: UInt32.self).pointee : UInt32(p.assumingMemoryBound(to: UInt16.self).pointee))
        }
        return Nettbit(punkter: punkter, trekanter: trekanter)
    }
}

/// Ekte 3D av rommet: LiDAR-nettet der hver trekant får bildet som ser den best.
enum Fargemodell {
    static func url(_ id: UUID) -> URL { Modell.mappe.appendingPathComponent(id.uuidString + "-3d.usdz") }
    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: url(id).path) }
    static func slett(_ id: UUID) { try? FileManager.default.removeItem(at: url(id)) }

    /// Et bilde gjort klart for regning: fra verden til kameraet, og kameraets brennvidde.
    private struct Kamera {
        let fraVerden: simd_float4x4
        let pos: SIMD3<Float>
        let fx: Float, fy: Float, cx: Float, cy: Float
        let b: Float, h: Float

        init(_ k: ARCamera, transform t: simd_float4x4? = nil) {
            let t = t ?? k.transform
            fraVerden = simd_inverse(t)
            pos = SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
            fx = k.intrinsics[0][0]; fy = k.intrinsics[1][1]; cx = k.intrinsics[2][0]; cy = k.intrinsics[2][1]
            b = Float(k.imageResolution.width); h = Float(k.imageResolution.height)
        }

        /// Punktet i bildet (fulle piksler) og avstanden foran kameraet, eller nil bak kameraet.
        func projiser(_ p: SIMD3<Float>) -> (SIMD2<Float>, Float)? {
            let c = simd_mul(fraVerden, SIMD4<Float>(p.x, p.y, p.z, 1))
            let z = -c.z
            guard z > 0.1 else { return nil }
            return (SIMD2(fx * c.x / z + cx, -fy * c.y / z + cy), z)
        }

        func inne(_ q: SIMD2<Float>) -> Bool { q.x >= 2 && q.y >= 2 && q.x <= b - 2 && q.y <= h - 2 }
    }

    /// Lager modellen og lagrer den som USDZ. Tar noen sekunder; kjør den i bakgrunnen.
    ///
    /// 1. Små løse biter (rusk fra LiDAR) tas bort.
    /// 2. Hver trekant får bildet som ser den best. Nabotrekanter foretrekker samme bilde, så det blir færre skjøter.
    /// 3. Trekanter ingen bilder ser godt, prøves igjen med mildere krav (litt på skrå, delvis utenfor bildet).
    /// 4. Det som fortsatt ikke har bilde, får fargen fra flatene rundt, i stedet for hvitt.
    static func lag(bitene: [Nettbit], bilder: [Fotobilde], til url: URL) {
        // Alle trekantene i én liste
        var p: [SIMD3<Float>] = []
        var alle: [SIMD3<Int32>] = []
        for bit in bitene {
            let start = Int32(p.count)
            p.append(contentsOf: bit.punkter)
            var i = 0
            while i + 2 < bit.trekanter.count {
                alle.append(SIMD3(start + Int32(bit.trekanter[i]), start + Int32(bit.trekanter[i + 1]), start + Int32(bit.trekanter[i + 2])))
                i += 3
            }
        }
        guard !alle.isEmpty else { return }

        // Punkter på samme sted (innen 1 cm) er det samme punktet, også på tvers av bitene fra ARKit
        var nokler: [SIMD3<Int32>: Int32] = [:]
        var sveiset = [Int32](repeating: 0, count: p.count)
        for (i, q) in p.enumerated() {
            let k = SIMD3<Int32>(Int32((q.x * 100).rounded()), Int32((q.y * 100).rounded()), Int32((q.z * 100).rounded()))
            if let n = nokler[k] { sveiset[i] = n } else { let n = Int32(nokler.count); nokler[k] = n; sveiset[i] = n }
        }
        let antallPunkter = nokler.count

        // 1. Sammenhengende biter. Små biter som henger løst, er rusk og tas bort.
        var forelder = Array(0..<Int32(antallPunkter))
        func rot(_ x: Int32) -> Int32 {
            var x = x
            while forelder[Int(x)] != x { forelder[Int(x)] = forelder[Int(forelder[Int(x)])]; x = forelder[Int(x)] }
            return x
        }
        func slaSammen(_ a: Int32, _ b: Int32) { let ra = rot(a), rb = rot(b); if ra != rb { forelder[Int(ra)] = rb } }
        for t in alle {
            slaSammen(sveiset[Int(t.x)], sveiset[Int(t.y)])
            slaSammen(sveiset[Int(t.x)], sveiset[Int(t.z)])
        }
        var storrelse: [Int32: Int] = [:]
        for t in alle { storrelse[rot(sveiset[Int(t.x)]), default: 0] += 1 }
        let minste = min(200, max(20, alle.count / 400))
        let tri = alle.filter { (storrelse[rot(sveiset[Int($0.x)])] ?? 0) >= minste }
        guard !tri.isEmpty else { return }
        // Rett opp posisjonen til hvert bilde: bildets egen dybdemåling legges oppå nettet
        let rutenett = Rutenett(tri: tri, p: p)
        let kameraer = bilder.map { Kamera($0.kamera, transform: rettOpp($0, rutenett: rutenett)) }

        // 2. Hvilke bilder ser hver trekant godt, og hvor godt
        var kandidater = [[(Int, Float)]](repeating: [], count: tri.count)
        var antallBest = [Int](repeating: 0, count: bilder.count)
        var normaler = [SIMD3<Float>](repeating: SIMD3(0, 1, 0), count: tri.count)
        func vurder(_ t: Int, streng: Bool) -> [(Int, Float)] {
            let idx = tri[t]
            let a = p[Int(idx.x)], b = p[Int(idx.y)], c = p[Int(idx.z)]
            let midt = (a + b + c) / 3
            let normal = normaler[t]
            var liste: [(Int, Float)] = []
            for (i, k) in kameraer.enumerated() {
                let mot = k.pos - midt
                let avstand = simd_length(mot)
                guard avstand > 0.15, avstand < (streng ? 6 : 8) else { continue }
                let forfra = abs(simd_dot(mot / avstand, normal))
                guard forfra > (streng ? 0.25 : 0.05) else { continue }
                guard let pm = k.projiser(midt), k.inne(pm.0) else { continue }
                if streng {
                    guard let pa = k.projiser(a), k.inne(pa.0), let pb = k.projiser(b), k.inne(pb.0),
                          let pc = k.projiser(c), k.inne(pc.0) else { continue }
                }
                // Bildets egen dybdemåling: står noe foran trekanten, eller ligger trekanten ikke der
                // bildet så en flate? Da var telefonens posisjon for bildet litt feil (den retter seg opp
                // underveis), og bildet ville havnet ved siden av. Slike bilder brukes ikke her.
                // Uten sikker måling (blank porselen, speil) vet vi ikke om noe står foran, f.eks. doen
                // foran gulvet. Da brukes ikke bildet her; flaten får heller fargen fra flatene rundt.
                var avvik: Float = 0
                if let d = bilder[i].dybdeVed(x: CGFloat(pm.0.x), y: CGFloat(pm.0.y)) {
                    let romslig = (streng ? 0.06 : 0.1) + pm.1 * 0.02
                    if d < pm.1 - romslig || d > pm.1 + romslig { continue }
                    avvik = abs(d - pm.1)
                } else if bilder[i].dybde != nil {
                    continue
                }
                liste.append((i, forfra * 2 - avstand * 0.5 - avvik * 8))
            }
            liste.sort { $0.1 > $1.1 }
            if liste.count > 5 { liste.removeLast(liste.count - 5) }
            return liste
        }
        for (t, idx) in tri.enumerated() {
            let a = p[Int(idx.x)], b = p[Int(idx.y)], c = p[Int(idx.z)]
            let kryss = simd_cross(b - a, c - a)
            let lengde = simd_length(kryss)
            guard lengde > 1e-9 else { continue }
            normaler[t] = kryss / lengde
            var liste = vurder(t, streng: true)
            // 3. Ingen så den godt nok: mildere krav
            if liste.isEmpty { liste = vurder(t, streng: false) }
            guard !liste.isEmpty else { continue }
            kandidater[t] = liste
            antallBest[liste[0].0] += 1
        }

        // Blant bildene som er nesten like gode, velg det som brukes mest. Færre skjøter.
        var valg = [Int](repeating: -1, count: tri.count)
        for t in tri.indices {
            let liste = kandidater[t]
            guard let forste = liste.first else { continue }
            let gode = liste.filter { $0.1 >= forste.1 - 0.4 }
            valg[t] = gode.max { antallBest[$0.0] < antallBest[$1.0] }?.0 ?? forste.0
        }

        // 4. Farge til trekantene uten bilde, fra flatene rundt
        let farger = fyllFarger(tri: tri, p: p, sveiset: sveiset, antallPunkter: antallPunkter, valg: valg, kameraer: kameraer, bilder: bilder)
        let palett = Palett(farger.compactMap { $0 })

        // Geometri: hver trekant får egne hjørner med teksturkoordinater i sitt bilde (eller i fargepaletten)
        var posisjoner: [SCNVector3] = []
        var norm: [SCNVector3] = []
        var uv: [CGPoint] = []
        posisjoner.reserveCapacity(tri.count * 3)
        norm.reserveCapacity(tri.count * 3)
        uv.reserveCapacity(tri.count * 3)
        let palettNr = -2
        var perBilde: [Int: [Int32]] = [:]
        for (t, idx) in tri.enumerated() {
            let hjorner = [p[Int(idx.x)], p[Int(idx.y)], p[Int(idx.z)]]
            let n = normaler[t]
            var i = valg[t]
            let start = Int32(posisjoner.count)
            let farge = i < 0 ? farger[t] : nil
            if i < 0, farge != nil { i = palettNr }
            for q in hjorner {
                posisjoner.append(SCNVector3(q.x, q.y, q.z))
                norm.append(SCNVector3(n.x, n.y, n.z))
                if i >= 0, let pk = kameraer[i].projiser(q) {
                    // Utenfor bildet: hold deg ved kanten
                    uv.append(CGPoint(x: CGFloat(min(1, max(0, pk.0.x / kameraer[i].b))), y: CGFloat(min(1, max(0, pk.0.y / kameraer[i].h)))))
                } else if i == palettNr, let farge {
                    uv.append(palett.punkt(farge))
                } else {
                    uv.append(.zero)
                }
            }
            perBilde[i, default: []].append(contentsOf: [start, start + 1, start + 2])
        }

        // Jevn ut lyset: et bilde mot vinduet blir lysere enn et mot en mørk vegg
        let lys = lysstyrke(tri: tri, p: p, kandidater: kandidater, kameraer: kameraer, bilder: bilder)
        let ci = CIContext()

        var elementer: [SCNGeometryElement] = []
        var materialer: [SCNMaterial] = []
        for (i, indekser) in perBilde.sorted(by: { $0.key < $1.key }) {
            elementer.append(SCNGeometryElement(indices: indekser, primitiveType: .triangles))
            let m = SCNMaterial()
            if i >= 0 { m.diffuse.contents = justert(bilder[i].jpeg, lys[i], ci) ?? UIImage(data: bilder[i].jpeg) ?? UIColor(white: 0.8, alpha: 1) }
            else if i == palettNr { m.diffuse.contents = palett.bilde(); m.diffuse.magnificationFilter = .nearest; m.diffuse.minificationFilter = .nearest }
            else { m.diffuse.contents = UIColor(white: 0.75, alpha: 1) }
            m.isDoubleSided = true
            m.lightingModel = .constant
            materialer.append(m)
        }
        let geometri = SCNGeometry(
            sources: [SCNGeometrySource(vertices: posisjoner), SCNGeometrySource(normals: norm), SCNGeometrySource(textureCoordinates: uv)],
            elements: elementer)
        geometri.materials = materialer
        let scene = SCNScene()
        scene.rootNode.addChildNode(SCNNode(geometry: geometri))
        try? FileManager.default.removeItem(at: url)
        _ = scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    }

    // MARK: Rett opp bildene

    /// Trekantene i små ruter, så det er raskt å finne flaten nærmest et punkt.
    private struct Rutenett {
        static let rute: Float = 0.08
        var ruter: [SIMD3<Int32>: [Int]] = [:]
        var midt: [SIMD3<Float>] = []
        var normal: [SIMD3<Float>] = []

        init(tri: [SIMD3<Int32>], p: [SIMD3<Float>]) {
            midt.reserveCapacity(tri.count); normal.reserveCapacity(tri.count)
            for t in tri {
                let a = p[Int(t.x)], b = p[Int(t.y)], c = p[Int(t.z)]
                let k = simd_cross(b - a, c - a), l = simd_length(k)
                let m = (a + b + c) / 3
                midt.append(m); normal.append(l > 1e-9 ? k / l : SIMD3(0, 1, 0))
                if l > 1e-9 { ruter[Self.nokkel(m), default: []].append(midt.count - 1) }
            }
        }

        static func nokkel(_ q: SIMD3<Float>) -> SIMD3<Int32> {
            SIMD3(Int32((q.x / rute).rounded(.down)), Int32((q.y / rute).rounded(.down)), Int32((q.z / rute).rounded(.down)))
        }

        /// Flaten nærmest punktet (midtpunkt og normal), innen `maks` meter.
        func naermeste(_ q: SIMD3<Float>, maks: Float) -> (SIMD3<Float>, SIMD3<Float>)? {
            let k = Self.nokkel(q)
            var best: Int? = nil, bestAvstand = maks * maks
            for dx in -1...1 { for dy in -1...1 { for dz in -1...1 {
                guard let liste = ruter[k &+ SIMD3(Int32(dx), Int32(dy), Int32(dz))] else { continue }
                for i in liste {
                    let d = simd_distance_squared(midt[i], q)
                    if d < bestAvstand { bestAvstand = d; best = i }
                }
            } } }
            return best.map { (midt[$0], normal[$0]) }
        }
    }

    /// Hvor kameraet sto da bildet ble tatt, rettet opp. Punktene i bildets dybdemåling skal ligge
    /// på nettet; de flyttes dit, punkt mot flate, noen runder. Telefonen retter sin egen posisjon
    /// underveis i skanningen, så bilder tatt tidlig står ofte noen cm feil.
    /// Store rettinger godtas ikke (da passer bildet ikke inn i det hele tatt).
    private static func rettOpp(_ b: Fotobilde, rutenett: Rutenett) -> simd_float4x4 {
        let start = b.kamera.transform
        guard let dybde = b.dybde, b.dybdeBredde > 0, b.dybdeHoyde > 0 else { return start }
        let k = b.kamera
        let fx = k.intrinsics[0][0], fy = k.intrinsics[1][1], cx = k.intrinsics[2][0], cy = k.intrinsics[2][1]
        let bredde = Float(k.imageResolution.width), hoyde = Float(k.imageResolution.height)
        let dw = b.dybdeBredde, dh = b.dybdeHoyde
        // Punktene i kameraets koordinater (x høyre, y opp, kameraet ser langs −z)
        var lokale: [SIMD3<Float>] = []
        for j in stride(from: 5, to: dh, by: 10) { for i in stride(from: 5, to: dw, by: 10) {
            let n = j * dw + i
            if let s = b.sikkerhet, s.count == dybde.count, s[n] < 2 { continue }
            let d = dybde[n]
            guard d.isFinite, d > 0.25, d < 5 else { continue }
            let u = (Float(i) + 0.5) / Float(dw) * bredde, v = (Float(j) + 0.5) / Float(dh) * hoyde
            lokale.append(SIMD3((u - cx) * d / fx, -(v - cy) * d / fy, -d))
        } }
        guard lokale.count >= 60 else { return start }

        func flytt(_ v: SIMD3<Float>) -> simd_float4x4 { var m = matrix_identity_float4x4; m.columns.3 = SIMD4(v.x, v.y, v.z, 1); return m }
        var t = start
        for _ in 0..<6 {
            var a = [Double](repeating: 0, count: 36), bv = [Double](repeating: 0, count: 6), antall = 0
            let senter = SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z)
            for l in lokale {
                let w = simd_mul(t, SIMD4(l.x, l.y, l.z, 1))
                let q = SIMD3(w.x, w.y, w.z)
                guard let (m, n) = rutenett.naermeste(q, maks: 0.1) else { continue }
                let r = simd_dot(n, q - m)
                let ax = simd_cross(q - senter, n)
                let jac = [Double(ax.x), Double(ax.y), Double(ax.z), Double(n.x), Double(n.y), Double(n.z)]
                for x in 0..<6 {
                    bv[x] -= jac[x] * Double(r)
                    for y in 0..<6 { a[x * 6 + y] += jac[x] * jac[y] }
                }
                antall += 1
            }
            guard antall >= 50, let s = los(a, bv) else { break }
            let rot = SIMD3(Float(s[0]), Float(s[1]), Float(s[2])), fl = SIMD3(Float(s[3]), Float(s[4]), Float(s[5]))
            let vinkel = simd_length(rot)
            let r = vinkel > 1e-7 ? simd_float4x4(simd_quatf(angle: vinkel, axis: rot / vinkel)) : matrix_identity_float4x4
            t = flytt(senter + fl) * r * flytt(-senter) * t
            if simd_length(fl) < 0.0005 && vinkel < 0.0003 { break }
        }
        let flyttet = simd_distance(SIMD3(t.columns.3.x, t.columns.3.y, t.columns.3.z), SIMD3(start.columns.3.x, start.columns.3.y, start.columns.3.z))
        let fram0 = SIMD3(start.columns.2.x, start.columns.2.y, start.columns.2.z), fram1 = SIMD3(t.columns.2.x, t.columns.2.y, t.columns.2.z)
        let snudd = acos(min(1, max(-1, simd_dot(simd_normalize(fram0), simd_normalize(fram1)))))
        return flyttet < 0.15 && snudd < 0.09 ? t : start
    }

    /// Løser A·x = b (6 × 6) med Gauss-eliminasjon. nil hvis likningene ikke har én løsning.
    private static func los(_ a0: [Double], _ b0: [Double]) -> [Double]? {
        var a = a0, b = b0
        let n = 6
        for i in 0..<n { a[i * n + i] += 1e-6 }
        for k in 0..<n {
            var p = k
            for r in (k + 1)..<n where abs(a[r * n + k]) > abs(a[p * n + k]) { p = r }
            guard abs(a[p * n + k]) > 1e-12 else { return nil }
            if p != k { for c in 0..<n { a.swapAt(k * n + c, p * n + c) }; b.swapAt(k, p) }
            for r in (k + 1)..<n {
                let f = a[r * n + k] / a[k * n + k]
                for c in k..<n { a[r * n + c] -= f * a[k * n + c] }
                b[r] -= f * b[k]
            }
        }
        var x = [Double](repeating: 0, count: n)
        for k in stride(from: n - 1, through: 0, by: -1) {
            var s = b[k]
            for c in (k + 1)..<n { s -= a[k * n + c] * x[c] }
            x[k] = s / a[k * n + k]
        }
        return x
    }

    // MARK: Jevn ut lyset

    /// Hvor mye hvert bilde bør gjøres lysere eller mørkere, så samme flate får samme lysstyrke
    /// uansett hvilket bilde den er tatt fra. Sammenligner bildene på flater flere bilder ser.
    private static func lysstyrke(tri: [SIMD3<Int32>], p: [SIMD3<Float>], kandidater: [[(Int, Float)]],
                                  kameraer: [Kamera], bilder: [Fotobilde]) -> [Float] {
        var gevinst = [Float](repeating: 1, count: bilder.count)
        guard bilder.count >= 2 else { return gevinst }
        // Et utvalg trekanter som minst to bilder ser
        var utvalg: [Int] = []
        for t in tri.indices where kandidater[t].count >= 2 { utvalg.append(t) }
        if utvalg.count > 3000 { let steg = utvalg.count / 3000 + 1; utvalg = stride(from: 0, to: utvalg.count, by: steg).map { utvalg[$0] } }
        guard !utvalg.isEmpty else { return gevinst }
        var leses: [Int: [(Int, SIMD2<Float>)]] = [:]
        for t in utvalg {
            let idx = tri[t]
            let midt = (p[Int(idx.x)] + p[Int(idx.y)] + p[Int(idx.z)]) / 3
            for (i, _) in kandidater[t].prefix(3) {
                if let pm = kameraer[i].projiser(midt) { leses[i, default: []].append((t, pm.0)) }
            }
        }
        // Lysstyrken per trekant og bilde
        var maling: [Int: [(Int, Float)]] = [:]
        for (i, liste) in leses {
            guard let les = Pikselleser(bilder[i]) else { continue }
            for (t, q) in liste {
                guard let f = les.farge(x: q.x, y: q.y) else { continue }
                let l = 0.2126 * f.x + 0.7152 * f.y + 0.0722 * f.z
                guard l > 0.04, l < 0.93 else { continue } // ikke helt mørkt eller utbrent
                maling[t, default: []].append((i, log(l)))
            }
        }
        // Log-gevinst per bilde: snittet av forskjellen mot de andre bildene på de samme flatene,
        // dratt litt mot 0 så ingen bilder blir dratt langt av sted. Noen runder til det roer seg.
        var g = [Float](repeating: 0, count: bilder.count)
        let par = maling.values.filter { $0.count >= 2 }
        guard !par.isEmpty else { return gevinst }
        for _ in 0..<25 {
            var sum = [Float](repeating: 0, count: bilder.count), n = [Float](repeating: 0, count: bilder.count)
            for liste in par {
                let snitt = liste.reduce(Float(0)) { $0 + $1.1 + g[$1.0] } / Float(liste.count)
                for (i, l) in liste { sum[i] += snitt - l; n[i] += 1 }
            }
            for i in g.indices { g[i] = sum[i] / (n[i] + 4) }
            let middel = g.reduce(0, +) / Float(g.count)
            for i in g.indices { g[i] -= middel }
        }
        for i in g.indices { gevinst[i] = min(1.6, max(0.6, exp(g[i]))) }
        return gevinst
    }

    /// Bildet med lysstyrken justert, eller nil når det ikke trengs.
    private static func justert(_ jpeg: Data, _ g: Float, _ ci: CIContext) -> UIImage? {
        guard abs(g - 1) > 0.03, let inn = CIImage(data: jpeg) else { return nil }
        let f = CGFloat(g)
        let ut = inn.applyingFilter("CIColorMatrix", parameters: [
            "inputRVector": CIVector(x: f, y: 0, z: 0, w: 0),
            "inputGVector": CIVector(x: 0, y: f, z: 0, w: 0),
            "inputBVector": CIVector(x: 0, y: 0, z: f, w: 0),
        ])
        guard let cg = ci.createCGImage(ut, from: inn.extent) else { return nil }
        return UIImage(cgImage: cg)
    }

    /// Fargen til trekantene uten bilde. Trekantene med bilde rundt dem får fargen sin lest fra bildet
    /// (midt i trekanten), og fargen sprer seg innover fra kanten, punkt for punkt.
    /// nil for trekanter som har bilde, og for flekker uten noen farget nabo.
    private static func fyllFarger(tri: [SIMD3<Int32>], p: [SIMD3<Float>], sveiset: [Int32], antallPunkter: Int,
                                   valg: [Int], kameraer: [Kamera], bilder: [Fotobilde]) -> [SIMD3<Float>?] {
        var ut = [SIMD3<Float>?](repeating: nil, count: tri.count)
        guard valg.contains(-1) else { return ut }
        let punkter = { (t: Int) -> [Int] in [Int(sveiset[Int(tri[t].x)]), Int(sveiset[Int(tri[t].y)]), Int(sveiset[Int(tri[t].z)])] }

        // Punktene som ligger i kanten av en flekk uten bilde
        var iFlekk = [Bool](repeating: false, count: antallPunkter)
        for t in tri.indices where valg[t] < 0 { for v in punkter(t) { iFlekk[v] = true } }

        // Les fargen i bildet for trekantene med bilde som rører en flekk, ett bilde om gangen
        var leses: [Int: [Int]] = [:]
        for t in tri.indices where valg[t] >= 0 && punkter(t).contains(where: { iFlekk[$0] }) { leses[valg[t], default: []].append(t) }
        var sum = [SIMD3<Float>](repeating: .zero, count: antallPunkter)
        var antall = [Float](repeating: 0, count: antallPunkter)
        for (i, liste) in leses {
            guard let les = Pikselleser(bilder[i]) else { continue }
            for t in liste {
                let idx = tri[t]
                let midt = (p[Int(idx.x)] + p[Int(idx.y)] + p[Int(idx.z)]) / 3
                guard let pm = kameraer[i].projiser(midt), let f = les.farge(x: pm.0.x, y: pm.0.y) else { continue }
                for v in punkter(t) where iFlekk[v] { sum[v] += f; antall[v] += 1 }
            }
        }

        // Spre fargen innover i flekkene: hver runde får punktene som har en farget nabo, snittet av naboene
        var naboer = [[Int]](repeating: [], count: antallPunkter)
        for t in tri.indices where valg[t] < 0 {
            let v = punkter(t)
            for a in v { for b in v where a != b { naboer[a].append(b) } }
        }
        var farge = [SIMD3<Float>?](repeating: nil, count: antallPunkter)
        var kant: [Int] = []
        for v in 0..<antallPunkter where antall[v] > 0 { farge[v] = sum[v] / antall[v]; kant.append(v) }
        var runder = 0
        while !kant.isEmpty && runder < 400 {
            runder += 1
            var neste: [Int: (SIMD3<Float>, Float)] = [:]
            for v in kant { for n in naboer[v] where farge[n] == nil {
                let f = farge[v]!
                let gml = neste[n] ?? (.zero, 0)
                neste[n] = (gml.0 + f, gml.1 + 1)
            } }
            kant = []
            for (n, (s, a)) in neste { farge[n] = s / a; kant.append(n) }
        }
        for t in tri.indices where valg[t] < 0 {
            let fs = punkter(t).compactMap { farge[$0] }
            if !fs.isEmpty { ut[t] = fs.reduce(.zero, +) / Float(fs.count) }
        }
        return ut
    }

    /// Leser fargen i ett av bildene fra skanningen (pakker ut JPEG-en én gang).
    private struct Pikselleser {
        let data: [UInt8]
        let bredde: Int, hoyde: Int
        let skala: Float

        init?(_ b: Fotobilde) {
            guard let kilde = CGImageSourceCreateWithData(b.jpeg as CFData, nil),
                  let bilde = CGImageSourceCreateImageAtIndex(kilde, 0, nil) else { return nil }
            let w = bilde.width, h = bilde.height
            var buffer = [UInt8](repeating: 0, count: w * h * 4)
            let ok = buffer.withUnsafeMutableBytes { ptr -> Bool in
                guard let ctx = CGContext(data: ptr.baseAddress, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w * 4,
                                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue) else { return false }
                ctx.draw(bilde, in: CGRect(x: 0, y: 0, width: w, height: h))
                return true
            }
            guard ok else { return nil }
            bredde = w; hoyde = h
            skala = Float(b.skala)
            data = buffer
        }

        /// Snittfargen rundt et punkt (fulle kamerapiksler, origo oppe til venstre), 0–1.
        func farge(x: Float, y: Float) -> SIMD3<Float>? {
            let px = Int(x * skala), py = Int(y * skala)
            var s = SIMD3<Float>(0, 0, 0), n: Float = 0
            for dy in -2...2 { for dx in -2...2 {
                let xx = px + dx * 2, yy = py + dy * 2
                guard xx >= 0, yy >= 0, xx < bredde, yy < hoyde else { continue }
                let o = (yy * bredde + xx) * 4
                s += SIMD3(Float(data[o]), Float(data[o + 1]), Float(data[o + 2])) / 255
                n += 1
            } }
            return n > 0 ? s / n : nil
        }
    }

    /// Et lite bilde med alle fargene for trekantene uten bilde (16 nivåer per farge, 64 × 64 ruter).
    private struct Palett {
        static let side = 64
        func punkt(_ f: SIMD3<Float>) -> CGPoint {
            let n = Self.nr(f)
            return CGPoint(x: (CGFloat(n % Self.side) + 0.5) / CGFloat(Self.side), y: (CGFloat(n / Self.side) + 0.5) / CGFloat(Self.side))
        }
        init(_ farger: [SIMD3<Float>]) {}

        static func nr(_ f: SIMD3<Float>) -> Int {
            let r = Int(min(15, max(0, (f.x * 15).rounded()))), g = Int(min(15, max(0, (f.y * 15).rounded()))), b = Int(min(15, max(0, (f.z * 15).rounded())))
            return r * 256 + g * 16 + b
        }

        func bilde() -> UIImage {
            let s = Self.side
            var px = [UInt8](repeating: 255, count: s * s * 4)
            for n in 0..<(s * s) {
                let r = n / 256, g = (n / 16) % 16, b = n % 16
                px[n * 4] = UInt8(r * 17); px[n * 4 + 1] = UInt8(g * 17); px[n * 4 + 2] = UInt8(b * 17)
            }
            let ctx = px.withUnsafeMutableBytes { ptr in
                CGContext(data: ptr.baseAddress, width: s, height: s, bitsPerComponent: 8, bytesPerRow: s * 4,
                          space: CGColorSpace(name: CGColorSpace.sRGB)!, bitmapInfo: CGImageAlphaInfo.noneSkipLast.rawValue)?.makeImage()
            }
            return ctx.map { UIImage(cgImage: $0) } ?? UIImage()
        }
    }
}
