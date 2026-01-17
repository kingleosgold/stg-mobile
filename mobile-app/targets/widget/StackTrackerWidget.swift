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
        .configurationDisplayName("Stack Tracker")
        .description("View your precious metals portfolio value and spot prices at a glance.")
        .supportedFamilies([.systemSmall, .systemMedium])
    }
}

/// Timeline provider for widget data
struct Provider: TimelineProvider {
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
        let currentDate = Date()
        let data = loadWidgetData()

        let entry = WidgetEntry(
            date: currentDate,
            data: data
        )

        // Refresh every 15 minutes
        let refreshDate = Calendar.current.date(byAdding: .minute, value: 15, to: currentDate)!

        let timeline = Timeline(entries: [entry], policy: .after(refreshDate))
        completion(timeline)
    }

    /// Load widget data from shared App Group storage
    private func loadWidgetData() -> WidgetData {
        let appGroupId = "group.com.stacktrackerpro.shared"

        guard let userDefaults = UserDefaults(suiteName: appGroupId),
              let jsonString = userDefaults.string(forKey: "widgetData"),
              let jsonData = jsonString.data(using: .utf8) else {
            return WidgetData.placeholder
        }

        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            return try decoder.decode(WidgetData.self, from: jsonData)
        } catch {
            print("Widget: Failed to decode data: \(error)")
            return WidgetData.placeholder
        }
    }
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
        }
    }
}
