import SwiftUI
import RoomPlan
import UIKit

@main
struct RomskannerApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

/// Hvor man kan gå i appen: et prosjekt (nil = rommene uten prosjekt) eller ett rom.
enum Rute: Hashable {
    case prosjekt(UUID?)
    case rom(UUID)
}

/// Startskjermen: prosjektene. Rom skannet før prosjektene kom, ligger under «Uten prosjekt».
struct ContentView: View {
    @StateObject private var lager = RomLager()
    @State private var nyttNavn = ""
    @State private var lagerNytt = false
    @State private var sti = NavigationPath()
    @State private var endrer: Prosjekt?
    @State private var endreNavn = ""
    @State private var sletter: Prosjekt?

    private let stottet = RoomCaptureSession.isSupported

    var body: some View {
        NavigationStack(path: $sti) {
            List {
                if !stottet {
                    Section {
                        Label("Denne telefonen har ikke LiDAR. Romskanner krever iPhone eller iPad Pro (12 Pro eller nyere).", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.secondary)
                    }
                }
                if lager.prosjekter.isEmpty && lager.rom.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Lag et prosjekt").font(.headline)
                            Text("Et prosjekt samler rommene til én kunde eller én bolig. Trykk «Nytt prosjekt», og skann rommene inne i prosjektet.")
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                }
                if !lager.prosjekter.isEmpty {
                    Section("Prosjekter") {
                        ForEach(lager.prosjekter.sorted { $0.dato > $1.dato }) { p in
                            NavigationLink(value: Rute.prosjekt(p.id)) { ProsjektRad(navn: p.navn, rom: lager.rom(i: p.id)) }
                                .contextMenu {
                                    Button { endreNavn = p.navn; endrer = p } label: { Label("Endre navn", systemImage: "pencil") }
                                    Button(role: .destructive) { sletter = p } label: { Label("Slett prosjektet", systemImage: "trash") }
                                }
                                .swipeActions {
                                    Button(role: .destructive) { sletter = p } label: { Label("Slett", systemImage: "trash") }
                                }
                        }
                    }
                }
                if !lager.rom(i: nil).isEmpty {
                    Section {
                        NavigationLink(value: Rute.prosjekt(nil)) { ProsjektRad(navn: "Uten prosjekt", rom: lager.rom(i: nil)) }
                    } footer: {
                        Text("Rom skannet før appen fikk prosjekter. Åpne og hold inne på et rom for å flytte det til et prosjekt.")
                    }
                }
            }
            .navigationTitle("Romskanner")
            .navigationDestination(for: Rute.self) { rute in
                switch rute {
                case .prosjekt(let id): ProsjektView(lager: lager, prosjektId: id)
                case .rom(let id): RomDetalj(lager: lager, id: id)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { nyttNavn = ""; lagerNytt = true } label: {
                    Label("Nytt prosjekt", systemImage: "folder.badge.plus").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                .controlSize(.large)
                .padding()
                .background(.bar)
            }
            .alert("Nytt prosjekt", isPresented: $lagerNytt) {
                TextField("F.eks. Hansen, Storgata 5", text: $nyttNavn)
                Button("Lag") {
                    let navn = nyttNavn.trimmingCharacters(in: .whitespaces)
                    let p = Prosjekt(navn: navn.isEmpty ? "Prosjekt \(lager.prosjekter.count + 1)" : navn)
                    lager.prosjekter.append(p)
                    sti.append(Rute.prosjekt(p.id))
                }
                Button("Avbryt", role: .cancel) {}
            }
            .alert("Endre navn", isPresented: Binding(get: { endrer != nil }, set: { if !$0 { endrer = nil } })) {
                TextField("Navn", text: $endreNavn)
                Button("Lagre") {
                    let navn = endreNavn.trimmingCharacters(in: .whitespaces)
                    if let p = endrer, !navn.isEmpty, let i = lager.prosjekter.firstIndex(where: { $0.id == p.id }) {
                        lager.prosjekter[i].navn = navn
                    }
                    endrer = nil
                }
                Button("Avbryt", role: .cancel) { endrer = nil }
            }
            .confirmationDialog("Slette prosjektet?", isPresented: Binding(get: { sletter != nil }, set: { if !$0 { sletter = nil } }), titleVisibility: .visible) {
                Button("Slett prosjektet og rommene", role: .destructive) {
                    if let p = sletter { lager.slett(prosjekt: p.id) }
                    sletter = nil
                }
                Button("Avbryt", role: .cancel) { sletter = nil }
            } message: {
                Text("\(sletter?.navn ?? ""): \(lager.rom(i: sletter?.id).count) rom med plantegninger og 3D-modeller blir borte.")
            }
        }
    }
}

struct ProsjektRad: View {
    let navn: String
    let rom: [SkannetRom]

    var body: some View {
        let gulv = rom.reduce(0.0) { $0 + $1.gulv }
        VStack(alignment: .leading, spacing: 4) {
            Text(navn).font(.headline)
            Text(rom.isEmpty ? "Ingen rom ennå" : "\(rom.count) rom · \(gulv.formatted(.number.precision(.fractionLength(1)))) m² gulv")
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}

/// Ett prosjekt: rommene, skanning av nye rom, og kopiering av alle eller bare noen av dem.
struct ProsjektView: View {
    @ObservedObject var lager: RomLager
    let prosjektId: UUID?

    @State private var skanner = false
    @State private var ventende: SkannetRom?
    @State private var navn = ""
    @State private var sporNavn = false
    @State private var kopiert = 0
    @State private var velger = false
    @State private var valgte = Set<UUID>()

    private let stottet = RoomCaptureSession.isSupported
    private var rommene: [SkannetRom] { lager.rom(i: prosjektId) }
    private var tittel: String { lager.navn(på: prosjektId) }
    private var prosjektNavn: String? { prosjektId == nil ? nil : tittel }
    /// Det som kopieres eller deles: de valgte, eller alle når ingen er valgt.
    private var utvalg: [SkannetRom] { velger && !valgte.isEmpty ? rommene.filter { valgte.contains($0.id) } : rommene }

    var body: some View {
        List(selection: $valgte) {
            if rommene.isEmpty {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Slik skanner du").font(.headline)
                        Text("Lukk dørene til andre rom. Trykk «Skann rom», stå i døråpningen og gå rolig langs veggene. Pek kameraet mot hjørnene og taket, ikke gjennom åpne dører. Trykk «Ferdig med rommet» når alle veggene er farget inn.")
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                }
            } else {
                Section {
                    ForEach(rommene) { rom in
                        NavigationLink(value: Rute.rom(rom.id)) { RomRad(rom: rom) }
                            .tag(rom.id)
                            .contextMenu {
                                if lager.prosjekter.contains(where: { $0.id != prosjektId }) {
                                    Menu {
                                        ForEach(lager.prosjekter.filter { $0.id != prosjektId }) { p in
                                            Button(p.navn) { lager.flytt([rom.id], til: p.id) }
                                        }
                                    } label: { Label("Flytt til prosjekt", systemImage: "folder") }
                                }
                                Button(role: .destructive) { lager.slett(rom: [rom.id]) } label: { Label("Slett rommet", systemImage: "trash") }
                            }
                    }
                    .onDelete { indekser in lager.slett(rom: Set(indekser.map { rommene[$0].id })) }
                } header: {
                    Text(velger ? "Velg rommene som skal kopieres" : "Rom")
                } footer: {
                    Text(velger ? "Ingen valgt: alle kopieres." : "Trykk på et rom for plantegningen. Hold inne for å flytte eller slette.")
                }
            }
        }
        .environment(\.editMode, .constant(velger ? .active : .inactive))
        .navigationTitle(tittel)
        .toolbar {
            if !rommene.isEmpty {
                ToolbarItem(placement: .topBarTrailing) {
                    Button(velger ? "Ferdig" : "Velg") {
                        velger.toggle()
                        if !velger { valgte = [] }
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    ShareLink(item: lager.fil(utvalg, prosjekt: prosjektNavn)) { Image(systemName: "square.and.arrow.up") }
                }
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(spacing: 10) {
                if !rommene.isEmpty {
                    Button {
                        UIPasteboard.general.string = Eksport(rom: utvalg, prosjekt: prosjektNavn).json()
                        kopiert = utvalg.count
                    } label: {
                        Label(utvalg.count == rommene.count ? "Kopier alle \(rommene.count) til Malerguiden" : "Kopier \(utvalg.count) valgte til Malerguiden", systemImage: "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                if !velger {
                    Button { skanner = true } label: {
                        Label("Skann rom", systemImage: "camera.viewfinder").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                    .controlSize(.large)
                    .disabled(!stottet)
                }
            }
            .padding()
            .background(.bar)
        }
        .fullScreenCover(isPresented: $skanner) {
            SkannView { rom, bilder in
                DispatchQueue.main.async {
                    skanner = false
                    guard let rom else { return }
                    var nytt = Maling.rom(fra: rom, navn: "")
                    nytt.prosjekt = prosjektId
                    Modell.lagre(rom, id: nytt.id)
                    lager.lagFotomodell(rom, bilder: bilder, id: nytt.id)
                    ventende = nytt
                    navn = "Rom \(rommene.count + 1)"
                    // Vent til skanneskjermen er borte før spørsmålet vises.
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { sporNavn = true }
                }
            }
            .ignoresSafeArea()
        }
        .alert("Hva heter rommet?", isPresented: $sporNavn, presenting: ventende) { _ in
            TextField("Navn", text: $navn)
            Button("Lagre") {
                if var r = ventende {
                    r.navn = navn.trimmingCharacters(in: .whitespaces).isEmpty ? "Rom" : navn
                    lager.rom.append(r)
                }
                ventende = nil
            }
            Button("Forkast", role: .cancel) {
                if let v = ventende { Modell.slett(v.id) }
                ventende = nil
            }
        } message: { r in
            Text(ContentView.melding(r))
        }
        .alert("Kopiert", isPresented: Binding(get: { kopiert > 0 }, set: { if !$0 { kopiert = 0 } })) {
            Button("OK") { kopiert = 0 }
        } message: {
            Text("\(kopiert) rom er kopiert. Åpne Malerguiden, gå til jobben → Mål → Skanning, og trykk «Lim inn».")
        }
    }
}

extension ContentView {
    /// Kort beskjed etter skanningen: hva som ble tatt ut, eller gulvarealet.
    static func melding(_ r: SkannetRom) -> String {
        var deler: [String] = []
        if let n = r.utenforVegger, n > 0 { deler.append(n == 1 ? "1 vegg utenfor rommet er tatt ut." : "\(n) vegger utenfor rommet er tatt ut.") }
        if let n = r.apneDorer, n > 0 { deler.append(n == 1 ? "1 dør sto åpen." : "\(n) dører sto åpne.") }
        if deler.isEmpty { return r.gulv.formatted(.number.precision(.fractionLength(1))) + " m² gulv" }
        return deler.joined(separator: " ")
    }
}

struct RomRad: View {
    let rom: SkannetRom

    private func m(_ v: Double, _ d: Int = 1) -> String { v.formatted(.number.precision(.fractionLength(d))) }

    var body: some View {
        HStack(spacing: 12) {
            if let plan = rom.plan, !plan.vegger.isEmpty {
                PlanView(plan: plan, visMal: false)
                    .frame(width: 56, height: 56)
                    .background(Color(uiColor: .secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
            }
            tekst
        }
    }

    private var tekst: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(rom.navn).font(.headline)
            Text("\(m(rom.gulv)) m² gulv · \(m(rom.omkrets)) m omkrets · \(m(rom.takhoyde, 2)) m høyde")
                .font(.subheadline).foregroundStyle(.secondary)
            Text("Vegg \(m(rom.veggNetto)) m² · \(rom.vinduer) vinduer · \(rom.dorer) dører" + (rom.apninger > 0 ? " · \(rom.apninger) åpninger" : ""))
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
