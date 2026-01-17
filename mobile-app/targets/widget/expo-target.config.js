/** @type {import('@bacons/apple-targets/app.plugin').Config} */
module.exports = {
  type: "widget",

  // Name of the widget target
  name: "StackTrackerWidget",

  // Display name shown to users
  displayName: "Stack Tracker",

  // Widget accent color (gold)
  colors: {
    $accent: { color: "#fbbf24", darkColor: "#fbbf24" },
    WidgetBackground: { color: "#1a1a2e", darkColor: "#1a1a2e" },
  },

  // Frameworks required for the widget
  frameworks: ["SwiftUI", "WidgetKit"],

  // App Group for sharing data with main app
  entitlements: {
    "com.apple.security.application-groups": ["group.com.stacktrackerpro.shared"],
  },

  // iOS deployment target
  deploymentTarget: "17.0",

  // Bundle identifier (appended to main app's bundle ID)
  bundleIdentifier: ".widget",
};
