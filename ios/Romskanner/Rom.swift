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
}

/// Plantegning i meter, sett ovenfra (x mot høyre, y nedover på skjermen).
struct Plan: Codable, Hashable {
    struct Punkt: Codable, Hashable { var x: Double; var y: Double }
    struct Linje: Codable, Hashable { var a: Punkt; var b: Punkt }
    var gulv: [Punkt]
    var vegger: [Linje]
    var dorer: [Linje]
    var vinduer: [Linje]
    var apninger: [Linje]

    var allePunkter: [Punkt] { gulv + (vegger + dorer + vinduer + apninger).flatMap { [$0.a, $0.b] } }
}

enum Maling {
    /// Regner ut målene fra RoomPlan sitt resultat.
    static func rom(fra r: CapturedRoom, navn: String) -> SkannetRom {
        let vegger = r.walls.map { (bredde: Double($0.dimensions.x), hoyde: Double($0.dimensions.y)) }
        let takhoyde = vegger.map { $0.hoyde }.max() ?? 2.4
        let veggBrutto = vegger.reduce(0.0) { $0 + $1.bredde * $1.hoyde }
        let hull = (r.doors + r.windows + r.openings).reduce(0.0) { $0 + Double($1.dimensions.x * $1.dimensions.y) }
        let (gulv, omkrets) = gulvMal(r)
        return SkannetRom(
            navn: navn,
            gulv: avrund(gulv), omkrets: avrund(omkrets), takhoyde: avrund(takhoyde),
            veggBrutto: avrund(veggBrutto), veggNetto: avrund(max(0, veggBrutto - hull)),
            vinduer: r.windows.count, dorer: r.doors.count, apninger: r.openings.count,
            plan: plan(r))
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
        return Plan.Linje(a: .init(x: a.x, y: a.y), b: .init(x: b.x, y: b.y))
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

    init(rom: [SkannetRom]) {
        self.rom = rom.map {
            Ut(navn: $0.navn, gulv: $0.gulv, omkrets: $0.omkrets, takhoyde: $0.takhoyde,
               vegg: $0.veggNetto, vinduer: $0.vinduer, dorer: $0.dorer, apninger: $0.apninger,
               plan: $0.plan.map(Eksport.avrundPlan))
        }
    }

    /// Centimeter holder, og fila blir mye mindre.
    static func avrundPlan(_ p: Plan) -> Plan {
        func r(_ q: Plan.Punkt) -> Plan.Punkt { .init(x: (q.x * 100).rounded() / 100, y: (q.y * 100).rounded() / 100) }
        func l(_ x: Plan.Linje) -> Plan.Linje { .init(a: r(x.a), b: r(x.b)) }
        return Plan(gulv: p.gulv.map(r), vegger: p.vegger.map(l), dorer: p.dorer.map(l), vinduer: p.vinduer.map(l), apninger: p.apninger.map(l))
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
    private let nokkel = "skannede-rom"

    init() {
        if let data = UserDefaults.standard.data(forKey: nokkel),
           let lagret = try? JSONDecoder().decode([SkannetRom].self, from: data) {
            rom = lagret
        }
    }

    private func lagre() {
        if let data = try? JSONEncoder().encode(rom) { UserDefaults.standard.set(data, forKey: nokkel) }
    }

    /// Skriver rommene til en fil som kan deles til Filer eller Malerguiden.
    func fil() -> URL {
        let url = FileManager.default.temporaryDirectory.appendingPathComponent("malerguiden-rom.json")
        try? Eksport(rom: rom).json().write(to: url, atomically: true, encoding: .utf8)
        return url
    }
}
