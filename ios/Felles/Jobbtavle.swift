import Foundation
import WidgetKit

/// Jobbene som vises på låseskjermen. Appen skriver dem, låseskjermen leser dem.
/// Ligger i en delt mappe (App Group) som både appen og låseskjermdelen kan lese.
struct Tavlejobb: Codable, Hashable, Identifiable {
    var id: String
    var navn: String
    var adresse: String
    /// Neste steg fra rommene.
    var neste: String
    /// «Ta med neste gang» som ikke er huket av.
    var husk: [String]
    /// Det som står på Handle-fanen og ikke er kjøpt. nil: fra en eldre versjon.
    var handle: [String]? = nil
    /// Når stoppeklokka ble startet (millisekunder). nil: står stille.
    var klokke: Double?
    /// Når neste strøk kan tas (millisekunder). nil: ingenting tørker.
    var tork: Double?
    var torkTekst: String
}

struct Jobbtavle: Codable {
    var oppdatert: Double
    var jobber: [Tavlejobb]
    /// Når jobbene vises, i minutter etter midnatt. 405 = 06:45, 900 = 15:00.
    var fra: Int = 405
    var til: Int = 900
}

enum Delt {
    static let standardGruppe = "group.no.yzeyr.romskanner"
    private static let filnavn = "jobbtavle.json"

    /// Den delte mappen. Sideloadly kan gi gruppen et annet navn når appen signeres,
    /// så navnet leses fra signeringsprofilen hvis den finnes.
    static var gruppe: String { fraProfil() ?? standardGruppe }

    private static func fraProfil() -> String? {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url),
              let tekst = String(data: data, encoding: .isoLatin1),
              let a = tekst.range(of: "<?xml"), let b = tekst.range(of: "</plist>"), a.lowerBound < b.upperBound,
              let plist = String(tekst[a.lowerBound..<b.upperBound]).data(using: .isoLatin1),
              let p = try? PropertyListSerialization.propertyList(from: plist, format: nil) as? [String: Any],
              let rettigheter = p["Entitlements"] as? [String: Any],
              let grupper = rettigheter["com.apple.security.application-groups"] as? [String] else { return nil }
        return grupper.first
    }

    static var mappe: URL? { FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: gruppe) }

    static func les() -> Jobbtavle? {
        guard let url = mappe?.appendingPathComponent(filnavn), let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(Jobbtavle.self, from: data)
    }

    /// Lagrer jobbene og ber låseskjermen tegne seg på nytt. false: den delte mappen finnes ikke.
    @discardableResult
    static func skriv(_ t: Jobbtavle) -> Bool {
        guard let url = mappe?.appendingPathComponent(filnavn), let data = try? JSONEncoder().encode(t) else { return false }
        do { try data.write(to: url, options: .atomic) } catch { return false }
        WidgetCenter.shared.reloadAllTimelines()
        return true
    }
}
