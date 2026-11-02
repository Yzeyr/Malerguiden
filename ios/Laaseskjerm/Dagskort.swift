import WidgetKit
import SwiftUI
import ActivityKit

/// Dagens jobber som et stort kort på låseskjermen (som musikkspilleren), og på Dynamic Island.
/// Øverst jobben med navn og neste steg, så linja for arbeidsdagen, og til slutt «Husk:».
struct Dagskort: Widget {
    static let terrakotta = Color(red: 0.85, green: 0.45, blue: 0.30)

    var body: some WidgetConfiguration {
        ActivityConfiguration(for: DagensJobber.self) { context in
            Kortvisning(tilstand: context.state, gammel: context.isStale)
                .padding(16)
                .activityBackgroundTint(Color.black.opacity(0.35))
                .widgetURL(lenke(context.state.jobber.first))
        } dynamicIsland: { context in
            let j = context.state.jobber.first
            return DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    Image(systemName: "paintbrush.fill").font(.title2).foregroundStyle(Self.terrakotta).padding(.leading, 4)
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if let start = j?.klokke {
                        Text(timerInterval: start...Date.distantFuture, countsDown: false)
                            .font(.title3.monospacedDigit().weight(.semibold)).frame(maxWidth: 90).padding(.trailing, 4)
                    }
                }
                DynamicIslandExpandedRegion(.center) {
                    Text(j?.navn ?? "Dagens jobber").font(.headline).lineLimit(1)
                }
                DynamicIslandExpandedRegion(.bottom) {
                    VStack(alignment: .leading, spacing: 4) {
                        if let j {
                            Text(Kortvisning.linje(j)).font(.subheadline).foregroundStyle(.secondary).lineLimit(1)
                            if !j.husk.isEmpty {
                                Text("Husk: " + j.husk.joined(separator: " · ")).font(.subheadline).foregroundStyle(Self.terrakotta).lineLimit(2)
                            }
                        }
                        if context.state.jobber.count > 1 {
                            Text("Også: " + context.state.jobber.dropFirst().map(\.navn).joined(separator: ", ")).font(.caption).foregroundStyle(.secondary).lineLimit(1)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            } compactLeading: {
                Image(systemName: "paintbrush.fill").foregroundStyle(Self.terrakotta)
            } compactTrailing: {
                if let start = j?.klokke {
                    Text(timerInterval: start...Date.distantFuture, countsDown: false).monospacedDigit().frame(maxWidth: 56)
                } else {
                    Text("\(context.state.jobber.count)").foregroundStyle(Self.terrakotta)
                }
            } minimal: {
                Image(systemName: "paintbrush.fill").foregroundStyle(Self.terrakotta)
            }
            .widgetURL(lenke(j))
        }
    }

    private func lenke(_ j: DagensJobber.Jobb?) -> URL? {
        guard let j else { return URL(string: "malerguiden://jobber") }
        return URL(string: "malerguiden://jobb/" + (j.id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? ""))
    }
}

/// Kortet på låseskjermen.
struct Kortvisning: View {
    let tilstand: DagensJobber.ContentState
    let gammel: Bool

    /// Linja under navnet: klokka som går, tørketiden, eller neste steg.
    static func linje(_ j: DagensJobber.Jobb) -> String {
        if let klar = j.tork, klar > .now {
            return (j.torkTekst.isEmpty ? "Tørker" : j.torkTekst) + " · klar kl. " + klar.formatted(date: .omitted, time: .shortened)
        }
        return j.neste.isEmpty ? "Ingen steg igjen i sjekklista" : "Neste: " + j.neste
    }

    var body: some View {
        if let j = tilstand.jobber.first, !gammel {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 12) {
                    RoundedRectangle(cornerRadius: 10)
                        .fill(Dagskort.terrakotta)
                        .frame(width: 54, height: 54)
                        .overlay(Image(systemName: "paintbrush.fill").font(.title2).foregroundStyle(.white))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(j.navn).font(.headline).foregroundStyle(.white).lineLimit(1)
                        Text(Self.linje(j)).font(.subheadline).foregroundStyle(.white.opacity(0.7)).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                    if let start = j.klokke {
                        VStack(alignment: .trailing, spacing: 0) {
                            Image(systemName: "stopwatch").font(.caption).foregroundStyle(Dagskort.terrakotta)
                            Text(timerInterval: start...Date.distantFuture, countsDown: false)
                                .font(.headline.monospacedDigit()).foregroundStyle(.white).frame(maxWidth: 80, alignment: .trailing)
                        }
                    }
                }
                // Arbeidsdagen: tid gått og tid igjen, som en sang
                HStack(spacing: 8) {
                    Text(tilstand.start, style: .time).font(.caption2.monospacedDigit()).foregroundStyle(.white.opacity(0.6))
                    ProgressView(timerInterval: tilstand.start...tilstand.slutt, countsDown: false) { EmptyView() } currentValueLabel: { EmptyView() }
                        .tint(.white.opacity(0.8))
                    Text(timerInterval: Date.now...tilstand.slutt, countsDown: true)
                        .font(.caption2.monospacedDigit()).foregroundStyle(.white.opacity(0.6)).frame(maxWidth: 56, alignment: .trailing)
                }
                if !j.husk.isEmpty {
                    Label { Text(j.husk.joined(separator: " · ")).lineLimit(2) } icon: { Image(systemName: "bag") }
                        .font(.subheadline.weight(.medium)).foregroundStyle(Dagskort.terrakotta)
                }
                if tilstand.jobber.count > 1 {
                    Text("Også i dag: " + tilstand.jobber.dropFirst().map(\.navn).joined(separator: ", "))
                        .font(.caption).foregroundStyle(.white.opacity(0.6)).lineLimit(1)
                }
            }
        } else {
            HStack(spacing: 12) {
                Image(systemName: "paintbrush.fill").foregroundStyle(Dagskort.terrakotta)
                Text("Arbeidsdagen er over").font(.headline).foregroundStyle(.white)
                Spacer()
            }
        }
    }
}
