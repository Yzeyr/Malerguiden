import Foundation
import ActivityKit

/// Starter, oppdaterer og avslutter klokka og tørketiden på Dynamic Island.
/// Malerguiden sender hele lista hver gang noe endres; det som ikke er med lenger, avsluttes.
@MainActor
enum Liveaktivitet {
    static func oppdater(_ liste: [[String: Any]]) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let tid = { (d: [String: Any], k: String) -> Date? in
            guard let ms = (d[k] as? NSNumber)?.doubleValue, ms > 0 else { return nil }
            return Date(timeIntervalSince1970: ms / 1000)
        }
        let onsket = liste.compactMap { d -> (id: String, navn: String, tilstand: JobbAktivitet.ContentState)? in
            guard let id = d["jobb"] as? String, !id.isEmpty else { return nil }
            let tilstand = JobbAktivitet.ContentState(klokke: tid(d, "klokke"), tork: tid(d, "tork"), torkTekst: d["torkTekst"] as? String ?? "")
            guard tilstand.klokke != nil || tilstand.tork != nil else { return nil }
            return (id, d["navn"] as? String ?? "Jobb", tilstand)
        }
        for a in Activity<JobbAktivitet>.activities where !onsket.contains(where: { $0.id == a.attributes.jobbId }) {
            await a.end(nil, dismissalPolicy: .immediate)
        }
        for o in onsket {
            // Bare tørketid: gammel når den er tørr, så den kan vise «Klar for neste strøk»
            let innhold = ActivityContent(state: o.tilstand, staleDate: o.tilstand.klokke == nil ? o.tilstand.tork : nil)
            if let a = Activity<JobbAktivitet>.activities.first(where: { $0.attributes.jobbId == o.id }) {
                if a.content.state != o.tilstand { await a.update(innhold) }
            } else {
                _ = try? Activity.request(attributes: JobbAktivitet(jobbId: o.id, navn: o.navn), content: innhold, pushType: nil)
            }
        }
        return true
    }
}
