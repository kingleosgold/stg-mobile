import SwiftUI
import WidgetKit

// MARK: - Design Constants

private let bgColor = Color(hex: "#1a1a2e")
private let goldAccent = Color(hex: "#D4AF37")
private let greenColor = Color(hex: "#4CAF50")
private let redColor = Color(hex: "#F44336")
private let mutedColor = Color(hex: "#71717a")
private let silverColor = Color(hex: "#9ca3af")

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
        case .systemLarge:
            LargeWidgetView(data: entry.data)
        default:
            SmallWidgetView(data: entry.data)
        }
    }
}

// MARK: - Small Widget View

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if data.hasSubscription {
                // Portfolio label
                Text("Portfolio")
                    .font(.system(size: 11, weight: .medium))
                    .foregroundColor(mutedColor)
                    .padding(.bottom, 2)

                // Hero portfolio value
                Text(formatCurrency(data.portfolioValue))
                    .font(.system(size: 32, weight: .bold))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
                    .padding(.bottom, 4)

                // Daily change with arrow and percent
                HStack(spacing: 4) {
                    Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                        .font(.system(size: 12, weight: .bold))
                        .foregroundColor(changeColor(data.dailyChangeAmount))
                    Text(formatChange(data.dailyChangeAmount))
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(changeColor(data.dailyChangeAmount))
                    Text("(\(formatPercent(data.dailyChangePercent)))")
                        .font(.system(size: 11))
                        .foregroundColor(changeColor(data.dailyChangeAmount))
                }
                .lineLimit(1)
                .minimumScaleFactor(0.7)

                Spacer()

                // Branding
                Text("Stack Tracker Gold")
                    .font(.system(size: 8, weight: .semibold))
                    .foregroundColor(goldAccent.opacity(0.7))
            } else {
                Spacer()
                VStack(spacing: 4) {
                    Text("Upgrade to Gold")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(goldAccent)
                    Text("for widget access")
                        .font(.system(size: 11))
                        .foregroundColor(mutedColor)
                }
                .frame(maxWidth: .infinity)
                Spacer()
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .containerBackground(for: .widget) { bgColor }
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        Group {
            if data.hasSubscription {
                VStack(alignment: .leading, spacing: 0) {
                    // Top: Portfolio value and daily change
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Portfolio")
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(mutedColor)

                        Text(formatCurrency(data.portfolioValue))
                            .font(.system(size: 38, weight: .bold))
                            .foregroundColor(.white)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)

                        HStack(spacing: 4) {
                            Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text(formatChange(data.dailyChangeAmount))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text("(\(formatPercent(data.dailyChangePercent)))")
                                .font(.system(size: 11))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                        }
                    }

                    Spacer(minLength: 8)

                    // Bottom: Spot prices side by side
                    HStack(spacing: 0) {
                        // Silver
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Silver (Ag)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(silverColor)
                            Text(formatSpotPrice(data.silverSpot))
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                            HStack(spacing: 3) {
                                Text(data.silverChangeAmount >= 0 ? "▲" : "▼")
                                    .font(.system(size: 9, weight: .bold))
                                Text(formatPercent(data.silverChangePercent))
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(changeColor(data.silverChangeAmount))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        // Gold
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Gold (Au)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(goldAccent)
                            Text(formatSpotPrice(data.goldSpot))
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(.white)
                                .minimumScaleFactor(0.7)
                                .lineLimit(1)
                            HStack(spacing: 3) {
                                Text(data.goldChangeAmount >= 0 ? "▲" : "▼")
                                    .font(.system(size: 9, weight: .bold))
                                Text(formatPercent(data.goldChangePercent))
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(changeColor(data.goldChangeAmount))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer(minLength: 4)

                    // Branding
                    Text("Stack Tracker Gold")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(goldAccent.opacity(0.7))
                }
                .padding(12)
            } else {
                VStack(spacing: 8) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 28))
                        .foregroundColor(mutedColor)
                    Text("Upgrade to Gold")
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(goldAccent)
                    Text("Get portfolio widgets on your home screen")
                        .font(.system(size: 12))
                        .foregroundColor(mutedColor)
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(for: .widget) { bgColor }
    }
}

// MARK: - Large Widget View

struct LargeWidgetView: View {
    let data: WidgetData

    var body: some View {
        Group {
            if data.hasSubscription {
                VStack(alignment: .leading, spacing: 0) {
                    // Top: Portfolio hero
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Portfolio")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(mutedColor)

                        Text(formatCurrency(data.portfolioValue))
                            .font(.system(size: 48, weight: .bold))
                            .foregroundColor(.white)
                            .minimumScaleFactor(0.5)
                            .lineLimit(1)

                        HStack(spacing: 4) {
                            Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text(formatChange(data.dailyChangeAmount))
                                .font(.system(size: 15, weight: .semibold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text("(\(formatPercent(data.dailyChangePercent)))")
                                .font(.system(size: 13))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                        }
                    }

                    Spacer(minLength: 12)

                    // Divider
                    Rectangle()
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 1)
                        .padding(.bottom, 12)

                    // Middle: Silver and Gold holdings side by side
                    HStack(spacing: 0) {
                        // Silver holdings
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Silver")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(silverColor)
                            Text(formatCurrency(data.silverValue))
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(.white)
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                            Text(formatOunces(data.silverOzt) + " oz")
                                .font(.system(size: 12))
                                .foregroundColor(mutedColor)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        // Gold holdings
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Gold")
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(goldAccent)
                            Text(formatCurrency(data.goldValue))
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(.white)
                                .minimumScaleFactor(0.6)
                                .lineLimit(1)
                            Text(formatOunces(data.goldOzt) + " oz")
                                .font(.system(size: 12))
                                .foregroundColor(mutedColor)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer(minLength: 12)

                    // Divider
                    Rectangle()
                        .fill(Color.white.opacity(0.08))
                        .frame(height: 1)
                        .padding(.bottom, 12)

                    // Bottom: Spot prices
                    HStack(spacing: 0) {
                        // Silver spot
                        HStack(spacing: 6) {
                            Text("Silver (Ag)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(silverColor)
                            Text(formatSpotPrice(data.silverSpot))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                            HStack(spacing: 2) {
                                Text(data.silverChangeAmount >= 0 ? "▲" : "▼")
                                    .font(.system(size: 8, weight: .bold))
                                Text(formatPercent(data.silverChangePercent))
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(changeColor(data.silverChangeAmount))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)

                        // Gold spot
                        HStack(spacing: 6) {
                            Text("Gold (Au)")
                                .font(.system(size: 11, weight: .semibold))
                                .foregroundColor(goldAccent)
                            Text(formatSpotPrice(data.goldSpot))
                                .font(.system(size: 13, weight: .bold))
                                .foregroundColor(.white)
                            HStack(spacing: 2) {
                                Text(data.goldChangeAmount >= 0 ? "▲" : "▼")
                                    .font(.system(size: 8, weight: .bold))
                                Text(formatPercent(data.goldChangePercent))
                                    .font(.system(size: 10, weight: .medium))
                            }
                            .foregroundColor(changeColor(data.goldChangeAmount))
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                    }

                    Spacer(minLength: 8)

                    // Branding
                    Text("Stack Tracker Gold")
                        .font(.system(size: 8, weight: .semibold))
                        .foregroundColor(goldAccent.opacity(0.7))
                }
                .padding(14)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "lock.fill")
                        .font(.system(size: 36))
                        .foregroundColor(mutedColor)
                    Text("Upgrade to Gold")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(goldAccent)
                    Text("Get portfolio widgets on your home screen")
                        .font(.system(size: 13))
                        .foregroundColor(mutedColor)
                        .multilineTextAlignment(.center)
                }
                .padding()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .containerBackground(for: .widget) { bgColor }
    }
}

// MARK: - Helper Functions

private func changeColor(_ value: Double) -> Color {
    value >= 0 ? greenColor : redColor
}

private func formatCurrency(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.maximumFractionDigits = 0
    return formatter.string(from: NSNumber(value: value)) ?? "$0"
}

private func formatSpotPrice(_ value: Double) -> String {
    let formatter = NumberFormatter()
    formatter.numberStyle = .currency
    formatter.minimumFractionDigits = 2
    formatter.maximumFractionDigits = 2
    return formatter.string(from: NSNumber(value: value)) ?? "$0.00"
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

private func formatOunces(_ value: Double) -> String {
    if value == floor(value) {
        return String(format: "%.0f", value)
    } else if value * 10 == floor(value * 10) {
        return String(format: "%.1f", value)
    } else {
        return String(format: "%.2f", value)
    }
}

// MARK: - Color Extension

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3:
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6:
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8:
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
