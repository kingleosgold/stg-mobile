import SwiftUI
import WidgetKit

/// Main widget entry view that switches between sizes
struct StackTrackerWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: WidgetEntry

    var body: some View {
        switch family {
        case .systemSmall:
            SmallWidgetView(data: entry.data)
        case .systemMedium:
            MediumWidgetView(data: entry.data)
        default:
            SmallWidgetView(data: entry.data)
        }
    }
}

// MARK: - Small Widget View

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        ZStack {
            // Background
            Color(hex: "#1a1a2e")

            VStack(alignment: .leading, spacing: 6) {
                // Header
                HStack {
                    Text("Stack Tracker")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Color(hex: "#fbbf24"))
                    Spacer()
                }

                Spacer()

                // Portfolio Value
                if data.hasSubscription {
                    Text(formatCurrency(data.portfolioValue))
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.6)
                        .lineLimit(1)

                    // Daily Change
                    HStack(spacing: 4) {
                        Text(formatChange(data.dailyChangeAmount))
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(changeColor)

                        Text("(\(formatPercent(data.dailyChangePercent)))")
                            .font(.system(size: 11))
                            .foregroundColor(changeColor)
                    }
                } else {
                    // Not subscribed message
                    VStack(spacing: 4) {
                        Text("Upgrade to Gold")
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Color(hex: "#fbbf24"))
                        Text("for widget access")
                            .font(.system(size: 11))
                            .foregroundColor(Color(hex: "#71717a"))
                    }
                }

                Spacer()

                // Last Updated
                Text(timeAgoString)
                    .font(.system(size: 9))
                    .foregroundColor(Color(hex: "#71717a"))
            }
            .padding(12)
        }
        .containerBackground(for: .widget) {
            Color(hex: "#1a1a2e")
        }
    }

    private var changeColor: Color {
        data.dailyChangeAmount >= 0 ? Color(hex: "#22c55e") : Color(hex: "#ef4444")
    }

    private var timeAgoString: String {
        let interval = Date().timeIntervalSince(data.lastUpdated)
        let minutes = Int(interval / 60)

        if minutes < 1 {
            return "Updated just now"
        } else if minutes == 1 {
            return "Updated 1m ago"
        } else if minutes < 60 {
            return "Updated \(minutes)m ago"
        } else {
            let hours = minutes / 60
            return hours == 1 ? "Updated 1h ago" : "Updated \(hours)h ago"
        }
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        ZStack {
            // Background
            Color(hex: "#1a1a2e")

            if data.hasSubscription {
                VStack(alignment: .leading, spacing: 8) {
                    // Header
                    HStack {
                        Text("Stack Tracker Pro")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Color(hex: "#fbbf24"))
                        Spacer()
                    }

                    Spacer()

                    // Portfolio Row
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Portfolio")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "#71717a"))
                            Text(formatCurrency(data.portfolioValue))
                                .font(.system(size: 22, weight: .bold))
                                .foregroundColor(.white)
                        }

                        Spacer()

                        // Daily Change
                        VStack(alignment: .trailing, spacing: 2) {
                            Text("Today")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "#71717a"))
                            HStack(spacing: 4) {
                                Text(formatChange(data.dailyChangeAmount))
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(changeColor)
                                Text("(\(formatPercent(data.dailyChangePercent)))")
                                    .font(.system(size: 12))
                                    .foregroundColor(changeColor)
                            }
                        }
                    }

                    Spacer()

                    // Spot Prices Row
                    HStack(spacing: 16) {
                        // Gold
                        HStack(spacing: 4) {
                            Text("🥇")
                                .font(.system(size: 14))
                            Text("Gold")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "#fbbf24"))
                            Text("$\(Int(data.goldSpot))")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        // Silver
                        HStack(spacing: 4) {
                            Text("🥈")
                                .font(.system(size: 14))
                            Text("Silver")
                                .font(.system(size: 11))
                                .foregroundColor(Color(hex: "#9ca3af"))
                            Text("$\(String(format: "%.2f", data.silverSpot))")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        Spacer()

                        // Last Updated
                        Text(timeAgoString)
                            .font(.system(size: 9))
                            .foregroundColor(Color(hex: "#71717a"))
                    }
                }
                .padding(14)
            } else {
                // Not subscribed
                VStack(spacing: 8) {
                    Text("🔒")
                        .font(.system(size: 28))
                    Text("Upgrade to Gold")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Color(hex: "#fbbf24"))
                    Text("Get portfolio widgets on your home screen")
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: "#71717a"))
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
        .containerBackground(for: .widget) {
            Color(hex: "#1a1a2e")
        }
    }

    private var changeColor: Color {
        data.dailyChangeAmount >= 0 ? Color(hex: "#22c55e") : Color(hex: "#ef4444")
    }

    private var timeAgoString: String {
        let interval = Date().timeIntervalSince(data.lastUpdated)
        let minutes = Int(interval / 60)

        if minutes < 1 {
            return "Just now"
        } else if minutes == 1 {
            return "1 min ago"
        } else if minutes < 60 {
            return "\(minutes) min ago"
        } else {
            let hours = minutes / 60
            return hours == 1 ? "1 hour ago" : "\(hours) hours ago"
        }
    }
}

// MARK: - Helper Functions

private func formatCurrency(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "$0"
}

private func formatChange(_ value: Double) -> String {
    let prefix = value >= 0 ? "+" : ""
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.maximumFractionDigits = 0
    return prefix + (formatter.string(from: NSNumber(value: value)) ?? "$0")
}

private func formatPercent(_ value: Double) -> String {
    let prefix = value >= 0 ? "+" : ""
    return "\(prefix)\(String(format: "%.1f", value))%"
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }
        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue: Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
