import SwiftUI
import UIKit

/// Raden for en ting i lista: navn, mål eller hvor langt modellen er kommet.
struct TingRad: View {
    let ting: SkannetTing
    let fremdrift: Double?

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "cube.transparent")
                .font(.title2)
                .foregroundStyle(Color(red: 0.73, green: 0.28, blue: 0.16))
                .frame(width: 44, height: 44)
                .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            VStack(alignment: .leading, spacing: 4) {
                Text(ting.navn).font(.headline)
                if let andel = fremdrift {
                    ProgressView(value: andel) { Text("Lager modellen … \(Int(andel * 100)) %").font(.subheadline).foregroundStyle(.secondary) }
                } else if let status = ting.status {
                    Text(status == "avbrutt" ? "Ikke ferdig. Trykk for å lage modellen." : status).font(.subheadline).foregroundStyle(.orange)
                } else {
                    Text(TingTekst.mal(ting)).font(.subheadline).foregroundStyle(.secondary)
                }
            }
        }
        .padding(.vertical, 2)
    }
}

enum TingTekst {
    static func cm(_ m: Double) -> String { (m * 100).formatted(.number.precision(.fractionLength(0))) }
    static func tall(_ v: Double, _ d: Int = 2) -> String { v.formatted(.number.precision(.fractionLength(d))) }
    static func mal(_ t: SkannetTing) -> String { "\(cm(t.lengde)) × \(cm(t.bredde)) × \(cm(t.hoyde)) cm · \(tall(t.areal)) m² overflate" }

    /// Tekst til utklippstavla, f.eks. til en kunde eller Malerguiden-notatet.
    static func kopi(_ t: SkannetTing) -> String {
        var linjer = ["\(t.navn): \(cm(t.lengde)) × \(cm(t.bredde)) × \(cm(t.hoyde)) cm (L × B × H)",
                      "Overflate: \(tall(t.areal)) m²"]
        if t.volum > 0 { linjer.append("Volum: \(tall(t.volum * 1000, 0)) liter") }
        return linjer.joined(separator: "\n")
    }
}

/// En ting: 3D-modellen, målene, og deling til spill, 3D-programmer og printing.
struct TingDetalj: View {
    @ObservedObject var lager: TingLager
    let id: UUID
    let prosjekter: [Prosjekt]

    @State private var vis: VistModell?
    @State private var objFiler: [URL] = []
    @State private var endrerNavn = false
    @State private var navn = ""
    @State private var kopiert = false
    @Environment(\.dismiss) private var lukk

    private var ting: SkannetTing? { lager.ting.first { $0.id == id } }

    var body: some View {
        if let t = ting {
            List {
                if let andel = lager.fremdrift[id] {
                    Section {
                        ProgressView(value: andel) { Text("Lager 3D-modellen på telefonen … \(Int(andel * 100)) %") }
                        Text("Hold appen åpen. Det tar noen minutter.").font(.footnote).foregroundStyle(.secondary)
                    }
                } else if let status = t.status {
                    Section {
                        Text(status == "avbrutt" ? "Modellen ble ikke ferdig, appen ble lukket." : status).foregroundStyle(.orange)
                        if TingFiler.harBilder(id) {
                            Button { lager.bygg(id) } label: { Label("Lag modellen", systemImage: "cube") }
                        }
                    }
                }
                if t.ferdig {
                    Section {
                        Button { vis = VistModell(url: TingFiler.modell(id), tittel: t.navn) } label: {
                            Label("Vis i 3D", systemImage: "rotate.3d")
                        }
                    }
                    Section("Mål") {
                        rad("Lengde", TingTekst.cm(t.lengde) + " cm")
                        rad("Bredde", TingTekst.cm(t.bredde) + " cm")
                        rad("Høyde", TingTekst.cm(t.hoyde) + " cm")
                        rad("Overflate", TingTekst.tall(t.areal) + " m²")
                        if t.volum > 0 { rad("Volum", TingTekst.tall(t.volum * 1000, 0) + " liter") }
                        Button { UIPasteboard.general.string = TingTekst.kopi(t); kopiert = true } label: { Label("Kopier målene", systemImage: "doc.on.doc") }
                    }
                    Section {
                        ShareLink(item: TingFiler.delbarUSDZ(t)) { Label("Del som USDZ", systemImage: "square.and.arrow.up") }
                        if !objFiler.isEmpty {
                            ShareLink(items: objFiler) { Label("Del som OBJ (\(objFiler.count) filer)", systemImage: "square.and.arrow.up.on.square") }
                        } else {
                            Button { objFiler = TingFiler.eksporterOBJ(t) } label: { Label("Lag OBJ-filer", systemImage: "shippingbox") }
                        }
                    } header: {
                        Text("Til spill og 3D-programmer")
                    } footer: {
                        Text("USDZ åpnes rett i Blender (Fil → Importer → USD), Unity og Unreal, og i AR på iPhone og Mac. OBJ går inn nesten overalt, også Roblox og programmer for 3D-printing. Modellen har \(t.trekanter.formatted()) trekanter, en størrelse som passer i spill. Målene er i meter.")
                    }
                }
                Section {
                    Button { navn = t.navn; endrerNavn = true } label: { Label("Endre navn", systemImage: "pencil") }
                    if !prosjekter.isEmpty {
                        Menu {
                            Button("Uten prosjekt") { flytt(nil) }
                            ForEach(prosjekter) { p in Button(p.navn) { flytt(p.id) } }
                        } label: { Label(prosjekter.first { $0.id == t.prosjekt }.map { "Prosjekt: " + $0.navn } ?? "Legg til et prosjekt", systemImage: "folder") }
                    }
                    Button(role: .destructive) { lager.slett(id); lukk() } label: { Label("Slett tingen", systemImage: "trash") }
                }
            }
            .navigationTitle(t.navn)
            .fullScreenCover(item: $vis) { ModellVisning(modell: $0) }
            .alert("Navn", isPresented: $endrerNavn) {
                TextField("Navn", text: $navn)
                Button("Lagre") {
                    let n = navn.trimmingCharacters(in: .whitespaces)
                    if !n.isEmpty, let i = lager.ting.firstIndex(where: { $0.id == id }) { lager.ting[i].navn = n; objFiler = [] }
                }
                Button("Avbryt", role: .cancel) {}
            }
            .alert("Kopiert", isPresented: $kopiert) { Button("OK") {} } message: { Text(TingTekst.kopi(t)) }
        } else {
            Text("Tingen finnes ikke lenger.").foregroundStyle(.secondary)
        }
    }

    private func rad(_ navn: String, _ verdi: String) -> some View {
        HStack { Text(navn); Spacer(); Text(verdi).foregroundStyle(.secondary).monospacedDigit() }
    }

    private func flytt(_ prosjekt: UUID?) {
        if let i = lager.ting.firstIndex(where: { $0.id == id }) { lager.ting[i].prosjekt = prosjekt }
    }
}
