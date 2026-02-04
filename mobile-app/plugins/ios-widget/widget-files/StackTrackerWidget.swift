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
        }
        .configurationDisplayName("Stack Tracker Gold")
        .description("View your precious metals portfolio value and live spot prices.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}

/// Timeline provider for widget data
/// Fetches fresh prices from backend cache and creates multiple timeline entries
struct Provider: TimelineProvider {
    private let appGroupId = "group.com.stacktrackerpro.shared"
    private let backendCacheUrl = "https://stack-tracker-pro-production.up.railway.app/api/spot-prices"

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
                print("✅ [Widget] Got fresh prices - Gold: $\(freshPrices.gold), Silver: $\(freshPrices.silver)")

                data.goldSpot = freshPrices.gold
                data.silverSpot = freshPrices.silver
                data.goldChangeAmount = freshPrices.goldChange
                data.goldChangePercent = freshPrices.goldChangePercent
                data.silverChangeAmount = freshPrices.silverChange
                data.silverChangePercent = freshPrices.silverChangePercent
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

            // Request a new timeline after 1 hour (more aggressive refresh)
            // This fetches fresh data from backend even if app is closed
            let nextRefresh = Calendar.current.date(byAdding: .hour, value: 1, to: currentDate)!
            let timeline = Timeline(entries: entries, policy: .after(nextRefresh))

            // Complete on main thread
            DispatchQueue.main.async {
                completion(timeline)
                print("✅ [Widget] Timeline completed")
            }
        }
    }

    /// Fetch spot prices from backend cache using async/await with timeout
    private func fetchFromBackendCacheAsync() async -> SpotPrices? {
        guard let url = URL(string: backendCacheUrl) else {
            print("❌ [Widget] Invalid URL")
            return nil
        }

        print("🔧 [Widget] Fetching from: \(backendCacheUrl)")

        // Create URLSession with timeout
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 10 // 10 second timeout
        config.timeoutIntervalForResource = 15
        let session = URLSession(configuration: config)

        do {
            let (data, response) = try await session.data(from: url)

            // Check HTTP status
            if let httpResponse = response as? HTTPURLResponse {
                print("🔧 [Widget] HTTP status: \(httpResponse.statusCode)")
                guard httpResponse.statusCode == 200 else {
                    print("❌ [Widget] Bad HTTP status: \(httpResponse.statusCode)")
                    return nil
                }
            }

            // Parse JSON
            guard let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let success = json["success"] as? Bool, success,
                  let gold = json["gold"] as? Double,
                  let silver = json["silver"] as? Double else {
                print("❌ [Widget] Failed to parse JSON or success=false")
                return nil
            }

            var goldChange: Double = 0
            var goldChangePercent: Double = 0
            var silverChange: Double = 0
            var silverChangePercent: Double = 0

            if let change = json["change"] as? [String: Any] {
                if let goldData = change["gold"] as? [String: Any] {
                    goldChange = goldData["amount"] as? Double ?? 0
                    goldChangePercent = goldData["percent"] as? Double ?? 0
                }
                if let silverData = change["silver"] as? [String: Any] {
                    silverChange = silverData["amount"] as? Double ?? 0
                    silverChangePercent = silverData["percent"] as? Double ?? 0
                }
            }

            return SpotPrices(
                gold: gold,
                silver: silver,
                goldChange: goldChange,
                goldChangePercent: goldChangePercent,
                silverChange: silverChange,
                silverChangePercent: silverChangePercent
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

/// Spot prices from backend cache
struct SpotPrices {
    let gold: Double
    let silver: Double
    let goldChange: Double
    let goldChangePercent: Double
    let silverChange: Double
    let silverChangePercent: Double
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
