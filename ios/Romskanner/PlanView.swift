import SwiftUI

/// 2D-plantegning av ett rom: gulv, vegger med mål, dører med slag og vinduer.
struct PlanView: View {
    let plan: Plan
    var visMal = true

    private let terrakotta = Color(red: 0.73, green: 0.28, blue: 0.16)
    private let vindusblaa = Color(red: 0.35, green: 0.62, blue: 0.85)

    var body: some View {
        Canvas { ctx, size in
            let p = Tilpasning(plan: plan, storrelse: size, marg: visMal ? 34 : 10)
            let bakgrunn = Color(uiColor: .systemBackground)

            // Gulvet
            if p.gulv.count >= 3 {
                var gulv = Path()
                gulv.addLines(p.gulv)
                gulv.closeSubpath()
                ctx.fill(gulv, with: .color(terrakotta.opacity(0.12)))
            }

            // Vegger utenfor rommet (sett gjennom åpen dør): stiplet og grå, regnes ikke med
            for v in p.utenfor {
                var sti = Path(); sti.move(to: v.0); sti.addLine(to: v.1)
                ctx.stroke(sti, with: .color(.secondary.opacity(0.6)), style: StrokeStyle(lineWidth: visMal ? 2 : 1, dash: [5, 4]))
            }

            // Veggene
            for v in p.vegger {
                var sti = Path(); sti.move(to: v.0); sti.addLine(to: v.1)
                ctx.stroke(sti, with: .color(.primary), style: StrokeStyle(lineWidth: visMal ? 5 : 2.5, lineCap: .round))
            }

            // Åpninger: et hull i veggen med stiplet linje
            for a in p.apninger {
                var sti = Path(); sti.move(to: a.0); sti.addLine(to: a.1)
                ctx.stroke(sti, with: .color(bakgrunn), lineWidth: 8)
                ctx.stroke(sti, with: .color(.secondary), style: StrokeStyle(lineWidth: 1.5, dash: [4, 3]))
            }

            // Vinduer: tynn dobbel linje i veggen
            for w in p.vinduer {
                var sti = Path(); sti.move(to: w.0); sti.addLine(to: w.1)
                ctx.stroke(sti, with: .color(bakgrunn), lineWidth: 8)
                ctx.stroke(sti, with: .color(vindusblaa), lineWidth: 4)
            }

            // Dører: hull i veggen, dørblad og slag inn i rommet
            for d in p.dorer {
                var hull = Path(); hull.move(to: d.0); hull.addLine(to: d.1)
                ctx.stroke(hull, with: .color(bakgrunn), lineWidth: 8)
                let slag = p.dorslag(d)
                ctx.stroke(slag.blad, with: .color(terrakotta), lineWidth: 2.5)
                ctx.stroke(slag.bue, with: .color(terrakotta.opacity(0.6)), style: StrokeStyle(lineWidth: 1, dash: [3, 3]))
            }

            // Mål på hver vegg utenfor rommet, og på vinduer og dører innenfor
            if visMal {
                for (v, meter) in zip(p.vegger, p.veggLengder) where meter >= 0.3 {
                    let tekst = ctx.resolve(Text(meter.formatted(.number.precision(.fractionLength(2))) + " m")
                        .font(.system(size: 11, weight: .semibold)).foregroundStyle(.secondary))
                    ctx.draw(tekst, at: p.utenfor(v, avstand: 12, tekst: tekst.measure(in: size)))
                }
                for (w, l) in zip(p.vinduer, plan.vinduer) {
                    if let s = Tilpasning.storrelse(l) {
                        let tekst = ctx.resolve(Text(s).font(.system(size: 10, weight: .semibold)).foregroundStyle(vindusblaa))
                        ctx.draw(tekst, at: p.utenfor(w, avstand: -10, tekst: tekst.measure(in: size)))
                    }
                }
                for (d, l) in zip(p.dorer, plan.dorer) {
                    if let s = Tilpasning.storrelse(l) {
                        let tekst = ctx.resolve(Text(s).font(.system(size: 10, weight: .semibold)).foregroundStyle(terrakotta))
                        ctx.draw(tekst, at: p.utenfor(d, avstand: -10, tekst: tekst.measure(in: size)))
                    }
                }
            }
        }
        .accessibilityLabel("Plantegning")
    }
}

/// Roterer planen så den lengste veggen ligger vannrett, og skalerer den til rammen.
struct Tilpasning {
    /// «1,20 × 1,40» (bredde × høyde i meter), eller nil når målene mangler.
    static func storrelse(_ l: Plan.Linje) -> String? {
        guard let b = l.bredde, let h = l.hoyde, b > 0, h > 0 else { return nil }
        let f = FloatingPointFormatStyle<Double>.number.precision(.fractionLength(2))
        return b.formatted(f) + " × " + h.formatted(f)
    }

    var gulv: [CGPoint] = []
    var vegger: [(CGPoint, CGPoint)] = []
    var dorer: [(CGPoint, CGPoint)] = []
    var vinduer: [(CGPoint, CGPoint)] = []
    var apninger: [(CGPoint, CGPoint)] = []
    var utenfor: [(CGPoint, CGPoint)] = []
    var veggLengder: [Double] = []
    var senter = CGPoint.zero

    init(plan: Plan, storrelse: CGSize, marg: CGFloat) {
        // Vinkelen til den lengste veggen
        let lengste = plan.vegger.max { lengde($0) < lengde($1) }
        let vinkel = lengste.map { atan2($0.b.y - $0.a.y, $0.b.x - $0.a.x) } ?? 0
        let c = cos(-vinkel), s = sin(-vinkel)
        func rot(_ q: Plan.Punkt) -> CGPoint { CGPoint(x: q.x * c - q.y * s, y: q.x * s + q.y * c) }

        let alle = plan.allePunkter.map(rot)
        guard let minX = alle.map(\.x).min(), let maxX = alle.map(\.x).max(),
              let minY = alle.map(\.y).min(), let maxY = alle.map(\.y).max() else { return }
        let bredde = max(maxX - minX, 0.5), hoyde = max(maxY - minY, 0.5)
        let skala = min((storrelse.width - 2 * marg) / bredde, (storrelse.height - 2 * marg) / hoyde)
        let forskyvX = (storrelse.width - bredde * skala) / 2 - minX * skala
        let forskyvY = (storrelse.height - hoyde * skala) / 2 - minY * skala
        func til(_ q: Plan.Punkt) -> CGPoint { let r = rot(q); return CGPoint(x: r.x * skala + forskyvX, y: r.y * skala + forskyvY) }
        func linje(_ l: Plan.Linje) -> (CGPoint, CGPoint) { (til(l.a), til(l.b)) }

        gulv = plan.gulv.map(til)
        vegger = plan.vegger.map(linje)
        dorer = plan.dorer.map(linje)
        vinduer = plan.vinduer.map(linje)
        apninger = plan.apninger.map(linje)
        utenfor = (plan.utenfor ?? []).map(linje)
        veggLengder = plan.vegger.map(lengde)
        let kilde = gulv.count >= 3 ? gulv : vegger.flatMap { [$0.0, $0.1] }
        if !kilde.isEmpty {
            senter = CGPoint(x: kilde.map(\.x).reduce(0, +) / CGFloat(kilde.count), y: kilde.map(\.y).reduce(0, +) / CGFloat(kilde.count))
        }
    }

    /// Et punkt ved midten av veggen, på motsatt side av rommets midte (negativ avstand: innenfor).
    /// Teksten står vannrett, så den flyttes en halv tekstbredde ekstra fra loddrette vegger.
    func utenfor(_ v: (CGPoint, CGPoint), avstand: CGFloat, tekst: CGSize) -> CGPoint {
        let m = CGPoint(x: (v.0.x + v.1.x) / 2, y: (v.0.y + v.1.y) / 2)
        let dx = v.1.x - v.0.x, dy = v.1.y - v.0.y
        let l = max(hypot(dx, dy), 0.001)
        var n = CGPoint(x: -dy / l, y: dx / l)
        if (senter.x - m.x) * n.x + (senter.y - m.y) * n.y > 0 { n = CGPoint(x: -n.x, y: -n.y) }
        let ekstra = abs(n.x) * tekst.width / 2 + abs(n.y) * tekst.height / 2
        let d = avstand < 0 ? avstand - ekstra : avstand + ekstra
        return CGPoint(x: m.x + n.x * d, y: m.y + n.y * d)
    }

    /// Dørbladet står vinkelrett på veggen, og slaget er en kvartsirkel inn i rommet.
    func dorslag(_ d: (CGPoint, CGPoint)) -> (blad: Path, bue: Path) {
        let a = d.0, b = d.1
        let vx = b.x - a.x, vy = b.y - a.y
        // Vend slaget mot midten av rommet
        let mot = (senter.x - a.x) * (-vy) + (senter.y - a.y) * vx > 0 ? 1.0 : -1.0
        func roter(_ t: Double) -> CGPoint {
            let v = t * .pi / 2 * mot
            return CGPoint(x: a.x + vx * cos(v) - vy * sin(v), y: a.y + vx * sin(v) + vy * cos(v))
        }
        var blad = Path(); blad.move(to: a); blad.addLine(to: roter(1))
        var bue = Path(); bue.move(to: b)
        for i in 1...12 { bue.addLine(to: roter(Double(i) / 12)) }
        return (blad, bue)
    }
}

private func lengde(_ l: Plan.Linje) -> Double { hypot(l.b.x - l.a.x, l.b.y - l.a.y) }

/// Ett rom: plantegningen og alle målene.
struct RomDetalj: View {
    @ObservedObject var lager: RomLager
    let id: UUID
    @State private var navn = ""
    @State private var endrer = false

    private var rom: SkannetRom? { lager.rom.first { $0.id == id } }
    private func m(_ v: Double, _ d: Int = 1) -> String { v.formatted(.number.precision(.fractionLength(d))) }

    var body: some View {
        if let rom {
            List {
                Section {
                    if let plan = rom.plan, !plan.vegger.isEmpty {
                        PlanView(plan: plan)
                            .frame(height: 360)
                            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    } else {
                        Text("Dette rommet ble skannet før appen lagret plantegninger. Skann det på nytt for å se planen.")
                            .foregroundStyle(.secondary)
                    }
                } footer: {
                    if let plan = rom.plan {
                        Text("\(plan.vegger.count) vegger · \(plan.dorer.count) dører · \(plan.vinduer.count) vinduer" + (plan.apninger.isEmpty ? "" : " · \(plan.apninger.count) åpninger"))
                    }
                }
                if (rom.utenforVegger ?? 0) > 0 || (rom.apneDorer ?? 0) > 0 {
                    Section {
                        if let n = rom.utenforVegger, n > 0 {
                            Label((n == 1 ? "1 vegg" : "\(n) vegger") + " utenfor rommet er ikke regnet med. Den er trolig sett gjennom en åpen dør, og vises stiplet.", systemImage: "eye.slash")
                        }
                        if let n = rom.apneDorer, n > 0 {
                            Label((n == 1 ? "1 dør" : "\(n) dører") + " sto åpne. Lukk dørene neste gang for sikrest mål.", systemImage: "door.left.hand.open")
                        }
                    }
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                }
                if let plan = rom.plan, !(plan.vinduer.isEmpty && plan.dorer.isEmpty) {
                    Section("Vinduer og dører") {
                        ForEach(Array(plan.vinduer.enumerated()), id: \.offset) { i, v in
                            LabeledContent("Vindu \(i + 1)", value: Tilpasning.storrelse(v).map { $0 + " m" } ?? "–")
                        }
                        ForEach(Array(plan.dorer.enumerated()), id: \.offset) { i, d in
                            LabeledContent("Dør \(i + 1)", value: Tilpasning.storrelse(d).map { $0 + " m" } ?? "–")
                        }
                    }
                }
                Section("Mål") {
                    LabeledContent("Gulv", value: "\(m(rom.gulv)) m²")
                    LabeledContent("Omkrets", value: "\(m(rom.omkrets)) m")
                    LabeledContent("Takhøyde", value: "\(m(rom.takhoyde, 2)) m")
                    LabeledContent("Vegg uten vinduer og dører", value: "\(m(rom.veggNetto)) m²")
                    LabeledContent("Vegg totalt", value: "\(m(rom.veggBrutto)) m²")
                    LabeledContent("Vinduer", value: "\(rom.vinduer)")
                    LabeledContent("Dører", value: "\(rom.dorer)")
                }
            }
            .navigationTitle(rom.navn)
            .toolbar {
                Button("Endre navn") { navn = rom.navn; endrer = true }
            }
            .alert("Endre navn", isPresented: $endrer) {
                TextField("Navn", text: $navn)
                Button("Lagre") {
                    if let i = lager.rom.firstIndex(where: { $0.id == id }), !navn.trimmingCharacters(in: .whitespaces).isEmpty {
                        lager.rom[i].navn = navn
                    }
                }
                Button("Avbryt", role: .cancel) {}
            }
        } else {
            Text("Rommet er slettet.").foregroundStyle(.secondary)
        }
    }
}
