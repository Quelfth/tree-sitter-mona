import XCTest
import SwiftTreeSitter
import TreeSitterMona

final class TreeSitterMonaTests: XCTestCase {
    func testCanLoadGrammar() throws {
        let parser = Parser()
        let language = Language(language: tree_sitter_mona())
        XCTAssertNoThrow(try parser.setLanguage(language),
                         "Error loading Mona grammar")
    }
}
