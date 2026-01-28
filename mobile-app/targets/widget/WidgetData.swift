import Foundation

/// Data structure for widget display
/// This matches the JSON structure sent from React Native
struct WidgetData: Codable {
    var portfolioValue: Double
    var dailyChangeAmount: Double
    var dailyChangePercent: Double
    var goldSpot: Double
    var silverSpot: Double
    var goldChangeAmount: Double
    var goldChangePercent: Double
    var silverChangeAmount: Double
    var silverChangePercent: Double
    var goldValue: Double
    var silverValue: Double
    var goldOzt: Double
    var silverOzt: Double
    var lastUpdated: Date
    var hasSubscription: Bool

    enum CodingKeys: String, CodingKey {
        case portfolioValue
        case dailyChangeAmount
        case dailyChangePercent
        case goldSpot
        case silverSpot
        case goldChangeAmount
        case goldChangePercent
        case silverChangeAmount
        case silverChangePercent
        case goldValue
        case silverValue
        case goldOzt
        case silverOzt
        case lastUpdated
        case hasSubscription
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        portfolioValue = try container.decode(Double.self, forKey: .portfolioValue)
        dailyChangeAmount = try container.decode(Double.self, forKey: .dailyChangeAmount)
        dailyChangePercent = try container.decode(Double.self, forKey: .dailyChangePercent)
        goldSpot = try container.decode(Double.self, forKey: .goldSpot)
        silverSpot = try container.decode(Double.self, forKey: .silverSpot)
        goldChangeAmount = try container.decode(Double.self, forKey: .goldChangeAmount)
        goldChangePercent = try container.decode(Double.self, forKey: .goldChangePercent)
        silverChangeAmount = try container.decode(Double.self, forKey: .silverChangeAmount)
        silverChangePercent = try container.decode(Double.self, forKey: .silverChangePercent)
        goldValue = (try? container.decode(Double.self, forKey: .goldValue)) ?? 0
        silverValue = (try? container.decode(Double.self, forKey: .silverValue)) ?? 0
        goldOzt = (try? container.decode(Double.self, forKey: .goldOzt)) ?? 0
        silverOzt = (try? container.decode(Double.self, forKey: .silverOzt)) ?? 0
        lastUpdated = try container.decode(Date.self, forKey: .lastUpdated)
        hasSubscription = try container.decode(Bool.self, forKey: .hasSubscription)
    }

    init(portfolioValue: Double, dailyChangeAmount: Double, dailyChangePercent: Double,
         goldSpot: Double, silverSpot: Double,
         goldChangeAmount: Double, goldChangePercent: Double,
         silverChangeAmount: Double, silverChangePercent: Double,
         goldValue: Double = 0, silverValue: Double = 0,
         goldOzt: Double = 0, silverOzt: Double = 0,
         lastUpdated: Date, hasSubscription: Bool) {
        self.portfolioValue = portfolioValue
        self.dailyChangeAmount = dailyChangeAmount
        self.dailyChangePercent = dailyChangePercent
        self.goldSpot = goldSpot
        self.silverSpot = silverSpot
        self.goldChangeAmount = goldChangeAmount
        self.goldChangePercent = goldChangePercent
        self.silverChangeAmount = silverChangeAmount
        self.silverChangePercent = silverChangePercent
        self.goldValue = goldValue
        self.silverValue = silverValue
        self.goldOzt = goldOzt
        self.silverOzt = silverOzt
        self.lastUpdated = lastUpdated
        self.hasSubscription = hasSubscription
    }

    /// Placeholder data shown while loading
    static var placeholder: WidgetData {
        WidgetData(
            portfolioValue: 0,
            dailyChangeAmount: 0,
            dailyChangePercent: 0,
            goldSpot: 2650,
            silverSpot: 31,
            goldChangeAmount: 0,
            goldChangePercent: 0,
            silverChangeAmount: 0,
            silverChangePercent: 0,
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
            goldSpot: 5287.00,
            silverSpot: 114.17,
            goldChangeAmount: 93.80,
            goldChangePercent: 1.8,
            silverChangeAmount: 2.56,
            silverChangePercent: 2.3,
            goldValue: 52870,
            silverValue: 123562,
            goldOzt: 10,
            silverOzt: 1082.25,
            lastUpdated: Date().addingTimeInterval(-120),
            hasSubscription: true
        )
    }
}
