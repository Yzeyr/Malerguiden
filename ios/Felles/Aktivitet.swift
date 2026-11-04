import Foundation
import ActivityKit

/// Klokka som går og tørketiden på Dynamic Island og låseskjermen (Live Activity).
/// Appen starter, oppdaterer og avslutter den. Låseskjermdelen tegner den.
struct JobbAktivitet: ActivityAttributes {
    struct ContentState: Codable, Hashable {
        /// Når stoppeklokka ble startet. nil: står stille.
        var klokke: Date?
        /// Når neste strøk kan tas. nil: ingenting tørker.
        var tork: Date?
        var torkTekst: String
    }
    var jobbId: String
    var navn: String
}

/// Dagens jobber i arbeidstiden: et stort kort på låseskjermen og Dynamic Island.
/// Appen sender alt innholdet, så kortet trenger ingen delt mappe.
struct DagensJobber: ActivityAttributes {
    struct Jobb: Codable, Hashable {
        var id: String
        var navn: String
        var neste: String
        var husk: [String]
        /// Det som skal kjøpes (Handle-fanen). nil: fra en eldre versjon.
        var handle: [String]? = nil
        var klokke: Date?
        var tork: Date?
        var torkTekst: String
    }
    struct ContentState: Codable, Hashable {
        var jobber: [Jobb]
        /// Arbeidsdagen, for linja med tid gått og tid igjen.
        var start: Date
        var slutt: Date
    }
    var dato: String
}
