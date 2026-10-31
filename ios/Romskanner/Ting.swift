import Foundation
import ModelIO
import RealityKit
import simd

/// En ting som er skannet til en 3D-modell (møbel, gjenstand, detalj).
/// Mål i meter, areal i m², volum i m³. Modellen ligger som USDZ i appens dokumentmappe.
struct SkannetTing: Codable, Identifiable, Hashable {
    var id = UUID()
    var navn: String
    var dato = Date()
    var prosjekt: UUID?
    /// Lengde, bredde og høyde på en boks rundt tingen.
    var lengde: Double = 0
    var bredde: Double = 0
    var hoyde: Double = 0
    /// Overflaten på modellen, og volumet når modellen er lukket.
    var areal: Double = 0
    var volum: Double = 0
    var trekanter: Int = 0
    /// nil = ferdig. Ellers: "bygger" eller en feilmelding.
    var status: String?

    var ferdig: Bool { status == nil && TingFiler.finnes(id) }
}

/// Hvor filene til en ting ligger: bildene fra skanningen, sjekkpunkter og den ferdige modellen.
enum TingFiler {
    static var rot: URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("ting", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    static func mappe(_ id: UUID) -> URL {
        let url = rot.appendingPathComponent(id.uuidString, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }
    static func bilder(_ id: UUID) -> URL { undermappe(id, "bilder") }
    static func sjekkpunkt(_ id: UUID) -> URL { undermappe(id, "sjekkpunkt") }
    static func modell(_ id: UUID) -> URL { mappe(id).appendingPathComponent("modell.usdz") }
    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: modell(id).path) }
    static func harBilder(_ id: UUID) -> Bool {
        ((try? FileManager.default.contentsOfDirectory(atPath: bilder(id).path))?.count ?? 0) > 0
    }

    private static func undermappe(_ id: UUID, _ navn: String) -> URL {
        let url = mappe(id).appendingPathComponent(navn, isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    /// Bildene og sjekkpunktene trengs ikke når modellen er laget. De tar mye plass.
    static func ryddEtterBygging(_ id: UUID) {
        try? FileManager.default.removeItem(at: mappe(id).appendingPathComponent("bilder"))
        try? FileManager.default.removeItem(at: mappe(id).appendingPathComponent("sjekkpunkt"))
    }

    static func slett(_ id: UUID) { try? FileManager.default.removeItem(at: rot.appendingPathComponent(id.uuidString)) }

    /// Et trygt filnavn fra tingens navn.
    static func filnavn(_ navn: String) -> String {
        let trygt = navn.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined(separator: "-")
        return trygt.isEmpty ? "Ting" : trygt
    }

    /// En kopi av USDZ-modellen med tingens navn, til deling.
    static func delbarUSDZ(_ ting: SkannetTing) -> URL {
        let mal = FileManager.default.temporaryDirectory.appendingPathComponent(filnavn(ting.navn) + ".usdz")
        try? FileManager.default.removeItem(at: mal)
        try? FileManager.default.copyItem(at: modell(ting.id), to: mal)
        return mal
    }

    /// Modellen som OBJ (med materialfil og teksturer når ModelIO skriver dem), til Blender,
    /// Unity, Unreal, Roblox og 3D-printing. Gir alle filene som skal deles sammen.
    static func eksporterOBJ(_ ting: SkannetTing) -> [URL] {
        guard MDLAsset.canExportFileExtension("obj") else { return [] }
        let mappe = FileManager.default.temporaryDirectory.appendingPathComponent("obj-" + ting.id.uuidString, isDirectory: true)
        try? FileManager.default.removeItem(at: mappe)
        try? FileManager.default.createDirectory(at: mappe, withIntermediateDirectories: true)
        let asset = MDLAsset(url: modell(ting.id))
        asset.loadTextures()
        let obj = mappe.appendingPathComponent(filnavn(ting.navn) + ".obj")
        do { try asset.export(to: obj) } catch { return [] }
        return (try? FileManager.default.contentsOfDirectory(at: mappe, includingPropertiesForKeys: nil)) ?? [obj]
    }
}

/// Mål på en ferdig modell, regnet ut fra trekantene.
enum TingMal {
    struct Resultat { var lengde = 0.0, bredde = 0.0, hoyde = 0.0, areal = 0.0, volum = 0.0, trekanter = 0 }

    static func beregn(_ url: URL) -> Resultat {
        var r = Resultat()
        let asset = MDLAsset(url: url)
        let boks = asset.boundingBox
        let storrelse = boks.maxBounds - boks.minBounds
        // Høyde er Y. Lengde er den lengste av de to andre.
        let x = Double(storrelse.x), z = Double(storrelse.z)
        r.hoyde = Double(storrelse.y)
        r.lengde = max(x, z)
        r.bredde = min(x, z)

        let maskene = asset.childObjects(of: MDLMesh.self).compactMap { $0 as? MDLMesh }
        var areal = 0.0, volum = 0.0, antall = 0
        for maske in maskene {
            guard let pos = maske.vertexAttributeData(forAttributeNamed: MDLVertexAttributePosition, as: .float3) else { continue }
            let steg = pos.stride
            let start = pos.dataStart
            func punkt(_ i: Int) -> SIMD3<Double> {
                let p = start.advanced(by: i * steg).assumingMemoryBound(to: Float.self)
                return SIMD3(Double(p[0]), Double(p[1]), Double(p[2]))
            }
            for del in (maske.submeshes as? [MDLSubmesh]) ?? [] where del.geometryType == .triangles {
                let buffer = del.indexBuffer(asIndexType: .uInt32)
                let kart = buffer.map()
                let indekser = kart.bytes.assumingMemoryBound(to: UInt32.self)
                var t = 0
                while t + 2 < del.indexCount {
                    let a = punkt(Int(indekser[t])), b = punkt(Int(indekser[t + 1])), c = punkt(Int(indekser[t + 2]))
                    areal += simd_length(simd_cross(b - a, c - a)) / 2
                    volum += simd_dot(a, simd_cross(b, c)) / 6
                    antall += 1
                    t += 3
                }
            }
        }
        r.areal = areal
        // Volumet stemmer bare når modellen er lukket. Ellers blir det for lite eller for stort,
        // så det tas bare med når det er rimelig mot boksen rundt tingen.
        let boksVolum = r.lengde * r.bredde * r.hoyde
        let v = abs(volum)
        r.volum = boksVolum > 0 && v <= boksVolum * 1.05 ? v : 0
        r.trekanter = antall
        return r
    }
}

/// Lagrer tingene i UserDefaults, som rommene.
final class TingLager: ObservableObject {
    @Published var ting: [SkannetTing] = [] { didSet { lagre() } }
    /// Hvor langt modellen er kommet for ting som bygges (0–1).
    @Published var fremdrift: [UUID: Double] = [:]
    private let nokkel = "skannede-ting"
    private var oppgaver: [UUID: Task<Void, Never>] = [:]

    init() {
        if let data = UserDefaults.standard.data(forKey: nokkel), let lest = try? JSONDecoder().decode([SkannetTing].self, from: data) {
            // En bygging som ble avbrutt (appen ble lukket) kan startes på nytt fra bildene
            ting = lest.map { var t = $0; if t.status == "bygger" { t.status = TingFiler.harBilder(t.id) ? "avbrutt" : "Bildene mangler. Skann tingen på nytt." }; return t }
        }
    }

    private func lagre() {
        if let data = try? JSONEncoder().encode(ting) { UserDefaults.standard.set(data, forKey: nokkel) }
    }

    func ting(i prosjekt: UUID?) -> [SkannetTing] { ting.filter { $0.prosjekt == prosjekt } }

    func slett(_ id: UUID) {
        oppgaver[id]?.cancel()
        TingFiler.slett(id)
        ting.removeAll { $0.id == id }
    }

    private func oppdater(_ id: UUID, _ endre: (inout SkannetTing) -> Void) {
        guard let i = ting.firstIndex(where: { $0.id == id }) else { return }
        endre(&ting[i])
    }

    /// Lager 3D-modellen fra bildene, på telefonen. Tar noen minutter.
    @MainActor
    func bygg(_ id: UUID) {
        guard oppgaver[id] == nil else { return }
        oppdater(id) { $0.status = "bygger" }
        fremdrift[id] = 0
        oppgaver[id] = Task { [weak self] in
            let ut = TingFiler.modell(id)
            let feil = await TingBygger.bygg(bilder: TingFiler.bilder(id), sjekkpunkt: TingFiler.sjekkpunkt(id), til: ut) { andel in
                Task { @MainActor in self?.fremdrift[id] = andel }
            }
            await MainActor.run {
                guard let self else { return }
                self.oppgaver[id] = nil
                self.fremdrift[id] = nil
                if let feil {
                    self.oppdater(id) { $0.status = feil }
                    return
                }
                let mal = TingMal.beregn(ut)
                self.oppdater(id) {
                    $0.status = nil
                    $0.lengde = mal.lengde; $0.bredde = mal.bredde; $0.hoyde = mal.hoyde
                    $0.areal = mal.areal; $0.volum = mal.volum; $0.trekanter = mal.trekanter
                }
                TingFiler.ryddEtterBygging(id)
            }
        }
    }
}

/// Fotogrammetri på telefonen (iOS 17): bildene blir en USDZ-modell med teksturer.
enum TingBygger {
    static var stottet: Bool { PhotogrammetrySession.isSupported }

    /// Returnerer nil når modellen er laget, ellers en feilmelding på norsk.
    static func bygg(bilder: URL, sjekkpunkt: URL, til ut: URL, fremdrift: @escaping (Double) -> Void) async -> String? {
        guard stottet else { return "Denne telefonen kan ikke lage 3D-modeller." }
        var oppsett = PhotogrammetrySession.Configuration()
        oppsett.checkpointDirectory = sjekkpunkt
        let okt: PhotogrammetrySession
        do { okt = try PhotogrammetrySession(input: bilder, configuration: oppsett) }
        catch { return "Klarte ikke starte: " + error.localizedDescription }
        do { try okt.process(requests: [.modelFile(url: ut)]) }
        catch { return "Klarte ikke lage modellen: " + error.localizedDescription }
        do {
            for try await svar in okt.outputs {
                if Task.isCancelled { okt.cancel(); return "Avbrutt." }
                switch svar {
                case .requestProgress(_, let andel):
                    fremdrift(andel)
                case .requestError(_, let feil):
                    return "Modellen feilet: " + feil.localizedDescription
                case .processingCancelled:
                    return "Avbrutt."
                case .processingComplete:
                    return FileManager.default.fileExists(atPath: ut.path) ? nil : "Modellen ble ikke laget. Prøv å skanne på nytt med mer lys."
                default:
                    break
                }
            }
        } catch {
            return "Modellen feilet: " + error.localizedDescription
        }
        return FileManager.default.fileExists(atPath: ut.path) ? nil : "Modellen ble ikke laget."
    }
}
