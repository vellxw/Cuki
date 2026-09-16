import XCTest

/// Exercises the real React Native app via system accessibility, not a JS mock.
final class CUKISmokeTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: "com.cuki.app.test")
        app.launch()
    }
    private func node(_ id: String, timeout: TimeInterval = 40,
                      file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        let item = app.descendants(matching: .any).matching(identifier: id).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: timeout), "Missing native element: \(id)\n\(app.debugDescription)", file: file, line: line)
        return item
    }
    private func tap(_ id: String, file: StaticString = #filePath, line: UInt = #line) {
        let item = node(id, file: file, line: line)
        for _ in 0..<6 { if item.isHittable { break }; app.swipeUp() }
        XCTAssertTrue(item.isHittable, "Element not hittable: \(id)", file: file, line: line)
        item.tap()
    }
    private func capture(_ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
    }
    func testGuestNavigationAndDurableFood() throws {
        // First launch must pass SecureStore restore and SQLite startup. A spinner/error
        // screen does not count as a successful launch even if simctl returned a PID.
        tap("welcome-explore")
        _ = node("Nutrición de hoy"); capture("01-home-empty")
        tap("nav-recipes"); _ = node("Buscar recetas e ingredientes"); capture("02-recipes")
        tap("nav-register"); _ = node("Buscar alimento"); capture("03-register")
        tap("Cerrar"); _ = node("Buscar recetas e ingredientes")
        tap("nav-train"); _ = node("SC-42"); capture("04-training")
        tap("nav-progress"); _ = node("SC-57"); capture("05-progress")
        tap("nav-home"); _ = node("Nutrición de hoy")
        tap("home-register"); tap("Buscar alimento")
        let search = app.textFields.matching(identifier: "Alimento o ingrediente").firstMatch
        XCTAssertTrue(search.waitForExistence(timeout: 20))
        search.tap(); search.typeText("Pechuga")
        let food = app.buttons.matching(NSPredicate(format: "label CONTAINS[c] %@", "Pechuga")).firstMatch
        XCTAssertTrue(food.waitForExistence(timeout: 20)); let title = food.label; food.tap()
        tap("food-portion")
        let amount = node("portion-amount")
        XCTAssertEqual(amount.value as? String, "100")
        tap("portion-save"); _ = node("Nutrición de hoy")
        tap("Abrir diario de nutrición"); _ = node(title); capture("06-saved-food")
        app.terminate(); app.launch()
        _ = node("Nutrición de hoy")
        tap("Abrir diario de nutrición"); _ = node(title); capture("07-persisted-food-after-process-restart")
    }
}
