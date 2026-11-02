import SwiftUI
import ARKit
import RealityKit
import SceneKit
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

        init(_ k: ARCamera) {
            fraVerden = simd_inverse(k.transform)
            pos = SIMD3(k.transform.columns.3.x, k.transform.columns.3.y, k.transform.columns.3.z)
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
    static func lag(bitene: [Nettbit], bilder: [Fotobilde], til url: URL) {
        // Alle trekantene i én liste
        var p: [SIMD3<Float>] = []
        var tri: [SIMD3<Int32>] = []
        for bit in bitene {
            let start = Int32(p.count)
            p.append(contentsOf: bit.punkter)
            var i = 0
            while i + 2 < bit.trekanter.count {
                tri.append(SIMD3(start + Int32(bit.trekanter[i]), start + Int32(bit.trekanter[i + 1]), start + Int32(bit.trekanter[i + 2])))
                i += 3
            }
        }
        guard !tri.isEmpty else { return }
        let kameraer = bilder.map { Kamera($0.kamera) }

        // 1. Hvilke bilder ser hver trekant godt, og hvor godt
        var kandidater = [[(Int, Float)]](repeating: [], count: tri.count)
        var antallBest = [Int](repeating: 0, count: bilder.count)
        for (t, idx) in tri.enumerated() {
            let a = p[Int(idx.x)], b = p[Int(idx.y)], c = p[Int(idx.z)]
            let midt = (a + b + c) / 3
            let kryss = simd_cross(b - a, c - a)
            let lengde = simd_length(kryss)
            guard lengde > 1e-9 else { continue }
            let normal = kryss / lengde
            var liste: [(Int, Float)] = []
            for (i, k) in kameraer.enumerated() {
                let mot = k.pos - midt
                let avstand = simd_length(mot)
                guard avstand > 0.15, avstand < 6 else { continue }
                let forfra = abs(simd_dot(mot / avstand, normal))
                guard forfra > 0.25 else { continue }
                guard let pm = k.projiser(midt), k.inne(pm.0),
                      let pa = k.projiser(a), k.inne(pa.0),
                      let pb = k.projiser(b), k.inne(pb.0),
                      let pc = k.projiser(c), k.inne(pc.0) else { continue }
                // Står noe foran trekanten i dette bildet?
                if let d = bilder[i].dybdeVed(x: CGFloat(pm.0.x), y: CGFloat(pm.0.y)), d < pm.1 - 0.06 { continue }
                liste.append((i, forfra * 2 - avstand * 0.5))
            }
            guard !liste.isEmpty else { continue }
            liste.sort { $0.1 > $1.1 }
            if liste.count > 5 { liste.removeLast(liste.count - 5) }
            kandidater[t] = liste
            antallBest[liste[0].0] += 1
        }

        // 2. Blant bildene som er nesten like gode, velg det som brukes mest. Færre skjøter.
        var valg = [Int](repeating: -1, count: tri.count)
        for t in tri.indices {
            let liste = kandidater[t]
            guard let forste = liste.first else { continue }
            let gode = liste.filter { $0.1 >= forste.1 - 0.25 }
            valg[t] = gode.max { antallBest[$0.0] < antallBest[$1.0] }?.0 ?? forste.0
        }

        // 3. Geometri: hver trekant får egne hjørner med teksturkoordinater i sitt bilde
        var posisjoner: [SCNVector3] = []
        var normaler: [SCNVector3] = []
        var uv: [CGPoint] = []
        posisjoner.reserveCapacity(tri.count * 3)
        normaler.reserveCapacity(tri.count * 3)
        uv.reserveCapacity(tri.count * 3)
        var perBilde: [Int: [Int32]] = [:]
        for (t, idx) in tri.enumerated() {
            let hjorner = [p[Int(idx.x)], p[Int(idx.y)], p[Int(idx.z)]]
            let n = simd_normalize(simd_cross(hjorner[1] - hjorner[0], hjorner[2] - hjorner[0]))
            let i = valg[t]
            let start = Int32(posisjoner.count)
            for q in hjorner {
                posisjoner.append(SCNVector3(q.x, q.y, q.z))
                normaler.append(n.x.isFinite ? SCNVector3(n.x, n.y, n.z) : SCNVector3(0, 1, 0))
                if i >= 0, let pk = kameraer[i].projiser(q) {
                    uv.append(CGPoint(x: CGFloat(pk.0.x / kameraer[i].b), y: CGFloat(pk.0.y / kameraer[i].h)))
                } else {
                    uv.append(.zero)
                }
            }
            perBilde[i, default: []].append(contentsOf: [start, start + 1, start + 2])
        }

        var elementer: [SCNGeometryElement] = []
        var materialer: [SCNMaterial] = []
        for (i, indekser) in perBilde.sorted(by: { $0.key < $1.key }) {
            elementer.append(SCNGeometryElement(indices: indekser, primitiveType: .triangles))
            let m = SCNMaterial()
            m.diffuse.contents = i >= 0 ? (UIImage(data: bilder[i].jpeg) ?? UIColor(white: 0.8, alpha: 1)) : UIColor(white: 0.8, alpha: 1)
            m.isDoubleSided = true
            m.lightingModel = .constant
            materialer.append(m)
        }
        let geometri = SCNGeometry(
            sources: [SCNGeometrySource(vertices: posisjoner), SCNGeometrySource(normals: normaler), SCNGeometrySource(textureCoordinates: uv)],
            elements: elementer)
        geometri.materials = materialer
        let scene = SCNScene()
        scene.rootNode.addChildNode(SCNNode(geometry: geometri))
        try? FileManager.default.removeItem(at: url)
        _ = scene.write(to: url, options: nil, delegate: nil, progressHandler: nil)
    }
}
