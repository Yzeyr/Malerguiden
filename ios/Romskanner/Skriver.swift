import Foundation
#if canImport(FoundationModels)
import FoundationModels
#endif

/// Skriver om tekst med Apples språkmodell på telefonen (Apple Intelligence, iOS 26).
/// Ingenting sendes på nett. Uten Apple Intelligence sier status() hvorfor.
enum Skriver {
    @MainActor static func status() -> (klar: Bool, grunn: String?) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let modell = SystemLanguageModel.default
            switch modell.availability {
            case .available:
                let norsk = ["nb_NO", "no_NO", "nn_NO", "nb"].contains { modell.supportsLocale(Locale(identifier: $0)) }
                return norsk ? (true, nil) : (false, "Apple Intelligence skriver ikke norsk på denne telefonen ennå. Malteksten fungerer like fullt.")
            case .unavailable(let grunn):
                switch grunn {
                case .deviceNotEligible: return (false, "Denne telefonen har ikke Apple Intelligence.")
                case .appleIntelligenceNotEnabled: return (false, "Slå på Apple Intelligence under Innstillinger for å la telefonen skrive om tilbudet.")
                case .modelNotReady: return (false, "Apple Intelligence lastes ned til telefonen. Prøv igjen litt senere.")
                @unknown default: return (false, "Apple Intelligence er ikke klar.")
                }
            }
        }
        return (false, "Omskriving med Apple Intelligence krever iOS 26.")
        #else
        return (false, "Denne versjonen av appen er bygget uten Apple Intelligence.")
        #endif
    }

    static func skriv(instrukser: String, sporsmal: String) async throws -> String {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            let okt = LanguageModelSession(instructions: instrukser)
            do {
                let svar = try await okt.respond(to: sporsmal)
                return svar.content
            } catch {
                throw Feil("Apple Intelligence klarte ikke skrive teksten: \(error.localizedDescription)")
            }
        }
        #endif
        throw Feil("Apple Intelligence er ikke tilgjengelig på denne telefonen.")
    }
}
