import Foundation
import ActivityKit
import UserNotifications

/// Starter, oppdaterer og avslutter klokka og tørketiden på Dynamic Island.
/// Malerguiden sender hele lista hver gang noe endres; det som ikke er med lenger, avsluttes.
@MainActor
enum Liveaktivitet {
    private static func tid(_ d: [String: Any], _ k: String) -> Date? {
        guard let ms = (d[k] as? NSNumber)?.doubleValue, ms > 0 else { return nil }
        return Date(timeIntervalSince1970: ms / 1000)
    }

    /// liste: klokke og tørketid per jobb. dagens: jobbene i arbeidstiden (da vises bare kortet).
    static func oppdater(_ liste: [[String: Any]], dagens: [[String: Any]]?, start: Date?, slutt: Date?) async -> Bool {
        guard ActivityAuthorizationInfo().areActivitiesEnabled else { return false }
        let jobber = (dagens ?? []).compactMap { d -> DagensJobber.Jobb? in
            guard let id = d["id"] as? String else { return nil }
            return DagensJobber.Jobb(id: id, navn: d["navn"] as? String ?? "", neste: d["neste"] as? String ?? "",
                                     husk: d["husk"] as? [String] ?? [], klokke: tid(d, "klokke"), tork: tid(d, "tork"),
                                     torkTekst: d["torkTekst"] as? String ?? "")
        }
        if !jobber.isEmpty, let start, let slutt {
            // Arbeidstid: ett kort med dagens jobber (klokka er med i kortet)
            for a in Activity<JobbAktivitet>.activities { await a.end(nil, dismissalPolicy: .immediate) }
            let tilstand = DagensJobber.ContentState(jobber: jobber, start: start, slutt: slutt)
            let innhold = ActivityContent(state: tilstand, staleDate: slutt)
            let dato = ISO8601DateFormatter.string(from: start, timeZone: .current, formatOptions: [.withFullDate])
            for a in Activity<DagensJobber>.activities where a.attributes.dato != dato { await a.end(nil, dismissalPolicy: .immediate) }
            if let a = Activity<DagensJobber>.activities.first(where: { $0.attributes.dato == dato }) {
                if a.content.state != tilstand { await a.update(innhold) }
            } else {
                _ = try? Activity.request(attributes: DagensJobber(dato: dato), content: innhold, pushType: nil)
            }
            return true
        }
        for a in Activity<DagensJobber>.activities { await a.end(nil, dismissalPolicy: .immediate) }
        let onsket = liste.compactMap { d -> (id: String, navn: String, tilstand: JobbAktivitet.ContentState)? in
            guard let id = d["jobb"] as? String, !id.isEmpty else { return nil }
            let tilstand = JobbAktivitet.ContentState(klokke: Self.tid(d, "klokke"), tork: Self.tid(d, "tork"), torkTekst: d["torkTekst"] as? String ?? "")
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

    /// Varsel kvart på sju hver morgen med jobbene og det du må ta med. Trykk åpner appen, og kortet starter.
    static func morgenvarsel(tekst: String?) async {
        let senter = UNUserNotificationCenter.current()
        senter.removePendingNotificationRequests(withIdentifiers: ["morgen"])
        guard let tekst, !tekst.isEmpty else { return }
        let lov = (try? await senter.requestAuthorization(options: [.alert, .sound])) ?? false
        guard lov else { return }
        let innhold = UNMutableNotificationContent()
        innhold.title = "Dagens jobber"
        innhold.body = tekst
        innhold.sound = .default
        var tid = DateComponents()
        tid.hour = 6
        tid.minute = 45
        try? await senter.add(UNNotificationRequest(identifier: "morgen", content: innhold, trigger: UNCalendarNotificationTrigger(dateMatching: tid, repeats: true)))
    }
}
