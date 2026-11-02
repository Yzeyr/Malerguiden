import SwiftUI
import RoomPlan
import UIKit

@main
struct RomskannerApp: App {
    var body: some Scene {
        WindowGroup { RotView() }
    }
}

/// Appen er Malerguiden: nettappen fyller skjermen, og skanneren, romvelgeren og
/// prøvemalingen åpnes oppå den når nettsiden ber om det.
struct RotView: View {
    @StateObject private var lager = RomLager()
    @StateObject private var tingLager = TingLager()
    @StateObject private var web = WebKobling()
    @State private var fargeModell: VistModell?

    var body: some View {
        MalerguidenWebView(kobling: web)
            .ignoresSafeArea()
            .background(Color(red: 0.96, green: 0.94, blue: 0.90).ignoresSafeArea())
            .onAppear { web.lager = lager }
            .onOpenURL { web.apne($0) }
            .sheet(isPresented: Binding(get: { web.visRomVelger }, set: { if !$0 { web.romValgt(nil) } })) {
                RomVelger(lager: lager, tingLager: tingLager, jobb: web.romJobb) { web.romValgt($0) }
            }
            // Skann rom rett inn i en jobb: jobbens prosjekt, og rommet går tilbake til jobben når det er lagret
            .fullScreenCover(item: Binding(get: { web.skannForJobb }, set: { if $0 == nil { web.skannFerdig(nil) } })) { j in
                NavigationStack {
                    ProsjektView(lager: lager, prosjektId: j.prosjekt, tilJobb: { rom in
                        web.skannFerdig(rom.isEmpty ? nil : Eksport(rom: rom).json())
                    }, startSkann: true)
                    .toolbar {
                        ToolbarItem(placement: .topBarLeading) {
                            Button { web.skannFerdig(nil) } label: { Label("Jobben", systemImage: "chevron.backward") }
                        }
                    }
                    .navigationDestination(for: Rute.self) { rute in
                        if case .rom(let id) = rute { RomDetalj(lager: lager, id: id) }
                    }
                }
            }
            // Et rom fra jobben, åpnet i skanneren
            .fullScreenCover(item: Binding(get: { web.apentRom }, set: { if $0 == nil { web.romLukket() } })) { r in
                NavigationStack {
                    RomDetalj(lager: lager, id: r.id)
                        .toolbar {
                            ToolbarItem(placement: .topBarLeading) {
                                Button { web.romLukket() } label: { Label("Jobben", systemImage: "chevron.backward") }
                            }
                        }
                }
            }
            // Et rom fra jobben, i 3D. Mål som tas, lagres på rommet.
            .fullScreenCover(item: $web.modell3D) { v in
                ModellVisning(modell: v) { nye in
                    guard let kilde = v.kilde, let id = web.modell3DRom, let i = lager.rom.firstIndex(where: { $0.id == id }) else { return }
                    lager.rom[i].avstander = (lager.rom[i].avstander ?? []).filter { $0.kilde != kilde } + nye
                }
            }
            .fullScreenCover(isPresented: $web.visSkanner) {
                ContentView(lager: lager, tingLager: tingLager) { web.visSkanner = false }
            }
            .fullScreenCover(item: $web.proveFarger) { p in
                ProveMalView(farger: p.farger, rom: lager.rom.filter { Modell.finnes($0.id) }, vis3D: { r in
                    // Lukk kameraet først, så åpnes rommet i 3D med de samme fargene
                    web.proveFarger = nil
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { fargeModell = TredjeVisning.modell(for: r, farger: p.farger) }
                }) { web.proveFarger = nil }
            }
            .fullScreenCover(item: $fargeModell) { ModellVisning(modell: $0) }
    }
}

/// Velg skannede rom som skal inn i Malerguiden, eller skann nye først.
struct RomVelger: View {
    @ObservedObject var lager: RomLager
    @ObservedObject var tingLager: TingLager
    /// Jobben rommene skal inn i. Prosjektet som hører til den, vises først.
    var jobb: JobbRef? = nil
    let ferdig: (String?) -> Void
    @State private var valgte = Set<UUID>()
    @State private var skanner = false

    private var grupper: [(navn: String, rom: [SkannetRom])] {
        let denne = jobb?.id
        let prosjekter = lager.prosjekter
            .sorted { ($0.jobb == denne && denne != nil ? 1 : 0, $0.dato) > ($1.jobb == denne && denne != nil ? 1 : 0, $1.dato) }
            .map { (navn: $0.jobb == denne && denne != nil ? "Denne jobben" : $0.navn, rom: lager.rom(i: $0.id)) }
        return (prosjekter + [(navn: "Uten prosjekt", rom: lager.rom(i: nil))]).filter { !$0.rom.isEmpty }
    }

    var body: some View {
        NavigationStack {
            List(selection: $valgte) {
                if grupper.isEmpty {
                    Section {
                        Text("Ingen rom er skannet ennå. Trykk «Åpne skanneren», lag et prosjekt og skann rommene.")
                            .foregroundStyle(.secondary)
                    }
                }
                ForEach(grupper, id: \.navn) { g in
                    Section(g.navn) {
                        ForEach(g.rom) { rom in RomRad(rom: rom).tag(rom.id) }
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .navigationTitle("Velg rom")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Avbryt") { ferdig(nil) } }
                ToolbarItem(placement: .confirmationAction) {
                    Button(valgte.isEmpty ? "Legg inn" : "Legg inn \(valgte.count)") {
                        let utvalg = lager.rom.filter { valgte.contains($0.id) }
                        if let jobb { lager.koble(valgte, tilJobb: jobb.id, navn: jobb.navn) }
                        ferdig(Eksport(rom: utvalg).json())
                    }
                    .disabled(valgte.isEmpty)
                }
            }
            .safeAreaInset(edge: .bottom) {
                Button { skanner = true } label: {
                    Label("Åpne skanneren", systemImage: "camera.viewfinder").frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                .controlSize(.large)
                .padding()
                .background(.bar)
            }
            .fullScreenCover(isPresented: $skanner) {
                ContentView(lager: lager, tingLager: tingLager) { skanner = false }
            }
        }
    }
}

/// Hvor man kan gå i appen: et prosjekt (nil = rommene uten prosjekt) eller ett rom.
enum Rute: Hashable {
    case prosjekt(UUID?)
    case rom(UUID)
    case ting(UUID)
}

/// Startskjermen: prosjektene. Rom skannet før prosjektene kom, ligger under «Uten prosjekt».
struct ContentView: View {
    @ObservedObject var lager: RomLager
    @ObservedObject var tingLager: TingLager
    /// Lukker skanneren og går tilbake til Malerguiden.
    var lukk: (() -> Void)? = nil
    @State private var skannerTing = false
    @State private var nyTing = UUID()
    @State private var ventendeTing: UUID?
    @State private var tingNavn = ""
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
                            NavigationLink(value: Rute.prosjekt(p.id)) { ProsjektRad(navn: p.navn, rom: lager.rom(i: p.id), jobb: p.jobb != nil) }
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
                if !tingLager.ting.isEmpty {
                    Section {
                        ForEach(tingLager.ting.sorted { $0.dato > $1.dato }) { t in
                            NavigationLink(value: Rute.ting(t.id)) { TingRad(ting: t, fremdrift: tingLager.fremdrift[t.id]) }
                                .swipeActions {
                                    Button(role: .destructive) { tingLager.slett(t.id) } label: { Label("Slett", systemImage: "trash") }
                                }
                        }
                    } header: {
                        Text("Ting")
                    } footer: {
                        Text("Møbler og gjenstander skannet til 3D-modeller, med mål og overflate.")
                    }
                }
                if !lager.rom(i: nil).isEmpty {
                    Section {
                        NavigationLink(value: Rute.prosjekt(nil)) { ProsjektRad(navn: "Uten prosjekt", rom: lager.rom(i: nil)) }
                    } footer: {
                        Text("Rom som ikke hører til et prosjekt. Åpne og hold inne på et rom for å flytte det til et prosjekt.")
                    }
                }
            }
            .navigationTitle("Skanner")
            .toolbar {
                if let lukk {
                    ToolbarItem(placement: .topBarLeading) {
                        Button { lukk() } label: { Label("Malerguiden", systemImage: "chevron.backward") }
                    }
                }
            }
            .navigationDestination(for: Rute.self) { rute in
                switch rute {
                case .prosjekt(let id): ProsjektView(lager: lager, prosjektId: id)
                case .rom(let id): RomDetalj(lager: lager, id: id)
                case .ting(let id): TingDetalj(lager: tingLager, id: id, prosjekter: lager.prosjekter)
                }
            }
            .safeAreaInset(edge: .bottom) {
                HStack(spacing: 10) {
                    Button { nyttNavn = ""; lagerNytt = true } label: {
                        Label("Nytt prosjekt", systemImage: "folder.badge.plus").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                    Button { nyTing = UUID(); skannerTing = true } label: {
                        Label("Skann ting", systemImage: "cube.transparent").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(!TingSkannView.stottet)
                }
                .controlSize(.large)
                .padding()
                .background(.bar)
            }
            .fullScreenCover(isPresented: $skannerTing) {
                TingSkannView(bilder: TingFiler.bilder(nyTing), sjekkpunkt: TingFiler.sjekkpunkt(nyTing)) { ok in
                    DispatchQueue.main.async {
                        skannerTing = false
                        guard ok else { TingFiler.slett(nyTing); return }
                        // Lagres med en gang, så tingen ikke blir borte om appen lukkes mens navnet spørres om
                        let t = SkannetTing(id: nyTing, navn: "Ting \(tingLager.ting.count + 1)", status: "bygger")
                        tingLager.ting.append(t)
                        tingLager.bygg(t.id)
                        tingNavn = t.navn
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { ventendeTing = t.id }
                    }
                }
            }
            .alert("Hva er det du skannet?", isPresented: Binding(get: { ventendeTing != nil }, set: { if !$0 { ventendeTing = nil } })) {
                TextField("F.eks. Kommode", text: $tingNavn)
                Button("Lagre") {
                    let n = tingNavn.trimmingCharacters(in: .whitespaces)
                    if let id = ventendeTing, !n.isEmpty, let i = tingLager.ting.firstIndex(where: { $0.id == id }) { tingLager.ting[i].navn = n }
                    ventendeTing = nil
                }
            } message: {
                Text("Modellen lages nå på telefonen. Det tar noen minutter. Hold appen åpen.")
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
    /// Prosjektet hører til en jobb i Malerguiden.
    var jobb = false

    var body: some View {
        let gulv = rom.reduce(0.0) { $0 + $1.gulv }
        VStack(alignment: .leading, spacing: 4) {
            Text(navn).font(.headline)
            if jobb {
                Label("Jobb i Malerguiden", systemImage: "link").font(.caption.weight(.medium)).foregroundStyle(.orange)
            }
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
    /// Åpnet fra en jobb: rommene som er skannet (eller valgt) går rett tilbake til jobben.
    var tilJobb: (([SkannetRom]) -> Void)? = nil
    /// Spør om skannemåte med en gang.
    var startSkann = false

    @State private var skanner = false
    @State private var skannerEtasje = false
    @State private var etasjeOkt = UUID()
    @State private var ventende: SkannetRom?
    @State private var navn = ""
    @State private var sporNavn = false
    @State private var kopiert = 0
    @State private var velger = false
    @State private var valgte = Set<UUID>()
    @State private var velgModus = false
    @State private var modus: Skannemodus = .noyaktig
    /// Rommet som får en runde til med ekte 3D (modus «ekte 3D»)
    @State private var ekte3D: SkannetRom?
    @State private var startet = false

    private let stottet = RoomCaptureSession.isSupported
    private var rommene: [SkannetRom] { lager.rom(i: prosjektId) }
    private var tittel: String { lager.navn(på: prosjektId) }
    private var prosjektNavn: String? { prosjektId == nil ? nil : tittel }
    /// Det som kopieres eller deles: de valgte, eller alle når ingen er valgt.
    private var utvalg: [SkannetRom] { velger && !valgte.isEmpty ? rommene.filter { valgte.contains($0.id) } : rommene }

    /// Etasjeskanninger med minst to rom, nyeste først: rommene tegnes sammen.
    private var etasjer: [[SkannetRom]] {
        let grupper = Dictionary(grouping: rommene.filter { $0.okt != nil }, by: { $0.okt! })
        return grupper.values.filter { $0.count >= 2 }.sorted { ($0.first?.dato ?? .distantPast) > ($1.first?.dato ?? .distantPast) }
    }

    var body: some View {
        skannevalg(liste)
            .onAppear {
                guard startSkann, !startet, stottet else { return }
                startet = true
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) { velgModus = true }
            }
    }

    private var liste: some View {
        List(selection: $valgte) {
            if !velger {
                ForEach(Array(etasjer.enumerated()), id: \.offset) { i, etasje in
                    Section {
                        EtasjePlanView(rom: etasje)
                            .frame(height: 320)
                            .listRowInsets(EdgeInsets(top: 8, leading: 8, bottom: 8, trailing: 8))
                    } header: {
                        Text(etasjer.count > 1 ? "Etasje \(etasjer.count - i)" : "Etasjen")
                    } footer: {
                        Text("\(etasje.count) rom · \(etasje.reduce(0.0) { $0 + $1.gulv }.formatted(.number.precision(.fractionLength(1)))) m² gulv")
                    }
                }
            }
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
                        if let tilJobb { tilJobb(utvalg); return }
                        UIPasteboard.general.string = Eksport(rom: utvalg, prosjekt: prosjektNavn).json()
                        kopiert = utvalg.count
                    } label: {
                        Label(tilJobb != nil
                              ? (utvalg.count == rommene.count ? "Legg alle \(rommene.count) inn i jobben" : "Legg \(utvalg.count) valgte inn i jobben")
                              : (utvalg.count == rommene.count ? "Kopier alle \(rommene.count) til Malerguiden" : "Kopier \(utvalg.count) valgte til Malerguiden"),
                              systemImage: tilJobb != nil ? "arrow.down.doc" : "doc.on.doc")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                }
                if !velger {
                    HStack(spacing: 10) {
                        Button { velgModus = true } label: {
                            Label("Skann rom", systemImage: "camera.viewfinder").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                        Button { etasjeOkt = UUID(); skannerEtasje = true } label: {
                            Label("Skann etasje", systemImage: "square.split.2x2").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                    }
                    .controlSize(.large)
                    .disabled(!stottet)
                }
            }
            .padding()
            .background(.bar)
        }
        .fullScreenCover(isPresented: $skanner) {
            SkannView(medBilder: modus.medBilder) { rom, bilder in
                DispatchQueue.main.async {
                    skanner = false
                    guard let rom else { return }
                    // Lagres med en gang med navnet «Rom N», så rommet ikke blir borte om appen
                    // lukkes mens navnet spørres om. «Forkast» sletter det igjen.
                    var nytt = Maling.rom(fra: rom, navn: "Rom \(rommene.count + 1)")
                    nytt.prosjekt = prosjektId
                    Modell.lagre(rom, id: nytt.id)
                    lager.rom.append(nytt)
                    lager.lagFotomodell(rom, bilder: bilder, id: nytt.id)
                    ventende = nytt
                    navn = nytt.navn
                    // Vent til skanneskjermen er borte før neste skjerm eller spørsmålet vises.
                    let tredje = modus == .ekte3D && Skann3DView.stottet
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) {
                        if tredje { ekte3D = nytt } else { sporNavn = true }
                    }
                }
            }
            .ignoresSafeArea()
        }
        // Etasje: rom for rom i samme økt. Hvert rom lagres med en gang, med navn «Rom N».
        .fullScreenCover(isPresented: $skannerEtasje) {
            SkannView(etasje: true, nyttRom: { rom, bilder in
                DispatchQueue.main.async {
                    var nytt = Maling.rom(fra: rom, navn: "Rom \(rommene.count + 1)")
                    nytt.prosjekt = prosjektId
                    nytt.okt = etasjeOkt
                    Modell.lagre(rom, id: nytt.id)
                    lager.rom.append(nytt)
                    lager.lagFotomodell(rom, bilder: bilder, id: nytt.id)
                }
            }) { _, _ in
                DispatchQueue.main.async {
                    skannerEtasje = false
                    // Fra en jobb: rommene i etasjen går rett inn i jobben
                    let nye = rommene.filter { $0.okt == etasjeOkt }
                    if let tilJobb, !nye.isEmpty { DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { tilJobb(nye) } }
                }
            }
            .ignoresSafeArea()
        }
        .alert("Hva heter rommet?", isPresented: $sporNavn, presenting: ventende) { _ in
            TextField("Navn", text: $navn)
            Button("Lagre") {
                let nyttNavn = navn.trimmingCharacters(in: .whitespaces)
                if let v = ventende, !nyttNavn.isEmpty, let i = lager.rom.firstIndex(where: { $0.id == v.id }) {
                    lager.rom[i].navn = nyttNavn
                }
                // Fra en jobb: rommet går rett inn i jobben
                if let v = ventende, let tilJobb, let r = lager.rom.first(where: { $0.id == v.id }) {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { tilJobb([r]) }
                }
                ventende = nil
            }
            Button("Forkast", role: .destructive) {
                if let v = ventende { lager.slett(rom: [v.id]) }
                ventende = nil
            }
        } message: { r in
            Text(ContentView.melding(r))
        }
        .alert("Kopiert", isPresented: Binding(get: { kopiert > 0 }, set: { if !$0 { kopiert = 0 } })) {
            Button("OK") { kopiert = 0 }
        } message: {
            Text("\(kopiert) rom er kopiert. I Malerguiden: jobben → Mål → Skanning → «Hent fra skanneren» henter rommene direkte.")
        }
    }

    /// Valget av skannemåte, og runde to med ekte 3D. Egen funksjon, så kompilatoren klarer resten.
    private func skannevalg<V: View>(_ v: V) -> some View {
        v
        // Runde to: hele rommet som ekte 3D med farger. Navnet spørres om etterpå.
            .fullScreenCover(item: $ekte3D) { rom in
                Skann3DView { bitene, bilder in
                    DispatchQueue.main.async {
                        ekte3D = nil
                        lager.lagFargemodell(bitene, bilder: bilder, id: rom.id)
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { sporNavn = true }
                    }
                }
                .ignoresSafeArea()
            }
            .confirmationDialog("Hvordan vil du skanne?", isPresented: $velgModus, titleVisibility: .visible) {
                ForEach(Skannemodus.allCases.filter { $0 != .ekte3D || Skann3DView.stottet }) { m in
                    Button(m.tittel) { modus = m; skanner = true }
                }
                Button("Avbryt", role: .cancel) {}
            } message: {
                Text(Skannemodus.allCases.filter { $0 != .ekte3D || Skann3DView.stottet }.map { $0.tittel + ": " + $0.forklaring }.joined(separator: "\n\n"))
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
            Text("Vegg \(m(rom.veggNetto + rom.veggInne)) m² · \(rom.vinduer) vinduer · \(rom.dorer) dører" + (rom.apninger > 0 ? " · \(rom.apninger) åpninger" : ""))
                .font(.subheadline).foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
    }
}
