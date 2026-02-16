import SwiftUI
import WidgetKit

// MARK: - Design Constants

let wBgColor = Color.black
let wGold = Color(hex: "#D4A843")
let wGreen = Color(hex: "#4CAF50")
let wRed = Color(hex: "#F44336")
let wMuted = Color(hex: "#71717a")
let wSilver = Color(hex: "#9ca3af")
let wPlatinum = Color(hex: "#7BB3D4")
let wPalladium = Color(hex: "#6BBF8A")

// MARK: - Pure formatting functions (no SwiftUI)

func wChangeColor(_ val: Double) -> Color {
    return val >= 0 ? wGreen : wRed
}

func wSparklineColor(_ data: [Double]) -> Color {
    guard data.count >= 2 else { return wMuted }
    return data.last! >= data.first! ? wGreen : wRed
}

func wFormatCurrency(_ val: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.maximumFractionDigits = 0
    return f.string(from: NSNumber(value: val)) ?? "$0"
}

func wFormatSpot(_ val: Double) -> String {
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.minimumFractionDigits = 2
    f.maximumFractionDigits = 2
    return f.string(from: NSNumber(value: val)) ?? "$0.00"
}

func wFormatChange(_ val: Double) -> String {
    let prefix = val >= 0 ? "+" : ""
    let f = NumberFormatter()
    f.numberStyle = .currency
    f.maximumFractionDigits = 0
    return prefix + (f.string(from: NSNumber(value: val)) ?? "$0")
}

func wFormatPct(_ val: Double) -> String {
    let prefix = val >= 0 ? "+" : ""
    return "\(prefix)\(String(format: "%.1f", val))%"
}

func wPrivacy(_ text: String, _ hide: Bool) -> String {
    return hide ? "••••••" : text
}

// MARK: - Path builders (pure functions, no view code)

func buildSparklinePath(points: [CGPoint]) -> Path {
    var p = Path()
    guard points.count >= 2 else { return p }
    p.move(to: points[0])
    for i in 1..<points.count {
        p.addLine(to: points[i])
    }
    return p
}

func buildSparklineFill(points: [CGPoint], height: CGFloat) -> Path {
    var p = Path()
    guard points.count >= 2 else { return p }
    p.move(to: CGPoint(x: points[0].x, y: height))
    for pt in points {
        p.addLine(to: pt)
    }
    p.addLine(to: CGPoint(x: points[points.count - 1].x, y: height))
    p.closeSubpath()
    return p
}

func normalizeSparklinePoints(data: [Double], width: CGFloat, height: CGFloat) -> [CGPoint] {
    guard data.count >= 2 else { return [] }
    let lo = data.min() ?? 0
    let hi = data.max() ?? 1
    let span = hi - lo
    let safe = span > 0 ? span : 1.0
    let pad: CGFloat = 2
    let dh = height - pad * 2
    return data.enumerated().map { i, val in
        let x = width * CGFloat(i) / CGFloat(data.count - 1)
        let y = pad + dh * (1 - CGFloat((val - lo) / safe))
        return CGPoint(x: x, y: y)
    }
}

// MARK: - SparklineStroke

struct SparklineStroke: View {
    let points: [CGPoint]
    let color: Color
    let lineWidth: CGFloat

    var body: some View {
        buildSparklinePath(points: points)
            .stroke(color, lineWidth: lineWidth)
    }
}

// MARK: - SparklineFill

struct SparklineFillView: View {
    let points: [CGPoint]
    let height: CGFloat
    let color: Color

    var body: some View {
        buildSparklineFill(points: points, height: height)
            .fill(fillGradient)
    }

    private var fillGradient: LinearGradient {
        LinearGradient(
            colors: [color.opacity(0.3), color.opacity(0.0)],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

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
            SparklineCanvas(
                data: data,
                color: color,
                lineWidth: lineWidth,
                showFill: showFill,
                width: geo.size.width,
                height: geo.size.height
            )
        }
    }
}

// MARK: - SparklineCanvas (sized)

struct SparklineCanvas: View {
    let data: [Double]
    let color: Color
    let lineWidth: CGFloat
    let showFill: Bool
    let width: CGFloat
    let height: CGFloat

    var body: some View {
        ZStack {
            strokeLayer
            fillLayer
        }
    }

    private var points: [CGPoint] {
        normalizeSparklinePoints(data: data, width: width, height: height)
    }

    @ViewBuilder
    private var strokeLayer: some View {
        if points.count >= 2 {
            SparklineStroke(points: points, color: color, lineWidth: lineWidth)
        }
    }

    @ViewBuilder
    private var fillLayer: some View {
        if showFill && points.count >= 2 {
            SparklineFillView(points: points, height: height, color: color)
        }
    }
}

// MARK: - Atomic Text Views

struct WBoldCurrencyText: View {
    let text: String
    let size: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .bold))
            .foregroundColor(.white)
            .minimumScaleFactor(0.5)
            .lineLimit(1)
    }
}

struct WSpotPriceText: View {
    let text: String
    let size: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .bold))
            .foregroundColor(.white)
            .minimumScaleFactor(0.6)
            .lineLimit(1)
    }
}

struct WPercentBadge: View {
    let text: String
    let color: Color
    let size: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .medium))
            .foregroundColor(color)
    }
}

struct WSymbolDot: View {
    let color: Color
    let size: CGFloat

    var body: some View {
        Circle()
            .fill(color)
            .frame(width: size, height: size)
    }
}

struct WSymbolLabel: View {
    let text: String
    let color: Color
    let size: CGFloat

    var body: some View {
        Text(text)
            .font(.system(size: size, weight: .semibold))
            .foregroundColor(color)
    }
}

// MARK: - GoldAccentBar

struct GoldAccentBar: View {
    var body: some View {
        Rectangle()
            .fill(wGold)
            .frame(height: 2)
    }
}

// MARK: - GoldDivider

struct GoldDivider: View {
    var body: some View {
        Rectangle()
            .fill(wGold.opacity(0.15))
            .frame(height: 1)
    }
}

// MARK: - AppIconImage

struct AppIconImage: View {
    let size: CGFloat

    var body: some View {
        Image("AppIcon")
            .resizable()
            .frame(width: size, height: size)
            .cornerRadius(4)
    }
}

// MARK: - PortfolioLabel

struct PortfolioLabel: View {
    let iconSize: CGFloat
    let fontSize: CGFloat

    var body: some View {
        HStack(spacing: 6) {
            AppIconImage(size: iconSize)
            labelText
        }
    }

    private var labelText: some View {
        Text("PORTFOLIO")
            .font(.system(size: fontSize, weight: .semibold))
            .foregroundColor(wMuted)
            .kerning(1.2)
    }
}

// MARK: - DailyChangeRow

struct DailyChangeRow: View {
    let amount: Double
    let percent: Double
    let hideValues: Bool
    let arrowSize: CGFloat
    let amountSize: CGFloat
    let pctSize: CGFloat

    var body: some View {
        HStack(spacing: 3) {
            arrowText
            changeText
            percentText
        }
        .lineLimit(1)
        .minimumScaleFactor(0.7)
    }

    private var arrowText: some View {
        Text(amount >= 0 ? "▲" : "▼")
            .font(.system(size: arrowSize, weight: .bold))
            .foregroundColor(wChangeColor(amount))
    }

    private var changeText: some View {
        Text(wPrivacy(wFormatChange(amount), hideValues))
            .font(.system(size: amountSize, weight: .semibold))
            .foregroundColor(wChangeColor(amount))
    }

    private var percentText: some View {
        let s = "(" + wFormatPct(percent) + ")"
        return Text(s)
            .font(.system(size: pctSize))
            .foregroundColor(wChangeColor(amount))
    }
}

// MARK: - LockedView

struct LockedSmallView: View {
    var body: some View {
        VStack(spacing: 4) {
            Spacer()
            lockTitle
            lockSubtitle
            Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var lockTitle: some View {
        Text("Upgrade to Gold")
            .font(.system(size: 14, weight: .semibold))
            .foregroundColor(wGold)
    }

    private var lockSubtitle: some View {
        Text("for widget access")
            .font(.system(size: 11))
            .foregroundColor(wMuted)
    }
}

struct LockedLargeView: View {
    let titleSize: CGFloat
    let subtitleSize: CGFloat

    var body: some View {
        VStack(spacing: 8) {
            lockIcon
            Spacer()
            lockTitle
            lockSubtitle
            Spacer()
        }
        .frame(maxWidth: .infinity)
        .padding()
    }

    private var lockIcon: some View {
        Image(systemName: "lock.fill")
            .font(.system(size: 32))
            .foregroundColor(wMuted)
    }

    private var lockTitle: some View {
        Text("Upgrade to Gold")
            .font(.system(size: titleSize, weight: .semibold))
            .foregroundColor(wGold)
    }

    private var lockSubtitle: some View {
        Text("Get portfolio widgets on your home screen")
            .font(.system(size: subtitleSize))
            .foregroundColor(wMuted)
            .multilineTextAlignment(.center)
    }
}

// MARK: - MetalRowMedium

struct MetalRowMedium: View {
    let symbol: String
    let price: Double
    let changePct: Double
    let changeAmt: Double
    let sparkline: [Double]
    let color: Color

    var body: some View {
        HStack(spacing: 6) {
            MetalRowInfo(symbol: symbol, price: price, changePct: changePct, changeAmt: changeAmt, color: color)
            Spacer()
            inlineSparkline
        }
    }

    @ViewBuilder
    private var inlineSparkline: some View {
        if sparkline.count >= 2 {
            SparklineView(data: sparkline, color: wSparklineColor(sparkline), lineWidth: 1.0, showFill: true)
                .frame(width: 48, height: 22)
        }
    }
}

struct MetalRowInfo: View {
    let symbol: String
    let price: Double
    let changePct: Double
    let changeAmt: Double
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            symbolRow
            priceText
            pctText
        }
    }

    private var symbolRow: some View {
        HStack(spacing: 4) {
            WSymbolDot(color: color, size: 6)
            WSymbolLabel(text: symbol, color: color, size: 10)
        }
    }

    private var priceText: some View {
        WSpotPriceText(text: wFormatSpot(price), size: 14)
    }

    private var pctText: some View {
        WPercentBadge(text: wFormatPct(changePct), color: wChangeColor(changeAmt), size: 9)
    }
}

// MARK: - SpotCardLarge

struct SpotCardLarge: View {
    let symbol: String
    let price: Double
    let changePct: Double
    let changeAmt: Double
    let sparkline: [Double]
    let color: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SpotCardInfo(symbol: symbol, price: price, changePct: changePct, changeAmt: changeAmt, color: color)
            cardSparkline
        }
        .padding(10)
        .background(Color.white.opacity(0.04))
        .cornerRadius(8)
    }

    @ViewBuilder
    private var cardSparkline: some View {
        if sparkline.count >= 2 {
            SparklineView(data: sparkline, color: wSparklineColor(sparkline), lineWidth: 1.0, showFill: true)
                .frame(height: 20)
                .padding(.top, 4)
        }
    }
}

struct SpotCardInfo: View {
    let symbol: String
    let price: Double
    let changePct: Double
    let changeAmt: Double
    let color: Color

    var body: some View {
        HStack {
            infoColumn
            Spacer()
        }
    }

    private var infoColumn: some View {
        VStack(alignment: .leading, spacing: 3) {
            symbolRow
            priceText
            pctText
        }
    }

    private var symbolRow: some View {
        HStack(spacing: 4) {
            WSymbolDot(color: color, size: 6)
            WSymbolLabel(text: symbol, color: color, size: 11)
        }
    }

    private var priceText: some View {
        WSpotPriceText(text: wFormatSpot(price), size: 15)
    }

    private var pctText: some View {
        WPercentBadge(text: wFormatPct(changePct), color: wChangeColor(changeAmt), size: 9)
    }
}

// MARK: - Main Entry View

struct StackTrackerWidgetEntryView: View {
    @Environment(\.widgetFamily) var family
    var entry: WidgetEntry

    var body: some View {
        widgetContent
    }

    @ViewBuilder
    private var widgetContent: some View {
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

// MARK: - Small Widget

struct SmallWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            SmallSubscribed(data: data)
        } else {
            LockedSmallView()
        }
    }
}

struct SmallSubscribed: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            SmallInner(data: data)
        }
    }
}

struct SmallInner: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            valueText
            changeRow
            Spacer(minLength: 4)
            SmallBottom(data: data)
        }
        .padding(.horizontal, 12)
    }

    private var header: some View {
        PortfolioLabel(iconSize: 18, fontSize: 9)
            .padding(.top, 8)
            .padding(.bottom, 4)
    }

    private var valueText: some View {
        WBoldCurrencyText(
            text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
            size: 26
        )
        .padding(.bottom, 2)
    }

    private var changeRow: some View {
        DailyChangeRow(
            amount: data.dailyChangeAmount,
            percent: data.dailyChangePercent,
            hideValues: data.hideValues,
            arrowSize: 9, amountSize: 11, pctSize: 9
        )
    }
}

struct SmallBottom: View {
    let data: WidgetData

    var body: some View {
        if hasSparkline {
            sparklineView
        } else {
            SmallMetalDots(data: data)
        }
    }

    private var hasSparkline: Bool {
        data.portfolioSparkline().count >= 2
    }

    private var sparklineView: some View {
        SparklineView(
            data: data.portfolioSparkline(),
            color: wSparklineColor(data.portfolioSparkline()),
            lineWidth: 1.5,
            showFill: true
        )
        .frame(maxHeight: 56)
        .padding(.bottom, 4)
    }
}

struct SmallMetalDots: View {
    let data: WidgetData

    var body: some View {
        HStack(spacing: 6) {
            dot(data.goldValue, wGold)
            dot(data.silverValue, wSilver)
            dot(data.platinumValue, wPlatinum)
            dot(data.palladiumValue, wPalladium)
        }
        .padding(.bottom, 6)
    }

    @ViewBuilder
    private func dot(_ val: Double, _ c: Color) -> some View {
        if val > 0 {
            WSymbolDot(color: c, size: 8)
        }
    }
}

// MARK: - Medium Widget

struct MediumWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            MediumSubscribed(data: data)
        } else {
            LockedLargeView(titleSize: 16, subtitleSize: 12)
        }
    }
}

struct MediumSubscribed: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            panels
        }
    }

    private var panels: some View {
        HStack(spacing: 0) {
            MediumLeft(data: data)
            MediumDivider()
            MediumRight(data: data)
        }
    }
}

struct MediumDivider: View {
    var body: some View {
        Rectangle()
            .fill(wGold.opacity(0.15))
            .frame(width: 1)
            .padding(.vertical, 10)
    }
}

struct MediumLeft: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            header
            valueText
            changeRow
            Spacer(minLength: 2)
            sparklineSection
        }
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var header: some View {
        PortfolioLabel(iconSize: 16, fontSize: 8)
            .padding(.top, 6)
            .padding(.bottom, 4)
    }

    private var valueText: some View {
        WBoldCurrencyText(
            text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
            size: 24
        )
        .padding(.bottom, 2)
    }

    private var changeRow: some View {
        DailyChangeRow(
            amount: data.dailyChangeAmount,
            percent: data.dailyChangePercent,
            hideValues: data.hideValues,
            arrowSize: 9, amountSize: 11, pctSize: 9
        )
    }

    @ViewBuilder
    private var sparklineSection: some View {
        let pts = data.portfolioSparkline()
        if pts.count >= 2 {
            SparklineView(data: pts, color: wSparklineColor(pts), lineWidth: 1.5, showFill: true)
                .frame(maxHeight: 48)
                .padding(.bottom, 4)
        }
    }
}

struct MediumRight: View {
    let data: WidgetData

    var body: some View {
        VStack(spacing: 6) {
            spotLabel
            goldRow
            thinDivider
            silverRow
            Spacer(minLength: 4)
        }
        .padding(.horizontal, 10)
        .frame(maxWidth: .infinity)
    }

    private var spotLabel: some View {
        Text("LIVE SPOT")
            .font(.system(size: 9, weight: .semibold))
            .foregroundColor(wMuted)
            .kerning(1.2)
            .padding(.top, 8)
    }

    private var goldRow: some View {
        MetalRowMedium(
            symbol: "Au", price: data.goldSpot,
            changePct: data.goldChangePercent,
            changeAmt: data.goldChangeAmount,
            sparkline: data.goldSparkline, color: wGold
        )
    }

    private var thinDivider: some View {
        Rectangle()
            .fill(Color.white.opacity(0.05))
            .frame(height: 1)
    }

    private var silverRow: some View {
        MetalRowMedium(
            symbol: "Ag", price: data.silverSpot,
            changePct: data.silverChangePercent,
            changeAmt: data.silverChangeAmount,
            sparkline: data.silverSparkline, color: wSilver
        )
    }
}

// MARK: - Large Widget

struct LargeWidgetView: View {
    let data: WidgetData

    var body: some View {
        if data.hasSubscription {
            LargeSubscribed(data: data)
        } else {
            LockedLargeView(titleSize: 18, subtitleSize: 13)
        }
    }
}

struct LargeSubscribed: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LargeMain(data: data)
        }
    }
}

struct LargeMain: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            LargeHeader(data: data)
            LargeSparkline(data: data)
            GoldDivider().padding(.vertical, 8)
            LargeSpotSection(data: data)
            Spacer(minLength: 4)
        }
        .padding(.horizontal, 14)
        .padding(.bottom, 8)
    }
}

struct LargeHeader: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            portfolioLabel
            titleRow
            changeRow
        }
    }

    private var portfolioLabel: some View {
        PortfolioLabel(iconSize: 18, fontSize: 9)
            .padding(.top, 10)
            .padding(.bottom, 4)
    }

    private var titleRow: some View {
        WBoldCurrencyText(
            text: wPrivacy(wFormatCurrency(data.portfolioValue), data.hideValues),
            size: 48
        )
    }

    private var changeRow: some View {
        DailyChangeRow(
            amount: data.dailyChangeAmount,
            percent: data.dailyChangePercent,
            hideValues: data.hideValues,
            arrowSize: 13, amountSize: 15, pctSize: 13
        )
        .padding(.top, 2)
    }
}

struct LargeSparkline: View {
    let data: WidgetData

    var body: some View {
        if hasSparkline {
            sparklineView
        }
    }

    private var hasSparkline: Bool {
        data.portfolioSparkline().count >= 2
    }

    private var sparklineView: some View {
        SparklineView(
            data: data.portfolioSparkline(),
            color: wSparklineColor(data.portfolioSparkline()),
            lineWidth: 1.5,
            showFill: true
        )
        .frame(height: 40)
        .padding(.top, 6)
    }
}

struct LargeSpotSection: View {
    let data: WidgetData

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            sectionLabel
            LargeSpotGrid(data: data)
        }
    }

    private var sectionLabel: some View {
        Text("LIVE SPOT")
            .font(.system(size: 9, weight: .semibold))
            .foregroundColor(wMuted)
            .kerning(1.2)
            .padding(.bottom, 6)
    }
}

struct LargeSpotGrid: View {
    let data: WidgetData

    private let cols = [
        GridItem(.flexible(), spacing: 8),
        GridItem(.flexible(), spacing: 8),
    ]

    var body: some View {
        LazyVGrid(columns: cols, spacing: 8) {
            goldCard
            silverCard
            platinumCard
            palladiumCard
        }
    }

    private var goldCard: some View {
        SpotCardLarge(symbol: "Au", price: data.goldSpot, changePct: data.goldChangePercent, changeAmt: data.goldChangeAmount, sparkline: data.goldSparkline, color: wGold)
    }

    private var silverCard: some View {
        SpotCardLarge(symbol: "Ag", price: data.silverSpot, changePct: data.silverChangePercent, changeAmt: data.silverChangeAmount, sparkline: data.silverSparkline, color: wSilver)
    }

    private var platinumCard: some View {
        SpotCardLarge(symbol: "Pt", price: data.platinumSpot, changePct: data.platinumChangePercent, changeAmt: data.platinumChangeAmount, sparkline: data.platinumSparkline, color: wPlatinum)
    }

    private var palladiumCard: some View {
        SpotCardLarge(symbol: "Pd", price: data.palladiumSpot, changePct: data.palladiumChangePercent, changeAmt: data.palladiumChangeAmount, sparkline: data.palladiumSparkline, color: wPalladium)
    }
}

// MARK: - Color Extension

// MARK: - iOS 17 Availability Extensions

extension View {
    func widgetBackground(_ color: Color) -> some View {
        if #available(iOSApplicationExtension 17.0, *) {
            return containerBackground(color, for: .widget)
        } else {
            return background(color)
        }
    }
}

extension WidgetConfiguration {
    func contentMarginsDisabledIfAvailable() -> some WidgetConfiguration {
        if #available(iOSApplicationExtension 17.0, *) {
            return self.contentMarginsDisabled()
        } else {
            return self
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
