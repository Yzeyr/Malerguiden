import WidgetKit
import SwiftUI
import ActivityKit

/// Klokka og tørketiden på Dynamic Island og låseskjermen. Trykk åpner jobben.
struct Jobbaktivitet: Widget {
    private static let terrakotta = Color(red: 0.85, green: 0.45, blue: 0.30)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: JobbAktivitet.self) { context in
            // Låseskjermen og varselet øverst
            HStack(spacing: 12) {
                Image(systemName: context.state.klokke != nil ? "stopwatch" : "drop")
                    .font(.title2)
                    .foregroundStyle(Self.terrakotta)
                VStack(alignment: .leading, spacing: 2) {
                    Text(context.attributes.navn).font(.headline).lineLimit(1)
                    Text(undertekst(context)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer()
                tid(context).font(.title2.monospacedDigit().weight(.semibold))
            }
            .padding(14)
            .widgetURL(lenke(context))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: context.state.klokke != nil ? "stopwatch" : "drop")
                        .font(.title2).foregroundStyle(Self.terrakotta).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    tid(context).font(.title2.monospacedDigit().weight(.semibold)).padding(.trailing, 4)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(spacing: 2) {
                        Text(context.attributes.navn).font(.headline).lineLimit(1)
                        Text(undertekst(context)).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                    }
                }
            } compactLeading: {
                Image(systemName: context.state.klokke != nil ? "stopwatch" : "drop").foregroundStyle(Self.terrakotta)
            } compactTrailing: {
                tid(context).monospacedDigit().frame(maxWidth: 64)
            } minimal: {
                Image(systemName: context.state.klokke != nil ? "stopwatch" : "drop").foregroundStyle(Self.terrakotta)
            }
            .widgetURL(lenke(context))
        }
    }

    private func lenke(_ c: ActivityViewContext<JobbAktivitet>) -> URL? {
        URL(string: "malerguiden://jobb/" + (c.attributes.jobbId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""))
    }

    /// Klokka teller opp; tørketiden teller ned til neste strøk.
    @ViewBuilder private func tid(_ c: ActivityViewContext<JobbAktivitet>) -> some View {
        if let start = c.state.klokke {
            Text(timerInterval: start...Date.distantFuture, countsDown: false)
        } else if let klar = c.state.tork, klar > .now {
            Text(timerInterval: Date.now...klar, countsDown: true)
        } else {
            Text("Klar")
        }
    }

    private func undertekst(_ c: ActivityViewContext<JobbAktivitet>) -> String {
        if c.state.klokke != nil {
            if let klar = c.state.tork, klar > .now { return "Klokka går · tørt kl. " + klar.formatted(date: .omitted, time: .shortened) }
            return "Klokka går"
        }
        if let klar = c.state.tork {
            if klar <= .now || c.isStale { return "Klar for neste strøk" }
            return (c.state.torkTekst.isEmpty ? "Tørker" : c.state.torkTekst) + " · klar kl. " + klar.formatted(date: .omitted, time: .shortened)
        }
        return ""
    }
}
