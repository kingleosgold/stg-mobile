import WidgetKit
import SwiftUI

/// Main widget bundle containing all widget sizes
@main
struct StackTrackerWidgetBundle: WidgetBundle {
    var body: some Widget {
        StackTrackerWidget()
    }
}

/// Stack Tracker Portfolio Widget
struct StackTrackerWidget: Widget {
    let kind: String = "StackTrackerWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            StackTrackerWidgetEntryView(entry: entry)
                .widgetBackground(Color.black)
        }
        .configurationDisplayName("Stack Tracker Gold")
        .description("View your precious metals portfolio value and live spot prices.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
        .contentMarginsDisabledIfAvailable()
    }
}

/// Timeline provider for widget data
/// Fetches fresh prices from backend cache and creates multiple timeline entries
struct Provider: TimelineProvider {
    private let appGroupId = "group.com.stacktrackerpro.shared"
    private let backendCacheUrl = "https://stack-tracker-pro-production.up.railway.app/api/widget-data"

    func placeholder(in context: Context) -> WidgetEntry {
        WidgetEntry(
            date: Date(),
            data: WidgetData.placeholder
        )
    }

    func getSnapshot(in context: Context, completion: @escaping (WidgetEntry) -> Void) {
        let entry = WidgetEntry(
            date: Date(),
            data: loadWidgetData()
        )
        completion(entry)
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<WidgetEntry>) -> Void) {
        print("🔧 [Widget] getTimeline called")

        // Use a background queue with async/await pattern for network request
        Task {
            let currentDate = Date()

            // Load existing widget data from App Group as fallback
            var data = loadWidgetData()
            print("🔧 [Widget] Loaded App Group data, portfolioValue: \(data.portfolioValue)")

            // Fetch fresh prices from backend cache (with timeout)
            if let freshPrices = await fetchFromBackendCacheAsync() {
                print("✅ [Widget] Got fresh prices - Gold: $\(freshPrices.gold), Silver: $\(freshPrices.silver), Pt: $\(freshPrices.platinum), Pd: $\(freshPrices.palladium)")

                data.goldSpot = freshPrices.gold
                data.silverSpot = freshPrices.silver
                data.platinumSpot = freshPrices.platinum
                data.palladiumSpot = freshPrices.palladium
                data.goldChangeAmount = freshPrices.goldChange
                data.goldChangePercent = freshPrices.goldChangePercent
                data.silverChangeAmount = freshPrices.silverChange
                data.silverChangePercent = freshPrices.silverChangePercent
                data.platinumChangeAmount = freshPrices.platinumChange
                data.platinumChangePercent = freshPrices.platinumChangePercent
                data.palladiumChangeAmount = freshPrices.palladiumChange
                data.palladiumChangePercent = freshPrices.palladiumChangePercent
                data.goldSparkline = freshPrices.goldSparkline
                data.silverSparkline = freshPrices.silverSparkline
                data.platinumSparkline = freshPrices.platinumSparkline
                data.palladiumSparkline = freshPrices.palladiumSparkline
                data.lastUpdated = currentDate

                // Save updated data to App Group so app benefits too
                saveWidgetData(data)
                print("✅ [Widget] Saved fresh data to App Group")
            } else {
                print("⚠️ [Widget] Using cached App Group data (fetch failed or timed out)")
            }

            // Create multiple timeline entries for the next 6 hours (every 15 min = 24 entries)
            // This ensures the widget stays fresh even when app is closed
            var entries: [WidgetEntry] = []

            for minuteOffset in stride(from: 0, to: 360, by: 15) {
                let entryDate = Calendar.current.date(byAdding: .minute, value: minuteOffset, to: currentDate)!
                var entryData = data
                entryData.lastUpdated = currentDate
                entries.append(WidgetEntry(date: entryDate, data: entryData))
            }

            print("🔧 [Widget] Created \(entries.count) timeline entries (6 hours coverage)")

            // Request a new timeline after 15 minutes to match app's background fetch
            // This ensures widget stays as fresh as possible even when app is closed
            let nextRefresh = Calendar.current.date(byAdding: .minute, value: 15, to: currentDate)!
            let timeline = Timeline(entries: entries, policy: .after(nextRefresh))

            // Complete on main thread
            DispatchQueue.main.async {
                completion(timeline)
                print("✅ [Widget] Timeline completed")
            }
        }
    }

    /// Fetch spot prices + sparklines from backend widget-data endpoint
    private func fetchFromBackendCacheAsync() async -> SpotPrices? {
        guard let url = URL(string: backendCacheUrl) else {
            print("❌ [Widget] Invalid URL")
            return nil
        }

        print("🔧 [Widget] Fetching from: \(backendCacheUrl)")

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config)

        do {
            let (data, response) = try await session.data(from: url)

            if let httpResponse = response as? HTTPURLResponse {
                print("🔧 [Widget] HTTP status: \(httpResponse.statusCode)")
                guard httpResponse.statusCode == 200 else {
                    print("❌ [Widget] Bad HTTP status: \(httpResponse.statusCode)")
                    return nil
                }
            }

            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let success = json["success"] as? Bool, success,
                  let metals = json["metals"] as? [[String: Any]] else {
                print("❌ [Widget] Failed to parse JSON or success=false")
                return nil
            }

            // Parse metals array: [{symbol, price, change_pct, sparkline}, ...]
            var gold: Double = 0, silver: Double = 0, platinum: Double = 0, palladium: Double = 0
            var goldSparkline: [Double] = [], silverSparkline: [Double] = []
            var platinumSparkline: [Double] = [], palladiumSparkline: [Double] = []

            for metal in metals {
                let symbol = metal["symbol"] as? String ?? ""
                let price = (metal["price"] as? NSNumber)?.doubleValue ?? 0
                // Robust sparkline parsing: handle NSNumber arrays from JSONSerialization
                let sparkline: [Double] = (metal["sparkline"] as? [Any])?.compactMap { ($0 as? NSNumber)?.doubleValue } ?? []

                switch symbol {
                case "Au":
                    gold = price
                    goldSparkline = sparkline
                case "Ag":
                    silver = price
                    silverSparkline = sparkline
                case "Pt":
                    platinum = price
                    platinumSparkline = sparkline
                case "Pd":
                    palladium = price
                    palladiumSparkline = sparkline
                default: break
                }
            }

            // Parse change data from nested change object
            var goldChange: Double = 0, goldChangePercent: Double = 0
            var silverChange: Double = 0, silverChangePercent: Double = 0
            var platinumChange: Double = 0, platinumChangePercent: Double = 0
            var palladiumChange: Double = 0, palladiumChangePercent: Double = 0

            if let change = json["change"] as? [String: Any] {
                if let d = change["gold"] as? [String: Any] {
                    goldChange = d["amount"] as? Double ?? 0
                    goldChangePercent = d["percent"] as? Double ?? 0
                }
                if let d = change["silver"] as? [String: Any] {
                    silverChange = d["amount"] as? Double ?? 0
                    silverChangePercent = d["percent"] as? Double ?? 0
                }
                if let d = change["platinum"] as? [String: Any] {
                    platinumChange = d["amount"] as? Double ?? 0
                    platinumChangePercent = d["percent"] as? Double ?? 0
                }
                if let d = change["palladium"] as? [String: Any] {
                    palladiumChange = d["amount"] as? Double ?? 0
                    palladiumChangePercent = d["percent"] as? Double ?? 0
                }
            }

            print("✅ [Widget] Parsed sparklines - Au:\(goldSparkline.count)pts, Ag:\(silverSparkline.count)pts")

            return SpotPrices(
                gold: gold, silver: silver, platinum: platinum, palladium: palladium,
                goldChange: goldChange, goldChangePercent: goldChangePercent,
                silverChange: silverChange, silverChangePercent: silverChangePercent,
                platinumChange: platinumChange, platinumChangePercent: platinumChangePercent,
                palladiumChange: palladiumChange, palladiumChangePercent: palladiumChangePercent,
                goldSparkline: goldSparkline, silverSparkline: silverSparkline,
                platinumSparkline: platinumSparkline, palladiumSparkline: palladiumSparkline
            )

        } catch {
            print("❌ [Widget] Fetch error: \(error.localizedDescription)")
            return nil
        }
    }

    /// Save widget data to App Group storage
    private func saveWidgetData(_ data: WidgetData) {
        guard let userDefaults = UserDefaults(suiteName: appGroupId) else {
            print("❌ [Widget] Failed to access App Group for save")
            return
        }

        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let jsonData = try encoder.encode(data)
            if let jsonString = String(data: jsonData, encoding: .utf8) {
                userDefaults.set(jsonString, forKey: "widgetData")
                userDefaults.synchronize() // Force immediate write
            }
        } catch {
            print("❌ [Widget] Failed to save data: \(error)")
        }
    }

    /// Load widget data from shared App Group storage
    private func loadWidgetData() -> WidgetData {
        guard let userDefaults = UserDefaults(suiteName: appGroupId) else {
            print("❌ [Widget] Failed to access App Group")
            return WidgetData.placeholder
        }

        guard let jsonString = userDefaults.string(forKey: "widgetData") else {
            print("❌ [Widget] No data in App Group")
            return WidgetData.placeholder
        }

        guard let jsonData = jsonString.data(using: .utf8) else {
            return WidgetData.placeholder
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let data = try decoder.decode(WidgetData.self, from: jsonData)
            return data
        } catch {
            print("❌ [Widget] Failed to decode: \(error)")
            return WidgetData.placeholder
        }
    }
}

/// Spot prices + sparklines from backend
struct SpotPrices {
    let gold: Double
    let silver: Double
    let platinum: Double
    let palladium: Double
    let goldChange: Double
    let goldChangePercent: Double
    let silverChange: Double
    let silverChangePercent: Double
    let platinumChange: Double
    let platinumChangePercent: Double
    let palladiumChange: Double
    let palladiumChangePercent: Double
    let goldSparkline: [Double]
    let silverSparkline: [Double]
    let platinumSparkline: [Double]
    let palladiumSparkline: [Double]
}

/// Timeline entry containing widget data
struct WidgetEntry: TimelineEntry {
    let date: Date
    let data: WidgetData
}

/// Preview provider for widget
struct StackTrackerWidget_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            StackTrackerWidgetEntryView(entry: WidgetEntry(
                date: Date(),
                data: WidgetData.preview
            ))
            .previewContext(WidgetPreviewContext(family: .systemSmall))

            StackTrackerWidgetEntryView(entry: WidgetEntry(
                date: Date(),
                data: WidgetData.preview
            ))
            .previewContext(WidgetPreviewContext(family: .systemMedium))

            StackTrackerWidgetEntryView(entry: WidgetEntry(
                date: Date(),
                data: WidgetData.preview
            ))
            .previewContext(WidgetPreviewContext(family: .systemLarge))
        }
    }
}
