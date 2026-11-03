import Foundation
import RoomPlan

/// 3D-modellen av hvert rom, lagret som USDZ i appens dokumentmappe.
/// RoomPlan lager en modell med vegger, gulv, vinduer, dører og møbler som klosser.
enum Modell {
    static var mappe: URL {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("modeller", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    static func url(_ id: UUID) -> URL { mappe.appendingPathComponent(id.uuidString + ".usdz") }

    static func finnes(_ id: UUID) -> Bool { FileManager.default.fileExists(atPath: url(id).path) }

    /// Lagrer modellen. Feiler eksporten, finnes rommet fortsatt, bare uten 3D.
    static func lagre(_ rom: CapturedRoom, id: UUID) {
        try? rom.export(to: url(id))
    }

    /// Skanningen slik RoomPlan leverte den, så etasjen kan settes sammen av Apple etterpå.
    static func raaUrl(_ id: UUID) -> URL { mappe.appendingPathComponent(id.uuidString + "-rom.json") }

    static func lagreRaa(_ rom: CapturedRoom, id: UUID) {
        if let data = try? JSONEncoder().encode(rom) { try? data.write(to: raaUrl(id), options: .atomic) }
    }

    static func raa(_ id: UUID) -> CapturedRoom? {
        guard let data = try? Data(contentsOf: raaUrl(id)) else { return nil }
        return try? JSONDecoder().decode(CapturedRoom.self, from: data)
    }

    static func slett(_ id: UUID) {
        try? FileManager.default.removeItem(at: url(id))
        try? FileManager.default.removeItem(at: raaUrl(id))
        Fotomodell.slett(id)
        Fargemodell.slett(id)
        Omrademodell.slett(id)
    }

    /// En kopi med rommets navn, så fila får et forståelig navn når den deles.
    static func delbar(_ rom: SkannetRom) -> URL {
        let trygt = rom.navn.components(separatedBy: CharacterSet(charactersIn: "/\\:?%*|\"<>")).joined(separator: "-")
        let mal = FileManager.default.temporaryDirectory.appendingPathComponent((trygt.isEmpty ? "Rom" : trygt) + ".usdz")
        try? FileManager.default.removeItem(at: mal)
        // Versjonen med bilder er mest nyttig å dele, når den finnes.
        let kilde = Fotomodell.finnes(rom.id) ? Fotomodell.url(rom.id) : url(rom.id)
        try? FileManager.default.copyItem(at: kilde, to: mal)
        return mal
    }
}
