import SwiftUI
import RealityKit
import ARKit
import Metal
import CoreImage

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
    /// Skannede rom med 3D-modell: fargene kan prøves på veggene der i stedet.
    var rom: [SkannetRom] = []
    var vis3D: ((SkannetRom) -> Void)? = nil
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
                    if let vis3D, !rom.isEmpty {
                        Menu {
                            ForEach(rom) { r in Button(r.navn) { vis3D(r) } }
                        } label: { Label("I 3D", systemImage: "cube") }
                        .buttonStyle(.bordered).tint(.white)
                    }
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

/// En vegg: et plan (et punkt på veggen og retningen rett ut fra den).
private struct Plan {
    var id = UUID()
    var punkt: SIMD3<Float>
    var normal: SIMD3<Float>
    func sammeSom(_ p: SIMD3<Float>, _ n: SIMD3<Float>) -> Bool {
        abs(simd_dot(normal, n)) > 0.94 && abs(simd_dot(p - punkt, normal)) < 0.08
    }
}

/// En vegg som skal males, og fargen.
private struct ValgtVegg {
    var plan: Plan
    var farge: Int
}

/// Trekantene i en del av skanningen som er vegg, i verdenskoordinater.
private struct VeggBiter {
    var senter: [SIMD3<Float>] = []
    var normal: [SIMD3<Float>] = []
    var areal: [Float] = []
}

@MainActor
final class VeggMaler: NSObject, ObservableObject, ARSessionDelegate {
    @Published var valgt = 0 { didSet { oppdaterMaling() } }
    @Published var alleVegger = false { didSet { if alleVegger { autoVegger = finnAlleVegger() }; oppdaterMaling() } }
    @Published var dekning: Double = 0.92 { didSet { oppdaterMaling() } }
    /// true: malingen får lys og skygge fra rommet. false: fargen vises flatt, akkurat som koden.
    @Published var ekteLys = true { didSet { oppdaterMaling() } }
    @Published var melding = "Gå rolig rundt og pek på veggene. Trykk på en vegg for å male den."
    @Published private(set) var antallVegger = 0

    var farger: [UIColor] = [] { didSet { oppdaterMaling() } }
    weak var arView: ARView?
    private var biter: [UUID: VeggBiter] = [:]
    private var vegger: [ValgtVegg] = [] { didSet { antallVegger = vegger.count } }
    /// Veggene funnet i skanningen, til «Alle vegger».
    private var autoVegger: [Plan] = []
    private var skitne = false
    private var tidtaker: Timer?
    /// Nye skanninger samles her (på ARKit-tråden) og leses høyst to ganger i sekundet.
    private nonisolated let ko = Leseko()
    /// Maler kamerabildet hver gang det tegnes.
    private let behandler = Etterbehandler()

    func start(_ v: ARView) {
        arView = v
        let oppsett = ARWorldTrackingConfiguration()
        oppsett.sceneReconstruction = .meshWithClassification
        // Dybden for hvert punkt i bildet: det er den som avgjør hva som er vegg
        if ARWorldTrackingConfiguration.supportsFrameSemantics(.smoothedSceneDepth) {
            oppsett.frameSemantics.insert(.smoothedSceneDepth)
        } else if ARWorldTrackingConfiguration.supportsFrameSemantics(.sceneDepth) {
            oppsett.frameSemantics.insert(.sceneDepth)
        }
        v.renderOptions.insert(.disableMotionBlur)
        v.session.delegate = self
        // Geometrien leses utenfor hovedtråden, så kameraet ikke hakker
        v.session.delegateQueue = DispatchQueue(label: "prøvemaling", qos: .userInitiated)
        behandler.okt = v.session
        v.renderCallbacks.postProcess = behandler.tilbakekall()
        v.session.run(oppsett)
        tidtaker = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            Task { @MainActor in self?.sjekkSkanning() }
        }
    }

    func stopp() {
        tidtaker?.invalidate()
        arView?.renderCallbacks.postProcess = nil
        arView?.session.pause()
    }

    // MARK: Skanningen

    nonisolated func session(_ session: ARSession, didAdd anchors: [ARAnchor]) { oppdater(anchors) }
    nonisolated func session(_ session: ARSession, didUpdate anchors: [ARAnchor]) { oppdater(anchors) }
    nonisolated func session(_ session: ARSession, didRemove anchors: [ARAnchor]) {
        let ider = anchors.compactMap { ($0 as? ARMeshAnchor)?.identifier }
        Task { @MainActor in for id in ider { self.biter[id] = nil } }
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
            for (id, b) in lest { self.biter[id] = b }
            self.skitne = true
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
            ut.senter.append((a + b + c) / 3)
            ut.normal.append(n / l)
            ut.areal.append(l / 2)
        }
        return ut
    }

    /// Ny skanning: finn veggene på nytt for «Alle vegger».
    private func sjekkSkanning() {
        if let r = arView?.window?.windowScene?.interfaceOrientation { behandler.sett(retning: r) }
        guard skitne else { return }
        skitne = false
        if alleVegger { autoVegger = finnAlleVegger(); oppdaterMaling() }
    }

    /// Veggplanet ut fra alle vegg-trekantene som ligger i det: mer nøyaktig enn punktet man trykket på.
    private func tilpass(_ p: SIMD3<Float>, _ normal: SIMD3<Float>) -> (SIMD3<Float>, SIMD3<Float>) {
        var nSum = SIMD3<Float>(0, 0, 0), dSum: Float = 0, vekt: Float = 0
        for b in biter.values {
            for i in b.senter.indices {
                var n = b.normal[i]
                if simd_dot(n, normal) < 0 { n = -n }
                guard simd_dot(n, normal) > 0.94, abs(simd_dot(b.senter[i] - p, normal)) < 0.06 else { continue }
                let a = b.areal[i]
                nSum += n * a; dSum += simd_dot(b.senter[i], normal) * a; vekt += a
            }
        }
        guard vekt > 0.02 else { return (p, normal) }
        let d = dSum / vekt
        return (p + normal * (d - simd_dot(p, normal)), simd_normalize(nSum))
    }

    /// Alle store, loddrette flater i skanningen som er vegg, største først.
    private func finnAlleVegger() -> [Plan] {
        struct Klynge { var nSum: SIMD3<Float>; var dSum: Float; var areal: Float; var n: SIMD3<Float>; var d: Float }
        var k: [Klynge] = []
        for b in biter.values {
            for i in b.senter.indices {
                let n0 = b.normal[i]
                guard abs(n0.y) < 0.3 else { continue }
                let c = b.senter[i], a = b.areal[i]
                var funnet = -1
                var n = n0
                for j in k.indices {
                    let dt = simd_dot(n0, k[j].n)
                    guard abs(dt) > 0.94 else { continue }
                    if abs(simd_dot(c, k[j].n) - k[j].d) < 0.08 { funnet = j; n = dt < 0 ? -n0 : n0; break }
                }
                if funnet >= 0 {
                    k[funnet].nSum += n * a
                    k[funnet].dSum += simd_dot(c, k[funnet].n) * a
                    k[funnet].areal += a
                    k[funnet].n = simd_normalize(k[funnet].nSum)
                    k[funnet].d = k[funnet].dSum / k[funnet].areal
                } else if k.count < 300 {
                    k.append(Klynge(nSum: n * a, dSum: simd_dot(c, n) * a, areal: a, n: n, d: simd_dot(c, n)))
                }
            }
        }
        let gamle = autoVegger
        return k.filter { $0.areal >= 0.6 }.sorted { $0.areal > $1.areal }.prefix(24).map { kl in
            let p = kl.n * kl.d
            var plan = Plan(punkt: p, normal: kl.n)
            if let g = gamle.first(where: { $0.sammeSom(p, kl.n) }) { plan.id = g.id }
            return plan
        }
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
        let (punktet, normal) = tilpass(p, simd_normalize(sum))
        // Trykk på en vegg som alt er malt: bytt farge, eller fjern den om fargen er den samme
        if let i = vegger.firstIndex(where: { $0.plan.sammeSom(punktet, normal) }) {
            if vegger[i].farge == valgt { vegger.remove(at: i); melding = "Malingen er tatt bort." }
            else { vegger[i].farge = valgt; melding = "Ny farge på veggen." }
        } else {
            vegger.append(ValgtVegg(plan: Plan(punkt: punktet, normal: normal), farge: valgt))
            melding = vegger.count == 1 ? "Malt! Trykk på flere vegger, eller ta et bilde." : "\(vegger.count) vegger malt."
        }
        oppdaterMaling()
    }

    func angre() {
        guard !vegger.isEmpty else { return }
        vegger.removeLast()
        oppdaterMaling()
    }

    // MARK: Malingen

    private func srgb(_ i: Int) -> SIMD3<Float> {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        farger[i].getRed(&r, green: &g, blue: &b, alpha: &a)
        return SIMD3(Float(r), Float(g), Float(b))
    }

    /// Sender veggene og fargene til tegningen. Veggene man har trykket på går først.
    private func oppdaterMaling() {
        var liste: [Etterbehandler.Vegg] = []
        func legg(_ p: Plan, _ f: Int) {
            guard f < farger.count else { return }
            liste.append(.init(id: p.id, plan: SIMD4(p.normal, simd_dot(p.normal, p.punkt)), farge: srgb(f)))
        }
        for v in vegger.reversed() { legg(v.plan, v.farge) }
        if alleVegger {
            for p in autoVegger where !vegger.contains(where: { $0.plan.sammeSom(p.punkt, p.normal) }) { legg(p, valgt) }
        }
        behandler.sett(vegger: liste, dekning: Float(dekning), ekteLys: ekteLys)
    }

    // MARK: Bilde

    func taBilde() {
        behandler.taBilde { [weak self] bilde in
            Task { @MainActor in
                if let bilde { _ = await Deling.del([bilde]); return }
                // Reserve: skjermbildet slik ARView tar det
                self?.arView?.snapshot(saveToHDR: false) { b in
                    guard let b else { return }
                    Task { @MainActor in _ = await Deling.del([b]) }
                }
            }
        }
    }
}

/// Maler veggene inn i kamerabildet hver gang ARView tegner (Maling.metal).
/// Kalles fra tegnetråden, så alt som deles med hovedtråden går gjennom en lås.
final class Etterbehandler: @unchecked Sendable {
    struct Vegg {
        let id: UUID
        let plan: SIMD4<Float>
        /// sRGB, 0–1
        let farge: SIMD3<Float>
    }

    private struct Oppsett {
        var kamera = matrix_identity_float4x4
        var bildeX = SIMD4<Float>(1, 0, 0, 0)
        var bildeY = SIMD4<Float>(0, 1, 0, 0)
        var indre = SIMD4<Float>(1, 1, 0, 0)
        var diverse = SIMD4<Float>(1, 1, 1, 1)
        var mer = SIMD4<Float>(0, 0, 0, 0)
    }
    private struct GPUVegg { var plan: SIMD4<Float>; var farge: SIMD4<Float> }

    static let maks = 32
    private let las = NSLock()
    private var vegger: [Vegg] = []
    private var dekning: Float = 0.92
    private var ekteLys = true
    /// Snittlyset på hver vegg i kamerabildet, målt fortløpende.
    private var lys: [UUID: Float] = [:]
    private var bildeSvar: ((UIImage?) -> Void)?
    private var retning: UIInterfaceOrientation = .portrait
    weak var okt: ARSession?

    private var ror: MTLComputePipelineState?
    private var cache: CVMetalTextureCache?
    private var tomDybde: MTLTexture?
    private var tomtBilde: MTLTexture?
    private var forsokt = false

    func sett(vegger: [Vegg], dekning: Float, ekteLys: Bool) {
        las.lock()
        self.vegger = Array(vegger.prefix(Self.maks))
        self.dekning = dekning
        self.ekteLys = ekteLys
        let ider = Set(self.vegger.map(\.id))
        lys = lys.filter { ider.contains($0.key) }
        las.unlock()
    }

    func sett(retning: UIInterfaceOrientation) {
        las.lock(); self.retning = retning; las.unlock()
    }

    /// Lagrer neste bilde som tegnes, med malingen.
    func taBilde(_ svar: @escaping (UIImage?) -> Void) {
        las.lock(); bildeSvar = svar; las.unlock()
    }

    func tilbakekall() -> (ARView.PostProcessContext) -> Void {
        { [weak self] ctx in
            if let self { self.kjor(ctx) } else { Etterbehandler.kopier(ctx) }
        }
    }

    private static func kopier(_ ctx: ARView.PostProcessContext) {
        guard let b = ctx.commandBuffer.makeBlitCommandEncoder() else { return }
        b.copy(from: ctx.sourceColorTexture, to: ctx.targetColorTexture)
        b.endEncoding()
    }

    /// Leser Metal fargene lineært fra denne teksturen? (sRGB-formatene og flyttall gjør det.)
    private static func erLineaer(_ f: MTLPixelFormat) -> Bool {
        switch f {
        case .bgra8Unorm, .rgba8Unorm, .bgra10_xr, .bgr10_xr, .bgr10a2Unorm, .rgb10a2Unorm: return false
        default: return true
        }
    }

    private static func lineaer(_ c: Float) -> Float { c <= 0.04045 ? c / 12.92 : powf((c + 0.055) / 1.055, 2.4) }

    private func forbered(_ device: MTLDevice) -> Bool {
        if forsokt { return ror != nil }
        forsokt = true
        guard let bib = device.makeDefaultLibrary(), let f = bib.makeFunction(name: "malVegger"),
              let r = try? device.makeComputePipelineState(function: f) else { return false }
        CVMetalTextureCacheCreate(nil, nil, device, nil, &cache)
        let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .r32Float, width: 1, height: 1, mipmapped: false)
        d.usage = [.shaderRead]
        tomDybde = device.makeTexture(descriptor: d)
        let b = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: 1, height: 1, mipmapped: false)
        b.usage = [.shaderWrite]
        tomtBilde = device.makeTexture(descriptor: b)
        guard cache != nil, tomDybde != nil, tomtBilde != nil else { return false }
        ror = r
        return true
    }

    private func kjor(_ ctx: ARView.PostProcessContext) {
        guard forbered(ctx.device), let ror, let tomDybde, let tomtBilde, let cache else { Self.kopier(ctx); return }
        las.lock()
        let vegger = self.vegger, dekning = self.dekning, ekteLys = self.ekteLys, retning = self.retning
        let lysNa = vegger.map { self.lys[$0.id] ?? 0 }
        let svar = bildeSvar
        bildeSvar = nil
        las.unlock()

        let mal = ctx.targetColorTexture
        let lin = Self.erLineaer(ctx.sourceColorTexture.pixelFormat)
        var o = Oppsett()
        o.diverse = SIMD4(1, 1, dekning, ekteLys ? 1 : 0)
        o.mer = SIMD4(0, svar != nil ? 1 : 0, lin ? 1 : 0, 0)
        var dybde = tomDybde
        var cvDybde: CVMetalTexture?
        if !vegger.isEmpty, let frame = okt?.currentFrame, let dd = frame.smoothedSceneDepth ?? frame.sceneDepth {
            let pb = dd.depthMap
            var t: CVMetalTexture?
            if CVMetalTextureCacheCreateTextureFromImage(nil, cache, pb, nil, .r32Float, CVPixelBufferGetWidth(pb), CVPixelBufferGetHeight(pb), 0, &t) == kCVReturnSuccess,
               let t, let tex = CVMetalTextureGetTexture(t) {
                dybde = tex
                cvDybde = t
                let inv = frame.displayTransform(for: retning, viewportSize: CGSize(width: mal.width, height: mal.height)).inverted()
                o.bildeX = SIMD4(Float(inv.a), Float(inv.c), Float(inv.tx), 0)
                o.bildeY = SIMD4(Float(inv.b), Float(inv.d), Float(inv.ty), 0)
                let k = frame.camera.intrinsics
                o.indre = SIMD4(k.columns.0.x, k.columns.1.y, k.columns.2.x, k.columns.2.y)
                o.kamera = frame.camera.transform
                o.diverse.x = Float(frame.camera.imageResolution.width)
                o.diverse.y = Float(frame.camera.imageResolution.height)
                o.mer.x = Float(vegger.count)
            }
        }

        var gpu = vegger.enumerated().map { i, v -> GPUVegg in
            let f = lin ? SIMD3(Self.lineaer(v.farge.x), Self.lineaer(v.farge.y), Self.lineaer(v.farge.z)) : v.farge
            return GPUVegg(plan: v.plan, farge: SIMD4(f, lysNa[i]))
        }
        if gpu.isEmpty { gpu = [GPUVegg(plan: .zero, farge: .zero)] }

        var bilde = tomtBilde
        if svar != nil {
            let d = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: .rgba8Unorm, width: mal.width, height: mal.height, mipmapped: false)
            d.usage = [.shaderWrite, .shaderRead]
            if let b = ctx.device.makeTexture(descriptor: d) { bilde = b } else { o.mer.y = 0 }
        }

        guard let stat = ctx.device.makeBuffer(length: Self.maks * 8, options: .storageModeShared),
              let enc = ctx.commandBuffer.makeComputeCommandEncoder() else {
            Self.kopier(ctx)
            if let svar { DispatchQueue.main.async { svar(nil) } }
            return
        }
        memset(stat.contents(), 0, stat.length)
        enc.setComputePipelineState(ror)
        enc.setTexture(ctx.sourceColorTexture, index: 0)
        enc.setTexture(mal, index: 1)
        enc.setTexture(dybde, index: 2)
        enc.setTexture(bilde, index: 3)
        enc.setBytes(&o, length: MemoryLayout<Oppsett>.stride, index: 0)
        gpu.withUnsafeBytes { enc.setBytes($0.baseAddress!, length: $0.count, index: 1) }
        enc.setBuffer(stat, offset: 0, index: 2)
        let bredde = ror.threadExecutionWidth
        enc.dispatchThreads(MTLSize(width: mal.width, height: mal.height, depth: 1),
                            threadsPerThreadgroup: MTLSize(width: bredde, height: max(1, ror.maxTotalThreadsPerThreadgroup / bredde), depth: 1))
        enc.endEncoding()

        let ider = vegger.map(\.id)
        let behold = cvDybde
        let lagret = o.mer.y > 0.5 ? bilde : nil
        ctx.commandBuffer.addCompletedHandler { [weak self] _ in
            _ = behold
            if let self {
                let p = stat.contents().assumingMemoryBound(to: UInt32.self)
                self.las.lock()
                for (i, id) in ider.enumerated() where i < Self.maks {
                    let n = p[i * 2 + 1]
                    guard n > 40 else { continue }
                    let snitt = Float(p[i * 2]) / Float(n) / 1000
                    self.lys[id] = self.lys[id].map { $0 * 0.85 + snitt * 0.15 } ?? snitt
                }
                self.las.unlock()
            }
            guard let svar else { return }
            var ut: UIImage?
            if let lagret, let rom = CGColorSpace(name: CGColorSpace.sRGB),
               let ci = CIImage(mtlTexture: lagret, options: [.colorSpace: rom])?.oriented(.downMirrored),
               let cg = CIContext().createCGImage(ci, from: ci.extent) {
                ut = UIImage(cgImage: cg)
            }
            DispatchQueue.main.async { svar(ut) }
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
