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
        let item = id.hasPrefix("nav-") ? app.descendants(matching: .any).matching(identifier: id).firstMatch : app.buttons.matching(identifier: id).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: 40), "Missing actionable button: \(id)", file: file, line: line)
        makeHittable(item)
        XCTAssertTrue(item.isHittable, "Element not hittable: \(id)", file: file, line: line)
        item.tap()
    }
    private func makeHittable(_ item: XCUIElement) {
        for _ in 0..<8 {
            if item.isHittable { return }
            let scroll = app.scrollViews.firstMatch
            let surface = scroll.exists ? scroll : app!
            if item.frame.minY < app.frame.minY + 80 { surface.swipeDown() }
            else { surface.swipeUp() }
        }
    }
    private func editableInput(_ id: String, file: StaticString = #filePath, line: UInt = #line) -> XCUIElement {
        // The visible label and native input share their accessible name. Query the
        // actual editable element instead of typing into the first matching StaticText.
        let editable = NSPredicate(format:
            "(elementType == %d OR elementType == %d OR elementType == %d) AND (identifier == %@ OR label == %@)",
            Int(XCUIElement.ElementType.textField.rawValue), Int(XCUIElement.ElementType.secureTextField.rawValue),
            Int(XCUIElement.ElementType.textView.rawValue), id, id)
        let item = app.descendants(matching: .any).matching(editable).firstMatch
        XCTAssertTrue(item.waitForExistence(timeout: 40), "Missing editable input: \(id)", file: file, line: line)
        return item
    }
    private func fill(_ id: String, _ value: String, file: StaticString = #filePath, line: UInt = #line) {
        let item = editableInput(id, file: file, line: line)
        makeHittable(item)
        XCTAssertTrue(item.isHittable, "Input not hittable: \(id)", file: file, line: line)
        item.tap()
        // A first-use iOS keyboard tutorial can intercept typed characters. Handle
        // ONLY its known system container; never dismiss arbitrary application alerts.
        let introduction = app.descendants(matching: .any).matching(identifier: "UIContinuousPathIntroductionView").firstMatch
        if introduction.waitForExistence(timeout: 2) {
            capture("system-keyboard-introduction")
            let proceed = introduction.buttons["Continue"]
            XCTAssertTrue(proceed.exists && proceed.isHittable, file: file, line: line)
            proceed.tap()
            XCTAssertFalse(introduction.exists, file: file, line: line)
            item.tap()
        }
        let raw = item.value as? String ?? ""
        let existing = raw == item.placeholderValue ? "" : raw
        if !existing.isEmpty {
            item.typeText(String(repeating: XCUIKeyboardKey.delete.rawValue, count: existing.count))
        }
        // Wait for each controlled native input update before sending the next key.
        // This still types through the OS and fails if a character is lost or changed.
        var expected = ""
        for character in value {
            item.typeText(String(character)); expected.append(character)
            let ready = NSPredicate(format: "value == %@", expected)
            XCTAssertEqual(XCTWaiter.wait(for: [XCTNSPredicateExpectation(predicate: ready, object: item)], timeout: 5), .completed,
                           "Native input lost characters: \(id)", file: file, line: line)
        }
        XCTAssertEqual(item.value as? String, value, file: file, line: line)
    }
    private func capture(_ name: String) {
        let screenshot = XCTAttachment(screenshot: app.screenshot())
        screenshot.name = name; screenshot.lifetime = .keepAlways; add(screenshot)
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = name + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
    }
    func testGuestNavigationFoodAndWorkoutRecovery() throws {
        // First launch must pass SecureStore restore and SQLite startup. A spinner/error
        // screen does not count as a successful launch even if simctl returned a PID.
        tap("welcome-explore")
        _ = node("Abrir diario de nutrición"); capture("01-home-empty")
        tap("nav-recipes"); _ = node("Buscar recetas e ingredientes"); capture("02-recipes")
        tap("nav-register"); _ = node("Buscar alimento"); capture("03-register")
        tap("Cerrar"); _ = node("Buscar recetas e ingredientes")
        tap("nav-train"); _ = node("SC-42"); capture("04-training")
        tap("nav-progress"); _ = node("SC-57"); capture("05-progress")
        tap("nav-home"); _ = node("Abrir diario de nutrición")
        tap("home-register"); tap("Buscar alimento")
        fill("Alimento o ingrediente", "Pechuga")
        let title = "Pechuga de pollo asada"
        tap(title)
        tap("food-portion")
        let amount = editableInput("portion-amount")
        XCTAssertEqual(amount.value as? String, "100")
        tap("portion-save"); _ = node("Abrir diario de nutrición")
        tap("Abrir diario de nutrición"); _ = node(title); capture("06-saved-food")
        app.terminate(); app.launch()
        _ = node("Abrir diario de nutrición")
        tap("Abrir diario de nutrición"); _ = node(title); capture("07-persisted-food-after-process-restart")
        // Exercise planning and state restoration through native controls, without test-data injection.
        tap("Volver"); tap("nav-train"); _ = node("SC-42")
        tap("Crear rutina"); _ = node("SC-44")
        fill("Nombre del plan", "Rutina QA nativa")
        tap("Añadir ejercicio al día"); _ = node("SC-45")
        fill("Buscar ejercicio o equipo", "Press inclinado"); tap("Press inclinado"); _ = node("SC-44")
        fill("Series, ejercicio 1", "1")
        fill("Grupo de superserie o circuito, ejercicio 1", "A")
        tap("Añadir ejercicio al día"); _ = node("SC-45")
        fill("Buscar ejercicio o equipo", "Remo sentado"); tap("Remo sentado"); _ = node("SC-44")
        fill("Series, ejercicio 2", "1")
        fill("Grupo de superserie o circuito, ejercicio 2", "A")
        tap("Guardar plan"); _ = node("SC-42"); tap("Iniciar Día A"); _ = node("SC-47")
        _ = node("Press inclinado"); fill("Carga kg", "20"); fill("Repeticiones", "8")
        tap("Completar serie"); _ = node("SC-48"); capture("08-rest-after-first-superset-set")
        app.terminate(); app.launch(); _ = node("Abrir diario de nutrición")
        tap("nav-train"); tap("Reanudar sesión"); _ = node("SC-48")
        tap("Continuar entrenamiento"); _ = node("SC-47"); _ = node("Remo sentado")
        fill("Carga kg", "25"); fill("Repeticiones", "8")
        tap("Completar serie"); _ = node("SC-48"); tap("Finalizar sesión"); _ = node("SC-51")
        fill("Cómo fue la sesión, opcional", "Persistencia QA nativa")
        tap("Guardar y finalizar sesión"); _ = node("SC-52")
        _ = node("2 series de trabajo / actividades válidas")
        _ = node("Persistencia QA nativa"); capture("09-durable-workout-summary")
    }
}
