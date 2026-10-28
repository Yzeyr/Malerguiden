import SwiftUI
import RoomPlan
import UIKit

@main
struct RomskannerApp: App {
    var body: some Scene {
        WindowGroup { ContentView() }
    }
}

struct ContentView: View {
    @StateObject private var lager = RomLager()
    @State private var skanner = false
    @State private var ventende: SkannetRom?
    @State private var navn = ""
    @State private var sporNavn = false
    @State private var kopiert = false
    @State private var endres: SkannetRom?

    private let stottet = RoomCaptureSession.isSupported

    var body: some View {
        NavigationStack {
            List {
                if !stottet {
                    Section {
                        Label("Denne telefonen har ikke LiDAR. Romskanner krever iPhone eller iPad Pro (12 Pro eller nyere).", systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.secondary)
                    }
                }
                if lager.rom.isEmpty {
                    Section {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Slik skanner du").font(.headline)
                            Text("Trykk «Skann rom», stå i døråpningen og gå rolig langs veggene. Pek kameraet mot hjørnene og taket. Trykk «Ferdig med rommet» når alle veggene er farget inn.")
                                .foregroundStyle(.secondary)
                        }
                        .padding(.vertical, 4)
                    }
                } else {
                    Section {
                        ForEach(lager.rom) { rom in
                            RomRad(rom: rom)
                                .contentShape(Rectangle())
                                .onTapGesture { endres = rom; navn = rom.navn }
                        }
                        .onDelete { lager.rom.remove(atOffsets: $0) }
                    } header: {
                        Text("Skannede rom")
                    } footer: {
                        Text("Sveip til venstre for å slette. Trykk for å endre navn.")
                    }
                }
            }
            .navigationTitle("Romskanner")
            .toolbar {
                if !lager.rom.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        ShareLink(item: lager.fil()) { Image(systemName: "square.and.arrow.up") }
                    }
                }
            }
            .safeAreaInset(edge: .bottom) {
                VStack(spacing: 10) {
                    if !lager.rom.isEmpty {
                        Button {
                            UIPasteboard.general.string = Eksport(rom: lager.rom).json()
                            kopiert = true
                        } label: {
                            Label("Kopier til Malerguiden", systemImage: "doc.on.doc").frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                    }
                    Button { skanner = true } label: {
                        Label("Skann rom", systemImage: "camera.viewfinder").frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.73, green: 0.28, blue: 0.16))
                    .controlSize(.large)
                    .disabled(!stottet)
                }
                .padding()
                .background(.bar)
            }
            .fullScreenCover(isPresented: $skanner) {
                SkannView { rom in
                    DispatchQueue.main.async {
                        skanner = false
                        guard let rom else { return }
                        ventende = Maling.rom(fra: rom, navn: "")
                        navn = "Rom \(lager.rom.count + 1)"
                        // Vent til skanneskjermen er borte før spørsmålet vises.
                        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { sporNavn = true }
                    }
                }
                .ignoresSafeArea()
            }
            .alert("Hva heter rommet?", isPresented: $sporNavn) {
                TextField("Navn", text: $navn)
                Button("Lagre") {
                    if var r = ventende {
                        r.navn = navn.trimmingCharacters(in: .whitespaces).isEmpty ? "Rom" : navn
                        lager.rom.append(r)
                    }
                    ventende = nil
                }
                Button("Forkast", role: .cancel) { ventende = nil }
            }
            .alert("Endre navn", isPresented: Binding(get: { endres != nil }, set: { if !$0 { endres = nil } })) {
                TextField("Navn", text: $navn)
                Button("Lagre") {
                    if let e = endres, let i = lager.rom.firstIndex(where: { $0.id == e.id }) {
                        lager.rom[i].navn = navn.isEmpty ? e.navn : navn
                    }
                    endres = nil
                }
                Button("Avbryt", role: .cancel) { endres = nil }
            }
            .alert("Kopiert", isPresented: $kopiert) {
                Button("OK") {}
            } message: {
                Text("Åpne Malerguiden, gå til jobben → Mål → Importer skanning, og trykk «Lim inn».")
            }
        }
    }
}

struct RomRad: View {
    let rom: SkannetRom

    private func m(_ v: Double, _ d: Int = 1) -> String { v.formatted(.number.precision(.fractionLength(d))) }

    var body: some View {
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
