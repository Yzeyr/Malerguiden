import SwiftUI

/// Én vegg, ett vindu eller én dør i planen.
enum Planbit: Hashable, Identifiable {
    case vegg(Int), vindu(Int), dor(Int)
    var id: String { "\(self)" }
    var navn: String {
        switch self {
        case .vegg(let i): return "Vegg \(i + 1)"
        case .vindu(let i): return "Vindu \(i + 1)"
        case .dor(let i): return "Dør \(i + 1)"
        }
    }
    var erVegg: Bool { if case .vegg = self { return true } else { return false } }
}

extension Plan {
    func linje(_ b: Planbit) -> Linje? {
        func hent(_ l: [Linje], _ i: Int) -> Linje? { l.indices.contains(i) ? l[i] : nil }
        switch b {
        case .vegg(let i): return hent(vegger, i)
        case .vindu(let i): return hent(vinduer, i)
        case .dor(let i): return hent(dorer, i)
        }
    }

    mutating func sett(_ b: Planbit, _ l: Linje) {
        switch b {
        case .vegg(let i): if vegger.indices.contains(i) { vegger[i] = l }
        case .vindu(let i): if vinduer.indices.contains(i) { vinduer[i] = l }
        case .dor(let i): if dorer.indices.contains(i) { dorer[i] = l }
        }
    }
}

extension Maling {
    /// Regner veggarealet på nytt fra planen, etter at et mål er rettet for hånd.
    static func regnOm(_ r: inout SkannetRom) {
        guard let p = r.plan else { return }
        func areal(_ l: Plan.Linje) -> Double { (l.bredde ?? 0) * (l.hoyde ?? 0) }
        let brutto = p.vegger.reduce(0.0) { $0 + areal($1) }
        let hull = (p.dorer + p.vinduer + p.apninger).reduce(0.0) { $0 + areal($1) }
        r.veggBrutto = avrund(brutto)
        r.veggNetto = avrund(max(0, brutto - hull))
        if let h = p.vegger.compactMap({ $0.hoyde }).max() { r.takhoyde = avrund(h) }
    }
}

/// «Mål på nytt»: rett målet på én vegg, ett vindu eller én dør. Målet kan skrives inn,
/// eller hentes fra et mål tatt i 3D-modellen. Veggarealet regnes på nytt.
struct RettMal: View {
    @ObservedObject var lager: RomLager
    let id: UUID
    let bit: Planbit
    @Environment(\.dismiss) private var lukk
    @State private var bredde = ""
    @State private var hoyde = ""

    private var rom: SkannetRom? { lager.rom.first { $0.id == id } }
    private var linje: Plan.Linje? { rom?.plan?.linje(bit) }

    var body: some View {
        NavigationStack {
            Form {
                if let plan = rom?.plan {
                    Section {
                        PlanView(plan: plan, visMal: false, markert: bit)
                            .frame(height: 170)
                            .listRowInsets(EdgeInsets(top: 6, leading: 6, bottom: 6, trailing: 6))
                    }
                }
                Section {
                    felt(bit.erVegg ? "Lengde" : "Bredde", tekst: $bredde, vannrett: true)
                    felt("Høyde", tekst: $hoyde, vannrett: false)
                } header: {
                    Text("Mål i cm")
                } footer: {
                    Text(rom?.avstander?.isEmpty == false
                         ? "Trykk på linjalen for å hente et mål du har tatt i 3D. Veggarealet regnes på nytt når du lagrer."
                         : "Veggarealet regnes på nytt når du lagrer. Du kan også måle i 3D-modellen først og hente målet her.")
                }
                if linje?.malt == true, let s = linje?.skannet, s.count == 2 {
                    Section {
                        Button("Bruk skannet mål (\(cm(s[0])) × \(cm(s[1])) cm)") { lagre(s[0], s[1], malt: false) }
                    }
                }
            }
            .navigationTitle(bit.navn)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { lukk() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Lagre") {
                        if let b = tall(bredde), let h = tall(hoyde) { lagre(b / 100, h / 100, malt: true) }
                    }
                    .disabled(tall(bredde) == nil || tall(hoyde) == nil)
                }
            }
            .onAppear {
                bredde = linje?.bredde.map(cm) ?? ""
                hoyde = linje?.hoyde.map(cm) ?? ""
            }
        }
    }

    private func felt(_ navn: String, tekst: Binding<String>, vannrett: Bool) -> some View {
        HStack {
            Text(navn)
            TextField("cm", text: tekst)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.trailing)
            let mal = rom?.avstander ?? []
            if !mal.isEmpty {
                Menu {
                    ForEach(mal) { a in
                        Button("\(a.navn): \(Avstand.lengde(del(a, vannrett)))") { tekst.wrappedValue = cm(Double(del(a, vannrett))) }
                    }
                } label: {
                    Image(systemName: "ruler")
                }
                .accessibilityLabel("Hent mål fra 3D")
            }
        }
    }

    /// Bredde bruker den vannrette delen av målet, høyde den loddrette, når målet er tatt
    /// omtrent rett bortover eller rett opp. Ellers hele avstanden.
    private func del(_ a: Avstand, _ vannrett: Bool) -> Float {
        let d = vannrett ? a.vannrett : a.loddrett
        return d > 0.8 * a.meter ? d : a.meter
    }

    private func cm(_ m: Double) -> String { "\(Int((m * 100).rounded()))" }

    private func tall(_ s: String) -> Double? {
        guard let v = Double(s.replacingOccurrences(of: ",", with: ".").trimmingCharacters(in: .whitespaces)), v > 0, v < 5000 else { return nil }
        return v
    }

    private func lagre(_ b: Double, _ h: Double, malt: Bool) {
        guard let i = lager.rom.firstIndex(where: { $0.id == id }) else { return }
        var r = lager.rom[i]
        guard var p = r.plan, var l = p.linje(bit) else { return }
        if l.skannet == nil, let b0 = l.bredde, let h0 = l.hoyde { l.skannet = [b0, h0] }
        l.bredde = b
        l.hoyde = h
        l.malt = malt ? true : nil
        p.sett(bit, l)
        r.plan = p
        Maling.regnOm(&r)
        lager.rom[i] = r
        lukk()
    }
}
