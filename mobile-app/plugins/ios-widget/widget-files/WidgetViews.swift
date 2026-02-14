import SwiftUI
import WidgetKit

// MARK: - Design Constants

private let bgGradient = LinearGradient(
    colors: [Color(hex: "#1a1a1a"), Color(hex: "#0d0d0d")],
    startPoint: .top,
    endPoint: .bottom
)
private let goldAccent = Color(hex: "#D4A843")
private let greenColor = Color(hex: "#4CAF50")
private let redColor = Color(hex: "#F44336")
private let mutedColor = Color(hex: "#71717a")
private let silverColor = Color(hex: "#9ca3af")
private let platinumColor = Color(hex: "#7BB3D4")
private let palladiumColor = Color(hex: "#6BBF8A")

// MARK: - SparklineView

struct SparklineView: View {
    let data: [Double]
    let color: Color
    let lineWidth: CGFloat
    let showFill: Bool

    init(data: [Double], color: Color, lineWidth: CGFloat = 1.5, showFill: Bool = false) {
        self.data = data
        self.color = color
        self.lineWidth = lineWidth
        self.showFill = showFill
    }

    var body: some View {
        GeometryReader { geo in
            sparklineContent(width: geo.size.width, height: geo.size.height)
        }
    }

    private func sparklineContent(width: CGFloat, height: CGFloat) -> some View {
        let points = normalizedPoints(width: width, height: height)
        return ZStack {
            if points.count >= 2 {
                sparklinePath(points: points)
                    .stroke(color, lineWidth: lineWidth)

                if showFill {
                    sparklineFillPath(points: points, height: height)
                        .fill(
                            LinearGradient(
                                colors: [color.opacity(0.3), color.opacity(0.0)],
                                startPoint: .top,
                                endPoint: .bottom
                            )
                        )
                }
            }
        }
    }

    private func sparklinePath(points: [CGPoint]) -> Path {
        Path { path in
            path.move(to: points[0])
            for i in 1..<points.count {
                path.addLine(to: points[i])
            }
        }
    }

    private func sparklineFillPath(points: [CGPoint], height: CGFloat) -> Path {
        Path { path in
            path.move(to: CGPoint(x: points[0].x, y: height))
            for pt in points {
                path.addLine(to: pt)
            }
            path.addLine(to: CGPoint(x: points[points.count - 1].x, y: height))
            path.closeSubpath()
        }
    }

    private func normalizedPoints(width: CGFloat, height: CGFloat) -> [CGPoint] {
        guard data.count >= 2 else { return [] }
        let minVal = data.min() ?? 0
        let maxVal = data.max() ?? 1
        let range = maxVal - minVal
        let safeRange = range > 0 ? range : 1

        let padding: CGFloat = 2
        let drawHeight = height - padding * 2

        return data.enumerated().map { i, val in
            let x = width * CGFloat(i) / CGFloat(data.count - 1)
            let y = padding + drawHeight * (1 - CGFloat((val - minVal) / safeRange))
            return CGPoint(x: x, y: y)
        }
    }
}

// MARK: - Helpers

private func privacyText(_ text: String, _ hide: Bool) -> String {
    hide ? "••••••" : text
}

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

// MARK: - Reusable Sub-Views

/// Gold accent bar — used with negative horizontal padding to go edge-to-edge
struct GoldAccentBar: View {
    var body: some View {
        Rectangle()
            .fill(goldAccent)
            .frame(height: 2)
    }
}

/// Portfolio header: icon + label
struct PortfolioLabel: View {
    let iconSize: CGFloat
    let fontSize: CGFloat

    var body: some View {
        HStack(spacing: 6) {
            Image("AppIcon")
                .resizable()
                .frame(width: iconSize, height: iconSize)
                .cornerRadius(4)
            Text("PORTFOLIO")
                .font(.system(size: fontSize, weight: .semibold))
                .foregroundColor(mutedColor)
                .kerning(1.2)
        }
    }
}

/// Daily change row: arrow + amount + percent
struct DailyChangeRow: View {
    let amount: Double
    let percent: Double
    let hideValues: Bool
    let arrowSize: CGFloat
    let amountSize: CGFloat
    let percentSize: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            Text(amount >= 0 ? "▲" : "▼")
                .font(.system(size: arrowSize, weight: .bold))
                .foregroundColor(changeColor(amount))
            Text(privacyText(formatChange(amount), hideValues))
                .font(.system(size: amountSize, weight: .semibold))
                .foregroundColor(changeColor(amount))
            Text("(\(formatPercent(percent)))")
                .font(.system(size: percentSize))
                .foregroundColor(changeColor(amount))
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }
}

/// Metal row for medium widget right panel
struct MetalRowMedium: View {
    let symbol: String
    let price: Double
    let changePercent: Double
    let changeAmount: Double
    let sparkline: [Double]
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            metalInfo
            Spacer()
            metalSparkline
        }
    }

    private var metalInfo: some View {
        VStack(alignment: .leading, spacing: 2) {
            HStack(spacing: 4) {
                Circle().fill(color).frame(width: 6, height: 6)
                Text(symbol)
                    .font(.system(size: 10, weight: .semibold))
                    .foregroundColor(color)
            }
            Text(formatSpotPrice(price))
                .font(.system(size: 14, weight: .bold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.6)
                .lineLimit(1)
            Text(formatPercent(changePercent))
                .font(.system(size: 9, weight: .medium))
                .foregroundColor(changeColor(changeAmount))
        }
    }

    @ViewBuilder
    private var metalSparkline: some View {
        if sparkline.count >= 2 {
            SparklineView(
                data: sparkline,
                color: changeAmount >= 0 ? greenColor : redColor,
                lineWidth: 1.0
            )
            .frame(width: 48, height: 22)
        }
    }
}

/// Spot price card for large widget grid
struct SpotCardLarge: View {
    let symbol: String
    let price: Double
    let changePercent: Double
    let changeAmount: Double
    let sparkline: [Double]
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            cardInfo
            cardSparkline
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .cornerRadius(8)
    }

    private var cardInfo: some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                HStack(spacing: 4) {
                    Circle().fill(color).frame(width: 6, height: 6)
                    Text(symbol)
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(color)
                }
                Text(formatSpotPrice(price))
                    .font(.system(size: 15, weight: .bold))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
                Text(formatPercent(changePercent))
                    .font(.system(size: 9, weight: .medium))
                    .foregroundColor(changeColor(changeAmount))
            }
            Spacer()
        }
    }

    @ViewBuilder
    private var cardSparkline: some View {
        if sparkline.count >= 2 {
            SparklineView(
                data: sparkline,
                color: changeAmount >= 0 ? greenColor : redColor,
                lineWidth: 1.0
            )
            .frame(height: 20)
            .padding(.top, 4)
        }
    }
}

/// Locked/upgrade prompt view
struct LockedView: View {
    let showIcon: Bool
    let titleSize: CGFloat
    let subtitleSize: CGFloat

    var body: some View {
        VStack(spacing: showIcon ? 8 : 4) {
            if showIcon {
                Image(systemName: "lock.fill")
                    .font(.system(size: titleSize > 16 ? 36 : 28))
                    .foregroundColor(mutedColor)
            }
            Spacer()
            Text("Upgrade to Gold")
                .font(.system(size: titleSize, weight: .semibold))
                .foregroundColor(goldAccent)
            Text(showIcon ? "Get portfolio widgets on your home screen" : "for widget access")
                .font(.system(size: subtitleSize))
                .foregroundColor(mutedColor)
                .multilineTextAlignment(.center)
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }
}

// MARK: - Main Entry View

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
        ZStack(alignment: .topLeading) {
            bgGradient
            if data.hasSubscription {
                subscribedContent
            } else {
                LockedView(showIcon: false, titleSize: 14, subtitleSize: 11)
            }
        }
    }

    private var subscribedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            GoldAccentBar()
            innerContent
                .padding(.horizontal, 12)
        }
    }

    private var innerContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            PortfolioLabel(iconSize: 18, fontSize: 9)
                .padding(.top, 10)
                .padding(.bottom, 4)

            Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                .font(.system(size: 26, weight: .bold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .padding(.bottom, 2)

            DailyChangeRow(
                amount: data.dailyChangeAmount,
                percent: data.dailyChangePercent,
                hideValues: data.hideValues,
                arrowSize: 9, amountSize: 11, percentSize: 9
            )

            Spacer()

            bottomSection
        }
    }

    @ViewBuilder
    private var bottomSection: some View {
        let sparkline = data.portfolioSparkline()
        if sparkline.count >= 2 {
            SparklineView(
                data: sparkline,
                color: data.dailyChangeAmount >= 0 ? greenColor : redColor,
                lineWidth: 1.5,
                showFill: true
            )
            .frame(height: 32)
            .padding(.bottom, 6)
        } else {
            metalDots
                .padding(.bottom, 6)
        }
    }

    private var metalDots: some View {
        HStack(spacing: 6) {
            if data.goldValue > 0 { Circle().fill(goldAccent).frame(width: 8, height: 8) }
            if data.silverValue > 0 { Circle().fill(silverColor).frame(width: 8, height: 8) }
            if data.platinumValue > 0 { Circle().fill(platinumColor).frame(width: 8, height: 8) }
            if data.palladiumValue > 0 { Circle().fill(palladiumColor).frame(width: 8, height: 8) }
        }
    }
}

// MARK: - Medium Widget View

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        ZStack(alignment: .topLeading) {
            bgGradient
            if data.hasSubscription {
                subscribedContent
            } else {
                LockedView(showIcon: true, titleSize: 16, subtitleSize: 12)
            }
        }
    }

    private var subscribedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            GoldAccentBar()
            HStack(spacing: 0) {
                leftPanel
                verticalDivider
                rightPanel
            }
        }
    }

    private var leftPanel: some View {
        VStack(alignment: .leading, spacing: 0) {
            PortfolioLabel(iconSize: 16, fontSize: 8)
                .padding(.top, 8)
                .padding(.bottom, 4)

            Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                .font(.system(size: 24, weight: .bold))
                .foregroundColor(.white)
                .minimumScaleFactor(0.5)
                .lineLimit(1)
                .padding(.bottom, 2)

            DailyChangeRow(
                amount: data.dailyChangeAmount,
                percent: data.dailyChangePercent,
                hideValues: data.hideValues,
                arrowSize: 9, amountSize: 11, percentSize: 9
            )

            Spacer()

            leftSparkline
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    @ViewBuilder
    private var leftSparkline: some View {
        let sparkline = data.portfolioSparkline()
        if sparkline.count >= 2 {
            SparklineView(
                data: sparkline,
                color: data.dailyChangeAmount >= 0 ? greenColor : redColor,
                lineWidth: 1.5,
                showFill: true
            )
            .frame(height: 30)
            .padding(.bottom, 8)
        }
    }

    private var verticalDivider: some View {
        Rectangle()
            .fill(goldAccent.opacity(0.15))
            .frame(width: 1)
            .padding(.vertical, 10)
    }

    private var rightPanel: some View {
        VStack(spacing: 6) {
            Spacer(minLength: 4)
            MetalRowMedium(
                symbol: "Au", price: data.goldSpot,
                changePercent: data.goldChangePercent,
                changeAmount: data.goldChangeAmount,
                sparkline: data.goldSparkline, color: goldAccent
            )
            Rectangle()
                .fill(Color.white.opacity(0.05))
                .frame(height: 1)
            MetalRowMedium(
                symbol: "Ag", price: data.silverSpot,
                changePercent: data.silverChangePercent,
                changeAmount: data.silverChangeAmount,
                sparkline: data.silverSparkline, color: silverColor
            )
            Spacer(minLength: 4)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
    }
}

// MARK: - Large Widget View

struct LargeWidgetView: View {
    let data: WidgetData

    private let gridColumns = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        ZStack(alignment: .topLeading) {
            bgGradient
            if data.hasSubscription {
                subscribedContent
            } else {
                LockedView(showIcon: true, titleSize: 18, subtitleSize: 13)
            }
        }
    }

    private var subscribedContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            GoldAccentBar()
            mainContent
                .padding(.horizontal, 14)
                .padding(.bottom, 8)
        }
    }

    private var mainContent: some View {
        VStack(alignment: .leading, spacing: 0) {
            portfolioHeader
            portfolioSparklineSection
            goldDivider
            spotSection
            Spacer(minLength: 4)
        }
    }

    private var portfolioHeader: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 8) {
                Image("AppIcon")
                    .resizable()
                    .frame(width: 20, height: 20)
                    .cornerRadius(4)
                Text(privacyText(formatCurrency(data.portfolioValue), data.hideValues))
                    .font(.system(size: 32, weight: .bold))
                    .foregroundColor(.white)
                    .minimumScaleFactor(0.5)
                    .lineLimit(1)
            }
            .padding(.top, 10)

            DailyChangeRow(
                amount: data.dailyChangeAmount,
                percent: data.dailyChangePercent,
                hideValues: data.hideValues,
                arrowSize: 11, amountSize: 13, percentSize: 11
            )
            .padding(.top, 2)
        }
    }

    @ViewBuilder
    private var portfolioSparklineSection: some View {
        let sparkline = data.portfolioSparkline()
        if sparkline.count >= 2 {
            SparklineView(
                data: sparkline,
                color: data.dailyChangeAmount >= 0 ? greenColor : redColor,
                lineWidth: 1.5,
                showFill: true
            )
            .frame(height: 40)
            .padding(.top, 6)
        }
    }

    private var goldDivider: some View {
        Rectangle()
            .fill(goldAccent.opacity(0.15))
            .frame(height: 1)
            .padding(.vertical, 8)
    }

    private var spotSection: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("LIVE SPOT")
                .font(.system(size: 9, weight: .semibold))
                .foregroundColor(mutedColor)
                .kerning(1.2)
                .padding(.bottom, 6)

            spotGrid
        }
    }

    private var spotGrid: some View {
        LazyVGrid(columns: gridColumns, spacing: 8) {
            SpotCardLarge(symbol: "Au", price: data.goldSpot, changePercent: data.goldChangePercent, changeAmount: data.goldChangeAmount, sparkline: data.goldSparkline, color: goldAccent)
            SpotCardLarge(symbol: "Ag", price: data.silverSpot, changePercent: data.silverChangePercent, changeAmount: data.silverChangeAmount, sparkline: data.silverSparkline, color: silverColor)
            SpotCardLarge(symbol: "Pt", price: data.platinumSpot, changePercent: data.platinumChangePercent, changeAmount: data.platinumChangeAmount, sparkline: data.platinumSparkline, color: platinumColor)
            SpotCardLarge(symbol: "Pd", price: data.palladiumSpot, changePercent: data.palladiumChangePercent, changeAmount: data.palladiumChangeAmount, sparkline: data.palladiumSparkline, color: palladiumColor)
        }
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
