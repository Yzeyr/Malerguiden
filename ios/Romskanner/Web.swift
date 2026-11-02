import SwiftUI
import WebKit
import Vision
import UIKit
import UserNotifications
import RoomPlan

/// Malerguiden (nettappen) inne i iPhone-appen.
///
/// Filene ligger i appen (mappa «Web», kopiert inn når appen bygges) og vises fra
/// adressen malerguiden://app/. Da virker alt offline, og lagringen (localStorage og
/// IndexedDB) hører til den adressen. Siden snakker med appen gjennom
/// window.webkit.messageHandlers.mg.postMessage({ type, ... }), som svarer med et løfte.
@MainActor
final class WebKobling: NSObject, ObservableObject {
    static let skjema = "malerguiden"
    static let start = URL(string: "malerguiden://app/index.html")!

    /// Det appen skal vise oppå nettsiden.
    @Published var visRomVelger = false
    @Published var visSkanner = false
    @Published var proveFarger: ProveFarger?
    /// Jobben romvelgeren ble åpnet fra (rommene kobles til den).
    @Published var romJobb: JobbRef?
    /// Skann nye rom rett inn i en jobb.
    @Published var skannForJobb: JobbRef?
    /// Et rom fra en jobb, åpnet i skanneren (plantegning, mål på nytt).
    @Published var apentRom: RomRef?
    /// Et rom fra en jobb, åpnet i 3D.
    @Published var modell3D: VistModell?
    var modell3DRom: UUID?
    /// Rommene og prosjektene i skanneren.
    weak var lager: RomLager?

    private var romSvar: ((String?) -> Void)?
    private var skannSvar: ((String?) -> Void)?
    private var apneSvar: (() -> Void)?
    private(set) lazy var webView: WKWebView = lagWebView()

    // MARK: Oppsett

    private func lagWebView() -> WKWebView {
        let oppsett = WKWebViewConfiguration()
        oppsett.setURLSchemeHandler(Filer(), forURLScheme: Self.skjema)
        oppsett.websiteDataStore = .default()
        oppsett.allowsInlineMediaPlayback = true
        let kode = oppsett.userContentController
        kode.addScriptMessageHandler(self, contentWorld: .page, name: "mg")
        // Legg tilbake data som mangler i lagringen (se Speil), før siden starter
        if let gjenopprett = Speil.gjenopprettSkript() {
            kode.addUserScript(WKUserScript(source: gjenopprett, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        }
        let w = WKWebView(frame: .zero, configuration: oppsett)
        w.navigationDelegate = self
        w.uiDelegate = self
        w.allowsBackForwardNavigationGestures = true
        w.scrollView.contentInsetAdjustmentBehavior = .never
        w.isOpaque = false
        w.backgroundColor = UIColor(red: 0.96, green: 0.94, blue: 0.90, alpha: 1)
        #if DEBUG
        if #available(iOS 16.4, *) { w.isInspectable = true }
        #endif
        w.load(URLRequest(url: Self.start))
        return w
    }

    // MARK: Svar fra skjermene appen viser

    func romValgt(_ json: String?) {
        visRomVelger = false
        romJobb = nil
        romSvar?(json)
        romSvar = nil
    }

    /// Skanningen fra en jobb er ferdig (nil: avbrutt). Bare første svar teller.
    func skannFerdig(_ json: String?) {
        skannForJobb = nil
        skannSvar?(json)
        skannSvar = nil
    }

    func romLukket() {
        apentRom = nil
        apneSvar?()
        apneSvar = nil
    }

    func jobbRef(_ m: Melding) -> JobbRef? {
        guard let id = m.valgfriTekst("jobb"), !id.isEmpty else { return nil }
        return JobbRef(id: id, navn: m.tekst("navn"), prosjekt: nil)
    }

    private func skannetRom(_ m: Melding) throws -> SkannetRom {
        guard let id = UUID(uuidString: m.tekst("id")), let r = lager?.rom.first(where: { $0.id == id }) else {
            throw Feil("Finner ikke skanningen av rommet. Den kan være slettet i skanneren.")
        }
        return r
    }
}

/// Viser nettsiden i SwiftUI.
struct MalerguidenWebView: UIViewRepresentable {
    let kobling: WebKobling
    func makeUIView(context: Context) -> WKWebView { kobling.webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

// MARK: - Meldinger fra nettsiden

extension WebKobling: WKScriptMessageHandlerWithReply {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) async -> (Any?, String?) {
        let body = message.body as? [String: Any] ?? [:]
        let type = body["type"] as? String ?? ""
        do {
            return (try await behandle(type, Melding(body)), nil)
        } catch {
            return (nil, error.localizedDescription)
        }
    }

    private func behandle(_ type: String, _ m: Melding) async throws -> Any? {
        switch type {
        case "info":
            return AppInfo.naa()
        case "speil":
            Speil.skriv(m.tekst("nokkel"), m.valgfriTekst("verdi"))
            return nil
        case "lesTekst":
            guard let b64 = m.valgfriTekst("bilde"), let data = Data(base64Encoded: b64) else { throw Feil("Fikk ikke bildet.") }
            let linjer = try await Tekstleser.les(data)
            return ["linjer": linjer]
        case "skrivTekst":
            let tekst = try await Skriver.skriv(instrukser: m.tekst("instrukser"), sporsmal: m.tekst("sporsmal"))
            return ["tekst": tekst]
        case "hentRom":
            romJobb = jobbRef(m)
            let json: String? = await withCheckedContinuation { fortsett in
                self.romSvar = { fortsett.resume(returning: $0) }
                self.visRomVelger = true
            }
            guard let json else { return ["tekst": NSNull()] }
            return ["tekst": json]
        case "skannRom":
            // Skann nye rom rett inn i jobben. Rommene havner i jobbens prosjekt i skanneren.
            guard RoomCaptureSession.isSupported else { throw Feil("Skanning krever en iPhone med LiDAR (12 Pro eller nyere).") }
            guard var j = jobbRef(m), let lager else { throw Feil("Mangler jobben.") }
            j.prosjekt = lager.prosjekt(forJobb: j.id, navn: j.navn)
            let json: String? = await withCheckedContinuation { fortsett in
                self.skannSvar = { fortsett.resume(returning: $0) }
                self.skannForJobb = j
            }
            return ["tekst": json ?? NSNull()]
        case "apneRom":
            // Åpner rommet i skanneren. Er målene endret når det lukkes, får jobben de nye.
            let for_ = try skannetRom(m)
            await withCheckedContinuation { (fortsett: CheckedContinuation<Void, Never>) in
                self.apneSvar = { fortsett.resume() }
                self.apentRom = RomRef(id: for_.id)
            }
            guard let etter = lager?.rom.first(where: { $0.id == for_.id }) else { return ["endret": false, "tekst": NSNull()] }
            return ["endret": !RomLager.sammeMal(for_, etter), "tekst": Eksport(rom: [etter]).json()]
        case "kopiMappe":
            return ["mappe": Autokopi.mappeNavn() ?? NSNull()]
        case "velgKopiMappe":
            return ["mappe": await Autokopi.velgMappe() ?? NSNull()]
        case "glemKopiMappe":
            Autokopi.glem()
            return nil
        case "autoKopi":
            guard let data = Data(base64Encoded: m.tekst("data")) else { throw Feil("Kopien kom ikke fram til appen.") }
            return try Autokopi.bit(del: Int(m.tall("del") ?? 0), av: Int(m.tall("av") ?? 1), data: data, navn: m.tekst("navn"))
        case "vis3D":
            let r = try skannetRom(m)
            guard Modell.finnes(r.id) || Fotomodell.finnes(r.id) || Fargemodell.finnes(r.id) else { throw Feil("Rommet har ingen 3D-modell.") }
            let farger = m.liste("farger").compactMap { f -> ProveFarger.Farge? in
                guard let hex = f["hex"] as? String, let farge = UIColor(hex: hex) else { return nil }
                return .init(navn: f["navn"] as? String ?? hex, hex: hex, farge: farge)
            }
            if !farger.isEmpty { ProveFarger.husk(farger) }
            modell3DRom = r.id
            modell3D = TredjeVisning.beste(for: r, farger: farger, farge: m.tekst("modus") == "farge")
            return nil
        case "kopier":
            UIPasteboard.general.string = m.tekst("tekst")
            return ["kopiert": true]
        case "apneSkanner":
            visSkanner = true
            return nil
        case "proveMal":
            let farger = m.liste("farger").compactMap { f -> ProveFarger.Farge? in
                guard let hex = f["hex"] as? String, let farge = UIColor(hex: hex) else { return nil }
                return .init(navn: f["navn"] as? String ?? hex, hex: hex, farge: farge)
            }
            guard !farger.isEmpty else { throw Feil("Ingen farger å prøve.") }
            guard ProveMalView.stottet else { throw Feil("Prøvemaling krever en iPhone med LiDAR.") }
            ProveFarger.husk(farger)
            proveFarger = ProveFarger(farger: farger)
            return nil
        case "varsle":
            // Påminnelse om tørketid: et lokalt varsel på telefonen når neste strøk kan tas
            guard let id = m.valgfriTekst("id"), let tid = m.tall("tid") else { throw Feil("Mangler tid for påminnelsen.") }
            let senter = UNUserNotificationCenter.current()
            let lov = try await senter.requestAuthorization(options: [.alert, .sound])
            guard lov else { return ["lov": false] }
            let innhold = UNMutableNotificationContent()
            innhold.title = m.valgfriTekst("tittel") ?? "Malerguiden"
            innhold.body = m.valgfriTekst("tekst") ?? "Klar for neste strøk."
            innhold.sound = .default
            let sekunder = max(5, tid / 1000 - Date().timeIntervalSince1970)
            senter.removePendingNotificationRequests(withIdentifiers: [id])
            try await senter.add(UNNotificationRequest(identifier: id, content: innhold, trigger: UNTimeIntervalNotificationTrigger(timeInterval: sekunder, repeats: false)))
            return ["lov": true]
        case "avlysVarsel":
            if let id = m.valgfriTekst("id") { UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: [id]) }
            return nil
        case "pdf":
            // Rapport til kunden: HTML fra nettappen blir en A4-PDF som deles
            guard let html = m.valgfriTekst("html") else { throw Feil("Ingen rapport å lage.") }
            let navn = (m.valgfriTekst("navn") ?? "Rapport.pdf").replacingOccurrences(of: "/", with: "-")
            let data = try await PdfLager().lag(html: html)
            let url = FileManager.default.temporaryDirectory.appendingPathComponent(navn)
            try data.write(to: url, options: .atomic)
            let delt = await Deling.del([url])
            return ["delt": delt]
        case "del":
            var ting: [Any] = []
            if let tekst = m.valgfriTekst("tekst") { ting.append(tekst) }
            if let b64 = m.valgfriTekst("fil"), let data = Data(base64Encoded: b64) {
                let navn = (m.valgfriTekst("navn") ?? "malerguiden.json").replacingOccurrences(of: "/", with: "-")
                let url = FileManager.default.temporaryDirectory.appendingPathComponent(navn)
                try data.write(to: url, options: .atomic)
                ting.append(url)
            }
            guard !ting.isEmpty else { throw Feil("Ingenting å dele.") }
            let delt = await Deling.del(ting)
            return ["delt": delt]
        default:
            throw Feil("Ukjent melding: \(type)")
        }
    }
}

/// Verdiene i en melding fra nettsiden.
struct Melding: @unchecked Sendable {
    private let d: [String: Any]
    init(_ d: [String: Any]) { self.d = d }
    func tekst(_ k: String) -> String { d[k] as? String ?? "" }
    func valgfriTekst(_ k: String) -> String? { d[k] as? String }
    func tall(_ k: String) -> Double? { (d[k] as? NSNumber)?.doubleValue }
    func liste(_ k: String) -> [[String: Any]] { d[k] as? [[String: Any]] ?? [] }
}

struct JobbRef: Identifiable {
    let id: String
    let navn: String
    var prosjekt: UUID?
}

struct RomRef: Identifiable {
    let id: UUID
}

struct Feil: LocalizedError {
    let melding: String
    init(_ m: String) { melding = m }
    var errorDescription: String? { melding }
}

/// Hva appen kan, til nettsiden (vises bare knapper som virker).
enum AppInfo {
    @MainActor static func naa() -> [String: Any] {
        let ki = Skriver.status()
        return [
            "versjon": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
            "ki": ki.klar,
            "kiGrunn": ki.grunn ?? NSNull(),
            "ar": ProveMalView.stottet,
            "tekst": true,
            // Jobben kan skanne rom, åpne dem i skanneren og vise dem i 3D
            "kobling": true,
            // Daglig sikkerhetskopi til en mappe du velger
            "autokopi": true,
        ]
    }
}

// MARK: - Lenker ut av appen

extension WebKobling: WKNavigationDelegate, WKUIDelegate {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }
        if url.scheme == Self.skjema || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" { return .allow }
        // Kart, telefon, e-post og nettsider åpnes utenfor appen
        _ = await UIApplication.shared.open(url)
        return .cancel
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url { UIApplication.shared.open(url) }
        return nil
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS kan stoppe nettsiden når minnet er fullt: last den inn igjen
        webView.load(URLRequest(url: Self.start))
    }
}

// MARK: - Filene i appen

/// Leverer filene i «Web»-mappa for malerguiden://app/…
final class Filer: NSObject, WKURLSchemeHandler {
    private let rot = Bundle.main.url(forResource: "Web", withExtension: nil)

    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url, let rot else {
            urlSchemeTask.didFailWithError(URLError(.fileDoesNotExist)); return
        }
        var sti = url.path
        if sti.isEmpty || sti == "/" { sti = "/index.html" }
        let fil = rot.appendingPathComponent(String(sti.dropFirst())).standardizedFileURL
        // Bare filer inne i Web-mappa
        guard fil.path.hasPrefix(rot.standardizedFileURL.path), let data = try? Data(contentsOf: fil) else {
            let svar = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            urlSchemeTask.didReceive(svar)
            urlSchemeTask.didReceive(Data("Finnes ikke".utf8))
            urlSchemeTask.didFinish()
            return
        }
        let svar = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: [
            "Content-Type": Self.mime(fil.pathExtension),
            "Content-Length": String(data.count),
            "Cache-Control": "no-cache",
            "Access-Control-Allow-Origin": "*",
        ])!
        urlSchemeTask.didReceive(svar)
        urlSchemeTask.didReceive(data)
        urlSchemeTask.didFinish()
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    static func mime(_ ext: String) -> String {
        switch ext.lowercased() {
        case "html": return "text/html; charset=utf-8"
        case "js", "mjs": return "text/javascript; charset=utf-8"
        case "css": return "text/css; charset=utf-8"
        case "json", "webmanifest": return "application/json; charset=utf-8"
        case "svg": return "image/svg+xml"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "woff2": return "font/woff2"
        default: return "application/octet-stream"
        }
    }
}

// MARK: - Speil av lagringen

/// En kopi av Malerguiden-dataene (jobber, priser, notater) i appens egne filer.
/// Hvis nettlesermotoren skulle miste lagringen, legges dataene tilbake ved oppstart.
/// Bildene (IndexedDB) er ikke med: dem sikrer du med sikkerhetskopi under Mitt.
enum Speil {
    static var mappe: URL {
        let m = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("speil", isDirectory: true)
        try? FileManager.default.createDirectory(at: m, withIntermediateDirectories: true)
        return m
    }

    private static func fil(_ nokkel: String) -> URL {
        let trygt = Data(nokkel.utf8).base64EncodedString().replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "+", with: "-")
        return mappe.appendingPathComponent(trygt + ".txt")
    }

    static func skriv(_ nokkel: String, _ verdi: String?) {
        guard nokkel.hasPrefix("malerguiden") else { return }
        if let verdi { try? Data(verdi.utf8).write(to: fil(nokkel), options: .atomic) }
        else { try? FileManager.default.removeItem(at: fil(nokkel)) }
    }

    static func gjenopprettSkript() -> String? {
        guard let filer = try? FileManager.default.contentsOfDirectory(at: mappe, includingPropertiesForKeys: nil), !filer.isEmpty else { return nil }
        var alle: [String: String] = [:]
        for f in filer where f.pathExtension == "txt" {
            let navn = f.deletingPathExtension().lastPathComponent.replacingOccurrences(of: "_", with: "/").replacingOccurrences(of: "-", with: "+")
            guard let nd = Data(base64Encoded: navn), let nokkel = String(data: nd, encoding: .utf8),
                  let verdi = try? String(contentsOf: f, encoding: .utf8) else { continue }
            alle[nokkel] = verdi
        }
        guard !alle.isEmpty, let json = try? JSONSerialization.data(withJSONObject: alle), let tekst = String(data: json, encoding: .utf8) else { return nil }
        return "(function(){try{var d=\(tekst);for(var k in d){if(localStorage.getItem(k)===null)localStorage.setItem(k,d[k]);}}catch(e){}})();"
    }
}

// MARK: - Tekstgjenkjenning

enum Tekstleser {
    /// Linjene i bildet, ovenfra og ned.
    static func les(_ data: Data) async throws -> [String] {
        guard let bilde = UIImage(data: data)?.cgImage else { throw Feil("Bildet kunne ikke leses.") }
        let orientering = CGImagePropertyOrientation(UIImage(data: data)?.imageOrientation ?? .up)
        return try await Task.detached(priority: .userInitiated) {
            let foresporsel = VNRecognizeTextRequest()
            foresporsel.recognitionLevel = .accurate
            // Av: norsk finnes ikke i tekstgjenkjenningen, og retting gjør norske ord om til engelske
            foresporsel.usesLanguageCorrection = false
            if #available(iOS 16.0, *) { foresporsel.automaticallyDetectsLanguage = true }
            let stottet = (try? foresporsel.supportedRecognitionLanguages()) ?? []
            let onsket = ["nb-NO", "no-NO", "da-DK", "sv-SE", "de-DE", "en-US"].filter { stottet.contains($0) }
            if !onsket.isEmpty { foresporsel.recognitionLanguages = onsket }
            let handler = VNImageRequestHandler(cgImage: bilde, orientation: orientering)
            try handler.perform([foresporsel])
            let funnet = (foresporsel.results ?? []).compactMap { obs -> (CGFloat, CGFloat, String)? in
                guard let t = obs.topCandidates(1).first?.string else { return nil }
                return (obs.boundingBox.midY, obs.boundingBox.minX, t)
            }
            // Vision har origo nede til venstre: høyest y først er øverst i bildet
            return funnet.sorted { abs($0.0 - $1.0) > 0.01 ? $0.0 > $1.0 : $0.1 < $1.1 }.map(\.2)
        }.value
    }
}

extension CGImagePropertyOrientation {
    init(_ o: UIImage.Orientation) {
        switch o {
        case .up: self = .up
        case .down: self = .down
        case .left: self = .left
        case .right: self = .right
        case .upMirrored: self = .upMirrored
        case .downMirrored: self = .downMirrored
        case .leftMirrored: self = .leftMirrored
        case .rightMirrored: self = .rightMirrored
        @unknown default: self = .up
        }
    }
}

// MARK: - Deling

enum Deling {
    /// Viser delingsarket. true hvis noe ble delt eller lagret.
    @MainActor static func del(_ ting: [Any]) async -> Bool {
        guard let topp = toppKontroller() else { return false }
        return await withCheckedContinuation { fortsett in
            let ark = UIActivityViewController(activityItems: ting, applicationActivities: nil)
            ark.completionWithItemsHandler = { _, ferdig, _, _ in fortsett.resume(returning: ferdig) }
            ark.popoverPresentationController?.sourceView = topp.view
            ark.popoverPresentationController?.sourceRect = CGRect(x: topp.view.bounds.midX, y: topp.view.bounds.maxY - 40, width: 1, height: 1)
            topp.present(ark, animated: true)
        }
    }

    @MainActor static func toppKontroller() -> UIViewController? {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive }
            ?? UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = scene?.windows.first { $0.isKeyWindow }?.rootViewController ?? scene?.windows.first?.rootViewController
        while let neste = vc?.presentedViewController { vc = neste }
        return vc
    }
}

extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let n = UInt32(s, radix: 16) else { return nil }
        self.init(red: CGFloat((n >> 16) & 255) / 255, green: CGFloat((n >> 8) & 255) / 255, blue: CGFloat(n & 255) / 255, alpha: 1)
    }
}


/// Gjør HTML om til en A4-PDF med sideskift: siden lastes i en usynlig nettvisning og skrives
/// ut til PDF med iOS sin utskriftsmotor.
@MainActor final class PdfLager: NSObject, WKNavigationDelegate {
    private var web: WKWebView?
    private var ferdig: CheckedContinuation<Data, Error>?
    private var selv: PdfLager?

    func lag(html: String) async throws -> Data {
        let w = WKWebView(frame: CGRect(x: 0, y: 0, width: 595, height: 842))
        w.navigationDelegate = self
        web = w
        selv = self // hold på objektet til PDF-en er ferdig
        return try await withCheckedThrowingContinuation { c in
            ferdig = c
            w.loadHTMLString(html, baseURL: nil)
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        // Litt tid til bildene er tegnet
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { [self] in
            let data = tegn(webView)
            ferdig?.resume(returning: data)
            rydd()
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        ferdig?.resume(throwing: error)
        rydd()
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        ferdig?.resume(throwing: error)
        rydd()
    }

    private func rydd() {
        ferdig = nil
        web = nil
        selv = nil
    }

    private func tegn(_ w: WKWebView) -> Data {
        let r = UIPrintPageRenderer()
        r.addPrintFormatter(w.viewPrintFormatter(), startingAtPageAt: 0)
        let a4 = CGRect(x: 0, y: 0, width: 595.2, height: 841.8)
        r.setValue(a4, forKey: "paperRect")
        r.setValue(a4.insetBy(dx: 28, dy: 34), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, a4, nil)
        r.prepare(forDrawingPages: NSRange(location: 0, length: r.numberOfPages))
        for i in 0..<r.numberOfPages {
            UIGraphicsBeginPDFPage()
            r.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        return data as Data
    }
}
