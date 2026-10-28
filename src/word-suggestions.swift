import AppKit
import Foundation

private struct Suggestions: Encodable {
    let correctlySpelled: Bool
    let corrections: [String]
    let completions: [String]
}

guard CommandLine.arguments.count == 3 else { exit(2) }
let word = CommandLine.arguments[1]
let language = CommandLine.arguments[2]
let range = NSRange(location: 0, length: (word as NSString).length)
let checker = NSSpellChecker.shared
let misspelled = checker.checkSpelling(of: word, startingAt: 0, language: language,
                                      wrap: false, inSpellDocumentWithTag: 0, wordCount: nil)
let correctlySpelled = misspelled.location == NSNotFound
let corrections = correctlySpelled ? [] :
    (checker.guesses(forWordRange: range, in: word, language: language,
                     inSpellDocumentWithTag: 0) ?? [])
let completions = correctlySpelled ? [] :
    (checker.completions(forPartialWordRange: range, in: word,
                         language: language, inSpellDocumentWithTag: 0) ?? [])
let output = try JSONEncoder().encode(Suggestions(correctlySpelled: correctlySpelled,
                                                  corrections: corrections,
                                                  completions: completions))
FileHandle.standardOutput.write(output)
