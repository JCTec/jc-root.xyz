import Foundation
import Vapor

/// Site locales. The locale is part of the URL (`/` = EN, `/es` = ES);
/// there is no cookie- or header-based detection, so every page stays
/// publicly cacheable and crawlable.
enum AppLocale: String, CaseIterable, Sendable {
    case en
    case es

    var htmlLang: String { rawValue }

    var homePath: String {
        switch self {
        case .en: "/"
        case .es: "/es"
        }
    }

    var other: AppLocale {
        switch self {
        case .en: .es
        case .es: .en
        }
    }
}

/// All UI copy, loaded at boot from `Resources/Strings/<locale>.strings`
/// (Apple `.strings` syntax: `"code" = "value";`). Code and templates refer to
/// string *codes* only — never literal copy. `en.strings` is the source of
/// truth for the key set; `es.strings` must keep full key parity, which the
/// test suite enforces.
struct StringsCatalog: Sendable {
    enum StringsError: Error, CustomStringConvertible {
        case malformedLine(file: String, line: Int, contents: String)
        case duplicateKey(file: String, key: String)

        var description: String {
            switch self {
            case .malformedLine(let file, let line, let contents):
                "Malformed .strings line at \(file):\(line): \(contents)"
            case .duplicateKey(let file, let key):
                "Duplicate key \"\(key)\" in \(file)"
            }
        }
    }

    let tables: [AppLocale: [String: String]]

    func table(for locale: AppLocale) -> [String: String] {
        tables[locale] ?? [:]
    }

    static func load(fromDirectory directory: String) throws -> StringsCatalog {
        let dir = directory.hasSuffix("/") ? directory : directory + "/"
        var tables: [AppLocale: [String: String]] = [:]
        for locale in AppLocale.allCases {
            let path = dir + "\(locale.rawValue).strings"
            let contents = try String(contentsOfFile: path, encoding: .utf8)
            tables[locale] = try parse(contents, file: path)
        }
        return StringsCatalog(tables: tables)
    }

    /// Line-based `.strings` parser: blank lines and `//` comments are
    /// skipped; every other line must be `"key" = "value";`. Values support
    /// `\"`, `\\`, `\n` and `\t` escapes. Anything else fails the boot loudly
    /// rather than rendering blanks.
    static func parse(_ contents: String, file: String = "<memory>") throws -> [String: String] {
        var result: [String: String] = [:]
        for (index, rawLine) in contents.components(separatedBy: .newlines).enumerated() {
            let line = rawLine.trimmingCharacters(in: .whitespaces)
            if line.isEmpty || line.hasPrefix("//") { continue }
            guard let (key, value) = parseLine(line) else {
                throw StringsError.malformedLine(file: file, line: index + 1, contents: line)
            }
            guard result[key] == nil else {
                throw StringsError.duplicateKey(file: file, key: key)
            }
            result[key] = value
        }
        return result
    }

    private static func parseLine(_ line: String) -> (String, String)? {
        var rest = Substring(line)
        guard let key = takeQuoted(&rest) else { return nil }
        rest = rest.drop(while: { $0 == " " || $0 == "\t" })
        guard rest.first == "=" else { return nil }
        rest = rest.dropFirst().drop(while: { $0 == " " || $0 == "\t" })
        guard let value = takeQuoted(&rest) else { return nil }
        rest = rest.drop(while: { $0 == " " || $0 == "\t" })
        guard rest.first == ";" else { return nil }
        let trailing = rest.dropFirst().drop(while: { $0 == " " || $0 == "\t" })
        guard trailing.isEmpty || trailing.hasPrefix("//") else { return nil }
        return (key, value)
    }

    private static func takeQuoted(_ input: inout Substring) -> String? {
        guard input.first == "\"" else { return nil }
        input = input.dropFirst()
        var out = ""
        while let char = input.first {
            input = input.dropFirst()
            switch char {
            case "\\":
                guard let escaped = input.first else { return nil }
                input = input.dropFirst()
                switch escaped {
                case "n": out.append("\n")
                case "t": out.append("\t")
                default: out.append(escaped)
                }
            case "\"":
                return out
            default:
                out.append(char)
            }
        }
        return nil
    }
}

extension Application {
    private struct StringsCatalogKey: StorageKey {
        typealias Value = StringsCatalog
    }

    var strings: StringsCatalog {
        get {
            guard let catalog = storage[StringsCatalogKey.self] else {
                fatalError("StringsCatalog not configured. Call configure(_:) first.")
            }
            return catalog
        }
        set {
            storage[StringsCatalogKey.self] = newValue
        }
    }
}
