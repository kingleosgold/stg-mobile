import Foundation

/// Data structure for widget display
/// This matches the JSON structure sent from React Native
struct WidgetData: Codable {
    var portfolioValue: Double
    var dailyChangeAmount: Double
    var dailyChangePercent: Double
    var goldSpot: Double
    var silverSpot: Double
    var platinumSpot: Double
    var palladiumSpot: Double
    var goldChangeAmount: Double
    var goldChangePercent: Double
    var silverChangeAmount: Double
    var silverChangePercent: Double
    var platinumChangeAmount: Double
    var platinumChangePercent: Double
    var palladiumChangeAmount: Double
    var palladiumChangePercent: Double
    var goldValue: Double
    var silverValue: Double
    var platinumValue: Double
    var palladiumValue: Double
    var goldOzt: Double
    var silverOzt: Double
    var platinumOzt: Double
    var palladiumOzt: Double
    var lastUpdated: Date
    var hasSubscription: Bool
    var hideValues: Bool

    // Sparkline data (7 data points per metal)
    var goldSparkline: [Double]
    var silverSparkline: [Double]
    var platinumSparkline: [Double]
    var palladiumSparkline: [Double]

    enum CodingKeys: String, CodingKey {
        case portfolioValue, dailyChangeAmount, dailyChangePercent
        case goldSpot, silverSpot, platinumSpot, palladiumSpot
        case goldChangeAmount, goldChangePercent
        case silverChangeAmount, silverChangePercent
        case platinumChangeAmount, platinumChangePercent
        case palladiumChangeAmount, palladiumChangePercent
        case goldValue, silverValue, platinumValue, palladiumValue
        case goldOzt, silverOzt, platinumOzt, palladiumOzt
        case lastUpdated, hasSubscription, hideValues
        case goldSparkline, silverSparkline, platinumSparkline, palladiumSparkline
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        portfolioValue = try container.decode(Double.self, forKey: .portfolioValue)
        dailyChangeAmount = try container.decode(Double.self, forKey: .dailyChangeAmount)
        dailyChangePercent = try container.decode(Double.self, forKey: .dailyChangePercent)
        goldSpot = try container.decode(Double.self, forKey: .goldSpot)
        silverSpot = try container.decode(Double.self, forKey: .silverSpot)
        platinumSpot = (try? container.decode(Double.self, forKey: .platinumSpot)) ?? 0
        palladiumSpot = (try? container.decode(Double.self, forKey: .palladiumSpot)) ?? 0
        goldChangeAmount = try container.decode(Double.self, forKey: .goldChangeAmount)
        goldChangePercent = try container.decode(Double.self, forKey: .goldChangePercent)
        silverChangeAmount = try container.decode(Double.self, forKey: .silverChangeAmount)
        silverChangePercent = try container.decode(Double.self, forKey: .silverChangePercent)
        platinumChangeAmount = (try? container.decode(Double.self, forKey: .platinumChangeAmount)) ?? 0
        platinumChangePercent = (try? container.decode(Double.self, forKey: .platinumChangePercent)) ?? 0
        palladiumChangeAmount = (try? container.decode(Double.self, forKey: .palladiumChangeAmount)) ?? 0
        palladiumChangePercent = (try? container.decode(Double.self, forKey: .palladiumChangePercent)) ?? 0
        goldValue = (try? container.decode(Double.self, forKey: .goldValue)) ?? 0
        silverValue = (try? container.decode(Double.self, forKey: .silverValue)) ?? 0
        platinumValue = (try? container.decode(Double.self, forKey: .platinumValue)) ?? 0
        palladiumValue = (try? container.decode(Double.self, forKey: .palladiumValue)) ?? 0
        goldOzt = (try? container.decode(Double.self, forKey: .goldOzt)) ?? 0
        silverOzt = (try? container.decode(Double.self, forKey: .silverOzt)) ?? 0
        platinumOzt = (try? container.decode(Double.self, forKey: .platinumOzt)) ?? 0
        palladiumOzt = (try? container.decode(Double.self, forKey: .palladiumOzt)) ?? 0
        lastUpdated = try container.decode(Date.self, forKey: .lastUpdated)
        hasSubscription = try container.decode(Bool.self, forKey: .hasSubscription)
        hideValues = (try? container.decode(Bool.self, forKey: .hideValues)) ?? false
        goldSparkline = (try? container.decode([Double].self, forKey: .goldSparkline)) ?? []
        silverSparkline = (try? container.decode([Double].self, forKey: .silverSparkline)) ?? []
        platinumSparkline = (try? container.decode([Double].self, forKey: .platinumSparkline)) ?? []
        palladiumSparkline = (try? container.decode([Double].self, forKey: .palladiumSparkline)) ?? []
    }

    init(portfolioValue: Double, dailyChangeAmount: Double, dailyChangePercent: Double,
         goldSpot: Double, silverSpot: Double,
         platinumSpot: Double = 0, palladiumSpot: Double = 0,
         goldChangeAmount: Double, goldChangePercent: Double,
         silverChangeAmount: Double, silverChangePercent: Double,
         platinumChangeAmount: Double = 0, platinumChangePercent: Double = 0,
         palladiumChangeAmount: Double = 0, palladiumChangePercent: Double = 0,
         goldValue: Double = 0, silverValue: Double = 0,
         platinumValue: Double = 0, palladiumValue: Double = 0,
         goldOzt: Double = 0, silverOzt: Double = 0,
         platinumOzt: Double = 0, palladiumOzt: Double = 0,
         lastUpdated: Date, hasSubscription: Bool,
         hideValues: Bool = false,
         goldSparkline: [Double] = [], silverSparkline: [Double] = [],
         platinumSparkline: [Double] = [], palladiumSparkline: [Double] = []) {
        self.portfolioValue = portfolioValue
        self.dailyChangeAmount = dailyChangeAmount
        self.dailyChangePercent = dailyChangePercent
        self.goldSpot = goldSpot
        self.silverSpot = silverSpot
        self.platinumSpot = platinumSpot
        self.palladiumSpot = palladiumSpot
        self.goldChangeAmount = goldChangeAmount
        self.goldChangePercent = goldChangePercent
        self.silverChangeAmount = silverChangeAmount
        self.silverChangePercent = silverChangePercent
        self.platinumChangeAmount = platinumChangeAmount
        self.platinumChangePercent = platinumChangePercent
        self.palladiumChangeAmount = palladiumChangeAmount
        self.palladiumChangePercent = palladiumChangePercent
        self.goldValue = goldValue
        self.silverValue = silverValue
        self.platinumValue = platinumValue
        self.palladiumValue = palladiumValue
        self.goldOzt = goldOzt
        self.silverOzt = silverOzt
        self.platinumOzt = platinumOzt
        self.palladiumOzt = palladiumOzt
        self.lastUpdated = lastUpdated
        self.hasSubscription = hasSubscription
        self.hideValues = hideValues
        self.goldSparkline = goldSparkline
        self.silverSparkline = silverSparkline
        self.platinumSparkline = platinumSparkline
        self.palladiumSparkline = palladiumSparkline
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
            platinumSpot: 2700,
            palladiumSpot: 1850,
            goldChangeAmount: 93.80,
            goldChangePercent: 1.8,
            silverChangeAmount: 2.56,
            silverChangePercent: 2.3,
            platinumChangeAmount: 45.00,
            platinumChangePercent: 1.7,
            palladiumChangeAmount: -22.50,
            palladiumChangePercent: -1.2,
            goldValue: 52870,
            silverValue: 123562,
            platinumValue: 5400,
            palladiumValue: 1850,
            goldOzt: 10,
            silverOzt: 1082.25,
            platinumOzt: 2,
            palladiumOzt: 1,
            lastUpdated: Date().addingTimeInterval(-120),
            hasSubscription: true,
            goldSparkline: [5150, 5180, 5220, 5195, 5240, 5260, 5287],
            silverSparkline: [110, 111.5, 112, 113, 112.5, 113.8, 114.17],
            platinumSparkline: [2650, 2660, 2670, 2680, 2690, 2695, 2700],
            palladiumSparkline: [1880, 1870, 1860, 1855, 1850, 1845, 1850]
        )
    }

    /// Compute portfolio sparkline from metal sparklines and ounce holdings
    func portfolioSparkline() -> [Double] {
        guard goldSparkline.count >= 2 else { return [] }
        let count: Int = min(goldSparkline.count, silverSparkline.count)
        var result: [Double] = []
        for i in 0..<count {
            let g: Double = goldOzt * goldSparkline[i]
            let s: Double = silverOzt * silverSparkline[i]
            let ptPrice: Double = i < platinumSparkline.count ? platinumSparkline[i] : platinumSpot
            let pt: Double = platinumOzt * ptPrice
            let pdPrice: Double = i < palladiumSparkline.count ? palladiumSparkline[i] : palladiumSpot
            let pd: Double = palladiumOzt * pdPrice
            let total: Double = g + s + pt + pd
            result.append(total)
        }
        return result
    }
}
