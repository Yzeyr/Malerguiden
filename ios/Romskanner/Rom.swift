import Foundation
import RoomPlan
import simd

/// Ett skannet rom, med målene Malerguiden trenger. Alle lengder i meter.
struct SkannetRom: Codable, Identifiable, Hashable {
    var id = UUID()
    var navn: String
    var gulv: Double        // m²
    var omkrets: Double     // m
    var takhoyde: Double    // m
    var veggBrutto: Double  // m², uten fradrag
    var veggNetto: Double   // m², minus vinduer, dører og åpninger
    var vinduer: Int
    var dorer: Int
    var apninger: Int
    var dato = Date()
    /// Plantegningen sett ovenfra. Mangler på rom skannet før planen ble lagret.
    var plan: Plan?
    /// Vegger som lå utenfor gulvet (typisk sett gjennom en åpen dør) og ikke er regnet med.
    var utenforVegger: Int?
    /// Dører RoomPlan så som åpne under skanningen.
    var apneDorer: Int?
    /// Prosjektet rommet hører til. nil: skannet før appen fikk prosjekter («Uten prosjekt»).
    var prosjekt: UUID?
}

/// En samling rom, f.eks. én kunde eller én bolig.
struct Prosjekt: Codable, Identifiable, Hashable {
    var id = UUID()
    var navn: String
    var dato = Date()
}

/// Plantegning i meter, sett ovenfra (x mot høyre, y nedover på skjermen).
struct Plan: Codable, Hashable {
    struct Punkt: Codable, Hashable { var x: Double; var y: Double }
    struct Linje: Codable, Hashable {
        var a: Punkt
        var b: Punkt
        /// Bredde og høyde i meter (vinduer, dører og åpninger). Mangler på eldre skanninger.
        var bredde: Double?
        var hoyde: Double?
    }
    var gulv: [Punkt]
    var vegger: [Linje]
    var dorer: [Linje]
    var vinduer: [Linje]
    var apninger: [Linje]
    /// Vegger utenfor rommets gulv. Vises stiplet, men regnes ikke med.
    var utenfor: [Linje]? = nil

    var allePunkter: [Punkt] { gulv + (vegger + dorer + vinduer + apninger + (utenfor ?? [])).flatMap { [$0.a, $0.b] } }
}

enum Maling {
    /// Regner ut målene fra RoomPlan sitt resultat.
    static func rom(fra r: CapturedRoom, navn: String) -> SkannetRom {
        var p = plan(r)
        let (gulv, omkretsGulv) = gulvMal(r)

        // Står en dør åpen, kan RoomPlan få med vegger fra rommet bak. Bare vegger
        // (og vinduer og dører i dem) som ligger langs kanten av gulvet, regnes med.
        var utenfor: [Plan.Linje] = []
        if p.gulv.count >= 3 {
            let kant = p.gulv
            utenfor = p.vegger.filter { !langsKanten($0, kant) }
            p.vegger = p.vegger.filter { langsKanten($0, kant) }
            p.dorer = p.dorer.filter { langsKanten($0, kant) }
            p.vinduer = p.vinduer.filter { langsKanten($0, kant) }
            p.apninger = p.apninger.filter { langsKanten($0, kant) }
            p.utenfor = utenfor
        }

        // En åpen dør ser RoomPlan ofte bare som et hull i veggen («åpning»). Er hullet på
        // størrelse med en dør, regnes det som en dør som står åpen.
        let somDor = dorstoreApninger(&p)

        func areal(_ l: Plan.Linje) -> Double { (l.bredde ?? 0) * (l.hoyde ?? 0) }
        let takhoyde = p.vegger.compactMap { $0.hoyde }.max() ?? 2.4
        let veggBrutto = p.vegger.reduce(0.0) { $0 + areal($1) }
        let hull = (p.dorer + p.vinduer + p.apninger).reduce(0.0) { $0 + areal($1) }
        let omkrets = p.gulv.count >= 3 ? omkretsGulv : p.vegger.reduce(0.0) { $0 + ($1.bredde ?? 0) }
        var apne = 0
        for d in r.doors {
            if case .door(let erApen) = d.category, erApen { apne += 1 }
        }

        return SkannetRom(
            navn: navn,
            gulv: avrund(gulv), omkrets: avrund(omkrets), takhoyde: avrund(takhoyde),
            veggBrutto: avrund(veggBrutto), veggNetto: avrund(max(0, veggBrutto - hull)),
            vinduer: p.vinduer.count, dorer: p.dorer.count, apninger: p.apninger.count,
            plan: p, utenforVegger: utenfor.count, apneDorer: apne + somDor)
    }

    /// Er åpningen på størrelse med en dør? 0,6–1,3 m bred, og minst 1,8 m høy (eller ukjent høyde).
    static func erDorstor(_ l: Plan.Linje) -> Bool {
        guard let b = l.bredde, b >= 0.6, b <= 1.3 else { return false }
        if let h = l.hoyde { return h >= 1.8 }
        return true
    }

    /// Flytter dørstore åpninger over til dørene i planen. Returnerer hvor mange som ble flyttet.
    @discardableResult
    static func dorstoreApninger(_ p: inout Plan) -> Int {
        let dorer = p.apninger.filter(erDorstor)
        guard !dorer.isEmpty else { return 0 }
        p.apninger.removeAll(where: erDorstor)
        p.dorer += dorer
        return dorer.count
    }

    /// Ligger midten av linjen nær en av gulvets kanter? Veggen står litt utenfor
    /// gulvkanten (halve veggtykkelsen), så grensen er romslig.
    static func langsKanten(_ l: Plan.Linje, _ gulv: [Plan.Punkt], grense: Double = 0.45) -> Bool {
        let m = SIMD2<Double>((l.a.x + l.b.x) / 2, (l.a.y + l.b.y) / 2)
        var minst = Double.infinity
        for i in gulv.indices {
            let neste = gulv[(i + 1) % gulv.count]
            let a = SIMD2<Double>(gulv[i].x, gulv[i].y)
            let b = SIMD2<Double>(neste.x, neste.y)
            let ab = b - a
            let lengde2 = ab.x * ab.x + ab.y * ab.y
            let am = m - a
            let t = lengde2 > 0 ? max(0, min(1, (am.x * ab.x + am.y * ab.y) / lengde2)) : 0
            let n = a + ab * t - m
            minst = min(minst, (n.x * n.x + n.y * n.y).squareRoot())
        }
        return minst <= grense
    }

    /// En flate (vegg, dør, vindu) som et linjestykke sett ovenfra: midtpunkt ± halve bredden langs flatens x-akse.
    static func linje(_ s: CapturedRoom.Surface) -> Plan.Linje {
        let t = s.transform
        let senter = SIMD2<Double>(Double(t.columns.3.x), Double(t.columns.3.z))
        var retning = SIMD2<Double>(Double(t.columns.0.x), Double(t.columns.0.z))
        let lengde = (retning.x * retning.x + retning.y * retning.y).squareRoot()
        if lengde > 0 { retning /= lengde }
        let halv = Double(s.dimensions.x) / 2
        let a = senter - retning * halv, b = senter + retning * halv
        return Plan.Linje(a: .init(x: a.x, y: a.y), b: .init(x: b.x, y: b.y),
                          bredde: Double(s.dimensions.x), hoyde: Double(s.dimensions.y))
    }

    static func plan(_ r: CapturedRoom) -> Plan {
        var gulv: [Plan.Punkt] = []
        if let g = r.floors.first {
            // Hjørnene er i gulvflatens eget koordinatsystem; regn dem om til rommets.
            gulv = g.polygonCorners.map { c in
                let w = g.transform * SIMD4<Float>(c.x, c.y, c.z, 1)
                return Plan.Punkt(x: Double(w.x), y: Double(w.z))
            }
        }
        return Plan(
            gulv: gulv,
            vegger: r.walls.map(linje),
            dorer: r.doors.map(linje),
            vinduer: r.windows.map(linje),
            apninger: r.openings.map(linje))
    }

    static func avrund(_ v: Double) -> Double { (v * 100).rounded() / 100 }

    /// Gulvareal og omkrets. Bruker gulvflaten fra RoomPlan når den finnes,
    /// ellers veggenes endepunkter sett ovenfra.
    static func gulvMal(_ r: CapturedRoom) -> (Double, Double) {
        if let gulv = r.floors.first, gulv.polygonCorners.count >= 3 {
            let p = iPlan(gulv.polygonCorners)
            return (areal(p), omkrets(p))
        }
        var punkter: [SIMD2<Double>] = []
        for v in r.walls {
            let t = v.transform
            let senter = SIMD2<Double>(Double(t.columns.3.x), Double(t.columns.3.z))
            var retning = SIMD2<Double>(Double(t.columns.0.x), Double(t.columns.0.z))
            let lengde = (retning.x * retning.x + retning.y * retning.y).squareRoot()
            if lengde > 0 { retning /= lengde }
            let halv = Double(v.dimensions.x) / 2
            punkter.append(senter + retning * halv)
            punkter.append(senter - retning * halv)
        }
        let omkrets = r.walls.reduce(0.0) { $0 + Double($1.dimensions.x) }
        return (areal(konvekstSkrog(punkter)), omkrets)
    }

    /// Hjørnene ligger i et plan; bruk de to aksene med størst spenn.
    static func iPlan(_ c: [simd_float3]) -> [SIMD2<Double>] {
        let xs = c.map { Double($0.x) }, ys = c.map { Double($0.y) }, zs = c.map { Double($0.z) }
        func spenn(_ a: [Double]) -> Double { (a.max() ?? 0) - (a.min() ?? 0) }
        let s = [spenn(xs), spenn(ys), spenn(zs)]
        let minste = s.firstIndex(of: s.min() ?? 0) ?? 1
        return c.indices.map { i -> SIMD2<Double> in
            switch minste {
            case 0: return SIMD2(ys[i], zs[i])
            case 1: return SIMD2(xs[i], zs[i])
            default: return SIMD2(xs[i], ys[i])
            }
        }
    }

    static func areal(_ p: [SIMD2<Double>]) -> Double {
        guard p.count >= 3 else { return 0 }
        var a = 0.0
        for i in p.indices {
            let j = (i + 1) % p.count
            a += p[i].x * p[j].y - p[j].x * p[i].y
        }
        return abs(a) / 2
    }

    static func omkrets(_ p: [SIMD2<Double>]) -> Double {
        guard p.count >= 2 else { return 0 }
        var o = 0.0
        for i in p.indices {
            let d = p[(i + 1) % p.count] - p[i]
            o += (d.x * d.x + d.y * d.y).squareRoot()
        }
        return o
    }

    /// Konvekst skrog (Andrews algoritme), som reserve når gulvflaten mangler.
    static func konvekstSkrog(_ punkter: [SIMD2<Double>]) -> [SIMD2<Double>] {
        let p = punkter.sorted { $0.x == $1.x ? $0.y < $1.y : $0.x < $1.x }
        guard p.count >= 3 else { return p }
        func kryss(_ o: SIMD2<Double>, _ a: SIMD2<Double>, _ b: SIMD2<Double>) -> Double {
            (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)
        }
        var nedre: [SIMD2<Double>] = []
        for q in p {
            while nedre.count >= 2 && kryss(nedre[nedre.count - 2], nedre[nedre.count - 1], q) <= 0 { nedre.removeLast() }
            nedre.append(q)
        }
        var ovre: [SIMD2<Double>] = []
        for q in p.reversed() {
            while ovre.count >= 2 && kryss(ovre[ovre.count - 2], ovre[ovre.count - 1], q) <= 0 { ovre.removeLast() }
            ovre.append(q)
        }
        return Array(nedre.dropLast() + ovre.dropLast())
    }
}

/// Formatet Malerguiden leser under Mål → Importer skanning.
struct Eksport: Codable {
    var format = "malerguiden-rom"
    var versjon = 1
    var laget = Date()
    /// Navnet på prosjektet rommene kommer fra (Malerguiden trenger det ikke, men det står i fila).
    var prosjekt: String?
    var rom: [Ut]

    struct Ut: Codable {
        var navn: String
        var gulv: Double
        var omkrets: Double
        var takhoyde: Double
        var vegg: Double
        var vinduer: Int
        var dorer: Int
        var apninger: Int
        var plan: Plan?
    }

    init(rom: [SkannetRom], prosjekt: String? = nil) {
        self.prosjekt = prosjekt
        self.rom = rom.map {
            Ut(navn: $0.navn, gulv: $0.gulv, omkrets: $0.omkrets, takhoyde: $0.takhoyde,
               vegg: $0.veggNetto, vinduer: $0.vinduer, dorer: $0.dorer, apninger: $0.apninger,
               plan: $0.plan.map(Eksport.avrundPlan))
        }
    }

    /// Centimeter holder, og fila blir mye mindre.
    static func avrundPlan(_ p: Plan) -> Plan {
        func r(_ q: Plan.Punkt) -> Plan.Punkt { .init(x: (q.x * 100).rounded() / 100, y: (q.y * 100).rounded() / 100) }
        func m(_ v: Double?) -> Double? { v.map { ($0 * 100).rounded() / 100 } }
        func l(_ x: Plan.Linje) -> Plan.Linje { .init(a: r(x.a), b: r(x.b), bredde: m(x.bredde), hoyde: m(x.hoyde)) }
        return Plan(gulv: p.gulv.map(r), vegger: p.vegger.map(l), dorer: p.dorer.map(l), vinduer: p.vinduer.map(l), apninger: p.apninger.map(l),
                    utenfor: p.utenfor?.map(l))
    }

    func json() -> String {
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        guard let data = try? enc.encode(self) else { return "{}" }
        return String(decoding: data, as: UTF8.self)
    }
}

/// Lagrer rommene på telefonen mellom hver gang appen åpnes.
@MainActor
final class RomLager: ObservableObject {
    @Published var rom: [SkannetRom] = [] { didSet { lagre() } }
    @Published var prosjekter: [Prosjekt] = [] { didSet { lagreProsjekter() } }
    /// Rom der 3D-modellen med bilder fortsatt lages.
    @Published var fotoUnderArbeid = Set<UUID>()
    private let nokkel = "skannede-rom"
    private let prosjektNokkel = "prosjekter"

    init() {
        if let data = UserDefaults.standard.data(forKey: nokkel),
           var lagret = try? JSONDecoder().decode([SkannetRom].self, from: data) {
            // Rom skannet før åpne dører ble kjent igjen: dørstore åpninger blir dører
            for i in lagret.indices {
                guard var plan = lagret[i].plan else { continue }
                let n = Maling.dorstoreApninger(&plan)
                guard n > 0 else { continue }
                lagret[i].plan = plan
                lagret[i].dorer += n
                lagret[i].apninger = max(0, lagret[i].apninger - n)
                lagret[i].apneDorer = (lagret[i].apneDorer ?? 0) + n
            }
            rom = lagret
        }
        if let data = UserDefaults.standard.data(forKey: prosjektNokkel),
           let lagret = try? JSONDecoder().decode([Prosjekt].self, from: data) {
            prosjekter = lagret
        }
    }

    /// Rommene i et prosjekt. nil gir rommene uten prosjekt.
    func rom(i prosjekt: UUID?) -> [SkannetRom] { rom.filter { $0.prosjekt == prosjekt } }
    func navn(på prosjekt: UUID?) -> String { prosjekter.first { $0.id == prosjekt }?.navn ?? "Uten prosjekt" }

    /// Sletter rommene og 3D-modellene deres.
    func slett(rom ider: Set<UUID>) {
        for id in ider { Modell.slett(id) }
        rom.removeAll { ider.contains($0.id) }
    }

    /// Sletter prosjektet og alle rommene i det.
    func slett(prosjekt id: UUID) {
        slett(rom: Set(rom(i: id).map(\.id)))
        prosjekter.removeAll { $0.id == id }
    }

    func flytt(_ ider: Set<UUID>, til prosjekt: UUID?) {
        for i in rom.indices where ider.contains(rom[i].id) { rom[i].prosjekt = prosjekt }
    }

    private func lagreProsjekter() {
        if let data = try? JSONEncoder().encode(prosjekter) { UserDefaults.standard.set(data, forKey: prosjektNokkel) }
    }

    /// Lager 3D-modellen med bilder i bakgrunnen (tar noen sekunder).
    func lagFotomodell(_ r: CapturedRoom, bilder: [Fotobilde], id: UUID) {
        guard bilder.count >= 2 else { return }
        fotoUnderArbeid.insert(id)
        let url = Fotomodell.url(id)
        Task.detached(priority: .utility) {
            Fotomodell.lag(rom: r, bilder: bilder, til: url)
            await MainActor.run { _ = self.fotoUnderArbeid.remove(id) }
        }
    }

    private func lagre() {
        if let data = try? JSONEncoder().encode(rom) { UserDefaults.standard.set(data, forKey: nokkel) }
    }

    /// Skriver rommene til en fil som kan deles til Filer eller Malerguiden.
    func fil(_ utvalg: [SkannetRom], prosjekt: String? = nil) -> URL {
        let trygt = (prosjekt ?? "rom").lowercased().map { $0.isLetter || $0.isNumber ? String($0) : "-" }.joined()
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("malerguiden-\(trygt).json")
        try? Eksport(rom: utvalg, prosjekt: prosjekt).json().write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
