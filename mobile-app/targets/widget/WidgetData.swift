import Foundation

/// Data structure for widget display
/// This matches the JSON structure sent from React Native
struct WidgetData: Codable {
    let portfolioValue: Double
    let dailyChangeAmount: Double
    let dailyChangePercent: Double
    let goldSpot: Double
    let silverSpot: Double
    let lastUpdated: Date
    let hasSubscription: Bool

    enum CodingKeys: String, CodingKey {
        case portfolioValue
        case dailyChangeAmount
        case dailyChangePercent
        case goldSpot
        case silverSpot
        case lastUpdated
        case hasSubscription
    }

    /// Placeholder data shown while loading
    static var placeholder: WidgetData {
        WidgetData(
            portfolioValue: 0,
            dailyChangeAmount: 0,
            dailyChangePercent: 0,
            goldSpot: 2650,
            silverSpot: 31,
            lastUpdated: Date(),
            hasSubscription: false
        )
    }

    /// Preview data for widget previews
    static var preview: WidgetData {
        WidgetData(
            portfolioValue: 176432,
            dailyChangeAmount: 1204,
            dailyChangePercent: 0.69,
            goldSpot: 4530,
            silverSpot: 77.50,
            lastUpdated: Date().addingTimeInterval(-120), // 2 minutes ago
            hasSubscription: true
        )
    }
}
