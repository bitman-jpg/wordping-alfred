import Foundation
import Translation

private struct Output: Encodable {
    let translation: String
}

@main
struct AppleTranslate {
    static func main() async {
        guard CommandLine.arguments.count == 4 else {
            exit(2)
        }
        guard #available(macOS 26.0, *) else {
            exit(2)
        }

        let source = Locale.Language(identifier: language(CommandLine.arguments[1]))
        let target = Locale.Language(identifier: language(CommandLine.arguments[2]))
        let text = CommandLine.arguments[3]

        let session: TranslationSession
        if #available(macOS 26.4, *) {
            let highFidelity = LanguageAvailability(preferredStrategy: .highFidelity)
            let highStatus = await highFidelity.status(from: source, to: target)
            if highStatus == .installed {
                session = TranslationSession(installedSource: source, target: target,
                                             preferredStrategy: .highFidelity)
            } else {
                let lowLatency = LanguageAvailability(preferredStrategy: .lowLatency)
                guard await lowLatency.status(from: source, to: target) == .installed else {
                    exit(3)
                }
                session = TranslationSession(installedSource: source, target: target,
                                             preferredStrategy: .lowLatency)
            }
        } else {
            session = TranslationSession(installedSource: source, target: target)
        }

        do {
            let translated = try await session.translate(text).targetText.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !translated.isEmpty else { exit(4) }
            let output = try JSONEncoder().encode(Output(translation: translated))
            FileHandle.standardOutput.write(output)
        } catch {
            exit(4)
        }
    }

    private static func language(_ code: String) -> String {
        switch code {
        case "zh-CN", "zh-CHS": return "zh-Hans"
        case "zh-TW", "zh-CHT": return "zh-Hant"
        default: return code
        }
    }
}
