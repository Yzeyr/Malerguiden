import WidgetKit
import SwiftUI

/// Jobbene på låseskjermen (og hjemskjermen): de aktive jobbene mellom 06:45 og 15:00,
/// med klokka som går, neste steg og det du må huske å ta med. Trykk åpner jobben.
@main
struct LaaseskjermPakke: WidgetBundle {
    var body: some Widget { Jobbwidget() }
}

struct Jobbwidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "jobber", provider: Leverandor()) { innslag in
            Jobbvisning(innslag: innslag)
        }
        .configurationDisplayName("Dagens jobber")
        .description("De aktive jobbene i arbeidstiden, med klokka og det du må ta med.")
        .supportedFamilies([.accessoryRectangular, .accessoryInline, .systemSmall, .systemMedium])
    }
}

struct Innslag: TimelineEntry {
    let date: Date
    let jobber: [Tavlejobb]
    /// Innenfor arbeidstiden (eller en forhåndsvisning).
    let synlig: Bool
    /// Fant ikke jobbene: appen er ikke åpnet ennå, eller den delte mappen virker ikke.
    let mangler: Bool
}

struct Leverandor: TimelineProvider {
    static let eksempel = Tavlejobb(id: "", navn: "Hansen – stue", adresse: "Storgata 5", neste: "Sparkle 2. strøk",
                                    husk: ["Sparkel", "Slipepapir 120"], klokke: nil, tork: nil, torkTekst: "")

    func placeholder(in context: Context) -> Innslag {
        Innslag(date: .now, jobber: [Self.eksempel], synlig: true, mangler: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (Innslag) -> Void) {
        if context.isPreview && (Delt.les()?.jobber.isEmpty ?? true) { completion(placeholder(in: context)); return }
        let t = Delt.les()
        completion(Innslag(date: .now, jobber: t?.jobber ?? [], synlig: true, mangler: t == nil))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<Innslag>) -> Void) {
        let t = Delt.les()
        let fra = t?.fra ?? 405, til = t?.til ?? 900
        let kal = Calendar.current
        let naa = Date()
        // Nytt innslag når arbeidstiden starter og slutter, i dag og de neste to dagene
        var tider = [naa]
        for d in 0...2 {
            guard let dag = kal.date(byAdding: .day, value: d, to: kal.startOfDay(for: naa)) else { continue }
            for m in [fra, til] {
                if let tid = kal.date(byAdding: .minute, value: m, to: dag), tid > naa { tider.append(tid) }
            }
        }
        let innslag = tider.sorted().map { tid -> Innslag in
            let min = kal.component(.hour, from: tid) * 60 + kal.component(.minute, from: tid)
            return Innslag(date: tid, jobber: t?.jobber ?? [], synlig: min >= fra && min < til, mangler: t == nil)
        }
        completion(Timeline(entries: innslag, policy: .atEnd))
    }
}

struct Jobbvisning: View {
    let innslag: Innslag
    @Environment(\.widgetFamily) private var familie

    private var jobber: [Tavlejobb] { innslag.synlig ? innslag.jobber : [] }

    var body: some View {
        innhold
            .widgetURL(jobber.first.flatMap { URL(string: "malerguiden://jobb/" + ($0.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? "")) }
                       ?? URL(string: "malerguiden://jobber"))
            .containerBackground(for: .widget) { Color(red: 0.96, green: 0.94, blue: 0.90) }
    }

    @ViewBuilder private var innhold: some View {
        switch familie {
        case .accessoryInline: inline
        case .accessoryRectangular: rektangel
        case .systemMedium: liste(3)
        default: liste(2)
        }
    }

    // Låseskjermen, én linje over klokka
    @ViewBuilder private var inline: some View {
        if let j = jobber.first {
            if let start = j.klokke { Text(Date(timeIntervalSince1970: start / 1000), style: .timer) + Text(" · " + j.navn) }
            else { Text(j.navn + (j.husk.isEmpty ? "" : " · Husk: " + j.husk.joined(separator: ", "))) }
        } else {
            Text(innslag.mangler && innslag.synlig ? "Åpne Malerguiden" : "")
        }
    }

    // Låseskjermen, boksen under klokka
    @ViewBuilder private var rektangel: some View {
        if let j = jobber.first {
            VStack(alignment: .leading, spacing: 1) {
                HStack(spacing: 4) {
                    Text(j.navn).font(.headline).lineLimit(1)
                    if jobber.count > 1 { Text("+\(jobber.count - 1)").font(.caption2.weight(.bold)) }
                }
                linje2(j).font(.caption).lineLimit(1)
                if !j.husk.isEmpty {
                    Text("Husk: " + j.husk.joined(separator: ", ")).font(.caption).lineLimit(1)
                } else if !j.adresse.isEmpty {
                    Text(j.adresse).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        } else if innslag.mangler && innslag.synlig {
            Text("Åpne Malerguiden én gang, så kommer jobbene hit.").font(.caption)
        } else {
            Color.clear
        }
    }

    /// Klokka som går, tørketiden, eller neste steg.
    private func linje2(_ j: Tavlejobb) -> Text {
        if let start = j.klokke {
            return Text(Image(systemName: "stopwatch")) + Text(" ") + Text(Date(timeIntervalSince1970: start / 1000), style: .timer)
        }
        if let klar = j.tork, klar > innslag.date.timeIntervalSince1970 * 1000 {
            return Text("Tørker til ") + Text(Date(timeIntervalSince1970: klar / 1000), style: .time)
        }
        return Text(j.neste.isEmpty ? j.adresse : j.neste)
    }

    // Hjemskjermen: flere jobber, hver med egen lenke
    @ViewBuilder private func liste(_ maks: Int) -> some View {
        if jobber.isEmpty {
            VStack(alignment: .leading, spacing: 4) {
                Text("Malerguiden").font(.headline)
                Text(innslag.mangler ? "Åpne appen én gang, så kommer jobbene hit." : innslag.synlig ? "Ingen aktive jobber." : "Jobbene vises 06:45–15:00.")
                    .font(.caption).foregroundStyle(.secondary)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        } else {
            VStack(alignment: .leading, spacing: 6) {
                ForEach(jobber.prefix(maks)) { j in
                    Link(destination: URL(string: "malerguiden://jobb/" + (j.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""))!) {
                        VStack(alignment: .leading, spacing: 1) {
                            Text(j.navn).font(.subheadline.weight(.semibold)).lineLimit(1)
                            linje2(j).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            if !j.husk.isEmpty {
                                Text("Husk: " + j.husk.joined(separator: ", ")).font(.caption).foregroundStyle(Color(red: 0.73, green: 0.28, blue: 0.16)).lineLimit(1)
                            }
                        }
                    }
                }
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
            .foregroundStyle(Color(red: 0.17, green: 0.15, blue: 0.13))
        }
    }
}
