import SwiftUI
import RealityKit

/// Rommet skannet med Apples egen metode (Object Capture i områdemodus, iOS 18):
/// mange bilder blir en 3D-modell ved fotogrammetri, laget på telefonen etterpå.
/// Ligger ved siden av vår ekte 3D, så de kan sammenlignes på samme rom.
enum Omrademodell {
    private static func mappe(_ id: UUID) -> URL {
        let url = Modell.mappe.appendingPathComponent(id.uuidString + "-apple", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    private static func undermappe(_ id: UUID, _ navn: String) -> URL {
        let url = mappe(id).appendingPathComponent(navn, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    static func bilder(_ id: UUID) -> URL { undermappe(id, "bilder") }
    static func sjekkpunkt(_ id: UUID) -> URL { undermappe(id, "sjekkpunkt") }
    static func url(_ id: UUID) -> URL { Modell.mappe.appendingPathComponent(id.uuidString + "-apple.usdz") }
    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: url(id).path) }

    /// Kan telefonen dette? Områdemodus kom i iOS 18 og krever LiDAR.
    @MainActor static var stottet: Bool {
        if #available(iOS 18.0, *) { return ObjectCaptureSession.isSupported && PhotogrammetrySession.isSupported }
        return false
    }

    /// Bildene trengs ikke når modellen er laget. De tar mye plass.
    static func rydd(_ id: UUID) {
        try? FileManager.default.removeItem(at: Modell.mappe.appendingPathComponent(id.uuidString + "-apple", isDirectory: true))
    }

    static func slett(_ id: UUID) {
        try? FileManager.default.removeItem(at: url(id))
        rydd(id)
    }

    /// Lager modellen av bildene. nil når den er laget, ellers en feilmelding.
    static func bygg(_ id: UUID, fremdrift: @escaping (Double) -> Void) async -> String? {
        var oppsett = PhotogrammetrySession.Configuration()
        oppsett.checkpointDirectory = sjekkpunkt(id)
        // Et rom er ikke en ting på et bord: ingenting skal klippes bort rundt
        oppsett.isObjectMaskingEnabled = false
        let ut = url(id)
        let okt: PhotogrammetrySession
        do { okt = try PhotogrammetrySession(input: bilder(id), configuration: oppsett) }
        catch { return "Klarte ikke starte: " + error.localizedDescription }
        do { try okt.process(requests: [.modelFile(url: ut)]) }
        catch { return "Klarte ikke lage modellen: " + error.localizedDescription }
        do {
            for try await svar in okt.outputs {
                switch svar {
                case .requestProgress(_, let andel): fremdrift(andel)
                case .requestError(_, let feil): return "Modellen feilet: " + feil.localizedDescription
                case .processingCancelled: return "Avbrutt."
                case .processingComplete:
                    return FileManager.default.fileExists(atPath: ut.path) ? nil : "Modellen ble ikke laget. Prøv igjen med mer lys."
                default: break
                }
            }
        } catch {
            return "Modellen feilet: " + error.localizedDescription
        }
        return FileManager.default.fileExists(atPath: ut.path) ? nil : "Modellen ble ikke laget."
    }
}

/// Skanning med Apples metode: trykk Start og gå rolig rundt i rommet. Ingen boks rundt en ting;
/// hele rommet tas med. Pek mot vegger, gulv, tak og hjørner. Trykk Ferdig når alt er dekket.
@available(iOS 18.0, *)
struct OmradeSkannView: View {
    let id: UUID
    /// true = bildene er tatt og modellen kan lages. false = avbrutt.
    let ferdig: (Bool) -> Void

    @State private var okt = ObjectCaptureSession()
    @State private var startet = false
    @State private var feil: String?

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if startet { ObjectCaptureView(session: okt).ignoresSafeArea() }
            VStack(spacing: 12) {
                HStack {
                    Button { okt.cancel(); ferdig(false) } label: {
                        Image(systemName: "xmark.circle.fill").font(.system(size: 30)).symbolRenderingMode(.palette).foregroundStyle(.white, .white.opacity(0.25))
                    }
                    .accessibilityLabel("Avbryt")
                    Spacer()
                    if case .capturing = okt.state {
                        Text("\(okt.numberOfShotsTaken) bilder")
                            .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                            .padding(.horizontal, 10).padding(.vertical, 6).background(.black.opacity(0.5), in: Capsule())
                    }
                }
                Spacer()
                if let tekst = rad {
                    Text(tekst).font(.callout.weight(.semibold)).foregroundStyle(.white).multilineTextAlignment(.center)
                        .padding(.horizontal, 14).padding(.vertical, 8).background(.black.opacity(0.55), in: Capsule())
                }
                knapper
            }
            .padding()
        }
        .preferredColorScheme(.dark)
        .onAppear {
            guard !startet else { return }
            var oppsett = ObjectCaptureSession.Configuration()
            oppsett.checkpointDirectory = Omrademodell.sjekkpunkt(id)
            okt.start(imagesDirectory: Omrademodell.bilder(id), configuration: oppsett)
            startet = true
        }
        .task {
            for await ny in okt.stateUpdates {
                switch ny {
                case .completed: ferdig(true)
                case .failed(let f): feil = f.localizedDescription
                default: break
                }
            }
        }
        .alert("Skanningen stoppet", isPresented: Binding(get: { feil != nil }, set: { if !$0 { feil = nil } })) {
            Button("OK") { ferdig(false) }
        } message: { Text(feil ?? "") }
    }

    private var rad: String? {
        if let f = okt.feedback.first.map(TingSkannView.tekst) { return f }
        switch okt.state {
        case .initializing: return "Starter kameraet …"
        case .ready: return "Stå i døråpningen. Trykk Start og gå rolig rundt i rommet."
        case .capturing: return "Gå sakte langs veggene. Pek mot gulv, tak og hjørner."
        case .finishing: return "Lagrer bildene …"
        default: return nil
        }
    }

    @ViewBuilder private var knapper: some View {
        switch okt.state {
        case .ready:
            // Områdemodus: rett til opptak, uten å finne en ting først
            Button { okt.startCapturing() } label: {
                Label("Start", systemImage: "record.circle").font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6)
            }
            .buttonStyle(.borderedProminent).tint(Color(red: 0.73, green: 0.28, blue: 0.16)).controlSize(.large)
        case .capturing:
            if okt.numberOfShotsTaken >= 30 {
                Button("Ferdig") { okt.finish() }
                    .buttonStyle(.borderedProminent).tint(Color(red: 0.73, green: 0.28, blue: 0.16)).controlSize(.large).frame(maxWidth: .infinity)
            }
        default:
            EmptyView()
        }
    }
}
