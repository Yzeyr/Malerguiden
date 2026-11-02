import SwiftUI
import RealityKit
import ARKit

/// Fargene nettsiden ba om å prøve (Identifiable, så den kan vises med fullScreenCover).
struct ProveFarger: Identifiable {
    struct Farge: Identifiable {
        let id = UUID()
        let navn: String
        let hex: String
        let farge: UIColor
    }
    let id = UUID()
    let farger: [Farge]
}

/// Prøvemaling: LiDAR skanner rommet, og veggene du trykker på males i fargen du har valgt.
/// Møbler og folk foran veggen skjuler malingen (okklusjon), så det ser ut som det er malt.
struct ProveMalView: View {
    let farger: [ProveFarger.Farge]
    let lukk: () -> Void

    static var stottet: Bool { ARWorldTrackingConfiguration.supportsSceneReconstruction(.meshWithClassification) }

    @StateObject private var maler = VeggMaler()

    var body: some View {
        ZStack {
            ARMalerView(maler: maler).ignoresSafeArea()
            VStack(spacing: 10) {
                HStack {
                    Button { lukk() } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 30)).symbolRenderingMode(.palette).foregroundStyle(.white, .black.opacity(0.4))
                    }
                    .accessibilityLabel("Lukk")
                    Spacer()
                    if maler.antallVegger > 0 {
                        Button { maler.angre() } label: { Label("Angre", systemImage: "arrow.uturn.backward") }
                            .buttonStyle(.bordered).tint(.white)
                    }
                    Button { maler.taBilde() } label: { Label("Bilde", systemImage: "camera") }
                        .buttonStyle(.borderedProminent).tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                }
                Spacer()
                Text(maler.melding)
                    .font(.callout.weight(.semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
                    .padding(.horizontal, 14).padding(.vertical, 8)
                    .background(.black.opacity(0.55), in: Capsule())
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 10) {
                        ForEach(Array(farger.enumerated()), id: \.element.id) { i, f in
                            Button { maler.valgt = i } label: {
                                VStack(spacing: 4) {
                                    Circle().fill(Color(uiColor: f.farge)).frame(width: 46, height: 46)
                                        .overlay(Circle().stroke(.white, lineWidth: maler.valgt == i ? 4 : 1))
                                        .shadow(radius: 2)
                                    Text(f.navn).font(.caption2.weight(.semibold)).foregroundStyle(.white).lineLimit(2).frame(width: 84)
                                }
                            }
                        }
                    }
                    .padding(.horizontal, 4)
                }
                HStack {
                    Toggle("Alle vegger", isOn: $maler.alleVegger).toggleStyle(.button).tint(.white)
                    Toggle("Romlys", isOn: $maler.ekteLys).toggleStyle(.button).tint(.white)
                    Spacer()
                    Text("Dekning").font(.footnote).foregroundStyle(.white)
                    Slider(value: $maler.dekning, in: 0.5...1).frame(width: 90).tint(.white)
                }
                .padding(10)
                .background(.black.opacity(0.4), in: RoundedRectangle(cornerRadius: 14))
            }
            .padding()
        }
        .onAppear { maler.farger = farger.map(\.farge) }
        .preferredColorScheme(.dark)
    }
}

/// Skanninger som venter på å bli lest. Brukes bare fra ARKit-tråden.
private final class Leseko: @unchecked Sendable {
    var ventende: [UUID: ARMeshAnchor] = [:]
    var sist: TimeInterval = 0
}

/// En vegg som skal males: et plan (punkt og retning) og fargen.
private struct ValgtVegg {
    let punkt: SIMD3<Float>
    let normal: SIMD3<Float>
    let farge: Int
}

/// Trekantene i en del av skanningen som er vegg, i verdenskoordinater.
private struct VeggBiter {
    var a: [SIMD3<Float>] = [], b: [SIMD3<Float>] = [], c: [SIMD3<Float>] = []
    var senter: [SIMD3<Float>] = []
    var normal: [SIMD3<Float>] = []
}

@MainActor
final class VeggMaler: NSObject, ObservableObject, ARSessionDelegate {
    @Published var valgt = 0 { didSet { if alleVegger { tegnAlt() } } }
    @Published var alleVegger = false { didSet { tegnAlt() } }
    @Published var dekning: Double = 0.92 { didSet { oppdaterMaterialer() } }
    /// true: malingen får lys og skygge fra rommet. false: fargen vises flatt, akkurat som koden.
    @Published var ekteLys = true { didSet { oppdaterMaterialer() } }
    @Published var melding = "Gå rolig rundt og pek på veggene. Trykk på en vegg for å male den."
    @Published private(set) var antallVegger = 0

    var farger: [UIColor] = []
    weak var arView: ARView?
    private let rot = AnchorEntity(world: .zero)
    private var biter: [UUID: VeggBiter] = [:]
    private var entiteter: [UUID: Entity] = [:]
    private var vegger: [ValgtVegg] = [] { didSet { antallVegger = vegger.count } }
    private var skitne = Set<UUID>()
    private var tidtaker: Timer?
    /// Antall vegg-trekanter sist en del ble tegnet, og når. Små endringer tegnes ikke på nytt hver gang.
    private var tegnet: [UUID: (antall: Int, tid: Date)] = [:]
    /// Nye skanninger samles her (på ARKit-tråden) og leses høyst to ganger i sekundet.
    private nonisolated let ko = Leseko()

    func start(_ v: ARView) {
        arView = v
        v.scene.addAnchor(rot)
        let oppsett = ARWorldTrackingConfiguration()
        oppsett.sceneReconstruction = .meshWithClassification
        // Ingen flatesøk eller personsporing: det koster mye og trengs ikke. Skanningen skjuler møbler.
        oppsett.environmentTexturing = .automatic
        v.environment.sceneUnderstanding.options.insert(.occlusion)
        v.renderOptions.insert(.disableMotionBlur)
        v.session.delegate = self
        // Geometrien leses utenfor hovedtråden, så kameraet ikke hakker
        v.session.delegateQueue = DispatchQueue(label: "prøvemaling", qos: .userInitiated)
        v.session.run(oppsett)
        // Skanningen oppdateres mange ganger i sekundet: tegn de endrede delene samlet
        tidtaker = Timer.scheduledTimer(withTimeInterval: 0.6, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.tegnSkitne() }
        }
    }

    func stopp() {
        tidtaker?.invalidate()
        arView?.session.pause()
    }

    // MARK: Skanningen

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) { oppdater(anchors) }
    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) { oppdater(anchors) }
    nonisolated func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let ider = anchors.compactMap { ($0 as? ARMeshAnchor)?.identifier }
        Task { @MainActor in
            for id in ider { self.biter[id] = nil; self.tegnet[id] = nil; self.entiteter[id]?.removeFromParent(); self.entiteter[id] = nil }
        }
    }

    private nonisolated func oppdater(_ anchors: [ARAnchor]) {
        let mesh = anchors.compactMap { $0 as? ARMeshAnchor }
        guard !mesh.isEmpty else { return }
        // ARKit melder endringer mange ganger i sekundet. Samle dem, og les bare siste utgave
        // av hver del, høyst to ganger i sekundet.
        for m in mesh { ko.ventende[m.identifier] = m }
        let na = Date().timeIntervalSinceReferenceDate
        guard na - ko.sist >= 0.5 else { return }
        ko.sist = na
        let klare = ko.ventende
        ko.ventende.removeAll()
        // Les geometrien her (ARKit-tråden), og send bare vegg-trekantene videre
        let lest = klare.map { ($0.key, Self.lesVegger($0.value)) }
        Task { @MainActor in
            for (id, b) in lest { self.biter[id] = b; self.skitne.insert(id) }
        }
    }

    private nonisolated static func lesVegger(_ anker: ARMeshAnchor) -> VeggBiter {
        let g = anker.geometry
        var ut = VeggBiter()
        guard let klasser = g.classification else { return ut }
        let t = anker.transform
        let v = g.vertices
        let vPtr = v.buffer.contents()
        func punkt(_ i: Int) -> SIMD3<Float> {
            let f = vPtr.advanced(by: v.offset + v.stride * i).assumingMemoryBound(to: Float.self)
            let p = t * SIMD4<Float>(f[0], f[1], f[2], 1)
            return SIMD3(p.x, p.y, p.z)
        }
        let flater = g.faces
        let fPtr = flater.buffer.contents()
        let kPtr = klasser.buffer.contents()
        for i in 0..<flater.count {
            let k = kPtr.advanced(by: klasser.offset + klasser.stride * i).assumingMemoryBound(to: UInt8.self).pointee
            guard ARMeshClassification(rawValue: Int(k)) == .wall else { continue }
            var idx = [Int](repeating: 0, count: 3)
            for j in 0..<3 {
                let p = fPtr.advanced(by: (i * 3 + j) * flater.bytesPerIndex)
                idx[j] = flater.bytesPerIndex == 4 ? Int(p.assumingMemoryBound(to: UInt32.self).pointee) : Int(p.assumingMemoryBound(to: UInt16.self).pointee)
            }
            let a = punkt(idx[0]), b = punkt(idx[1]), c = punkt(idx[2])
            let n = simd_cross(b - a, c - a)
            let l = simd_length(n)
            guard l > 1e-8 else { continue }
            ut.a.append(a); ut.b.append(b); ut.c.append(c)
            ut.senter.append((a + b + c) / 3)
            ut.normal.append(n / l)
        }
        return ut
    }

    // MARK: Trykk på en vegg

    func trykk(_ punkt: CGPoint) {
        guard let v = arView else { return }
        guard let treff = v.raycast(from: punkt, allowing: .estimatedPlane, alignment: .any).first else {
            melding = "Fant ingen flate der. Pek litt mer rett på veggen."
            return
        }
        let p = SIMD3<Float>(treff.worldTransform.columns.3.x, treff.worldTransform.columns.3.y, treff.worldTransform.columns.3.z)
        // Retningen på veggen: snittet av vegg-trekantene rundt punktet
        var sum = SIMD3<Float>(0, 0, 0), antall = 0
        var forste: SIMD3<Float>?
        for b in biter.values {
            for i in b.senter.indices where simd_distance(b.senter[i], p) < 0.15 {
                var n = b.normal[i]
                if let f = forste { if simd_dot(n, f) < 0 { n = -n } } else { forste = n }
                sum += n; antall += 1
            }
        }
        guard antall >= 3 else {
            melding = "Det der er ikke vegg ennå. Gå nærmere, eller vent litt til veggen er skannet."
            return
        }
        let normal = simd_normalize(sum)
        // Trykk på en vegg som alt er malt: bytt farge, eller fjern den om fargen er den samme
        if let i = vegger.firstIndex(where: { erSammeVegg($0, punkt: p, normal: normal) }) {
            if vegger[i].farge == valgt { vegger.remove(at: i); melding = "Malingen er tatt bort." }
            else { vegger[i] = ValgtVegg(punkt: vegger[i].punkt, normal: vegger[i].normal, farge: valgt); melding = "Ny farge på veggen." }
        } else {
            vegger.append(ValgtVegg(punkt: p, normal: normal, farge: valgt))
            melding = vegger.count == 1 ? "Malt! Trykk på flere vegger, eller ta et bilde." : "\(vegger.count) vegger malt."
        }
        tegnAlt()
    }

    func angre() {
        guard !vegger.isEmpty else { return }
        vegger.removeLast()
        tegnAlt()
    }

    private func erSammeVegg(_ v: ValgtVegg, punkt: SIMD3<Float>, normal: SIMD3<Float>) -> Bool {
        abs(simd_dot(v.normal, normal)) > 0.94 && abs(simd_dot(punkt - v.punkt, v.normal)) < 0.08
    }

    // MARK: Tegning

    /// Tegner deler av skanningen som har endret seg. Ingenting malt: ingenting å tegne.
    /// Små endringer venter litt, og høyst åtte deler tegnes om gangen, så bildet ikke hakker.
    private func tegnSkitne() {
        guard !skitne.isEmpty else { return }
        guard !vegger.isEmpty || alleVegger else { skitne.removeAll(); return }
        let na = Date()
        var tegnetNa = 0
        for id in skitne {
            guard tegnetNa < 8 else { break }
            let antall = biter[id]?.senter.count ?? 0
            if let t = tegnet[id] {
                let endring = abs(antall - t.antall)
                // Under 5 % flere eller færre trekanter: vent til det har gått 3 sekunder
                if endring * 20 < max(t.antall, 1) && na.timeIntervalSince(t.tid) < 3 { continue }
            }
            skitne.remove(id)
            tegn(id)
            tegnetNa += 1
        }
    }

    private func tegnAlt() { for id in biter.keys { tegn(id) } }

    private func materiale(_ f: Int) -> RealityKit.Material {
        if ekteLys {
            var m = PhysicallyBasedMaterial()
            m.baseColor = .init(tint: farger[f])
            m.roughness = 1.0
            m.metallic = 0.0
            if dekning < 0.99 { m.blending = .transparent(opacity: .init(scale: Float(dekning))) }
            return m
        }
        var m = UnlitMaterial(color: farger[f])
        if dekning < 0.99 { m.blending = .transparent(opacity: .init(scale: Float(dekning))) }
        return m
    }

    /// Dekning og romlys: bytt bare materialet, ikke hele malingen.
    private func oppdaterMaterialer() {
        for samling in entiteter.values {
            for barn in samling.children {
                guard let modell = barn as? ModelEntity, let f = Int(modell.name.dropFirst()), f < farger.count else { continue }
                modell.model?.materials = [materiale(f)]
            }
        }
    }

    /// Lager malingen for én del av skanningen: én modell per farge.
    private func tegn(_ id: UUID) {
        entiteter[id]?.removeFromParent()
        entiteter[id] = nil
        tegnet[id] = (biter[id]?.senter.count ?? 0, Date())
        guard let b = biter[id], !b.senter.isEmpty, !farger.isEmpty else { return }
        let kamera = arView?.session.currentFrame.map { SIMD3<Float>($0.camera.transform.columns.3.x, $0.camera.transform.columns.3.y, $0.camera.transform.columns.3.z) } ?? .zero
        var perFarge: [Int: (pos: [SIMD3<Float>], nor: [SIMD3<Float>])] = [:]
        for i in b.senter.indices {
            let farge: Int?
            if let v = vegger.last(where: { abs(simd_dot($0.normal, b.normal[i])) > 0.94 && abs(simd_dot(b.senter[i] - $0.punkt, $0.normal)) < 0.08 }) {
                farge = v.farge
            } else {
                farge = alleVegger ? valgt : nil
            }
            guard let f = farge, f < farger.count else { continue }
            // Malingen løftes 1,5 cm ut fra veggen, mot kameraet, så den ikke blinker mot skanningen
            var n = b.normal[i]
            if simd_dot(n, kamera - b.senter[i]) < 0 { n = -n }
            let l = n * 0.015
            var x = perFarge[f] ?? ([], [])
            x.pos.append(contentsOf: [b.a[i] + l, b.b[i] + l, b.c[i] + l])
            x.nor.append(contentsOf: [n, n, n])
            perFarge[f] = x
        }
        guard !perFarge.isEmpty else { return }
        let samling = Entity()
        for (f, x) in perFarge {
            var d = MeshDescriptor(name: "maling")
            d.positions = MeshBuffers.Positions(x.pos)
            d.normals = MeshBuffers.Normals(x.nor)
            // Begge sider, så malingen synes uansett hvilken vei trekanten vender
            let n = UInt32(x.pos.count)
            var idx: [UInt32] = []
            idx.reserveCapacity(Int(n) * 2)
            var i: UInt32 = 0
            while i < n { idx.append(contentsOf: [i, i + 1, i + 2, i, i + 2, i + 1]); i += 3 }
            d.primitives = .triangles(idx)
            guard let mesh = try? MeshResource.generate(from: [d]) else { continue }
            let modell = ModelEntity(mesh: mesh, materials: [materiale(f)])
            modell.name = "f\(f)"
            samling.addChild(modell)
        }
        rot.addChild(samling)
        entiteter[id] = samling
    }

    // MARK: Bilde

    func taBilde() {
        arView?.snapshot(saveToHDR: false) { bilde in
            guard let bilde else { return }
            Task { @MainActor in _ = await Deling.del([bilde]) }
        }
    }
}

/// ARView i SwiftUI. Trykk på skjermen maler veggen der.
struct ARMalerView: UIViewRepresentable {
    let maler: VeggMaler

    func makeUIView(context: Context) -> ARView {
        let v = ARView(frame: .zero, cameraMode: .ar, automaticallyConfigureSession: false)
        maler.start(v)
        v.addGestureRecognizer(UITapGestureRecognizer(target: context.coordinator, action: #selector(Koordinator.trykk(_:))))
        return v
    }

    func updateUIView(_ uiView: ARView, context: Context) {}

    static func dismantleUIView(_ uiView: ARView, coordinator: Koordinator) {
        coordinator.maler.stopp()
    }

    func makeCoordinator() -> Koordinator { Koordinator(maler: maler) }

    @MainActor final class Koordinator: NSObject {
        let maler: VeggMaler
        init(maler: VeggMaler) { self.maler = maler }
        @objc func trykk(_ g: UITapGestureRecognizer) {
            guard let v = g.view else { return }
            maler.trykk(g.location(in: v))
        }
    }
}
