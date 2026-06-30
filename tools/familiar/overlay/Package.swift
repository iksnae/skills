// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "FamiliarOverlay",
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(name: "FamiliarOverlay", path: "Sources/FamiliarOverlay")
    ]
)
