import XCTest

/// Captures ONLY actual, identified native screen components in the isolated visual app.
/// A successful launch, a system URL sheet, or an onboarding screenshot cannot pass.
final class CUKIVisualTests: XCTestCase {
    private var app: XCUIApplication!
    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication(bundleIdentifier: "com.cuki.app.visual")
        app.launch()
    }
    private func capture(_ scene: String, screen: String, index: Int,
                         action: String? = nil, file: StaticString = #filePath, line: UInt = #line) throws {
        // XCTest opens the URL on the target application. The old simctl-only driver
        // captured a SpringBoard confirmation sheet and incorrectly reported success.
        app.open(URL(string: "cuki-visual://visual/" + scene)!)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        let knownOpenSheet = springboard.alerts.containing(.staticText,
            identifier: "Open in \"CUKI Visual\"?").firstMatch
        if knownOpenSheet.waitForExistence(timeout: 2) {
            let button = knownOpenSheet.buttons["Open"]
            XCTAssertTrue(button.isHittable, file: file, line: line)
            button.tap()
        }
        let marker = app.descendants(matching: .any).matching(identifier: "visual-scene-" + scene).firstMatch
        let content = app.descendants(matching: .any).matching(identifier: screen).firstMatch
        XCTAssertTrue(marker.waitForExistence(timeout: 45), "Wrong scene / intercepted URL: \(scene)", file: file, line: line)
        XCTAssertTrue(content.waitForExistence(timeout: 15), "Missing actual screen \(screen)", file: file, line: line)
        // The fixture disables motion. Give the asynchronous native GL first draw or
        // bounded procedural fallback time to settle, then assert the scene again.
        Thread.sleep(forTimeInterval: 10)
        XCTAssertTrue(marker.exists && content.exists, file: file, line: line)
        XCTAssertEqual(app.alerts.count, 0, "An application alert obscures the reference", file: file, line: line)
        XCTAssertEqual(springboard.alerts.count, 0, "A system alert obscures the reference", file: file, line: line)
        if let action = action {
            let button = app.buttons.matching(identifier: action).firstMatch
            XCTAssertTrue(button.exists && button.isHittable,
                          "Primary action not visible in the initial viewport: \(action)", file: file, line: line)
            let dock = app.descendants(matching: .any).matching(identifier: "nav-home").firstMatch
            if dock.exists {
                XCTAssertLessThanOrEqual(button.frame.maxY, dock.frame.minY,
                                         "Dock covers primary action \(action)", file: file, line: line)
            }
        }
        let prefix = String(format: "%02d-%@", index, scene)
        // Native GL can report a draw before iOS includes its layer in a screenshot.
        // Keep every attempted framebuffer, and select ONLY a consecutive stable pair.
        // This waits for presentation, never for resemblance to the design reference.
        let hasPlant = scene == "home" || scene == "garden"
        let plantState = app.descendants(matching: .any).matching(identifier: "plant-render-drawing").firstMatch
        if hasPlant {
            XCTAssertTrue(plantState.waitForExistence(timeout: 15),
                          "Canonical 3D capture must actually draw; fallback requires separate QA", file: file, line: line)
        }
        var previous: XCUIScreenshot? = nil
        var stablePair: (XCUIScreenshot, XCUIScreenshot)? = nil
        var presentationAttempts = 0
        for attempt in 1...8 {
            let screenshot = app.screenshot()
            let raw = XCTAttachment(screenshot: screenshot)
            raw.name = "\(prefix)-presentation-attempt-\(attempt)"; raw.lifetime = .keepAlways; add(raw)
            presentationAttempts = attempt
            if let last = previous, last.pngRepresentation == screenshot.pngRepresentation {
                stablePair = (last, screenshot)
                break
            }
            previous = screenshot
            Thread.sleep(forTimeInterval: 1)
        }
        guard let pair = stablePair else {
            XCTFail("Native screenshot did not settle; all attempted frames preserved", file: file, line: line)
            throw NSError(domain: "CUKI.NativePresentation", code: 1)
        }
        XCTAssertTrue(marker.exists && content.exists, file: file, line: line)
        XCTAssertEqual(springboard.alerts.count, 0, file: file, line: line)
        for (sample, screenshot) in [pair.0, pair.1].enumerated() {
            let frame = XCTAttachment(screenshot: screenshot)
            frame.name = "\(prefix)-\(sample + 1)"; frame.lifetime = .keepAlways; add(frame)
        }
        let tree = XCTAttachment(string: app.debugDescription)
        tree.name = prefix + "-accessibility"; tree.lifetime = .keepAlways; add(tree)
        let observation: [String: Any] = ["scene": scene, "screen": screen,
            "identifiedNativeScreen": true, "noApplicationAlert": true, "noSystemAlert": true,
            "primaryAction": action ?? "not-applicable", "fixtureSeed": 1852006,
            "stableConsecutivePair": true, "presentationAttempts": presentationAttempts,
            "plant3DDrawAsserted": hasPlant,
            "frame": ["width": app.frame.width, "height": app.frame.height]]
        let json = try JSONSerialization.data(withJSONObject: observation, options: [.sortedKeys])
        let proof = XCTAttachment(data: json, uniformTypeIdentifier: "public.json")
        proof.name = prefix + "-proof"; proof.lifetime = .keepAlways; add(proof)
    }
    func test01Home() throws { try capture("home", screen: "SC-07", index: 1, action: "home-register") }
    func test02Recipes() throws { try capture("recipes", screen: "SC-23", index: 2) }
    func test03Recipe() throws { try capture("recipe", screen: "SC-26", index: 3, action: "Registrar esta receta") }
    func test04Scan() throws { try capture("scan", screen: "SC-20", index: 4) }
    func test05Training() throws { try capture("training", screen: "SC-47", index: 5, action: "Completar serie") }
    func test06Garden() throws { try capture("garden", screen: "SC-79", index: 6) }
}
