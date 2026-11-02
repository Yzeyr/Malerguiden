import SwiftUI
import SceneKit
import UIKit
import simd

/// En modell som skal vises (Identifiable, så den kan brukes med fullScreenCover).
struct VistModell: Identifiable {
    let id = UUID()
    let url: URL
    let tittel: String
    /// Hvilken modell det er («3d», «foto» eller «plan»). Mål lagres bare når den er satt.
    var kilde: String? = nil
    /// Mål som allerede er tatt i denne modellen.
    var mal: [Avstand] = []
    /// Farger å male veggene med. Tom: fargene sist sendt fra Malerguiden.
    var farger: [ProveFarger.Farge] = []
    /// Åpne rett i fargevalg (fra «Prøv farge»).
    var startMedFarge = false
}

/// En avstand målt i en 3D-modell: to punkter i modellens koordinater, i meter.
/// Punktene hører til én bestemt modell (`kilde`), fordi hver modell har egne koordinater.
struct Avstand: Codable, Hashable, Identifiable {
    var id = UUID()
    var navn: String
    var a: [Float]
    var b: [Float]
    var kilde: String

    var pa: SIMD3<Float> { a.count == 3 ? SIMD3(a[0], a[1], a[2]) : .zero }
    var pb: SIMD3<Float> { b.count == 3 ? SIMD3(b[0], b[1], b[2]) : .zero }
    var meter: Float { simd_distance(pa, pb) }
    var vannrett: Float { hypot(pb.x - pa.x, pb.z - pa.z) }
    var loddrett: Float { abs(pb.y - pa.y) }
    var tekst: String { Avstand.lengde(meter) }
    var deler: String { "vannrett \(Avstand.lengde(vannrett)) · loddrett \(Avstand.lengde(loddrett))" }

    /// Hele cm under én meter, ellers meter med to desimaler.
    static func lengde(_ m: Float) -> String {
        let cm = (m * 100).rounded()
        if cm < 100 { return "\(Int(cm)) cm" }
        return Double(m).formatted(.number.precision(.fractionLength(2))) + " m"
    }

    static func kildenavn(_ k: String) -> String {
        switch k {
        case "3d": return "ekte 3D"
        case "foto": return "3D med bilder"
        default: return "3D"
        }
    }
}

/// En vegg malt i 3D-modellen: et plan (punkt og retning, i meter) og fargen.
struct MaltFlate: Equatable {
    var punkt: SIMD3<Float>
    var normal: SIMD3<Float>
    var hex: String
}

extension ProveFarger {
    private static let nokkel = "provefarger-sist"
    /// Fargene sist sendt fra Malerguiden til «Prøv farge», så de kan brukes i 3D-modellene.
    static func husk(_ farger: [Farge]) {
        UserDefaults.standard.set(farger.map { [$0.navn, $0.hex] }, forKey: nokkel)
    }
    static func sist() -> [Farge] {
        let liste = UserDefaults.standard.array(forKey: nokkel) as? [[String]] ?? []
        return liste.compactMap { p in
            guard p.count == 2, let f = UIColor(hex: p[1]) else { return nil }
            return Farge(navn: p[0], hex: p[1], farge: f)
        }
    }
}

/// Holder på SceneKit-visningen, så knapper i SwiftUI kan ta bilde av den.
final class Visningsref: ObservableObject {
    weak var visning: SCNView?
}

/// 3D-visning av rommet på svart bakgrunn. Én finger snur, to fingre zoomer og flytter.
/// «Mål»: trykk på to punkter og få avstanden. «Farge»: trykk på en vegg for å male den.
struct ModellVisning: View {
    enum Modus { case se, mal, farge }

    let modell: VistModell
    /// Kalles med alle målene hver gang de endres. nil: målene lagres ikke.
    var lagre: (([Avstand]) -> Void)? = nil
    @Environment(\.dismiss) private var lukk
    @StateObject private var ref = Visningsref()
    @State private var avstander: [Avstand]
    @State private var ventende: SIMD3<Float>?
    @State private var modus: Modus
    @State private var omdop: Avstand?
    @State private var navn = ""
    @State private var farger: [ProveFarger.Farge]
    @State private var valgt = 0
    @State private var egen = Color(red: 0.85, green: 0.80, blue: 0.72)
    @State private var malte: [MaltFlate] = []
    @State private var ekteLys = true
    /// Som i Sims: vegger og tak mellom kameraet og rommet skjules, så du ser inn.
    @State private var gjem = true

    init(modell: VistModell, lagre: (([Avstand]) -> Void)? = nil) {
        self.modell = modell
        self.lagre = modell.kilde == nil ? nil : lagre
        _avstander = State(initialValue: modell.mal)
        _modus = State(initialValue: modell.startMedFarge ? .farge : .se)
        _farger = State(initialValue: modell.farger.isEmpty ? ProveFarger.sist() : modell.farger)
    }

    private var hint: String {
        switch modus {
        case .se: return gjem ? "Veggene nærmest deg er gjemt · trykk på kuben for å vise alt" : "Dra for å snu · knip for å zoome · to fingre for å flytte"
        case .mal: return ventende == nil ? "Trykk på første punkt. Zoom inn mot hjørnet for å treffe nøyaktig." : "Trykk på andre punkt."
        case .farge: return malte.isEmpty ? "Velg en farge og trykk på en vegg." : "Trykk på flere vegger, eller på en malt vegg for å bytte farge."
        }
    }

    /// Fargen som er valgt: en fra lista, eller den egne (siste plass).
    private var valgtHex: String {
        if valgt < farger.count { return farger[valgt].hex }
        return UIColor(egen).hex
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Scenevisning(url: modell.url, ref: ref, modus: modus, avstander: avstander, ventende: ventende,
                         malte: malte, ekteLys: ekteLys, gjem: gjem, trykk: punkt, trykkVegg: malVegg)
                .ignoresSafeArea()
            VStack {
                topplinje.padding()
                Spacer()
                switch modus {
                case .se:
                    Text(hint)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.bottom, 8)
                case .mal: malepanel
                case .farge: fargepanel
                }
            }
        }
        .preferredColorScheme(.dark)
        .alert("Navn på målet", isPresented: Binding(get: { omdop != nil }, set: { if !$0 { omdop = nil } })) {
            TextField("F.eks. Foring, vindu 1", text: $navn)
            Button("Lagre") {
                let n = navn.trimmingCharacters(in: .whitespaces)
                if let o = omdop, !n.isEmpty, let i = avstander.firstIndex(where: { $0.id == o.id }) {
                    avstander[i].navn = n
                    lagre?(avstander)
                }
                omdop = nil
            }
            Button("Avbryt", role: .cancel) { omdop = nil }
        }
    }

    private var topplinje: some View {
        HStack(spacing: 10) {
            Text(modell.tittel).font(.headline).foregroundStyle(.white).lineLimit(1)
            Spacer()
            Button { gjem.toggle() } label: {
                Image(systemName: gjem ? "cube.transparent" : "cube")
                    .font(.subheadline.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(gjem ? Color.orange : Color.white.opacity(0.2), in: Capsule())
                    .foregroundStyle(.white)
            }
            .accessibilityLabel(gjem ? "Vis alle vegger" : "Gjem veggene nærmest")
            modusknapp("Farge", ikon: "paintpalette", .farge)
            modusknapp("Mål", ikon: "ruler", .mal)
            Button { lukk() } label: {
                Image(systemName: "xmark.circle.fill")
                    .font(.system(size: 30))
                    .symbolRenderingMode(.palette)
                    .foregroundStyle(.white, .white.opacity(0.25))
            }
            .accessibilityLabel("Lukk")
        }
    }

    private func modusknapp(_ tittel: String, ikon: String, _ m: Modus) -> some View {
        Button {
            modus = modus == m ? .se : m
            ventende = nil
        } label: {
            Label(tittel, systemImage: ikon)
                .font(.subheadline.weight(.semibold))
                .padding(.horizontal, 11)
                .padding(.vertical, 7)
                .background(modus == m ? Color.orange : Color.white.opacity(0.2), in: Capsule())
                .foregroundStyle(.white)
        }
    }

    // MARK: Mål

    private var malepanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(hint).font(.footnote).foregroundStyle(.white.opacity(0.85))
            if !avstander.isEmpty {
                ScrollView {
                    VStack(spacing: 8) {
                        ForEach(Array(avstander.enumerated()), id: \.element.id) { i, a in rad(i, a) }
                    }
                }
                .frame(height: min(CGFloat(avstander.count) * 50, 160))
            }
            HStack {
                Button {
                    if ventende != nil { ventende = nil } else if !avstander.isEmpty { avstander.removeLast(); lagre?(avstander) }
                } label: {
                    Label("Angre", systemImage: "arrow.uturn.backward")
                }
                .disabled(ventende == nil && avstander.isEmpty)
                Spacer()
                Text(lagre == nil ? "Målene lagres ikke her" : "Lagres på rommet")
                    .font(.caption)
                    .foregroundStyle(.white.opacity(0.55))
            }
            .font(.subheadline)
        }
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func rad(_ i: Int, _ a: Avstand) -> some View {
        HStack(spacing: 10) {
            Text("\(i + 1)")
                .font(.caption.weight(.bold))
                .frame(width: 22, height: 22)
                .background(Color.orange, in: Circle())
            VStack(alignment: .leading, spacing: 1) {
                Text(a.navn).font(.subheadline.weight(.medium)).lineLimit(1)
                Text(a.deler).font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            Text(a.tekst).font(.headline.monospacedDigit())
            Menu {
                Button { navn = a.navn; omdop = a } label: { Label("Endre navn", systemImage: "pencil") }
                Button(role: .destructive) {
                    avstander.removeAll { $0.id == a.id }
                    lagre?(avstander)
                } label: { Label("Slett", systemImage: "trash") }
            } label: {
                Image(systemName: "ellipsis.circle").font(.title3)
            }
        }
        .foregroundStyle(.white)
    }

    /// Et trykk i modellen: første punkt venter, andre punkt gir et nytt mål.
    private func punkt(_ p: SIMD3<Float>) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        guard let a = ventende else { ventende = p; return }
        ventende = nil
        avstander.append(Avstand(navn: "Mål \(avstander.count + 1)", a: [a.x, a.y, a.z], b: [p.x, p.y, p.z], kilde: modell.kilde ?? ""))
        lagre?(avstander)
    }

    // MARK: Farge

    private var fargepanel: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(hint).font(.footnote).foregroundStyle(.white.opacity(0.85))
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(Array(farger.enumerated()), id: \.element.id) { i, f in
                        Button { valgt = i } label: {
                            fargeprikk(Color(uiColor: f.farge), navn: f.navn, valgt: valgt == i)
                        }
                    }
                    VStack(spacing: 4) {
                        ColorPicker("Egen farge", selection: $egen, supportsOpacity: false)
                            .labelsHidden()
                            .frame(width: 42, height: 42)
                            .overlay(Circle().stroke(.white, lineWidth: valgt >= farger.count ? 3 : 0).padding(-2))
                            .onChange(of: egen) { _ in valgt = farger.count }
                        Text("Egen").font(.caption2.weight(.semibold)).foregroundStyle(.white)
                    }
                    .onTapGesture { valgt = farger.count }
                }
                .padding(.horizontal, 2)
            }
            if farger.isEmpty {
                Text("Fargene fra jobben kommer hit når du trykker «Prøv farge» i Malerguiden.")
                    .font(.caption).foregroundStyle(.white.opacity(0.6))
            }
            HStack(spacing: 14) {
                Button { if !malte.isEmpty { malte.removeLast() } } label: { Label("Angre", systemImage: "arrow.uturn.backward") }
                    .disabled(malte.isEmpty)
                Toggle("Romlys", isOn: $ekteLys).toggleStyle(.button)
                Spacer()
                Button { taBilde() } label: { Label("Bilde", systemImage: "camera") }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
            }
            .font(.subheadline)
        }
        .padding(14)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
        .padding(.horizontal, 12)
        .padding(.bottom, 8)
    }

    private func fargeprikk(_ c: Color, navn: String, valgt: Bool) -> some View {
        VStack(spacing: 4) {
            Circle().fill(c).frame(width: 42, height: 42)
                .overlay(Circle().stroke(.white, lineWidth: valgt ? 3 : 1))
            Text(navn).font(.caption2.weight(.semibold)).foregroundStyle(.white).lineLimit(2).frame(width: 76)
        }
    }

    /// Trykk på en vegg i fargemodus: mal den, bytt farge, eller ta bort malingen
    /// hvis den alt har fargen som er valgt.
    private func malVegg(_ p: SIMD3<Float>, _ n: SIMD3<Float>) {
        UIImpactFeedbackGenerator(style: .light).impactOccurred()
        let hex = valgtHex
        if let i = malte.lastIndex(where: { abs(simd_dot($0.normal, n)) > 0.94 && abs(simd_dot(p - $0.punkt, $0.normal)) < 0.06 }) {
            if malte[i].hex == hex { malte.remove(at: i) } else { malte[i].hex = hex }
        } else {
            malte.append(MaltFlate(punkt: p, normal: n, hex: hex))
        }
    }

    private func taBilde() {
        guard let bilde = ref.visning?.snapshot() else { return }
        Task { _ = await Deling.del([bilde]) }
    }
}

/// SceneKit-visning av en USDZ-fil, med kameraet rettet mot midten av rommet.
/// Målene tegnes oppå bildet (alltid synlige, samme størrelse uansett zoom).
struct Scenevisning: UIViewRepresentable {
    let url: URL
    var ref: Visningsref? = nil
    var modus: ModellVisning.Modus = .se
    var avstander: [Avstand] = []
    var ventende: SIMD3<Float>? = nil
    var malte: [MaltFlate] = []
    var ekteLys = true
    var gjem = true
    var trykk: (SIMD3<Float>) -> Void = { _ in }
    var trykkVegg: (SIMD3<Float>, SIMD3<Float>) -> Void = { _, _ in }

    func makeCoordinator() -> Malerlag { Malerlag() }

    func makeUIView(context: Context) -> SCNView {
        let visning = SCNView()
        visning.backgroundColor = .black
        visning.antialiasingMode = .multisampling4X
        visning.allowsCameraControl = true
        visning.autoenablesDefaultLighting = true
        ref?.visning = visning

        let lag = context.coordinator
        lag.visning = visning
        visning.delegate = lag
        lag.lag.frame = visning.bounds
        lag.lag.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        visning.addSubview(lag.lag)
        visning.addGestureRecognizer(UITapGestureRecognizer(target: lag, action: #selector(Malerlag.trykket(_:))))

        guard let scene = try? SCNScene(url: url, options: nil) else { return visning }
        scene.background.contents = UIColor.black
        visning.scene = scene

        // Ramme rundt hele modellen, og et kamera litt ovenfra og på skrå
        let (lav, hoy) = scene.rootNode.boundingBox
        let senter = SCNVector3((lav.x + hoy.x) / 2, (lav.y + hoy.y) / 2, (lav.z + hoy.z) / 2)
        let storst = max(hoy.x - lav.x, hoy.y - lav.y, hoy.z - lav.z, 1)
        // Modellene er i meter. Er en modell lest inn i cm, er den over 50 enheter stor.
        lag.skala = storst > 50 ? 0.01 : 1
        lag.midt = SIMD3(senter.x, senter.y, senter.z)
        lag.forbered(scene.rootNode)
        let kamera = SCNNode()
        kamera.camera = SCNCamera()
        kamera.camera?.zNear = 0.01
        kamera.camera?.zFar = Double(storst) * 20
        kamera.camera?.fieldOfView = 50
        kamera.position = SCNVector3(senter.x + storst * 0.7, senter.y + storst * 1.1, senter.z + storst * 0.9)
        kamera.look(at: senter)
        scene.rootNode.addChildNode(kamera)
        visning.pointOfView = kamera
        scene.rootNode.addChildNode(lag.maling)

        let styring = visning.defaultCameraController
        styring.interactionMode = .orbitTurntable
        styring.target = senter
        styring.inertiaEnabled = true
        styring.maximumVerticalAngle = 89
        styring.minimumVerticalAngle = -10
        return visning
    }

    func updateUIView(_ visning: SCNView, context: Context) {
        let lag = context.coordinator
        lag.modus = modus
        lag.avstander = avstander
        lag.ventende = ventende
        lag.trykk = trykk
        lag.trykkVegg = trykkVegg
        lag.settGjem(gjem)
        lag.mal(malte, ekteLys: ekteLys)
        lag.tegn()
    }
}

/// Tar imot trykk i modellen, tegner målene som streker, prikker og tall oppå 3D-bildet,
/// og legger fargen på veggene som er malt.
final class Malerlag: NSObject, SCNSceneRendererDelegate {
    weak var visning: SCNView?
    let lag = UIView()
    /// Malingen ligger her. Egen kategori, så trykk går gjennom den og treffer modellen.
    let maling = SCNNode()
    /// Meter per enhet i scenen.
    var skala: Float = 1
    var modus: ModellVisning.Modus = .se
    var avstander: [Avstand] = []
    var ventende: SIMD3<Float>?
    var trykk: (SIMD3<Float>) -> Void = { _ in }
    var trykkVegg: (SIMD3<Float>, SIMD3<Float>) -> Void = { _, _ in }
    private let streker = CAShapeLayer()
    private var prikker: [UIView] = []
    private var etiketter: [UILabel] = []
    private var tegnes = false
    private let laas = NSLock()

    // MARK: Gjem veggene nærmest (som i Sims)

    /// Midten av modellen, i scenens koordinater.
    var midt = SIMD3<Float>(0, 0, 0)
    private(set) var gjem = true
    private var materialer: [SCNMaterial] = []

    /// Hver flate snus mot midten av rommet. Vender den da bort fra kameraet, står kameraet
    /// på utsiden av den: da er den en vegg eller et tak i veien, og skjules.
    /// Virker uansett hvilken vei flatene i fila vender.
    static let gjemKode = """
    #pragma arguments
    float3 rommidt;
    float gjem;
    #pragma body
    if (gjem > 0.5) {
        float3 n = normalize(_surface.normal);
        float3 p = _surface.position;
        float3 c = (scn_frame.viewTransform * float4(rommidt, 1.0)).xyz;
        if (dot(n, c - p) < 0.0) { n = -n; }
        if (dot(n, -p) < -0.03 * length(p)) { discard_fragment(); }
    }
    """

    /// Samme regel på CPU-en, så trykk går gjennom veggene som er skjult.
    func skjult(_ p: SIMD3<Float>, _ normal: SIMD3<Float>, kamera: SIMD3<Float>) -> Bool {
        guard gjem else { return false }
        var n = normal
        if simd_dot(n, midt - p) < 0 { n = -n }
        let mot = kamera - p
        return simd_dot(n, mot) < -0.03 * simd_length(mot)
    }

    /// Legger regelen på alle materialene i modellen.
    func forbered(_ rot: SCNNode) {
        rot.enumerateHierarchy { node, _ in
            node.geometry?.materials.forEach { self.gjor($0) }
        }
    }

    private func gjor(_ m: SCNMaterial, husk: Bool = true) {
        m.shaderModifiers = [.fragment: Malerlag.gjemKode]
        m.setValue(NSValue(scnVector3: SCNVector3(midt.x, midt.y, midt.z)), forKey: "rommidt")
        m.setValue(NSNumber(value: gjem ? 1 : 0), forKey: "gjem")
        if husk { materialer.append(m) }
    }

    func settGjem(_ ja: Bool) {
        guard ja != gjem else { return }
        gjem = ja
        let alle = materialer + maling.childNodes.compactMap { $0.geometry?.materials }.flatMap { $0 }
        alle.forEach { $0.setValue(NSNumber(value: ja ? 1 : 0), forKey: "gjem") }
    }

    /// Alle trekantene i modellen, i scenens koordinater. Leses første gang noe males.
    private struct Trekant { var a, b, c, n, s: SIMD3<Float> }
    private var trekanter: [Trekant]?
    private var sistMalt: [MaltFlate] = []
    private var sistLys = true

    override init() {
        super.init()
        lag.isUserInteractionEnabled = false
        streker.strokeColor = UIColor.systemOrange.cgColor
        streker.fillColor = nil
        streker.lineWidth = 2.5
        streker.lineCap = .round
        lag.layer.addSublayer(streker)
        maling.categoryBitMask = 2
    }

    @objc func trykket(_ g: UITapGestureRecognizer) {
        guard modus != .se, let v = visning else { return }
        let treff = v.hitTest(g.location(in: v), options: [
            .searchMode: SCNHitTestSearchMode.all.rawValue,
            .ignoreHiddenNodes: true,
            .categoryBitMask: 1,
        ])
        // Det første treffet som ikke er en skjult vegg
        let k = v.pointOfView?.worldPosition ?? SCNVector3Zero
        let kamera = SIMD3(k.x, k.y, k.z)
        guard let t = treff.first(where: { h in
            let p = h.worldCoordinates, n = h.worldNormal
            return !skjult(SIMD3(p.x, p.y, p.z), simd_normalize(SIMD3(n.x, n.y, n.z)), kamera: kamera)
        }) else { return }
        let p = t.worldCoordinates
        let punkt = SIMD3(p.x, p.y, p.z) * skala
        if modus == .farge {
            let n = t.worldNormal
            let normal = simd_normalize(SIMD3(n.x, n.y, n.z))
            trykkVegg(punkt, normal)
        } else {
            trykk(punkt)
        }
    }

    // MARK: Maling

    /// Leser trekantene i modellen (alle noder med geometri) over i verdenskoordinater.
    private func lesTrekanter() -> [Trekant] {
        var ut: [Trekant] = []
        guard let rot = visning?.scene?.rootNode else { return ut }
        rot.enumerateHierarchy { node, _ in
            guard node !== self.maling, node.parent !== self.maling, let g = node.geometry,
                  let kilde = g.sources(for: .vertex).first,
                  kilde.usesFloatComponents, kilde.bytesPerComponent == 4, kilde.componentsPerVector >= 3 else { return }
            let m = node.simdWorldTransform
            let antall = kilde.vectorCount, steg = kilde.dataStride, start = kilde.dataOffset
            var punkter = [SIMD3<Float>](repeating: .zero, count: antall)
            kilde.data.withUnsafeBytes { raw in
                for i in 0..<antall {
                    let o = start + i * steg
                    guard o + 12 <= raw.count else { break }
                    let x = raw.loadUnaligned(fromByteOffset: o, as: Float.self)
                    let y = raw.loadUnaligned(fromByteOffset: o + 4, as: Float.self)
                    let z = raw.loadUnaligned(fromByteOffset: o + 8, as: Float.self)
                    let w = m * SIMD4<Float>(x, y, z, 1)
                    punkter[i] = SIMD3(w.x, w.y, w.z)
                }
            }
            for e in g.elements where e.primitiveType == .triangles {
                let bpi = e.bytesPerIndex
                e.data.withUnsafeBytes { raw in
                    func indeks(_ k: Int) -> Int {
                        let o = k * bpi
                        switch bpi {
                        case 1: return Int(raw.load(fromByteOffset: o, as: UInt8.self))
                        case 2: return Int(raw.loadUnaligned(fromByteOffset: o, as: UInt16.self))
                        default: return Int(raw.loadUnaligned(fromByteOffset: o, as: UInt32.self))
                        }
                    }
                    let n = min(e.primitiveCount, raw.count / (bpi * 3))
                    for t in 0..<n {
                        let i0 = indeks(t * 3), i1 = indeks(t * 3 + 1), i2 = indeks(t * 3 + 2)
                        guard i0 < antall, i1 < antall, i2 < antall else { continue }
                        let a = punkter[i0], b = punkter[i1], c = punkter[i2]
                        let kryss = simd_cross(b - a, c - a)
                        let l = simd_length(kryss)
                        guard l > 1e-10 else { continue }
                        ut.append(Trekant(a: a, b: b, c: c, n: kryss / l, s: (a + b + c) / 3))
                    }
                }
            }
        }
        return ut
    }

    /// Legger fargen på trekantene som ligger i planet til hver malt vegg (siste maling vinner).
    func mal(_ malte: [MaltFlate], ekteLys: Bool) {
        guard malte != sistMalt || ekteLys != sistLys else { return }
        sistMalt = malte
        sistLys = ekteLys
        maling.childNodes.forEach { $0.removeFromParentNode() }
        guard !malte.isEmpty else { return }
        if trekanter == nil { trekanter = lesTrekanter() }
        guard let alle = trekanter, !alle.isEmpty else { return }

        // Planene i scenens enheter
        let plan = malte.map { (p: $0.punkt / skala, n: simd_normalize($0.normal), hex: $0.hex) }
        let grense = 0.06 / skala
        let loft = 0.004 / skala
        var perFarge: [String: [SIMD3<Float>]] = [:]
        for t in alle {
            guard let f = plan.lastIndex(where: { abs(simd_dot($0.n, t.n)) > 0.94 && abs(simd_dot(t.s - $0.p, $0.n)) < grense }) else { continue }
            // Løft malingen litt ut fra veggen, mot den siden veggen ble trykket på
            let l = plan[f].n * loft
            perFarge[plan[f].hex, default: []].append(contentsOf: [t.a + l, t.b + l, t.c + l])
        }
        for (hex, p) in perFarge {
            let kilde = SCNGeometrySource(vertices: p.map { SCNVector3($0.x, $0.y, $0.z) })
            let idx = (0..<UInt32(p.count)).map { $0 }
            let element = SCNGeometryElement(indices: idx, primitiveType: .triangles)
            let geo = SCNGeometry(sources: [kilde], elements: [element])
            let mat = SCNMaterial()
            mat.diffuse.contents = UIColor(hex: hex) ?? .white
            mat.isDoubleSided = true
            if ekteLys {
                // Multipliser med bildet under: lys, skygge og struktur fra rommet blir med
                mat.lightingModel = .constant
                mat.blendMode = .multiply
                mat.writesToDepthBuffer = false
            } else {
                mat.lightingModel = .constant
            }
            geo.materials = [mat]
            gjor(mat, husk: false)
            let node = SCNNode(geometry: geo)
            node.categoryBitMask = 2
            maling.addChildNode(node)
        }
    }

    // MARK: Mål

    /// Kameraet har flyttet seg: flytt målene etter, høyst én gang per bilde.
    func renderer(_ renderer: SCNSceneRenderer, didRenderScene scene: SCNScene, atTime time: TimeInterval) {
        laas.lock()
        let opptatt = tegnes
        tegnes = true
        laas.unlock()
        guard !opptatt else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            self.laas.lock(); self.tegnes = false; self.laas.unlock()
            self.tegn()
        }
    }

    private func skjerm(_ m: SIMD3<Float>, _ v: SCNView) -> CGPoint? {
        let s = m / skala
        let p = v.projectPoint(SCNVector3(s.x, s.y, s.z))
        guard p.z > 0, p.z < 1 else { return nil }
        return CGPoint(x: CGFloat(p.x), y: CGFloat(p.y))
    }

    func tegn() {
        guard let v = visning else { return }
        let sti = UIBezierPath()
        var punkter: [(CGPoint, Bool)] = []
        var tekster: [(CGPoint, String)] = []
        // Målene vises i målemodus og når man bare ser, ikke mens man maler
        let visMal = modus != .farge
        for (i, a) in avstander.enumerated() where visMal {
            guard let pa = skjerm(a.pa, v), let pb = skjerm(a.pb, v) else { continue }
            sti.move(to: pa)
            sti.addLine(to: pb)
            punkter.append((pa, false))
            punkter.append((pb, false))
            tekster.append((CGPoint(x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 14), "\(i + 1) · \(a.tekst)"))
        }
        if modus == .mal, let vt = ventende, let p = skjerm(vt, v) { punkter.append((p, true)) }

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        streker.path = sti.cgPath
        CATransaction.commit()

        while prikker.count < punkter.count {
            let d = UIView(frame: CGRect(x: 0, y: 0, width: 12, height: 12))
            d.layer.cornerRadius = 6
            d.layer.borderWidth = 2
            d.layer.borderColor = UIColor.white.cgColor
            lag.addSubview(d)
            prikker.append(d)
        }
        for (i, d) in prikker.enumerated() {
            d.isHidden = i >= punkter.count
            guard i < punkter.count else { continue }
            d.center = punkter[i].0
            d.backgroundColor = punkter[i].1 ? .systemYellow : .systemOrange
        }

        while etiketter.count < tekster.count {
            let l = UILabel()
            l.font = .systemFont(ofSize: 13, weight: .bold)
            l.textColor = .white
            l.textAlignment = .center
            l.backgroundColor = UIColor.black.withAlphaComponent(0.7)
            l.layer.cornerRadius = 9
            l.layer.masksToBounds = true
            lag.addSubview(l)
            etiketter.append(l)
        }
        for (i, l) in etiketter.enumerated() {
            l.isHidden = i >= tekster.count
            guard i < tekster.count else { continue }
            l.text = tekster[i].1
            let s = l.sizeThatFits(CGSize(width: 300, height: 30))
            l.bounds = CGRect(x: 0, y: 0, width: s.width + 14, height: 20)
            l.center = tekster[i].0
        }
    }
}

extension UIColor {
    /// «#RRGGBB».
    var hex: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        getRed(&r, green: &g, blue: &b, alpha: &a)
        func k(_ v: CGFloat) -> Int { Int((min(max(v, 0), 1) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", k(r), k(g), k(b))
    }
}

enum TredjeVisning {
    /// Den beste 3D-modellen av rommet, åpnet for å prøve farger: ekte 3D, så med bilder, så vanlig.
    /// Den beste modellen, med målene som er tatt i den. farge: åpne rett i fargevalg.
    static func beste(for r: SkannetRom, farger: [ProveFarger.Farge], farge: Bool) -> VistModell {
        let (url, kilde) = Fargemodell.finnes(r.id) ? (Fargemodell.url(r.id), "3d")
            : Fotomodell.finnes(r.id) ? (Fotomodell.url(r.id), "foto") : (Modell.url(r.id), "plan")
        return VistModell(url: url, tittel: r.navn, kilde: kilde, mal: (r.avstander ?? []).filter { $0.kilde == kilde },
                          farger: farger, startMedFarge: farge)
    }

    static func modell(for r: SkannetRom, farger: [ProveFarger.Farge]) -> VistModell {
        let url = Fargemodell.finnes(r.id) ? Fargemodell.url(r.id) : Fotomodell.finnes(r.id) ? Fotomodell.url(r.id) : Modell.url(r.id)
        return VistModell(url: url, tittel: r.navn, farger: farger, startMedFarge: true)
    }
}
