import SwiftUI
import RealityKit

/// Skanning av en ting med Apples Object Capture (iOS 17, LiDAR).
/// 1. Pek på tingen og trykk «Finn tingen»: en boks legger seg rundt den.
/// 2. «Start skanning»: gå rolig rundt. Prikkene rundt tingen fylles inn.
/// 3. Etter en runde: snu tingen for å få med undersiden, ta en runde til, eller bli ferdig.
/// Bildene lagres i `bilder`; selve modellen lages etterpå (TingLager.bygg).
struct TingSkannView: View {
    let bilder: URL
    let sjekkpunkt: URL
    /// true = bildene er tatt og modellen kan lages. false = avbrutt.
    let ferdig: (Bool) -> Void

    // ObjectCaptureSession bruker Observation (@Observable), så den holdes i @State
    @State private var okt = ObjectCaptureSession()
    @State private var startet = false
    @State private var runder = 1
    @State private var feil: String?

    static var stottet: Bool { ObjectCaptureSession.isSupported }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            if startet { ObjectCaptureView(session: okt).ignoresSafeArea() }
            VStack(spacing: 12) {
                topplinje
                Spacer()
                if let tekst = rad { Text(tekst).font(.callout.weight(.semibold)).foregroundStyle(.white).multilineTextAlignment(.center).padding(.horizontal, 14).padding(.vertical, 8).background(.black.opacity(0.55), in: Capsule()) }
                knapper
            }
            .padding()
        }
        .preferredColorScheme(.dark)
        .onAppear {
            guard !startet else { return }
            var oppsett = ObjectCaptureSession.Configuration()
            oppsett.checkpointDirectory = sjekkpunkt
            okt.start(imagesDirectory: bilder, configuration: oppsett)
            startet = true
        }
        // Tilstanden har en feil i seg og kan ikke sammenlignes, så den følges som en strøm
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

    private var topplinje: some View {
        HStack {
            Button { okt.cancel(); ferdig(false) } label: {
                Image(systemName: "xmark.circle.fill").font(.system(size: 30)).symbolRenderingMode(.palette).foregroundStyle(.white, .white.opacity(0.25))
            }
            .accessibilityLabel("Avbryt")
            Spacer()
            if case .capturing = okt.state {
                Text("Runde \(runder) · \(okt.numberOfShotsTaken) bilder")
                    .font(.footnote.weight(.semibold)).foregroundStyle(.white)
                    .padding(.horizontal, 10).padding(.vertical, 6).background(.black.opacity(0.5), in: Capsule())
            }
        }
    }

    /// Hva brukeren bør gjøre nå: tilbakemelding fra skanningen eller neste steg.
    private var rad: String? {
        if let f = okt.feedback.first.map(Self.tekst) { return f }
        switch okt.state {
        case .initializing: return "Starter kameraet …"
        case .ready: return "Sett tingen på et bord eller gulvet med god plass rundt. Pek på den."
        case .detecting: return "Juster boksen så hele tingen er inni."
        case .capturing: return okt.userCompletedScanPass ? "Runden er ferdig." : "Gå rolig rundt tingen. Hold avstand på en halv til én meter."
        case .finishing: return "Lagrer bildene …"
        default: return nil
        }
    }

    @ViewBuilder private var knapper: some View {
        switch okt.state {
        case .ready:
            stor("Finn tingen", ikon: "viewfinder") { _ = okt.startDetecting() }
        case .detecting:
            HStack(spacing: 10) {
                liten("Nullstill") { okt.resetDetection() }
                stor("Start skanning", ikon: "record.circle") { okt.startCapturing() }
            }
        case .capturing:
            if okt.userCompletedScanPass {
                VStack(spacing: 10) {
                    stor("Snu tingen, ta en runde til", ikon: "arrow.triangle.2.circlepath") { runder += 1; okt.beginNewScanPassAfterFlip() }
                    HStack(spacing: 10) {
                        liten("Runde til uten å snu") { runder += 1; okt.beginNewScanPass() }
                        liten("Ferdig") { okt.finish() }
                    }
                }
            } else if okt.numberOfShotsTaken > 20 {
                liten("Ferdig nå") { okt.finish() }
            }
        default:
            EmptyView()
        }
    }

    private func stor(_ tekst: String, ikon: String, handling: @escaping () -> Void) -> some View {
        Button(action: handling) { Label(tekst, systemImage: ikon).font(.headline).frame(maxWidth: .infinity).padding(.vertical, 6) }
            .buttonStyle(.borderedProminent)
            .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
            .controlSize(.large)
    }

    private func liten(_ tekst: String, handling: @escaping () -> Void) -> some View {
        Button(tekst, action: handling).buttonStyle(.bordered).tint(.white).controlSize(.large).frame(maxWidth: .infinity)
    }

    static func tekst(_ f: ObjectCaptureSession.Feedback) -> String {
        switch f {
        case .objectTooClose: return "For nær. Gå litt bakover."
        case .objectTooFar: return "For langt unna. Gå litt nærmere."
        case .movingTooFast: return "Litt saktere."
        case .environmentLowLight: return "Lite lys. Skru på mer lys."
        case .environmentTooDark: return "For mørkt."
        case .outOfFieldOfView: return "Hold tingen midt i bildet."
        case .objectNotFlippable: return "Denne tingen bør ikke snus. Ta heller en runde til fra en annen høyde."
        case .overCapturing: return "Nok bilder her. Gå videre rundt."
        case .objectNotDetected: return "Finner ikke tingen. Pek rett på den."
        @unknown default: return "Juster kameraet."
        }
    }
}
