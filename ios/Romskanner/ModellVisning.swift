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

/// 3D-visning av rommet på svart bakgrunn. Én finger snur, to fingre zoomer og flytter.
/// Med «Mål» trykker man på to punkter i modellen og får avstanden mellom dem.
struct ModellVisning: View {
    let modell: VistModell
    /// Kalles med alle målene hver gang de endres. nil: målene lagres ikke.
    var lagre: (([Avstand]) -> Void)? = nil
    @Environment(\.dismiss) private var lukk
    @State private var avstander: [Avstand]
    @State private var ventende: SIMD3<Float>?
    @State private var maler = false
    @State private var omdop: Avstand?
    @State private var navn = ""

    init(modell: VistModell, lagre: (([Avstand]) -> Void)? = nil) {
        self.modell = modell
        self.lagre = modell.kilde == nil ? nil : lagre
        _avstander = State(initialValue: modell.mal)
    }

    private var hint: String {
        if !maler { return "Dra for å snu · knip for å zoome · to fingre for å flytte" }
        if ventende == nil { return "Trykk på første punkt. Zoom inn mot hjørnet for å treffe nøyaktig." }
        return "Trykk på andre punkt."
    }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            Scenevisning(url: modell.url, maler: maler, avstander: avstander, ventende: ventende, trykk: punkt)
                .ignoresSafeArea()
            VStack {
                HStack(spacing: 12) {
                    Text(modell.tittel).font(.headline).foregroundStyle(.white)
                    Spacer()
                    Button {
                        maler.toggle()
                        ventende = nil
                    } label: {
                        Label("Mål", systemImage: "ruler")
                            .font(.subheadline.weight(.semibold))
                            .padding(.horizontal, 12)
                            .padding(.vertical, 7)
                            .background(maler ? Color.orange : Color.white.opacity(0.2), in: Capsule())
                            .foregroundStyle(.white)
                    }
                    .accessibilityLabel(maler ? "Slutt å måle" : "Mål")
                    Button { lukk() } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 30))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, .white.opacity(0.25))
                    }
                    .accessibilityLabel("Lukk")
                }
                .padding()
                Spacer()
                if maler {
                    malepanel
                } else {
                    Text(hint)
                        .font(.footnote)
                        .foregroundStyle(.white.opacity(0.6))
                        .padding(.bottom, 8)
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
}

/// SceneKit-visning av en USDZ-fil, med kameraet rettet mot midten av rommet.
/// Målene tegnes oppå bildet (alltid synlige, samme størrelse uansett zoom).
struct Scenevisning: UIViewRepresentable {
    let url: URL
    var maler = false
    var avstander: [Avstand] = []
    var ventende: SIMD3<Float>? = nil
    var trykk: (SIMD3<Float>) -> Void = { _ in }

    func makeCoordinator() -> Malerlag { Malerlag() }

    func makeUIView(context: Context) -> SCNView {
        let visning = SCNView()
        visning.backgroundColor = .black
        visning.antialiasingMode = .multisampling4X
        visning.allowsCameraControl = true
        visning.autoenablesDefaultLighting = true

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
        let kamera = SCNNode()
        kamera.camera = SCNCamera()
        kamera.camera?.zNear = 0.01
        kamera.camera?.zFar = Double(storst) * 20
        kamera.camera?.fieldOfView = 50
        kamera.position = SCNVector3(senter.x + storst * 0.7, senter.y + storst * 1.1, senter.z + storst * 0.9)
        kamera.look(at: senter)
        scene.rootNode.addChildNode(kamera)
        visning.pointOfView = kamera

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
        lag.aktiv = maler
        lag.avstander = avstander
        lag.ventende = ventende
        lag.trykk = trykk
        lag.tegn()
    }
}

/// Tar imot trykk i modellen og tegner målene som streker, prikker og tall oppå 3D-bildet.
final class Malerlag: NSObject, SCNSceneRendererDelegate {
    weak var visning: SCNView?
    let lag = UIView()
    /// Meter per enhet i scenen.
    var skala: Float = 1
    var aktiv = false
    var avstander: [Avstand] = []
    var ventende: SIMD3<Float>?
    var trykk: (SIMD3<Float>) -> Void = { _ in }
    private let streker = CAShapeLayer()
    private var prikker: [UIView] = []
    private var etiketter: [UILabel] = []
    private var tegnes = false
    private let laas = NSLock()

    override init() {
        super.init()
        lag.isUserInteractionEnabled = false
        streker.strokeColor = UIColor.systemOrange.cgColor
        streker.fillColor = nil
        streker.lineWidth = 2.5
        streker.lineCap = .round
        lag.layer.addSublayer(streker)
    }

    @objc func trykket(_ g: UITapGestureRecognizer) {
        guard aktiv, let v = visning else { return }
        let treff = v.hitTest(g.location(in: v), options: [
            .searchMode: SCNHitTestSearchMode.closest.rawValue,
            .ignoreHiddenNodes: true,
        ])
        guard let t = treff.first else { return }
        let p = t.worldCoordinates
        trykk(SIMD3(p.x, p.y, p.z) * skala)
    }

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
        for (i, a) in avstander.enumerated() {
            guard let pa = skjerm(a.pa, v), let pb = skjerm(a.pb, v) else { continue }
            sti.move(to: pa)
            sti.addLine(to: pb)
            punkter.append((pa, false))
            punkter.append((pb, false))
            tekster.append((CGPoint(x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 - 14), "\(i + 1) · \(a.tekst)"))
        }
        if aktiv, let vt = ventende, let p = skjerm(vt, v) { punkter.append((p, true)) }

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
