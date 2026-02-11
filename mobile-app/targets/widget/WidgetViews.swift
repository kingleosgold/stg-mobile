import SwiftUI
import WidgetKit

// MARK: - Design Constants

private let bgColor = Color(hex: "#1a1a1a")
private let goldAccent = Color(hex: "#D4A843")
private let greenColor = Color(hex: "#4CAF50")
private let redColor = Color(hex: "#F44336")
private let mutedColor = Color(hex: "#71717a")
private let silverColor = Color(hex: "#9ca3af")
private let platinumColor = Color(hex: "#7BB3D4")
private let palladiumColor = Color(hex: "#6BBF8A")

// MARK: - Helpers

/// Gold shimmer accent line at top of widget
private func goldAccentLine() -> some View {
    Rectangle()
        .fill(goldAccent)
        .frame(height: 2)
}

/// Privacy masking: returns masked text when hidden
private func privacyText(_ text: String, _ hide: Bool) -> String {
    hide ? "••••••" : text
}

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
                goldAccentLine()

                VStack(alignment: .leading, spacing: 0) {
                    // Logo + label
                    HStack(spacing: 6) {
                        Image("AppIcon")
                            .resizable()
                            .frame(width: 20, height: 20)
                            .cornerRadius(4)
                        Text("PORTFOLIO")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(mutedColor)
                            .kerning(1.2)
                    }
                    .padding(.top, 10)
                    .padding(.bottom, 6)

                    // Portfolio value
                    Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                        .font(.system(size: 28, weight: .bold))
                        .foregroundColor(.white)
                        .minimumScaleFactor(0.5)
                        .lineLimit(1)
                        .padding(.bottom, 4)

                    // Daily change
                    HStack(spacing: 4) {
                        Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                            .font(.system(size: 10, weight: .bold))
                            .foregroundColor(changeColor(data.dailyChangeAmount))
                        Text(privacyText(formatChange(data.dailyChangeAmount), data.hideValues))
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(changeColor(data.dailyChangeAmount))
                        Text("(\(formatPercent(data.dailyChangePercent)))")
                            .font(.system(size: 10))
                            .foregroundColor(changeColor(data.dailyChangeAmount))
                    }
                    .lineLimit(1)
                    .minimumScaleFactor(0.7)

                    Spacer()

                    // Bottom: colored dots for held metals
                    HStack(spacing: 6) {
                        if data.goldValue > 0 {
                            Circle().fill(goldAccent).frame(width: 8, height: 8)
                        }
                        if data.silverValue > 0 {
                            Circle().fill(silverColor).frame(width: 8, height: 8)
                        }
                        if data.platinumValue > 0 {
                            Circle().fill(platinumColor).frame(width: 8, height: 8)
                        }
                        if data.palladiumValue > 0 {
                            Circle().fill(palladiumColor).frame(width: 8, height: 8)
                        }
                    }
                    .padding(.bottom, 2)
                }
                .padding(.horizontal, 12)
                .padding(.bottom, 10)
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
                    goldAccentLine()

                    VStack(alignment: .leading, spacing: 0) {
                        // Top row: logo + portfolio value + change
                        HStack(alignment: .top) {
                            Image("AppIcon")
                                .resizable()
                                .frame(width: 18, height: 18)
                                .cornerRadius(4)
                                .padding(.top, 2)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                                    .font(.system(size: 32, weight: .bold))
                                    .foregroundColor(.white)
                                    .minimumScaleFactor(0.5)
                                    .lineLimit(1)

                                HStack(spacing: 4) {
                                    Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                                        .font(.system(size: 10, weight: .bold))
                                        .foregroundColor(changeColor(data.dailyChangeAmount))
                                    Text(privacyText(formatChange(data.dailyChangeAmount), data.hideValues))
                                        .font(.system(size: 12, weight: .semibold))
                                        .foregroundColor(changeColor(data.dailyChangeAmount))
                                    Text("(\(formatPercent(data.dailyChangePercent)))")
                                        .font(.system(size: 10))
                                        .foregroundColor(changeColor(data.dailyChangeAmount))
                                }
                            }

                            Spacer()
                        }
                        .padding(.top, 10)

                        // Divider
                        Rectangle()
                            .fill(goldAccent.opacity(0.15))
                            .frame(height: 1)
                            .padding(.vertical, 8)

                        // Bottom: 4 spot prices
                        HStack(spacing: 0) {
                            spotPriceColumn(symbol: "Au", price: data.goldSpot, changePercent: data.goldChangePercent, changeAmount: data.goldChangeAmount, color: goldAccent)
                            spotPriceColumn(symbol: "Ag", price: data.silverSpot, changePercent: data.silverChangePercent, changeAmount: data.silverChangeAmount, color: silverColor)
                            spotPriceColumn(symbol: "Pt", price: data.platinumSpot, changePercent: data.platinumChangePercent, changeAmount: data.platinumChangeAmount, color: platinumColor)
                            spotPriceColumn(symbol: "Pd", price: data.palladiumSpot, changePercent: data.palladiumChangePercent, changeAmount: data.palladiumChangeAmount, color: palladiumColor)
                        }

                        Spacer(minLength: 2)
                    }
                    .padding(.horizontal, 12)
                    .padding(.bottom, 10)
                }
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

    private func spotPriceColumn(symbol: String, price: Double, changePercent: Double, changeAmount: Double, color: Color) -> some View {
        VStack(spacing: 3) {
            Circle()
                .fill(color)
                .frame(width: 6, height: 6)
            Text(symbol)
                .font(.system(size: 10, weight: .semibold))
                .foregroundColor(color)
            Text(formatSpotPrice(price))
                .font(.system(size: 16, weight: .bold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(formatPercent(changePercent))
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(changeColor(changeAmount))
        }
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Large Widget View

struct LargeWidgetView: View {
    let data: WidgetData

    private let spotGridColumns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        Group {
            if data.hasSubscription {
                VStack(alignment: .leading, spacing: 0) {
                    goldAccentLine()

                    VStack(alignment: .leading, spacing: 0) {
                        // Logo + portfolio value
                        HStack(spacing: 8) {
                            Image("AppIcon")
                                .resizable()
                                .frame(width: 20, height: 20)
                                .cornerRadius(4)

                            VStack(alignment: .leading, spacing: 0) {
                                Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                                    .font(.system(size: 36, weight: .bold))
                                    .foregroundColor(.white)
                                    .minimumScaleFactor(0.5)
                                    .lineLimit(1)
                            }
                        }
                        .padding(.top, 10)

                        // Daily change
                        HStack(spacing: 4) {
                            Text(data.dailyChangeAmount >= 0 ? "▲" : "▼")
                                .font(.system(size: 11, weight: .bold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text(privacyText(formatChange(data.dailyChangeAmount), data.hideValues))
                                .font(.system(size: 13, weight: .semibold))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                            Text("(\(formatPercent(data.dailyChangePercent)))")
                                .font(.system(size: 11))
                                .foregroundColor(changeColor(data.dailyChangeAmount))
                        }
                        .padding(.top, 2)

                        // Divider
                        Rectangle()
                            .fill(goldAccent.opacity(0.15))
                            .frame(height: 1)
                            .padding(.vertical, 10)

                        // LIVE SPOT section header
                        Text("LIVE SPOT")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(mutedColor)
                            .kerning(1.2)
                            .padding(.bottom, 8)

                        // 2x2 grid of spot price cards
                        LazyVGrid(columns: spotGridColumns, spacing: 8) {
                            spotCard(symbol: "Au", price: data.goldSpot, changePercent: data.goldChangePercent, changeAmount: data.goldChangeAmount, color: goldAccent)
                            spotCard(symbol: "Ag", price: data.silverSpot, changePercent: data.silverChangePercent, changeAmount: data.silverChangeAmount, color: silverColor)
                            spotCard(symbol: "Pt", price: data.platinumSpot, changePercent: data.platinumChangePercent, changeAmount: data.platinumChangeAmount, color: platinumColor)
                            spotCard(symbol: "Pd", price: data.palladiumSpot, changePercent: data.palladiumChangePercent, changeAmount: data.palladiumChangeAmount, color: palladiumColor)
                        }

                        // Divider
                        Rectangle()
                            .fill(goldAccent.opacity(0.15))
                            .frame(height: 1)
                            .padding(.vertical, 10)

                        // HOLDINGS section header
                        Text("HOLDINGS")
                            .font(.system(size: 9, weight: .semibold))
                            .foregroundColor(mutedColor)
                            .kerning(1.2)
                            .padding(.bottom, 6)

                        // Holdings rows - only metals with value > 0
                        VStack(spacing: 6) {
                            if data.goldValue > 0 {
                                holdingRow(name: "Gold", value: data.goldValue, color: goldAccent)
                            }
                            if data.silverValue > 0 {
                                holdingRow(name: "Silver", value: data.silverValue, color: silverColor)
                            }
                            if data.platinumValue > 0 {
                                holdingRow(name: "Platinum", value: data.platinumValue, color: platinumColor)
                            }
                            if data.palladiumValue > 0 {
                                holdingRow(name: "Palladium", value: data.palladiumValue, color: palladiumColor)
                            }
                        }

                        Spacer(minLength: 4)
                    }
                    .padding(.horizontal, 14)
                    .padding(.bottom, 10)
                }
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

    private func spotCard(symbol: String, price: Double, changePercent: Double, changeAmount: Double, color: Color) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Circle()
                        .fill(color)
                        .frame(width: 6, height: 6)
                    Text(symbol)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(color)
                }
                Text(formatSpotPrice(price))
                    .font(.system(size: 16, weight: .bold))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(formatPercent(changePercent))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(changeColor(changeAmount))
            }
            Spacer()
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .cornerRadius(8)
    }

    private func holdingRow(name: String, value: Double, color: Color) -> some View {
        HStack(spacing: 6) {
            Circle()
                .fill(color)
                .frame(width: 8, height: 8)
            Text(name)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(.white)
            Spacer()
            Text(privacyText(formatCurrency(value), data.hideValues))
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(.white)
        }
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
