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
