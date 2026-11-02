import UIKit
import UniformTypeIdentifiers

/// Automatisk sikkerhetskopi. Malerguiden lager kopien én gang om dagen og sender den hit i biter.
/// Kopien lagres i en mappe du har valgt (f.eks. iCloud Drive), og den blir liggende selv om
/// appen slettes. Uten valgt mappe havner den i appens egen mappe (Filer → På min iPhone →
/// Malerguiden), som slettes sammen med appen.
@MainActor
enum Autokopi {
    private static let nokkel = "autokopi-mappe"
    static let prefiks = "Malerguiden-kopi-"
    /// Så mange av de nyeste kopiene beholdes i mappen.
    static let beholdes = 7

    /// Mappen som er valgt, eller nil.
    static func valgtMappe() -> URL? {
        guard let data = UserDefaults.standard.data(forKey: nokkel) else { return nil }
        var gammel = false
        guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &gammel) else { return nil }
        if gammel, url.startAccessingSecurityScopedResource() {
            defer { url.stopAccessingSecurityScopedResource() }
            if let ny = try? url.bookmarkData() { UserDefaults.standard.set(ny, forKey: nokkel) }
        }
        return url
    }

    static func mappeNavn() -> String? { valgtMappe()?.lastPathComponent }

    static func glem() { UserDefaults.standard.removeObject(forKey: nokkel) }

    /// Lar deg velge mappen. Svarer med navnet, eller nil hvis du avbrøt.
    static func velgMappe() async -> String? {
        guard let topp = Deling.toppKontroller() else { return nil }
        let velger = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        let mottaker = Mottaker()
        velger.delegate = mottaker
        let url: URL? = await withCheckedContinuation { fortsett in
            mottaker.ferdig = { fortsett.resume(returning: $0) }
            topp.present(velger, animated: true)
        }
        withExtendedLifetime(mottaker) {}
        guard let url, url.startAccessingSecurityScopedResource() else { return nil }
        defer { url.stopAccessingSecurityScopedResource() }
        guard let data = try? url.bookmarkData() else { return nil }
        UserDefaults.standard.set(data, forKey: nokkel)
        return url.lastPathComponent
    }

    private final class Mottaker: NSObject, UIDocumentPickerDelegate {
        var ferdig: ((URL?) -> Void)?
        func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { ferdig?(urls.first); ferdig = nil }
        func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { ferdig?(nil); ferdig = nil }
    }

    private static var underveis: URL { FileManager.default.temporaryDirectory.appendingPathComponent("autokopi.underveis") }

    /// Tar imot én bit av kopien. Når siste bit er kommet, legges fila i mappen og gamle kopier ryddes.
    static func bit(del: Int, av: Int, data: Data, navn: String) throws -> [String: Any] {
        let fm = FileManager.default
        if del == 0 {
            try? fm.removeItem(at: underveis)
            fm.createFile(atPath: underveis.path, contents: nil)
        }
        let h = try FileHandle(forWritingTo: underveis)
        try h.seekToEnd()
        try h.write(contentsOf: data)
        try h.close()
        guard del >= av - 1 else { return ["ferdig": false] }

        let trygt = navn.replacingOccurrences(of: "/", with: "-")
        if let mappe = valgtMappe() {
            guard mappe.startAccessingSecurityScopedResource() else {
                throw Feil("Fikk ikke skrive til mappen \(mappe.lastPathComponent). Velg mappen på nytt under Mitt.")
            }
            defer { mappe.stopAccessingSecurityScopedResource() }
            try legg(underveis, i: mappe, navn: trygt)
            return ["ferdig": true, "mappe": mappe.lastPathComponent, "utenforAppen": true]
        }
        let egen = fm.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try legg(underveis, i: egen, navn: trygt)
        return ["ferdig": true, "mappe": "På min iPhone › Malerguiden", "utenforAppen": false]
    }

    private static func legg(_ fil: URL, i mappe: URL, navn: String) throws {
        let fm = FileManager.default
        let maal = mappe.appendingPathComponent(navn)
        var koordFeil: NSError?
        var skrivFeil: Error?
        NSFileCoordinator().coordinate(writingItemAt: maal, options: .forReplacing, error: &koordFeil) { url in
            do {
                if fm.fileExists(atPath: url.path) { try fm.removeItem(at: url) }
                try fm.copyItem(at: fil, to: url)
            } catch { skrivFeil = error }
        }
        if let e = koordFeil ?? skrivFeil { throw e }
        try? fm.removeItem(at: fil)
        // Behold de nyeste kopiene. Bare filer appen selv har laget (navnet), tas bort.
        let kopier = ((try? fm.contentsOfDirectory(at: mappe, includingPropertiesForKeys: nil)) ?? [])
            .filter { $0.lastPathComponent.hasPrefix(prefiks) && $0.pathExtension == "json" }
            .sorted { $0.lastPathComponent > $1.lastPathComponent }
        for gammel in kopier.dropFirst(beholdes) { try? fm.removeItem(at: gammel) }
    }
}
