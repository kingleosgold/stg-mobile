/**
 * Stack Tracker Pro - React Native App
 * Privacy-First Precious Metals Portfolio Tracker
 * "Make Stacking Great Again" Edition 🪙
 */

import React, { useState, useEffect, useRef, Component } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Modal, Platform, SafeAreaView, StatusBar, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Dimensions, AppState, FlatList, Clipboard, Linking,
  useColorScheme, RefreshControl,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import * as Haptics from 'expo-haptics';
import Purchases from 'react-native-purchases';
import * as XLSX from 'xlsx';
import * as Notifications from 'expo-notifications';
import * as StoreReview from 'expo-store-review';
import { CloudStorage, CloudStorageScope } from 'react-native-cloud-storage';
import { initializePurchases, hasGoldEntitlement, getUserEntitlements } from './src/utils/entitlements';
import { syncWidgetData, isWidgetKitAvailable } from './src/utils/widgetKit';
import { LineChart } from 'react-native-chart-kit';
import GoldPaywall from './src/components/GoldPaywall';
import Tutorial from './src/components/Tutorial';
import ViewShot from 'react-native-view-shot';

// Configure notifications behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// iCloud sync key
const ICLOUD_HOLDINGS_KEY = 'stack_tracker_holdings.json';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'https://stack-tracker-pro-production.up.railway.app';

// ============================================
// DEALER CSV TEMPLATES
// ============================================
const DEALER_TEMPLATES = {
  'generic': {
    name: 'Generic / Custom',
    instructions: 'CSV should have columns: Product Name, Metal Type, OZT, Quantity, Price, Date',
    columnMap: {
      product: ['product', 'name', 'item', 'description'],
      metal: ['metal', 'type', 'metal type'],
      quantity: ['quantity', 'qty', 'count'],
      unitPrice: ['price', 'unit price', 'cost', 'unit cost'],
      date: ['date', 'purchased', 'purchase date', 'order date'],
      dealer: ['dealer', 'source', 'vendor', 'seller'],
      ozt: ['oz', 'ozt', 'ounces', 'troy oz', 'weight'],
    },
    detectPattern: null, // Default fallback
    autoDealer: null,
  },
  'apmex': {
    name: 'APMEX',
    instructions: 'Go to My Account → Order History → Export to CSV',
    columnMap: {
      product: ['description', 'item description', 'product'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['unit price', 'price'],
      date: ['order date', 'date'],
      dealer: null, // Will auto-fill with dealer name
    },
    detectPattern: /apmex|order.*id.*apmex/i,
    autoDealer: 'APMEX',
  },
  'jmbullion': {
    name: 'JM Bullion',
    instructions: 'Go to Order History → Download Order History',
    columnMap: {
      product: ['product name', 'product', 'item', 'description'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date', 'purchase date'],
      dealer: null,
    },
    detectPattern: /jm.*bullion|jmbullion/i,
    autoDealer: 'JM Bullion',
  },
  'sdbullion': {
    name: 'SD Bullion',
    instructions: 'Go to My Orders → Export to CSV',
    columnMap: {
      product: ['product', 'item name', 'description'],
      quantity: ['quantity', 'qty'],
      unitPrice: ['price', 'unit price', 'item price'],
      date: ['order date', 'date'],
      dealer: null,
    },
    detectPattern: /sd.*bullion|sdbullion/i,
    autoDealer: 'SD Bullion',
  },
  'providentmetals': {
    name: 'Provident Metals',
    instructions: 'Go to Order History → Export',
    columnMap: {
      product: ['product', 'description', 'item'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /provident/i,
    autoDealer: 'Provident Metals',
  },
  'herobullion': {
    name: 'Hero Bullion',
    instructions: 'Go to My Account → Order History → Export',
    columnMap: {
      product: ['product', 'description', 'item name'],
      quantity: ['quantity', 'qty'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /hero.*bullion/i,
    autoDealer: 'Hero Bullion',
  },
  'boldpreciousmetals': {
    name: 'BOLD Precious Metals',
    instructions: 'Go to Account → Orders → Download CSV',
    columnMap: {
      product: ['item', 'product', 'description'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /bold.*precious|boldprecious/i,
    autoDealer: 'BOLD Precious Metals',
  },
  'moneymetals': {
    name: 'Money Metals Exchange',
    instructions: 'Go to Order History → Export Orders',
    columnMap: {
      product: ['product', 'description', 'item'],
      quantity: ['qty', 'quantity'],
      unitPrice: ['price', 'unit price'],
      date: ['date', 'order date'],
      dealer: null,
    },
    detectPattern: /money.*metals/i,
    autoDealer: 'Money Metals Exchange',
  },
};

// ============================================
// METAL & WEIGHT DETECTION HELPERS
// ============================================

/**
 * Auto-detect metal type from product name
 * Returns 'gold', 'silver', 'platinum', 'palladium', or null
 */
const detectMetalFromName = (productName) => {
  if (!productName) return null;
  const name = productName.toLowerCase();

  // Gold detection patterns
  const goldPatterns = [
    /\bgold\b/,
    /\bau\b/,
    /\b(1|one|half|quarter|tenth)\s*(oz|ounce).*gold/,
    /gold.*(eagle|buffalo|maple|krugerrand|panda|philharmonic|kangaroo|britannia)/,
    /(eagle|buffalo|maple|krugerrand|panda|philharmonic|kangaroo|britannia).*gold/,
    /\b(american|canadian|south african|chinese|austrian|australian|british).*gold/,
    /\b24k\b|\b22k\b|\b14k\b|\b18k\b/,
    /gold\s*(bar|coin|round)/,
    /\bkilo.*gold\b|\bgold.*kilo\b/,
  ];

  // Silver detection patterns
  const silverPatterns = [
    /\bsilver\b/,
    /\bag\b/,
    /silver.*(eagle|maple|britannia|philharmonic|kookaburra|panda|libertad)/,
    /(eagle|maple|britannia|philharmonic|kookaburra|panda|libertad).*silver/,
    /\b(american|canadian|austrian|australian|mexican|chinese).*silver/,
    /\bjunk\s*silver\b/,
    /\b90%\s*(silver|coin)/,
    /\b40%\s*silver/,
    /silver\s*(bar|coin|round)/,
    /\b(morgan|peace|walking liberty|mercury|roosevelt|washington|kennedy)\b/,
    /\bgeneric.*silver\b|\bsilver.*generic\b/,
    /\b999\s*silver\b|\bsilver.*999\b/,
    /\.999\s*fine\s*silver/,
  ];

  // Platinum detection patterns
  const platinumPatterns = [
    /\bplatinum\b/,
    /\bpt\b/,
    /platinum.*(eagle|maple|britannia|philharmonic)/,
  ];

  // Palladium detection patterns
  const palladiumPatterns = [
    /\bpalladium\b/,
    /\bpd\b/,
    /palladium.*(eagle|maple)/,
  ];

  // Check patterns in order of likelihood
  for (const pattern of silverPatterns) {
    if (pattern.test(name)) return 'silver';
  }
  for (const pattern of goldPatterns) {
    if (pattern.test(name)) return 'gold';
  }
  for (const pattern of platinumPatterns) {
    if (pattern.test(name)) return 'platinum';
  }
  for (const pattern of palladiumPatterns) {
    if (pattern.test(name)) return 'palladium';
  }

  return null;
};

/**
 * Auto-detect troy ounces from product name
 * Returns the OZT value as a number, or null if not detected
 */
const detectOztFromName = (productName) => {
  if (!productName) return null;
  const name = productName.toLowerCase();

  // Common fractional gold sizes
  const fractionalPatterns = [
    { pattern: /\b1\/10\s*(oz|ounce|ozt)\b|\btenth\s*(oz|ounce)\b/i, ozt: 0.1 },
    { pattern: /\b1\/4\s*(oz|ounce|ozt)\b|\bquarter\s*(oz|ounce)\b/i, ozt: 0.25 },
    { pattern: /\b1\/2\s*(oz|ounce|ozt)\b|\bhalf\s*(oz|ounce)\b/i, ozt: 0.5 },
    { pattern: /\b1\/20\s*(oz|ounce|ozt)\b/i, ozt: 0.05 },
    { pattern: /\b2\s*(oz|ounce|ozt)\b/i, ozt: 2 },
    { pattern: /\b5\s*(oz|ounce|ozt)\b/i, ozt: 5 },
    { pattern: /\b10\s*(oz|ounce|ozt)\b/i, ozt: 10 },
    { pattern: /\b100\s*(oz|ounce|ozt)\b/i, ozt: 100 },
    { pattern: /\b1000\s*(oz|ounce|ozt)\b|\b1,000\s*(oz|ounce|ozt)\b/i, ozt: 1000 },
    { pattern: /\b1\s*(oz|ounce|ozt)\b/i, ozt: 1 },
  ];

  // Kilo bars
  if (/\bkilo\b|\b1\s*kg\b|\bkilogram\b/i.test(name)) {
    return 32.15; // 1 kilo = 32.15 troy oz
  }

  // Check fractional patterns (order matters - check specific fractions first)
  for (const { pattern, ozt } of fractionalPatterns) {
    if (pattern.test(name)) return ozt;
  }

  // Try to extract numeric oz value: "10oz", "10 oz", "10-oz"
  const ozMatch = name.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(oz|ozt|ounce|troy\s*oz)/i);
  if (ozMatch) {
    const value = parseFloat(ozMatch[1]);
    if (value > 0 && value <= 1000) return value;
  }

  // Gram bars: "1g", "5g", "10g", "50g", "100g"
  const gramMatch = name.match(/(\d+(?:\.\d+)?)\s*[-]?\s*(g|gram|grams)\b/i);
  if (gramMatch) {
    const grams = parseFloat(gramMatch[1]);
    if (grams > 0 && grams <= 1000) {
      return parseFloat((grams / 31.1035).toFixed(4)); // Convert grams to ozt
    }
  }

  // Common coin defaults (if metal detected but no weight)
  // American Silver Eagle, Canadian Maple, etc. are 1oz
  if (/\b(eagle|maple|britannia|philharmonic|buffalo|krugerrand|panda|libertad|kookaburra)\b/i.test(name)) {
    // If no specific weight mentioned, these are typically 1oz
    return 1;
  }

  // Junk silver - 90% silver coins have specific silver content
  if (/\bjunk\b.*silver|90%/i.test(name)) {
    // $1 face value of 90% silver = 0.715 ozt
    // Can't determine without face value, return null
    return null;
  }

  return null;
};

/**
 * Auto-detect dealer from headers/file content
 * Returns the dealer template key or 'generic'
 */
const detectDealerFromHeaders = (headers, fileContent = '') => {
  const headerStr = headers.join(' ').toLowerCase();
  const contentStr = (fileContent || '').toLowerCase();

  for (const [key, template] of Object.entries(DEALER_TEMPLATES)) {
    if (template.detectPattern && (template.detectPattern.test(headerStr) || template.detectPattern.test(contentStr))) {
      return key;
    }
  }

  return 'generic';
};

// ============================================
// ERROR BOUNDARY - Catches crashes and shows error UI
// ============================================
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error for debugging (visible in Crashlytics/Sentry if added later)
    console.error('ErrorBoundary caught error:', error);
    console.error('Error info:', errorInfo);
  }

  handleRestart = async () => {
    // Clear error state and try to re-render
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <SafeAreaView style={{ flex: 1, backgroundColor: '#0f0f0f', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <StatusBar barStyle="light-content" />
          <Text style={{ fontSize: 48, marginBottom: 16 }}>⚠️</Text>
          <Text style={{ fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ fontSize: 14, color: '#a1a1aa', textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
            The app encountered an unexpected error. Please try restarting.
          </Text>
          {!__DEV__ ? null : (
            <View style={{ backgroundColor: '#1a1a2e', padding: 12, borderRadius: 8, marginBottom: 24, maxWidth: '100%' }}>
              <Text style={{ fontSize: 10, color: '#ef4444', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' }}>
                {this.state.error?.toString()?.substring(0, 200)}
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={this.handleRestart}
            style={{ backgroundColor: '#fbbf24', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 8 }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: '#1a1a2e' }}>Try Again</Text>
          </TouchableOpacity>
        </SafeAreaView>
      );
    }

    return this.props.children;
  }
}

// ============================================
// REUSABLE COMPONENTS
// ============================================

const FloatingInput = ({ label, value, onChangeText, placeholder, keyboardType, prefix, editable = true, colors, isDarkMode }) => {
  // Default colors for backwards compatibility
  const labelColor = colors ? colors.muted : '#a1a1aa';
  const inputBg = colors ? (isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)') : 'rgba(0,0,0,0.3)';
  const borderColor = colors ? colors.border : 'rgba(255,255,255,0.1)';
  const textColor = colors ? colors.text : '#fff';
  const prefixColor = colors ? colors.muted : '#71717a';
  const disabledBg = colors ? (isDarkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)') : 'rgba(0,0,0,0.5)';

  return (
    <View style={styles.floatingContainer}>
      <Text style={[styles.floatingLabel, { color: labelColor }]}>{label}</Text>
      <View style={[styles.inputRow, { backgroundColor: inputBg, borderColor: borderColor }, !editable && { backgroundColor: disabledBg }]}>
        {prefix && <Text style={[styles.inputPrefix, { color: prefixColor }]}>{prefix}</Text>}
        <TextInput
          style={[styles.floatingInput, { color: textColor }, prefix && { paddingLeft: 4 }]}
          placeholder={placeholder}
          placeholderTextColor={colors ? colors.muted : '#52525b'}
          keyboardType={keyboardType || 'default'}
          value={value}
          onChangeText={onChangeText}
          editable={editable}
          returnKeyType="done"
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>
    </View>
  );
};

const PieChart = ({ data, size = 150, cardBgColor, textColor, mutedColor }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;

  // Filter out 0-value segments and calculate percentages
  const nonZeroSegments = data.filter((item) => item.value > 0);

  // Calculate percentages for legend (all items)
  const allSegments = data.map((item) => ({
    ...item,
    percentage: total > 0 ? item.value / total : 0,
  }));

  // Special case: single segment (100%) - just show a solid circle
  if (nonZeroSegments.length === 1) {
    const segment = nonZeroSegments[0];
    return (
      <View style={{ alignItems: 'center' }}>
        <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: segment.color, position: 'relative' }}>
          <View style={{
            position: 'absolute',
            width: size * 0.6,
            height: size * 0.6,
            borderRadius: size * 0.3,
            backgroundColor: cardBgColor || '#1a1a2e',
            top: size * 0.2,
            left: size * 0.2,
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <Text style={{ color: textColor || '#fff', fontWeight: '700', fontSize: 14 }}>
              ${(total / 1000).toFixed(1)}k
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
          {allSegments.map((seg, index) => (
            <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: seg.color, marginRight: 6 }} />
              <Text style={{ color: mutedColor || '#a1a1aa', fontSize: 12 }}>{seg.label} {(seg.percentage * 100).toFixed(0)}%</Text>
            </View>
          ))}
        </View>
      </View>
    );
  }

  // Two segments: use the half-rectangle overlay technique
  let currentAngle = 0;
  const segments = nonZeroSegments.map((item) => {
    const percentage = item.value / total;
    const angle = percentage * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...item, percentage, startAngle, angle };
  });

  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', position: 'relative' }}>
        {segments.map((segment, index) => (
          <View
            key={index}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              transform: [{ rotate: `${segment.startAngle}deg` }],
            }}
          >
            <View style={{ width: size / 2, height: size, backgroundColor: segment.color }} />
          </View>
        ))}
        <View style={{
          position: 'absolute',
          width: size * 0.6,
          height: size * 0.6,
          borderRadius: size * 0.3,
          backgroundColor: cardBgColor || '#1a1a2e',
          top: size * 0.2,
          left: size * 0.2,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text style={{ color: textColor || '#fff', fontWeight: '700', fontSize: 14 }}>
            ${(total / 1000).toFixed(1)}k
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
        {allSegments.map((segment, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: segment.color, marginRight: 6 }} />
            <Text style={{ color: mutedColor || '#a1a1aa', fontSize: 12 }}>{segment.label} {(segment.percentage * 100).toFixed(0)}%</Text>
          </View>
        ))}
      </View>
    </View>
  );
};

const ProgressBar = ({ value, max, color, label }) => {
  const percentage = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <View style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={{ color: '#a1a1aa', fontSize: 12 }}>{label}</Text>
        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }}>{percentage.toFixed(0)}%</Text>
      </View>
      <View style={{ height: 8, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 4 }}>
        <View style={{ height: 8, width: `${percentage}%`, backgroundColor: color, borderRadius: 4 }} />
      </View>
    </View>
  );
};

// Modal wrapper with proper keyboard handling and smooth scrolling
const ModalWrapper = ({ visible, onClose, title, children, colors, isDarkMode }) => {
  // Default colors for backwards compatibility (dark theme)
  const modalBg = colors ? (isDarkMode ? '#1a1a2e' : '#ffffff') : '#1a1a2e';
  const textColor = colors ? colors.text : '#fff';
  const borderColor = colors ? colors.border : 'rgba(255,255,255,0.1)';
  const buttonBg = colors ? (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)') : 'rgba(255,255,255,0.1)';

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={[styles.modalKeyboardView, { backgroundColor: modalBg }]}
        >
          <View style={[styles.modalContent, { backgroundColor: modalBg }]}>
            {/* Header - always visible */}
            <View style={[styles.modalHeader, { borderBottomColor: borderColor }]}>
              <Text style={[styles.modalTitle, { color: textColor }]}>{title}</Text>
              <TouchableOpacity
                onPress={onClose}
                style={[styles.closeButton, { backgroundColor: buttonBg }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: textColor }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* Content - scrollable with keyboard dismiss on scroll */}
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ============================================
// MAIN APP
// ============================================

// Main app content (wrapped by ErrorBoundary below)
function AppContent() {
  // Theme
  const systemColorScheme = useColorScheme();
  const [themePreference, setThemePreference] = useState('system'); // 'system', 'light', 'dark'

  // Derive actual theme from preference
  const isDarkMode = themePreference === 'system'
    ? systemColorScheme !== 'light'
    : themePreference === 'dark';

  // Core State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [tab, setTab] = useState('dashboard');
  const [metalTab, setMetalTab] = useState('both'); // Changed from 'silver' to 'both'

  // Spot Prices - Updated defaults for Dec 2025
  const [silverSpot, setSilverSpot] = useState(77);
  const [goldSpot, setGoldSpot] = useState(4530);
  const [priceSource, setPriceSource] = useState('cached');
  const [priceTimestamp, setPriceTimestamp] = useState(null);
  const [spotPricesLive, setSpotPricesLive] = useState(false); // True after successful API fetch

  // Spot Price Daily Change
  const [spotChange, setSpotChange] = useState({
    gold: { amount: null, percent: null },
    silver: { amount: null, percent: null },
  });
  const [spotChangeDisplayMode, setSpotChangeDisplayMode] = useState('percent'); // 'percent' or 'amount'

  // Portfolio Data
  const [silverItems, setSilverItems] = useState([]);
  const [goldItems, setGoldItems] = useState([]);
  const [dataLoaded, setDataLoaded] = useState(false); // Prevents saving until initial load completes

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSpeculationModal, setShowSpeculationModal] = useState(false);
  const [showJunkCalcModal, setShowJunkCalcModal] = useState(false);
  const [showPaywallModal, setShowPaywallModal] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  const [showImportPreview, setShowImportPreview] = useState(false);
  const [importData, setImportData] = useState([]);
  const [showDealerSelector, setShowDealerSelector] = useState(false);
  const [selectedDealer, setSelectedDealer] = useState(null);
  const [pendingImportFile, setPendingImportFile] = useState(null);
  const [showScannedItemsPreview, setShowScannedItemsPreview] = useState(false);
  const [scannedItems, setScannedItems] = useState([]);
  const [scannedMetadata, setScannedMetadata] = useState({ purchaseDate: '', dealer: '' });
  const [showDetailView, setShowDetailView] = useState(false);
  const [detailItem, setDetailItem] = useState(null);
  const [detailMetal, setDetailMetal] = useState(null);
  const [showSortMenu, setShowSortMenu] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  // Sort State
  const [sortBy, setSortBy] = useState('date-newest'); // date-newest, date-oldest, value-high, value-low, metal, name

  // Daily Snapshot State - stores oz counts and spot prices at midnight
  // This allows recalculating baseline when items are added/removed
  const [midnightSnapshot, setMidnightSnapshot] = useState(null);
  // Format: { silverOzt, goldOzt, silverSpot, goldSpot, date, timestamp }

  // Entitlements
  const [hasGold, setHasGold] = useState(false);

  // Server-side scan tracking
  const [scanUsage, setScanUsage] = useState({
    scansUsed: 0,
    scansLimit: 5,
    resetsAt: null,
    loading: true
  });

  // Lifetime Access (granted via RevenueCat)
  const [hasLifetimeAccess, setHasLifetimeAccess] = useState(false);
  const [revenueCatUserId, setRevenueCatUserId] = useState(null);

  // Upgrade Banner (session-only dismissal)
  const [upgradeBannerDismissed, setUpgradeBannerDismissed] = useState(false);

  // iCloud Sync State
  const [iCloudSyncEnabled, setICloudSyncEnabled] = useState(false);
  const [iCloudAvailable, setICloudAvailable] = useState(false);
  const [iCloudSyncing, setICloudSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Scan State
  const [scanStatus, setScanStatus] = useState(null);
  const [scanMessage, setScanMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);

  // Push Notifications State
  const [expoPushToken, setExpoPushToken] = useState(null);

  // Price Alerts State (Gold/Lifetime feature)
  const [priceAlerts, setPriceAlerts] = useState([]);
  const [showAddAlertModal, setShowAddAlertModal] = useState(false);
  const [alertsLoading, setAlertsLoading] = useState(false);
  const [newAlert, setNewAlert] = useState({
    metal: 'silver',
    targetPrice: '',
    direction: 'above', // 'above' or 'below'
  });

  // Analytics State (Gold/Lifetime feature)
  const [analyticsSnapshots, setAnalyticsSnapshots] = useState([]);
  const [analyticsRange, setAnalyticsRange] = useState('1M');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);

  // Share My Stack
  const shareViewRef = useRef(null);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);
  const [showSharePreview, setShowSharePreview] = useState(false);

  // Analytics fetch abort controller - allows canceling in-progress fetches
  const analyticsAbortRef = useRef(null);

  // Historical price cache - avoids re-fetching same dates when switching time ranges
  // Format: { "2025-01-15": { gold: 2650, silver: 31.50 }, ... }
  const historicalPriceCache = useRef({});

  // Form State
  const [form, setForm] = useState({
    productName: '', source: '', datePurchased: '', ozt: '',
    quantity: '1', unitPrice: '', taxes: '0', shipping: '0',
    spotPrice: '', premium: '0',
  });
  const [spotPriceSource, setSpotPriceSource] = useState(null); // Tracks data source for spot price warnings

  // Speculation State
  const [specSilverPrice, setSpecSilverPrice] = useState('100');
  const [specGoldPrice, setSpecGoldPrice] = useState('5000');

  // Junk Silver Calculator State
  const [junkType, setJunkType] = useState('90');
  const [junkFaceValue, setJunkFaceValue] = useState('');

  // Colors - dynamic based on theme
  const colors = isDarkMode ? {
    // Dark mode colors
    silver: '#94a3b8',
    gold: '#fbbf24',
    success: '#22c55e',
    error: '#ef4444',
    text: '#e4e4e7',
    muted: '#71717a',
    background: '#09090b',
    cardBg: '#18181b',
    border: 'rgba(255,255,255,0.1)',
  } : {
    // Light mode colors
    silver: '#64748b',
    gold: '#fbbf24',
    success: '#16a34a',
    error: '#dc2626',
    text: '#18181b',
    muted: '#71717a',
    background: '#f4f4f5',
    cardBg: '#ffffff',
    border: 'rgba(0,0,0,0.1)',
  };

  // Change theme and save to AsyncStorage
  const changeTheme = async (newTheme) => {
    setThemePreference(newTheme);
    try {
      await AsyncStorage.setItem('stack_theme_preference', newTheme);
    } catch (error) {
      console.error('Failed to save theme preference:', error);
    }
  };

  // Helper function to format currency with commas
  const formatCurrency = (value, decimals = 2) => {
    return value.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  // Helper function to calculate premium percentage
  const calculatePremiumPercent = (premium, unitPrice) => {
    if (unitPrice <= 0) return 0;
    return (premium / unitPrice) * 100;
  };

  // Helper function to parse various date formats into YYYY-MM-DD
  // Handles: 2023-03-21, Mar 21 2023, 03/21/2023, 21/03/2023, March 21, 2023, Excel serial numbers, etc.
  const parseDate = (dateStr) => {
    if (!dateStr) return '';
    const str = String(dateStr).trim();
    if (!str) return '';

    // Excel serial number detection (5 digit number between ~25000-55000 for years 1968-2050)
    // Excel dates are days since Jan 1, 1900 (with leap year bug - Excel thinks 1900 was leap year)
    if (/^\d{5}$/.test(str)) {
      const serial = parseInt(str);
      if (serial >= 25000 && serial <= 55000) {
        // Convert Excel serial to JS date
        // Excel epoch is Jan 1, 1900, but has a bug counting Feb 29, 1900 (which didn't exist)
        // For dates after Feb 28, 1900, subtract 1 day to account for this
        const excelEpoch = new Date(1899, 11, 30); // Dec 30, 1899 (Excel's actual day 0)
        const jsDate = new Date(excelEpoch.getTime() + serial * 24 * 60 * 60 * 1000);
        const y = jsDate.getFullYear();
        const m = String(jsDate.getMonth() + 1).padStart(2, '0');
        const d = String(jsDate.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }

    // Month name mappings
    const months = {
      jan: '01', january: '01',
      feb: '02', february: '02',
      mar: '03', march: '03',
      apr: '04', april: '04',
      may: '05',
      jun: '06', june: '06',
      jul: '07', july: '07',
      aug: '08', august: '08',
      sep: '09', sept: '09', september: '09',
      oct: '10', october: '10',
      nov: '11', november: '11',
      dec: '12', december: '12',
    };

    // Already in YYYY-MM-DD format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
      return str;
    }

    // ISO format with time: 2023-03-21T... -> 2023-03-21
    if (/^\d{4}-\d{2}-\d{2}T/.test(str)) {
      return str.substring(0, 10);
    }

    // MM/DD/YYYY or MM-DD-YYYY (US format)
    let match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, m, d, y] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // DD/MM/YYYY or DD-MM-YYYY (European format) - check if day > 12
    match = str.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (match) {
      const [, first, second, y] = match;
      // If first number > 12, it must be day (European format)
      if (parseInt(first) > 12) {
        return `${y}-${second.padStart(2, '0')}-${first.padStart(2, '0')}`;
      }
    }

    // YYYY/MM/DD or YYYY.MM.DD
    match = str.match(/^(\d{4})[\/\.](\d{1,2})[\/\.](\d{1,2})$/);
    if (match) {
      const [, y, m, d] = match;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // Month DD, YYYY or Month DD YYYY (e.g., "March 21, 2023" or "Mar 21 2023")
    match = str.match(/^([a-zA-Z]+)\s+(\d{1,2}),?\s+(\d{4})$/);
    if (match) {
      const [, monthStr, d, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-${d.padStart(2, '0')}`;
      }
    }

    // DD Month YYYY (e.g., "21 March 2023" or "21 Mar 2023")
    match = str.match(/^(\d{1,2})\s+([a-zA-Z]+),?\s+(\d{4})$/);
    if (match) {
      const [, d, monthStr, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-${d.padStart(2, '0')}`;
      }
    }

    // Month YYYY (assume day 1) - e.g., "March 2023"
    match = str.match(/^([a-zA-Z]+)\s+(\d{4})$/);
    if (match) {
      const [, monthStr, y] = match;
      const m = months[monthStr.toLowerCase()];
      if (m) {
        return `${y}-${m}-01`;
      }
    }

    // Try JavaScript's Date parser as last resort
    try {
      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        const y = parsed.getFullYear();
        const m = String(parsed.getMonth() + 1).padStart(2, '0');
        const d = String(parsed.getDate()).padStart(2, '0');
        // Only accept if year is reasonable (1900-2100)
        if (y >= 1900 && y <= 2100) {
          return `${y}-${m}-${d}`;
        }
      }
    } catch (e) {
      // Ignore parse errors
    }

    // Return original if we couldn't parse it
    return str;
  };

  // ============================================
  // CALCULATIONS
  // ============================================

  const totalSilverOzt = silverItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
  const totalGoldOzt = goldItems.reduce((sum, i) => sum + (i.ozt * i.quantity), 0);

  const silverMeltValue = totalSilverOzt * silverSpot;
  const goldMeltValue = totalGoldOzt * goldSpot;
  const totalMeltValue = silverMeltValue + goldMeltValue;

  const silverCostBasis = silverItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const goldCostBasis = goldItems.reduce((sum, i) => sum + (i.unitPrice * i.quantity) + i.taxes + i.shipping, 0);
  const totalCostBasis = silverCostBasis + goldCostBasis;

  const silverPremiumsPaid = silverItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const goldPremiumsPaid = goldItems.reduce((sum, i) => sum + (i.premium * i.quantity), 0);
  const totalPremiumsPaid = silverPremiumsPaid + goldPremiumsPaid;
  const totalPremiumsPct = totalCostBasis > 0 ? ((totalPremiumsPaid / totalCostBasis) * 100) : 0;

  const totalGainLoss = totalMeltValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? ((totalGainLoss / totalCostBasis) * 100) : 0;

  const goldSilverRatio = silverSpot > 0 ? (goldSpot / silverSpot) : 0;

  const avgSilverCostPerOz = totalSilverOzt > 0 ? (silverCostBasis / totalSilverOzt) : 0;
  const avgGoldCostPerOz = totalGoldOzt > 0 ? (goldCostBasis / totalGoldOzt) : 0;

  // Daily change calculation - recalculates baseline using CURRENT oz counts × MIDNIGHT spot prices
  // This ensures adding/removing items doesn't affect Today's Change (only price movement does)
  const midnightBaseline = midnightSnapshot
    ? (totalSilverOzt * midnightSnapshot.silverSpot) + (totalGoldOzt * midnightSnapshot.goldSpot)
    : null;
  const dailyChange = midnightBaseline !== null ? (totalMeltValue - midnightBaseline) : 0;
  const dailyChangePct = (midnightBaseline !== null && midnightBaseline > 0) ? ((dailyChange / midnightBaseline) * 100) : 0;
  const isDailyChangePositive = dailyChange >= 0;

  // Show daily change only if:
  // 1. We have a midnight snapshot
  // 2. The snapshot date is today
  // 3. We have live prices (not stale defaults)
  const isTodaySnapshot = midnightSnapshot?.date === new Date().toDateString();
  const showDailyChange = midnightSnapshot !== null
    && midnightBaseline > 0
    && isTodaySnapshot
    && spotPricesLive;

  // Speculation
  const specSilverNum = parseFloat(specSilverPrice) || silverSpot;
  const specGoldNum = parseFloat(specGoldPrice) || goldSpot;
  const specTotalValue = (totalSilverOzt * specSilverNum) + (totalGoldOzt * specGoldNum);
  const specGainLoss = specTotalValue - totalCostBasis;
  const specGainLossPct = totalCostBasis > 0 ? ((specGainLoss / totalCostBasis) * 100) : 0;

  // Junk Silver
  const junkMultipliers = { '90': 0.715, '40': 0.295, '35': 0.0563 };
  const junkFaceNum = parseFloat(junkFaceValue) || 0;
  const junkOzt = junkType === '35' ? (junkFaceNum / 0.05) * junkMultipliers['35'] : junkFaceNum * junkMultipliers[junkType];
  const junkMeltValue = junkOzt * silverSpot;

  // Break-even
  const silverBreakeven = totalSilverOzt > 0 ? (silverCostBasis / totalSilverOzt) : 0;
  const goldBreakeven = totalGoldOzt > 0 ? (goldCostBasis / totalGoldOzt) : 0;

  // Milestones
  const silverMilestones = [10, 50, 100, 250, 500, 1000];
  const goldMilestones = [1, 5, 10, 25, 50, 100];
  const nextSilverMilestone = silverMilestones.find(m => totalSilverOzt < m) || 1000;
  const nextGoldMilestone = goldMilestones.find(m => totalGoldOzt < m) || 100;

  // ============================================
  // AUTO-CALCULATE PREMIUM
  // ============================================

  useEffect(() => {
    const unitPrice = parseFloat(form.unitPrice) || 0;
    const spotPrice = parseFloat(form.spotPrice) || 0;
    const ozt = parseFloat(form.ozt) || 0;

    if (unitPrice > 0 && spotPrice > 0 && ozt > 0) {
      const calculatedPremium = unitPrice - (spotPrice * ozt);
      if (calculatedPremium > 0) {
        setForm(prev => ({ ...prev, premium: calculatedPremium.toFixed(2) }));
      }
    }
  }, [form.unitPrice, form.spotPrice, form.ozt]);

  // ============================================
  // AUTHENTICATION & DATA
  // ============================================

  const authenticate = async () => {
    try {
      // Wrap all authentication in defensive try-catch
      let shouldAuthenticate = false;

      try {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const isEnrolled = await LocalAuthentication.isEnrolledAsync();

        if (hasHardware && isEnrolled) {
          const result = await LocalAuthentication.authenticateAsync({
            promptMessage: 'Unlock Stack Tracker Pro',
            fallbackLabel: 'Use Passcode',
          });
          shouldAuthenticate = result?.success === true;
        } else {
          // No biometric hardware or not enrolled - allow access
          shouldAuthenticate = true;
        }
      } catch (authError) {
        console.error('Biometric auth error (non-fatal):', authError?.message || authError);
        // If biometric fails, allow access anyway
        shouldAuthenticate = true;
      }

      // Only update state and load data if authentication succeeded or was skipped
      if (shouldAuthenticate) {
        setIsAuthenticated(true);
        // Wrap loadData in setTimeout to ensure state update completes first
        setTimeout(() => {
          loadData().catch(err => {
            console.error('loadData failed (non-fatal):', err?.message || err);
            setIsLoading(false); // Still hide loading even if data fails
          });
        }, 50);
      }
    } catch (e) {
      console.error('authenticate outer catch:', e?.message || e);
      setIsAuthenticated(true);
      setIsLoading(false);
    }
  };

  const loadData = async () => {
    try {
      const [silver, gold, silverS, goldS, timestamp, hasSeenTutorial, storedMidnightSnapshot, storedTheme, storedChangeDisplayMode] = await Promise.all([
        AsyncStorage.getItem('stack_silver'),
        AsyncStorage.getItem('stack_gold'),
        AsyncStorage.getItem('stack_silver_spot'),
        AsyncStorage.getItem('stack_gold_spot'),
        AsyncStorage.getItem('stack_price_timestamp'),
        AsyncStorage.getItem('stack_has_seen_tutorial'),
        AsyncStorage.getItem('stack_midnight_snapshot'),
        AsyncStorage.getItem('stack_theme_preference'),
        AsyncStorage.getItem('stack_spot_change_display_mode'),
      ]);

      // Safely parse JSON data with fallbacks
      if (silver) {
        try { setSilverItems(JSON.parse(silver)); } catch (e) { console.error('Failed to parse silver data'); }
      }
      if (gold) {
        try { setGoldItems(JSON.parse(gold)); } catch (e) { console.error('Failed to parse gold data'); }
      }
      if (silverS) setSilverSpot(parseFloat(silverS) || 30);
      if (goldS) setGoldSpot(parseFloat(goldS) || 2600);
      if (timestamp) setPriceTimestamp(timestamp);
      if (storedMidnightSnapshot) {
        try {
          setMidnightSnapshot(JSON.parse(storedMidnightSnapshot));
        } catch (e) {
          console.error('Failed to parse midnight snapshot');
        }
      }
      if (storedTheme && ['system', 'light', 'dark'].includes(storedTheme)) {
        setThemePreference(storedTheme);
      }
      if (storedChangeDisplayMode && ['percent', 'amount'].includes(storedChangeDisplayMode)) {
        setSpotChangeDisplayMode(storedChangeDisplayMode);
      }

      // Show tutorial if user hasn't seen it
      if (!hasSeenTutorial) {
        setShowTutorial(true);
      }

      // Mark data as loaded BEFORE fetching prices - this prevents the save useEffect from overwriting
      setDataLoaded(true);

      // Delay fetchSpotPrices to not block the main thread
      setTimeout(() => {
        fetchSpotPrices().catch(err => console.error('fetchSpotPrices failed:', err?.message));
      }, 100);
    } catch (error) {
      console.error('Error loading data:', error?.message || error);
      // Still mark as loaded on error to prevent infinite loop, but data won't be overwritten
      setDataLoaded(true);
    } finally {
      setIsLoading(false);
    }
  };

  const saveData = async (key, data) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(data));
    } catch (error) {
      console.error('Error saving data:', error);
    }
  };

  // ============================================
  // ICLOUD SYNC FUNCTIONS
  // ============================================

  // Check if iCloud is available
  const checkiCloudAvailability = async () => {
    if (Platform.OS !== 'ios') {
      setICloudAvailable(false);
      return false;
    }
    try {
      const available = await CloudStorage.isCloudAvailable();
      setICloudAvailable(available);
      return available;
    } catch (error) {
      console.log('iCloud availability check failed:', error?.message);
      setICloudAvailable(false);
      return false;
    }
  };

  // Load iCloud sync preference
  const loadiCloudSyncPreference = async () => {
    try {
      const enabled = await AsyncStorage.getItem('stack_icloud_sync_enabled');
      const lastSync = await AsyncStorage.getItem('stack_last_sync_time');
      if (enabled === 'true') setICloudSyncEnabled(true);
      if (lastSync) setLastSyncTime(lastSync);
    } catch (error) {
      console.error('Failed to load iCloud preference:', error);
    }
  };

  // Check if user has Gold access (Gold subscription or Lifetime)
  const hasGoldAccess = hasGold || hasLifetimeAccess;

  // Save holdings to iCloud
  const syncToCloud = async (silver = silverItems, gold = goldItems) => {
    if (!hasGoldAccess || !iCloudSyncEnabled || !iCloudAvailable || Platform.OS !== 'ios') return;

    try {
      setICloudSyncing(true);
      const cloudData = {
        silverItems: silver,
        goldItems: gold,
        lastModified: new Date().toISOString(),
        version: '1.0',
      };

      await CloudStorage.writeFile(
        ICLOUD_HOLDINGS_KEY,
        JSON.stringify(cloudData),
        CloudStorageScope.Documents
      );

      const syncTime = new Date().toISOString();
      setLastSyncTime(syncTime);
      await AsyncStorage.setItem('stack_last_sync_time', syncTime);
      console.log('Synced to iCloud successfully');
    } catch (error) {
      console.error('iCloud sync failed:', error?.message);
    } finally {
      setICloudSyncing(false);
    }
  };

  // Load holdings from iCloud
  const syncFromCloud = async () => {
    if (!iCloudAvailable || Platform.OS !== 'ios') return null;

    try {
      setICloudSyncing(true);
      const exists = await CloudStorage.exists(ICLOUD_HOLDINGS_KEY, CloudStorageScope.Documents);
      if (!exists) {
        console.log('No iCloud data found');
        return null;
      }

      const content = await CloudStorage.readFile(ICLOUD_HOLDINGS_KEY, CloudStorageScope.Documents);
      const cloudData = JSON.parse(content);

      return cloudData;
    } catch (error) {
      console.error('Failed to read from iCloud:', error?.message);
      return null;
    } finally {
      setICloudSyncing(false);
    }
  };

  // Toggle iCloud sync
  const toggleiCloudSync = async (enabled) => {
    if (enabled && !iCloudAvailable) {
      Alert.alert('iCloud Unavailable', 'Please sign in to iCloud in your device settings to enable sync.');
      return;
    }

    setICloudSyncEnabled(enabled);
    await AsyncStorage.setItem('stack_icloud_sync_enabled', enabled ? 'true' : 'false');

    if (enabled) {
      // Check for existing cloud data
      const cloudData = await syncFromCloud();
      if (cloudData && cloudData.lastModified) {
        const localTimestamp = await AsyncStorage.getItem('stack_last_modified');
        const cloudTime = new Date(cloudData.lastModified).getTime();
        const localTime = localTimestamp ? new Date(localTimestamp).getTime() : 0;

        if (cloudTime > localTime && (cloudData.silverItems?.length > 0 || cloudData.goldItems?.length > 0)) {
          // Cloud data is newer - ask user or auto-apply
          Alert.alert(
            'iCloud Data Found',
            'Found newer data in iCloud. Would you like to use it?',
            [
              { text: 'Keep Local', style: 'cancel', onPress: () => syncToCloud() },
              {
                text: 'Use iCloud',
                onPress: () => {
                  if (cloudData.silverItems) setSilverItems(cloudData.silverItems);
                  if (cloudData.goldItems) setGoldItems(cloudData.goldItems);
                  setLastSyncTime(cloudData.lastModified);
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
              },
            ]
          );
        } else {
          // Local is newer or same - sync to cloud
          await syncToCloud();
        }
      } else {
        // No cloud data - sync local to cloud
        await syncToCloud();
      }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  // Manual sync trigger
  const triggerManualSync = async () => {
    if (!iCloudAvailable) {
      Alert.alert('iCloud Unavailable', 'Please sign in to iCloud in your device settings.');
      return;
    }

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await syncToCloud();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Synced', 'Your holdings have been synced to iCloud.');
  };

  // Update local timestamp when data changes
  const updateLocalTimestamp = async () => {
    await AsyncStorage.setItem('stack_last_modified', new Date().toISOString());
  };

  // Initialize iCloud on app start
  useEffect(() => {
    if (Platform.OS === 'ios') {
      checkiCloudAvailability();
      loadiCloudSyncPreference();
    }
  }, []);

  // Sync to cloud when holdings change (debounced) - Gold/Lifetime only
  useEffect(() => {
    if (!isAuthenticated || !dataLoaded || !iCloudSyncEnabled || !hasGoldAccess) return;

    updateLocalTimestamp();
    const timeout = setTimeout(() => {
      syncToCloud();
    }, 2000); // Debounce 2 seconds

    return () => clearTimeout(timeout);
  }, [silverItems, goldItems, iCloudSyncEnabled, isAuthenticated, dataLoaded, hasGoldAccess]);

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    if (isAuthenticated && dataLoaded) saveData('stack_silver', silverItems);
  }, [silverItems, isAuthenticated, dataLoaded]);

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    if (isAuthenticated && dataLoaded) saveData('stack_gold', goldItems);
  }, [goldItems, isAuthenticated, dataLoaded]);

  useEffect(() => { authenticate(); }, []);

  // Register for push notifications (for price alerts)
  const registerForPushNotifications = async () => {
    try {
      // Check if device (not simulator)
      if (!Constants.isDevice) {
        console.log('📱 Push notifications require a physical device');
        return null;
      }

      // Check existing permissions
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      // Request permission if not granted
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== 'granted') {
        console.log('📱 Push notification permission not granted');
        return null;
      }

      // Get Expo push token
      const tokenData = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      const token = tokenData.data;
      console.log('📱 Expo Push Token:', token);

      // Configure for iOS
      if (Platform.OS === 'ios') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#fbbf24',
        });
      }

      return token;
    } catch (error) {
      console.error('❌ Push notification registration error:', error);
      return null;
    }
  };

  // Register for push notifications after authentication
  useEffect(() => {
    if (isAuthenticated) {
      registerForPushNotifications().then(token => {
        if (token) {
          setExpoPushToken(token);
        }
      });
    }
  }, [isAuthenticated]);

  // Check entitlements function (can be called after purchase)
  const checkEntitlements = async () => {
    try {
      const customerInfo = await Purchases.getCustomerInfo();

      // Safety checks for customerInfo structure
      if (!customerInfo) {
        if (__DEV__) console.log('❌ No customer info returned from RevenueCat');
        return false;
      }

      const activeEntitlements = customerInfo?.entitlements?.active || {};
      const isGold = activeEntitlements['Gold'] !== undefined;
      const isLifetime = activeEntitlements['Lifetime'] !== undefined;
      const userId = customerInfo?.originalAppUserId || null;

      if (__DEV__) console.log('📋 RevenueCat User ID:', userId);
      if (__DEV__) console.log('🏆 Has Gold:', isGold, 'Has Lifetime:', isLifetime);

      setHasGold(isGold);
      setHasLifetimeAccess(isLifetime);
      setRevenueCatUserId(userId);

      return isGold || isLifetime;
    } catch (error) {
      if (__DEV__) console.log('❌ Error checking entitlements:', error);
      return false;
    }
  };

  // Initialize RevenueCat (non-blocking, runs after authentication)
  // IMPORTANT: Uses setTimeout to ensure this doesn't block the main render
  useEffect(() => {
    if (!isAuthenticated) return; // Wait for auth to complete first

    // Delay RevenueCat setup slightly to ensure UI renders first
    const timeoutId = setTimeout(() => {
      const setupRevenueCat = async () => {
        try {
          // Use the same API key for all builds - RevenueCat auto-detects sandbox vs production
          // based on the App Store receipt. EAS dev builds use release mode so __DEV__ is false.
          const apiKey = 'appl_WDKPrWsOHfWzfJhxOGluQYsniLW';

          console.log('🔧 Initializing RevenueCat...');

          const initialized = await initializePurchases(apiKey);
          if (initialized) {
            // Additional delay before checking entitlements
            await new Promise(resolve => setTimeout(resolve, 100));
            await checkEntitlements();
            console.log('✅ RevenueCat setup complete');
          } else {
            console.log('⚠️ RevenueCat initialization returned false, skipping entitlements');
          }
        } catch (error) {
          // Log but don't crash - RevenueCat is not critical for app function
          console.error('RevenueCat setup failed (non-fatal):', error?.message || error);
        }
      };
      setupRevenueCat();
    }, 500); // 500ms delay to let UI settle

    return () => clearTimeout(timeoutId);
  }, [isAuthenticated]); // Run when isAuthenticated changes

  // Fetch scan status when RevenueCat user ID is available
  useEffect(() => {
    if (revenueCatUserId && !hasGold && !hasLifetimeAccess) {
      fetchScanStatus();
    }
  }, [revenueCatUserId, hasGold, hasLifetimeAccess]);

  // Fetch price alerts when user has Gold/Lifetime access
  useEffect(() => {
    if (revenueCatUserId && (hasGold || hasLifetimeAccess)) {
      fetchPriceAlerts();
    }
  }, [revenueCatUserId, hasGold, hasLifetimeAccess]);

  // Daily Snapshot: Check if it's a new day and update midnight snapshot
  // Stores oz counts and spot prices so we can recalculate baseline when items change
  useEffect(() => {
    const checkAndUpdateMidnightSnapshot = async () => {
      // IMPORTANT: Wait until data is loaded AND we have live spot prices from API
      // This prevents saving wrong values before prices are fetched
      if (!isAuthenticated || !dataLoaded || !spotPricesLive) {
        if (__DEV__ && !spotPricesLive && dataLoaded) {
          console.log('📸 Snapshot deferred: waiting for live spot prices...');
        }
        return;
      }

      // Only update if we have actual portfolio data (items loaded)
      // If totalMeltValue is 0 with no items, that's valid - but if items exist, value should be > 0
      const hasItems = silverItems.length > 0 || goldItems.length > 0;
      if (hasItems && totalMeltValue === 0) {
        // Items exist but value is 0 - something is wrong, skip
        if (__DEV__) console.log('📸 Snapshot skipped: items exist but value is 0');
        return;
      }

      const today = new Date().toDateString(); // e.g., "Mon Dec 29 2025"

      // If no snapshot or it's a new day, create new snapshot
      if (!midnightSnapshot || midnightSnapshot.date !== today) {
        const snapshot = {
          silverOzt: totalSilverOzt,
          goldOzt: totalGoldOzt,
          silverSpot: silverSpot,
          goldSpot: goldSpot,
          date: today,
          timestamp: new Date().toISOString(),
        };

        await AsyncStorage.setItem('stack_midnight_snapshot', JSON.stringify(snapshot));
        setMidnightSnapshot(snapshot);

        const snapshotValue = (totalSilverOzt * silverSpot) + (totalGoldOzt * goldSpot);
        console.log(`📸 Daily snapshot: ${totalSilverOzt.toFixed(2)}oz Ag @ $${silverSpot}, ${totalGoldOzt.toFixed(3)}oz Au @ $${goldSpot} = $${snapshotValue.toFixed(2)}`);
      }
    };

    // Check on app open and when prices are loaded
    checkAndUpdateMidnightSnapshot();
  }, [isAuthenticated, dataLoaded, spotPricesLive, midnightSnapshot, totalSilverOzt, totalGoldOzt, silverSpot, goldSpot, totalMeltValue, silverItems.length, goldItems.length]);

  // Auto-refresh spot prices every 1 minute (when app is active)
  useEffect(() => {
    let priceRefreshInterval = null;

    const startPriceRefresh = () => {
      // Clear any existing interval
      if (priceRefreshInterval) {
        clearInterval(priceRefreshInterval);
      }

      // Fetch prices every 60 seconds (1 minute)
      priceRefreshInterval = setInterval(() => {
        if (isAuthenticated) {
          if (__DEV__) console.log('🔄 Auto-refreshing spot prices (1-min interval)...');
          fetchSpotPrices(true); // silent = true (no loading indicator)
        }
      }, 60000); // 60,000ms = 1 minute
    };

    const stopPriceRefresh = () => {
      if (priceRefreshInterval) {
        clearInterval(priceRefreshInterval);
        priceRefreshInterval = null;
        if (__DEV__) console.log('⏸️  Paused auto-refresh (app in background)');
      }
    };

    // Listen to app state changes
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        // App came to foreground - fetch prices immediately, then start auto-refresh
        if (__DEV__) console.log('▶️  App active - fetching prices and starting auto-refresh');
        if (isAuthenticated) {
          fetchSpotPrices(true); // Fetch immediately on foreground
        }
        startPriceRefresh();
      } else {
        // App went to background - stop auto-refresh
        stopPriceRefresh();
      }
    });

    // Start auto-refresh when component mounts (if authenticated)
    if (isAuthenticated) {
      startPriceRefresh();
    }

    // Cleanup on unmount
    return () => {
      stopPriceRefresh();
      subscription.remove();
    };
  }, [isAuthenticated]);

  // Free tier limit check
  const handleAddPurchase = () => {
    const FREE_TIER_LIMIT = 25;
    const totalItems = silverItems.length + goldItems.length;

    if (!hasGold && !hasLifetimeAccess && totalItems >= FREE_TIER_LIMIT) {
      // User has reached free tier limit, show paywall
      // Haptic feedback on hitting limit
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      Alert.alert(
        'Upgrade to Gold',
        `You've reached the free tier limit of ${FREE_TIER_LIMIT} items. Upgrade to Gold for unlimited items!`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade Now', onPress: () => setShowPaywallModal(true) }
        ]
      );
    } else {
      // User can add more items
      resetForm();
      // Ensure a valid metal is selected (not 'both') when adding new items
      if (metalTab === 'both') {
        setMetalTab('silver'); // Default to silver when adding from "Both" view
      }
      setShowAddModal(true);
    }
  };

  // Tutorial completion handler
  const handleTutorialComplete = async () => {
    try {
      await AsyncStorage.setItem('stack_has_seen_tutorial', 'true');
      setShowTutorial(false);
    } catch (error) {
      console.error('Error saving tutorial status:', error);
      setShowTutorial(false);
    }
  };

  // Server-side scan tracking functions
  const fetchScanStatus = async () => {
    if (!revenueCatUserId) {
      if (__DEV__) console.log('⚠️ No RevenueCat user ID yet, skipping scan status fetch');
      return;
    }

    // Skip for premium users - they have unlimited scans
    if (hasGold || hasLifetimeAccess) {
      setScanUsage(prev => ({ ...prev, loading: false }));
      return;
    }

    try {
      if (__DEV__) console.log(`📊 Fetching scan status for user: ${revenueCatUserId.substring(0, 8)}...`);
      const response = await fetch(`${API_BASE_URL}/api/scan-status?rcUserId=${encodeURIComponent(revenueCatUserId)}`);
      const data = await response.json();

      if (data.success) {
        setScanUsage({
          scansUsed: data.scansUsed,
          scansLimit: data.scansLimit,
          resetsAt: data.resetsAt,
          loading: false
        });
        if (__DEV__) console.log(`📊 Scan status: ${data.scansUsed}/${data.scansLimit}, resets at ${data.resetsAt}`);
      } else {
        if (__DEV__) console.log('⚠️ Failed to fetch scan status:', data.error);
        setScanUsage(prev => ({ ...prev, loading: false }));
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Error fetching scan status:', error.message);
      // Fail open - allow scanning if server is unreachable
      setScanUsage(prev => ({ ...prev, loading: false }));
    }
  };

  const incrementScanCount = async () => {
    if (!revenueCatUserId) {
      if (__DEV__) console.log('⚠️ No RevenueCat user ID, cannot increment scan count');
      return;
    }

    try {
      if (__DEV__) console.log(`📊 Incrementing scan count for user: ${revenueCatUserId.substring(0, 8)}...`);
      const response = await fetch(`${API_BASE_URL}/api/increment-scan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rcUserId: revenueCatUserId })
      });
      const data = await response.json();

      if (data.success) {
        setScanUsage({
          scansUsed: data.scansUsed,
          scansLimit: data.scansLimit,
          resetsAt: data.resetsAt,
          loading: false
        });
        if (__DEV__) console.log(`📊 New scan count: ${data.scansUsed}/${data.scansLimit}`);
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Error incrementing scan count:', error.message);
      // Still update local state optimistically
      setScanUsage(prev => ({ ...prev, scansUsed: prev.scansUsed + 1 }));
    }
  };

  const canScan = () => {
    if (hasGold || hasLifetimeAccess) return true; // Gold tier or lifetime access has unlimited scans
    return scanUsage.scansUsed < scanUsage.scansLimit;
  };

  const checkScanLimit = () => {
    if (hasGold || hasLifetimeAccess) return true; // Gold tier or lifetime access bypass

    if (scanUsage.scansUsed >= scanUsage.scansLimit) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      // Format reset date
      let resetDateStr = '';
      if (scanUsage.resetsAt) {
        resetDateStr = new Date(scanUsage.resetsAt).toLocaleDateString();
      }

      Alert.alert(
        'Scan Limit Reached',
        `You've used all ${scanUsage.scansLimit} free scans this month.${resetDateStr ? ` Resets on ${resetDateStr}.` : ''}\n\nUpgrade to Gold for unlimited scans!`,
        [
          { text: 'Maybe Later', style: 'cancel' },
          { text: 'Upgrade to Gold', onPress: () => setShowPaywallModal(true) }
        ]
      );
      return false;
    }
    return true;
  };

  // ============================================
  // PRICE ALERTS (Gold/Lifetime Feature)
  // ============================================

  // Fetch user's price alerts
  const fetchPriceAlerts = async () => {
    if (!revenueCatUserId) return;
    if (!hasGold && !hasLifetimeAccess) return; // Only for premium users

    setAlertsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/alerts/${encodeURIComponent(revenueCatUserId)}`);
      const data = await response.json();

      if (data.success) {
        setPriceAlerts(data.alerts || []);
        if (__DEV__) console.log(`🔔 Loaded ${data.alerts?.length || 0} price alerts`);
      }
    } catch (error) {
      console.error('❌ Error fetching price alerts:', error);
    } finally {
      setAlertsLoading(false);
    }
  };

  // Create a new price alert
  const createPriceAlert = async () => {
    if (!revenueCatUserId) {
      Alert.alert('Error', 'Unable to create alert. Please try again.');
      return;
    }

    const targetPrice = parseFloat(newAlert.targetPrice);
    if (isNaN(targetPrice) || targetPrice <= 0) {
      Alert.alert('Invalid Price', 'Please enter a valid target price.');
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const response = await fetch(`${API_BASE_URL}/api/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: revenueCatUserId,
          metal: newAlert.metal,
          targetPrice: targetPrice,
          direction: newAlert.direction,
          pushToken: expoPushToken,
        }),
      });

      const data = await response.json();

      if (data.success) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setPriceAlerts(prev => [data.alert, ...prev]);
        setShowAddAlertModal(false);
        setNewAlert({ metal: 'silver', targetPrice: '', direction: 'above' });

        Alert.alert(
          'Alert Created',
          `You'll be notified when ${newAlert.metal === 'gold' ? 'gold' : 'silver'} goes ${newAlert.direction} $${targetPrice}/oz.`
        );
      } else {
        Alert.alert('Error', data.error || 'Failed to create alert');
      }
    } catch (error) {
      console.error('❌ Error creating price alert:', error);
      Alert.alert('Error', 'Failed to create alert. Please try again.');
    }
  };

  // Delete a price alert
  const deletePriceAlert = async (alertId) => {
    if (!revenueCatUserId) return;

    Alert.alert(
      'Delete Alert',
      'Are you sure you want to delete this price alert?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

              const response = await fetch(
                `${API_BASE_URL}/api/alerts/${alertId}?userId=${encodeURIComponent(revenueCatUserId)}`,
                { method: 'DELETE' }
              );

              const data = await response.json();

              if (data.success) {
                setPriceAlerts(prev => prev.filter(a => a.id !== alertId));
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              }
            } catch (error) {
              console.error('❌ Error deleting price alert:', error);
            }
          },
        },
      ]
    );
  };

  // ============================================
  // HOME SCREEN WIDGET (Gold/Lifetime Feature)
  // ============================================

  /**
   * Sync portfolio data to iOS home screen widget
   * Called when prices update or portfolio changes
   */
  const syncWidget = async () => {
    // Debug logging for subscription state
    console.log('📱 [syncWidget] Called with state:', {
      hasGold,
      hasLifetimeAccess,
      combinedSubscription: hasGold || hasLifetimeAccess,
      platform: Platform.OS,
      widgetKitAvailable: isWidgetKitAvailable(),
    });

    // Only sync for Gold/Lifetime subscribers
    if (!hasGold && !hasLifetimeAccess) {
      console.log('📱 [syncWidget] Skipping - no subscription');
      return;
    }

    // Only sync on iOS with WidgetKit available
    if (Platform.OS !== 'ios' || !isWidgetKitAvailable()) {
      console.log('📱 [syncWidget] Skipping - not iOS or WidgetKit unavailable');
      return;
    }

    try {
      // Calculate daily change
      let dailyChangeAmt = 0;
      let dailyChangePct = 0;

      if (midnightSnapshot && spotPricesLive) {
        const midnightBaseline = (totalSilverOzt * midnightSnapshot.silverSpot) +
                                 (totalGoldOzt * midnightSnapshot.goldSpot);
        if (midnightBaseline > 0) {
          dailyChangeAmt = totalMeltValue - midnightBaseline;
          dailyChangePct = (dailyChangeAmt / midnightBaseline) * 100;
        }
      }

      const widgetPayload = {
        portfolioValue: totalMeltValue,
        dailyChangeAmount: dailyChangeAmt,
        dailyChangePercent: dailyChangePct,
        goldSpot: goldSpot,
        silverSpot: silverSpot,
        hasSubscription: hasGold || hasLifetimeAccess,
      };

      console.log('📱 [syncWidget] Sending payload:', widgetPayload);

      await syncWidgetData(widgetPayload);

      console.log('✅ [syncWidget] Widget data synced successfully');
    } catch (error) {
      console.error('❌ [syncWidget] Failed:', error.message);
    }
  };

  // Sync widget when prices or portfolio changes
  useEffect(() => {
    if (dataLoaded && spotPricesLive && (hasGold || hasLifetimeAccess)) {
      syncWidget();
    }
  }, [totalMeltValue, silverSpot, goldSpot, dataLoaded, spotPricesLive, hasGold, hasLifetimeAccess]);

  // Sync widget when app comes to foreground
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active' && (hasGold || hasLifetimeAccess)) {
        syncWidget();
      }
    });

    return () => subscription.remove();
  }, [hasGold, hasLifetimeAccess]);

  // ============================================
  // ANALYTICS (Gold/Lifetime Feature)
  // ============================================

  /**
   * Save daily portfolio snapshot for analytics
   * Only saves once per day (checks lastSnapshotDate in AsyncStorage)
   */
  const saveDailySnapshot = async () => {
    // Only for Gold/Lifetime subscribers
    if (!hasGold && !hasLifetimeAccess) return;
    if (!revenueCatUserId) return;
    if (!spotPricesLive) return; // Need live prices for accurate snapshot

    try {
      const today = new Date().toISOString().split('T')[0];
      const lastSnapshot = await AsyncStorage.getItem('lastSnapshotDate');

      // Only save one snapshot per day
      if (lastSnapshot === today) {
        if (__DEV__) console.log('📊 Snapshot already saved today');
        return;
      }

      // Calculate portfolio values
      const goldValue = totalGoldOzt * goldSpot;
      const silverValue = totalSilverOzt * silverSpot;
      const totalValue = goldValue + silverValue;

      const response = await fetch(`${API_BASE_URL}/api/snapshots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: revenueCatUserId,
          totalValue,
          goldValue,
          silverValue,
          goldOz: totalGoldOzt,
          silverOz: totalSilverOzt,
          goldSpot,
          silverSpot,
        }),
      });

      const data = await response.json();

      if (data.success) {
        await AsyncStorage.setItem('lastSnapshotDate', today);
        if (__DEV__) console.log('📊 Daily snapshot saved:', data.snapshot?.date);
      }
    } catch (error) {
      console.error('❌ Error saving daily snapshot:', error.message);
    }
  };

  /**
   * Calculate historical portfolio values from holdings + historical spot prices
   * This generates chart data client-side without needing to persist every historical snapshot
   */
  const calculateHistoricalPortfolioData = async (range = '1M') => {
    const allItems = [...silverItems, ...goldItems];
    if (allItems.length === 0) return [];

    // Determine date range
    const now = new Date();
    let startDate = new Date();
    switch (range.toUpperCase()) {
      case '1W': startDate.setDate(now.getDate() - 7); break;
      case '1M': startDate.setMonth(now.getMonth() - 1); break;
      case '3M': startDate.setMonth(now.getMonth() - 3); break;
      case '6M': startDate.setMonth(now.getMonth() - 6); break;
      case '1Y': startDate.setFullYear(now.getFullYear() - 1); break;
      case 'ALL':
        // Find oldest purchase date
        const oldestPurchase = allItems.reduce((oldest, item) => {
          if (item.datePurchased && item.datePurchased < oldest) return item.datePurchased;
          return oldest;
        }, now.toISOString().split('T')[0]);
        startDate = new Date(oldestPurchase);
        break;
    }

    // Generate dates to calculate (sample every few days for performance)
    // Limit to max 10 data points to avoid too many API calls
    const dates = [];
    const totalDays = Math.ceil((now - startDate) / (1000 * 60 * 60 * 24));
    const maxPoints = 10;
    const step = Math.max(1, Math.ceil(totalDays / maxPoints));

    for (let d = new Date(startDate); d <= now; d.setDate(d.getDate() + step)) {
      dates.push(d.toISOString().split('T')[0]);
    }
    // Always include today
    const today = now.toISOString().split('T')[0];
    if (!dates.includes(today)) dates.push(today);

    // Pre-cache today's prices from live spot data (avoids an API call)
    if (goldSpot > 0 && silverSpot > 0 && !historicalPriceCache.current[today]) {
      historicalPriceCache.current[today] = {
        gold: goldSpot,
        silver: silverSpot,
      };
      if (__DEV__) console.log(`   📦 Pre-cached today's prices from live spot: Gold $${goldSpot}, Silver $${silverSpot}`);
    }

    // Check how many dates we need to fetch (not in cache)
    const uncachedDates = dates.filter(d => !historicalPriceCache.current[d]);
    const cachedCount = dates.length - uncachedDates.length;

    if (__DEV__) {
      console.log(`📊 Calculating ${dates.length} data points for range ${range}`);
      console.log(`   📦 ${cachedCount} cached, ${uncachedDates.length} need fetching`);
    }

    // Helper function to fetch with timeout
    const fetchWithTimeout = async (url, timeoutMs = 5000) => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        clearTimeout(timeoutId);
        throw error;
      }
    };

    // Fetch uncached dates (if any)
    let consecutiveFailures = 0;
    const maxConsecutiveFailures = 3;

    for (const date of uncachedDates) {
      // Stop if we've had too many failures in a row
      if (consecutiveFailures >= maxConsecutiveFailures) {
        if (__DEV__) console.log('⚠️ Too many consecutive failures, stopping historical fetch');
        break;
      }

      try {
        // Fetch historical spot prices with timeout
        const response = await fetchWithTimeout(`${API_BASE_URL}/api/historical-spot?date=${date}`, 5000);
        const priceData = await response.json();

        if (priceData.success) {
          consecutiveFailures = 0; // Reset on success
          // Cache the result
          historicalPriceCache.current[date] = {
            gold: priceData.gold,
            silver: priceData.silver,
          };
          if (__DEV__) console.log(`   ✅ Fetched & cached ${date}: Gold $${priceData.gold}, Silver $${priceData.silver}`);
        } else {
          consecutiveFailures++;
          if (__DEV__) console.log(`⚠️ API returned error for ${date}:`, priceData.error);
        }
      } catch (error) {
        consecutiveFailures++;
        if (__DEV__) console.log(`⚠️ Could not fetch price for ${date}:`, error.message);
      }
    }

    // Now calculate portfolio values using cached prices
    const historicalData = [];
    for (const date of dates) {
      const cached = historicalPriceCache.current[date];
      if (!cached) continue; // Skip dates we couldn't fetch

      // Get items owned on this date (purchased on or before this date)
      const ownedItems = allItems.filter(item => !item.datePurchased || item.datePurchased <= date);
      if (ownedItems.length === 0) continue;

      // Calculate oz owned
      const silverOz = ownedItems
        .filter(i => silverItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);
      const goldOz = ownedItems
        .filter(i => goldItems.includes(i))
        .reduce((sum, i) => sum + (i.ozt * i.quantity), 0);

      const silverSpotHist = cached.silver || silverSpot;
      const goldSpotHist = cached.gold || goldSpot;
      const totalValue = (silverOz * silverSpotHist) + (goldOz * goldSpotHist);

      historicalData.push({
        date,
        total_value: totalValue,
        gold_value: goldOz * goldSpotHist,
        silver_value: silverOz * silverSpotHist,
        gold_oz: goldOz,
        silver_oz: silverOz,
        gold_spot: goldSpotHist,
        silver_spot: silverSpotHist,
      });
    }

    return historicalData;
  };

  /**
   * Fetch portfolio snapshots for analytics charts
   * If user has holdings but no snapshots, saves one immediately and calculates historical data
   */
  const fetchAnalyticsSnapshots = async (range = analyticsRange) => {
    if (!hasGold && !hasLifetimeAccess) return;
    if (!revenueCatUserId) return;

    // Cancel any in-progress fetch
    if (analyticsAbortRef.current) {
      analyticsAbortRef.current.abort();
    }

    // Create new abort controller for this fetch
    const controller = new AbortController();
    analyticsAbortRef.current = controller;

    setAnalyticsLoading(true);
    try {
      // Add timeout
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(
        `${API_BASE_URL}/api/snapshots/${encodeURIComponent(revenueCatUserId)}?range=${range}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      // Check if this request was aborted (user switched ranges)
      if (controller.signal.aborted) {
        if (__DEV__) console.log('📊 Analytics fetch aborted (range changed)');
        return;
      }

      const data = await response.json();

      // Double-check we weren't aborted while parsing JSON
      if (controller.signal.aborted) return;

      if (data.success && data.snapshots) {
        // If user has holdings but no snapshots, save one now and calculate historical data
        if (data.snapshots.length === 0 && (silverItems.length > 0 || goldItems.length > 0)) {
          if (__DEV__) console.log('📊 No snapshots found but user has holdings - calculating history for range:', range);

          // Save current snapshot (don't await - let it run in background)
          saveDailySnapshot().catch(err => console.log('Snapshot save error:', err.message));

          // Calculate historical data from holdings with a timeout wrapper
          try {
            const historicalPromise = calculateHistoricalPortfolioData(range);
            const timeoutPromise = new Promise((_, reject) =>
              setTimeout(() => reject(new Error('Historical calculation timeout')), 15000)
            );
            const historicalData = await Promise.race([historicalPromise, timeoutPromise]);

            // Check if aborted before setting state
            if (controller.signal.aborted) return;

            if (historicalData && historicalData.length > 0) {
              setAnalyticsSnapshots(historicalData);
              if (__DEV__) console.log(`📊 Calculated ${historicalData.length} historical data points`);
            } else {
              throw new Error('No historical data returned');
            }
          } catch (histError) {
            // Check if aborted
            if (controller.signal.aborted) return;

            if (__DEV__) console.log('⚠️ Historical calculation failed, using today only:', histError.message);
            // Fallback: show today's data only
            setAnalyticsSnapshots([{
              date: new Date().toISOString().split('T')[0],
              total_value: totalMeltValue,
              gold_value: totalGoldOzt * goldSpot,
              silver_value: totalSilverOzt * silverSpot,
              gold_oz: totalGoldOzt,
              silver_oz: totalSilverOzt,
              gold_spot: goldSpot,
              silver_spot: silverSpot,
            }]);
          }
        } else if (data.snapshots.length > 0) {
          setAnalyticsSnapshots(data.snapshots);
          if (__DEV__) console.log(`📊 Loaded ${data.snapshots.length} snapshots for range: ${range}`);
        } else {
          // No holdings and no snapshots
          setAnalyticsSnapshots([]);
        }
      } else {
        // API returned but not successful - show empty state
        if (__DEV__) console.log('⚠️ Analytics API returned unsuccessful response');
        setAnalyticsSnapshots([]);
      }
    } catch (error) {
      // Don't log or set state for aborted requests
      if (error.name === 'AbortError' || controller.signal.aborted) {
        if (__DEV__) console.log('📊 Analytics fetch aborted');
        return;
      }

      console.error('❌ Error fetching analytics:', error.message);
      // On error, show today's data as fallback if user has holdings
      if (silverItems.length > 0 || goldItems.length > 0) {
        setAnalyticsSnapshots([{
          date: new Date().toISOString().split('T')[0],
          total_value: totalMeltValue,
          gold_value: totalGoldOzt * goldSpot,
          silver_value: totalSilverOzt * silverSpot,
          gold_oz: totalGoldOzt,
          silver_oz: totalSilverOzt,
          gold_spot: goldSpot,
          silver_spot: silverSpot,
        }]);
      } else {
        setAnalyticsSnapshots([]);
      }
    } finally {
      // Only set loading false if this is still the active request
      if (!controller.signal.aborted) {
        setAnalyticsLoading(false);
      }
    }
  };

  // Save snapshot when data is loaded and prices are live
  useEffect(() => {
    if (dataLoaded && spotPricesLive && revenueCatUserId && (hasGold || hasLifetimeAccess)) {
      saveDailySnapshot();
    }
  }, [dataLoaded, spotPricesLive, revenueCatUserId, hasGold, hasLifetimeAccess]);

  // Fetch analytics when range changes or tab opens
  useEffect(() => {
    if (tab === 'analytics' && revenueCatUserId && (hasGold || hasLifetimeAccess)) {
      fetchAnalyticsSnapshots(analyticsRange);
    }

    // Cleanup: cancel any in-progress fetch when dependencies change or unmount
    return () => {
      if (analyticsAbortRef.current) {
        analyticsAbortRef.current.abort();
      }
    };
  }, [tab, analyticsRange, revenueCatUserId, hasGold, hasLifetimeAccess]);

  // ============================================
  // CLOUD BACKUP
  // ============================================

  const createBackup = async () => {
    try {
      const backup = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        data: { silverItems, goldItems }
      };

      const json = JSON.stringify(backup, null, 2);
      const filename = `stack-tracker-backup-${new Date().toISOString().split('T')[0]}.json`;
      const filepath = `${FileSystem.documentDirectory}${filename}`;

      await FileSystem.writeAsStringAsync(filepath, json);
      await Sharing.shareAsync(filepath, {
        mimeType: 'application/json',
        dialogTitle: 'Save Backup to Cloud',
        UTI: 'public.json'
      });

      Alert.alert('Backup Created', 'Save to iCloud Drive, Google Drive, or your preferred storage.');
    } catch (error) {
      Alert.alert('Error', 'Failed to create backup: ' + error.message);
    }
  };

  const restoreBackup = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      // Safety check for assets array
      if (!result.assets || result.assets.length === 0) {
        Alert.alert('Error', 'No file selected');
        return;
      }

      const file = result.assets[0];
      const content = await FileSystem.readAsStringAsync(file.uri);
      const backup = JSON.parse(content);

      if (!backup.data || !backup.version) {
        Alert.alert('Invalid Backup', 'This file is not a valid Stack Tracker backup.');
        return;
      }

      Alert.alert(
        'Restore Backup',
        `Replace current data with backup from ${backup.timestamp}?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Restore',
            onPress: async () => {
              if (backup.data.silverItems) setSilverItems(backup.data.silverItems);
              if (backup.data.goldItems) setGoldItems(backup.data.goldItems);
              Alert.alert('Success', 'Backup restored!');
            }
          }
        ]
      );
    } catch (error) {
      Alert.alert('Error', 'Failed to restore: ' + error.message);
    }
  };

  // ============================================
  // IN-APP REVIEW PROMPT
  // ============================================

  /**
   * Check if we should show the review prompt
   * Conditions:
   * - Max 3 prompts per year
   * - At least 30 days between prompts
   * - Triggered after 10th holding OR 7 days of use
   */
  const checkAndRequestReview = async (trigger = 'holdings') => {
    try {
      // Check if store review is available
      const isAvailable = await StoreReview.isAvailableAsync();
      if (!isAvailable) {
        if (__DEV__) console.log('📱 Store review not available on this device');
        return;
      }

      // Get review prompt history
      const reviewHistoryStr = await AsyncStorage.getItem('stack_review_prompts');
      const reviewHistory = reviewHistoryStr ? JSON.parse(reviewHistoryStr) : [];
      const now = Date.now();
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      const thirtyDays = 30 * 24 * 60 * 60 * 1000;

      // Filter to prompts within the last year
      const promptsThisYear = reviewHistory.filter(ts => now - ts < oneYear);

      // Check if we've hit max prompts (3 per year)
      if (promptsThisYear.length >= 3) {
        if (__DEV__) console.log('📱 Max review prompts reached this year');
        return;
      }

      // Check if at least 30 days since last prompt
      const lastPrompt = promptsThisYear.length > 0 ? Math.max(...promptsThisYear) : 0;
      if (lastPrompt && now - lastPrompt < thirtyDays) {
        if (__DEV__) console.log('📱 Too soon since last review prompt');
        return;
      }

      // Check trigger conditions
      if (trigger === 'holdings') {
        const totalHoldings = silverItems.length + goldItems.length;
        if (totalHoldings < 10) {
          return; // Not enough holdings yet
        }
        if (__DEV__) console.log(`📱 Triggering review prompt: ${totalHoldings} holdings`);
      } else if (trigger === 'days') {
        const firstOpenStr = await AsyncStorage.getItem('stack_first_open_date');
        if (!firstOpenStr) {
          // First time opening, save the date
          await AsyncStorage.setItem('stack_first_open_date', new Date().toISOString());
          return;
        }
        const firstOpen = new Date(firstOpenStr).getTime();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (now - firstOpen < sevenDays) {
          return; // Not 7 days yet
        }
        if (__DEV__) console.log('📱 Triggering review prompt: 7+ days of use');
      }

      // Request the review
      await StoreReview.requestReview();

      // Save the prompt timestamp
      promptsThisYear.push(now);
      await AsyncStorage.setItem('stack_review_prompts', JSON.stringify(promptsThisYear));
      if (__DEV__) console.log('📱 Review prompt shown successfully');

    } catch (error) {
      console.error('❌ Error with review prompt:', error.message);
    }
  };

  // Check for 7-day review trigger on app load
  useEffect(() => {
    if (dataLoaded && isAuthenticated) {
      // Small delay to not interfere with initial load
      const timer = setTimeout(() => {
        checkAndRequestReview('days');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [dataLoaded, isAuthenticated]);

  // ============================================
  // SPOT PRICE CHANGE DISPLAY TOGGLE
  // ============================================

  const toggleSpotChangeDisplayMode = async () => {
    const newMode = spotChangeDisplayMode === 'percent' ? 'amount' : 'percent';
    setSpotChangeDisplayMode(newMode);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      await AsyncStorage.setItem('stack_spot_change_display_mode', newMode);
    } catch (error) {
      console.error('Failed to save spot change display mode:', error);
    }
  };

  // ============================================
  // API CALLS
  // ============================================

  const fetchSpotPrices = async (silent = false) => {
    if (!silent) setPriceSource('loading...');
    try {
      if (__DEV__) console.log('📡 Fetching spot prices from:', `${API_BASE_URL}/api/spot-prices`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/api/spot-prices`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      if (__DEV__) console.log('✅ API Response Status:', response.status, response.statusText);

      const data = await response.json();
      if (__DEV__) console.log('📊 API Response Data:', JSON.stringify(data).substring(0, 300));

      if (data.success) {
        if (data.silver && data.silver > 10) {
          setSilverSpot(data.silver);
          await AsyncStorage.setItem('stack_silver_spot', data.silver.toString());
        }
        if (data.gold && data.gold > 1000) {
          setGoldSpot(data.gold);
          await AsyncStorage.setItem('stack_gold_spot', data.gold.toString());
        }
        setPriceSource(data.source || 'live');
        setPriceTimestamp(data.timestamp || new Date().toISOString());
        setSpotPricesLive(true); // Mark that we have live prices from API
        await AsyncStorage.setItem('stack_price_timestamp', data.timestamp || new Date().toISOString());

        // Capture daily change data if available
        if (data.change) {
          setSpotChange({
            gold: {
              amount: data.change.gold?.amount ?? null,
              percent: data.change.gold?.percent ?? null,
            },
            silver: {
              amount: data.change.silver?.amount ?? null,
              percent: data.change.silver?.percent ?? null,
            },
          });
          if (__DEV__) console.log('📈 Change data:', data.change);
        }

        if (__DEV__) console.log(`💰 Prices updated: Gold $${data.gold}, Silver $${data.silver} (Source: ${data.source})`);
      } else {
        if (__DEV__) console.log('⚠️  API returned success=false');
        setPriceSource('cached');
      }
    } catch (error) {
      console.error('❌ Error fetching spot prices:', error.message);
      if (__DEV__) console.error('   Error details:', error);
      setPriceSource('cached');
    }
  };

  // Pull-to-refresh handler for dashboard
  const onRefreshDashboard = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchSpotPrices();
    setIsRefreshing(false);
  };

  const onRefreshAnalytics = async () => {
    setIsRefreshing(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await fetchAnalyticsSnapshots(analyticsRange);
    setIsRefreshing(false);
  };

  /**
   * Fetch historical spot price for a given date
   *
   * The API returns a three-tier response:
   * - Pre-2006: Monthly averages (granularity: 'monthly')
   * - 2006+: ETF-derived daily prices (granularity: 'daily' or 'estimated_intraday')
   * - Recent: Minute-level from our database (granularity: 'minute')
   *
   * @param {string} date - Date in YYYY-MM-DD format
   * @param {string} metal - 'gold' or 'silver'
   * @param {string} time - Optional time in HH:MM format for intraday estimation
   * @returns {Object} { price, source, granularity, dailyRange, note }
   */
  const fetchHistoricalSpot = async (date, metal, time = null) => {
    if (!date || date.length < 10) return { price: null, source: null };
    try {
      let url = `${API_BASE_URL}/api/historical-spot?date=${date}`;
      if (metal) url += `&metal=${metal}`;
      if (time) url += `&time=${time}`;

      if (__DEV__) console.log(`📅 Fetching historical spot: ${url}`);
      const response = await fetch(url);
      const data = await response.json();

      if (__DEV__) {
        console.log('📅 Historical spot API response:', JSON.stringify(data, null, 2));

        // Log granularity-based warnings
        if (data.granularity === 'monthly' || data.granularity === 'monthly_fallback') {
          console.log('⚠️ Using monthly average (pre-2006 or fallback)');
        } else if (data.granularity === 'estimated_intraday') {
          console.log('📊 Using time-weighted intraday estimate');
        } else if (data.granularity === 'minute') {
          console.log('✅ Using exact minute-level price from our records');
        }

        if (data.note) {
          console.log(`📝 Note: ${data.note}`);
        }
      }

      if (data.success) {
        // Get the price for the requested metal (or default to the response format)
        const metalKey = metal || metalTab;
        const price = data.price || data[metalKey];

        return {
          price: price,
          source: data.source,
          granularity: data.granularity,
          dailyRange: data.dailyRange ? data.dailyRange[metalKey] : null,
          note: data.note,
          // Also return full response for both metals if needed
          gold: data.gold,
          silver: data.silver
        };
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Could not fetch historical spot:', error.message);
    }
    // Return current spot as fallback with source indicator
    return {
      price: metal === 'gold' ? goldSpot : silverSpot,
      source: 'client-fallback',
      granularity: 'current'
    };
  };

  const handleDateChange = async (date) => {
    setForm(prev => ({ ...prev, datePurchased: date }));
    setSpotPriceSource(null); // Clear previous source while loading
    if (date.length === 10) {
      const result = await fetchHistoricalSpot(date, metalTab);
      if (result.price) {
        setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
        setSpotPriceSource(result.source);

        // Log daily range info if available (for debugging)
        if (__DEV__ && result.dailyRange) {
          console.log(`📈 Daily range: $${result.dailyRange.low} - $${result.dailyRange.high}`);
        }
        if (__DEV__ && result.note) {
          console.log(`📝 ${result.note}`);
        }
      }
    }
  };

  // ============================================
  // RECEIPT SCANNING
  // ============================================

  // Show scanning tips before opening picker
  const showScanningTips = (source) => {
    const tips = source === 'camera'
      ? "For best results:\n\n• Lay paper receipt flat with good lighting\n• Avoid shadows and glare\n• Include all line items in frame"
      : "For best results:\n\n• Use screenshots from dealer apps or emails\n• For paper receipts: lay flat with good lighting\n• Select multiple images for long receipts";

    Alert.alert(
      '📷 Scanning Tips',
      tips,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Continue', onPress: () => performScan(source) }
      ]
    );
  };

  // Process a single image and return items
  const processImage = async (asset, imageIndex, totalImages) => {
    console.log(`📷 Processing image ${imageIndex + 1}/${totalImages}`);
    console.log(`   URI: ${asset.uri}`);
    console.log(`   Width: ${asset.width}px, Height: ${asset.height}px`);

    // Read file as base64
    const fileInfo = await FileSystem.getInfoAsync(asset.uri, { size: true });
    const fullBase64 = await FileSystem.readAsStringAsync(asset.uri, {
      encoding: FileSystem.EncodingType.Base64
    });

    console.log(`   File size: ${fileInfo.size ? (fileInfo.size / 1024).toFixed(2) + ' KB' : 'unknown'}`);
    console.log(`   Base64 length: ${fullBase64.length} characters`);

    const mimeType = asset.mimeType || asset.type || 'image/jpeg';

    const response = await fetch(`${API_BASE_URL}/api/scan-receipt`, {
      method: 'POST',
      body: JSON.stringify({
        image: fullBase64,
        mimeType: mimeType,
        originalSize: fileInfo.size
      }),
      headers: { 'Content-Type': 'application/json' },
    });

    const data = await response.json();
    return data;
  };

  // Perform the actual scan after tips
  const performScan = async (source) => {
    // Check scan limit first
    if (!checkScanLimit()) return;

    let result;

    if (source === 'camera') {
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera to take photos of receipts.');
        return;
      }
      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 1.0 });
    } else {
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos.');
        return;
      }
      // Allow multiple selection for gallery (up to 5 images)
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1.0,
        allowsMultipleSelection: true,
        selectionLimit: 5
      });
    }

    if (result.canceled) return;

    if (!result.assets || result.assets.length === 0) {
      Alert.alert('Error', 'No image selected');
      return;
    }

    const totalImages = result.assets.length;
    setScanStatus('scanning');
    setScanMessage(`Analyzing ${totalImages} image${totalImages > 1 ? 's' : ''}...`);

    try {
      // Process all images and combine results
      let allItems = [];
      let dealer = '';
      let purchaseDate = '';
      let successCount = 0;

      for (let i = 0; i < result.assets.length; i++) {
        const asset = result.assets[i];
        setScanMessage(`Analyzing image ${i + 1} of ${totalImages}...`);

        try {
          const data = await processImage(asset, i, totalImages);

          if (data.success && data.items && data.items.length > 0) {
            allItems = [...allItems, ...data.items];
            // Use first found dealer/date
            if (!dealer && data.dealer) dealer = data.dealer;
            if (!purchaseDate && data.purchaseDate) purchaseDate = parseDate(data.purchaseDate);
            successCount++;
            if (__DEV__) console.log(`✅ Image ${i + 1}: Found ${data.items.length} items`);
          } else {
            if (__DEV__) console.log(`⚠️ Image ${i + 1}: No items found`);
          }
        } catch (imgError) {
          console.error(`❌ Image ${i + 1} failed:`, imgError.message);
        }
      }

      // Only increment scan count once for the batch
      if (allItems.length > 0) {
        await incrementScanCount();
      }

      // Deduplicate items (same description, quantity, and unit price)
      const uniqueItems = [];
      const seen = new Set();
      for (const item of allItems) {
        const key = `${item.description}|${item.quantity}|${item.unitPrice}`;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueItems.push(item);
        }
      }
      const duplicatesRemoved = allItems.length - uniqueItems.length;
      if (duplicatesRemoved > 0 && __DEV__) {
        console.log(`🔄 Removed ${duplicatesRemoved} duplicate item(s)`);
      }

      const data = { success: uniqueItems.length > 0, items: uniqueItems, dealer, purchaseDate };
      if (__DEV__) console.log(`📄 Combined results: ${uniqueItems.length} unique items from ${successCount}/${totalImages} images`);

      // Handle multi-item receipt response
      if (data.success && data.items && data.items.length > 0) {
        const items = data.items;

        if (__DEV__) console.log(`✅ Found ${items.length} item(s) on receipt`);

        // Count items by metal type
        const silverCount = items.filter(item => item.metal === 'silver').length;
        const goldCount = items.filter(item => item.metal === 'gold').length;
        const otherCount = items.length - silverCount - goldCount;

        // Build summary message
        let summary = `Found ${items.length} item${items.length > 1 ? 's' : ''}`;
        if (silverCount > 0 || goldCount > 0) {
          const parts = [];
          if (silverCount > 0) parts.push(`${silverCount} Silver`);
          if (goldCount > 0) parts.push(`${goldCount} Gold`);
          if (otherCount > 0) parts.push(`${otherCount} Other`);
          summary += `: ${parts.join(', ')}`;
        }

        // Process ALL items and prepare them for preview
        const processedItems = [];
        for (const item of items) {
          const extractedMetal = item.metal === 'gold' ? 'gold' : 'silver';

          // Get historical spot price for this item
          let spotPrice = '';
          if (purchaseDate.length === 10) {
            const result = await fetchHistoricalSpot(purchaseDate, extractedMetal);
            if (result.price) spotPrice = result.price.toString();
          }

          let unitPrice = parseFloat(item.unitPrice) || 0;
          const ozt = parseFloat(item.ozt) || 0;
          const spotNum = parseFloat(spotPrice) || 0;
          const qty = parseInt(item.quantity) || 1;
          const extPrice = item.extPrice ? parseFloat(item.extPrice) : unitPrice * qty;

          // Spot price sanity check - precious metals almost never sell below spot
          let priceWarning = null;
          if (spotNum > 0 && ozt > 0) {
            const minExpectedPrice = spotNum * ozt;

            if (unitPrice < minExpectedPrice) {
              // Price is suspiciously low - try recalculating from ext price
              if (__DEV__) console.log(`⚠️ Price sanity check: $${unitPrice} < spot value $${minExpectedPrice.toFixed(2)}`);

              if (extPrice > 0 && qty > 0) {
                const recalculatedPrice = Math.round((extPrice / qty) * 100) / 100;
                if (__DEV__) console.log(`   Trying extPrice/qty: $${extPrice} / ${qty} = $${recalculatedPrice}`);

                if (recalculatedPrice >= minExpectedPrice) {
                  // Recalculated price makes sense, use it
                  if (__DEV__) console.log(`   ✓ Using recalculated price: $${recalculatedPrice}`);
                  unitPrice = recalculatedPrice;
                } else {
                  // Still below spot - flag for manual review
                  priceWarning = `Price $${unitPrice.toFixed(2)} is below spot value ($${minExpectedPrice.toFixed(2)}) - please verify`;
                  if (__DEV__) console.log(`   ⚠️ Still below spot, adding warning`);
                }
              } else {
                // No ext price to verify with - flag for manual review
                priceWarning = `Price $${unitPrice.toFixed(2)} is below spot value ($${minExpectedPrice.toFixed(2)}) - please verify`;
                if (__DEV__) console.log(`   ⚠️ No ext price to verify, adding warning`);
              }
            }
          }

          let premium = '0';
          if (unitPrice > 0 && spotNum > 0 && ozt > 0) {
            premium = (unitPrice - (spotNum * ozt)).toFixed(2);
          }

          processedItems.push({
            metal: extractedMetal,
            productName: item.description || '',
            source: dealer,
            datePurchased: purchaseDate,
            ozt: parseFloat(item.ozt) || 0,
            quantity: qty,
            unitPrice: unitPrice,
            extPrice: extPrice,
            taxes: 0,
            shipping: 0,
            spotPrice: parseFloat(spotPrice) || 0,
            premium: parseFloat(premium) || 0,
            priceWarning: priceWarning,
          });
        }

        // Store scanned items and metadata
        setScannedItems(processedItems);
        setScannedMetadata({ purchaseDate, dealer });

        // Show success message with haptic feedback
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setScanStatus('success');
        setScanMessage(summary);

        // Close the add modal and show preview modal
        setShowAddModal(false);
        setShowScannedItemsPreview(true);

        if (__DEV__) console.log(`✅ Processed ${processedItems.length} items for preview`);
      } else {
        if (__DEV__) console.log('⚠️ Server returned success=false or no items found');
        setScanStatus('error');
        setScanMessage("Couldn't read receipt. This scan didn't count against your limit.");
      }
    } catch (error) {
      console.error('❌ Scan receipt error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      setScanStatus('error');
      setScanMessage("Scan failed. This didn't count against your limit.");
    }

    setTimeout(() => { setScanStatus(null); setScanMessage(''); }, 5000);
  };

  // ============================================
  // SPREADSHEET IMPORT (with Dealer Templates)
  // ============================================

  const importSpreadsheet = async () => {
    // Check scan limit first
    if (!checkScanLimit()) return;

    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      // Safety check for assets array
      if (!result.assets || result.assets.length === 0) {
        Alert.alert('Error', 'No file selected');
        setScanStatus(null);
        return;
      }

      const file = result.assets[0];
      if (__DEV__) console.log('📊 Spreadsheet selected:', file.name);

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(file.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Convert base64 to binary
      const binaryString = atob(fileContent);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Parse with XLSX
      const workbook = XLSX.read(bytes, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });

      if (rows.length < 2) {
        Alert.alert('Invalid Spreadsheet', "Spreadsheet must have at least a header row and one data row. This didn't count against your scan limit.");
        return;
      }

      // Get headers for detection
      const headers = rows[0].map(h => String(h || '').toLowerCase().trim());

      // Try to auto-detect dealer from headers and filename
      const detectedDealer = detectDealerFromHeaders(headers, file.name);

      if (detectedDealer !== 'generic') {
        // Auto-detected dealer - process immediately
        if (__DEV__) console.log(`🏪 Auto-detected dealer: ${DEALER_TEMPLATES[detectedDealer].name}`);
        await processSpreadsheetWithDealer(rows, headers, detectedDealer);
      } else {
        // No dealer detected - show dealer selector
        setPendingImportFile({ rows, headers, fileName: file.name });
        setShowDealerSelector(true);
      }

    } catch (error) {
      console.error('❌ Import error:', error);
      Alert.alert('Import Failed', `Could not import spreadsheet. This didn't count against your scan limit.\n\n${error.message}`);
    }
  };

  // Process spreadsheet with selected dealer template
  const processSpreadsheetWithDealer = async (rows, headers, dealerKey) => {
    try {
      const template = DEALER_TEMPLATES[dealerKey];
      if (__DEV__) console.log(`📊 Processing with template: ${template.name}`);

      // Build column finder for this template
      const findColumn = (possibleNames) => {
        if (!possibleNames) return -1;
        for (const name of possibleNames) {
          const index = headers.findIndex(h => h.includes(name.toLowerCase()));
          if (index !== -1) return index;
        }
        return -1;
      };

      // Map columns based on template
      const colMap = {
        productName: findColumn(template.columnMap.product),
        metal: findColumn(template.columnMap.metal || []),
        quantity: findColumn(template.columnMap.quantity),
        unitPrice: findColumn(template.columnMap.unitPrice),
        date: findColumn(template.columnMap.date),
        dealer: findColumn(template.columnMap.dealer || []),
        ozt: findColumn(template.columnMap.ozt || []),
      };

      // For dealer-specific templates, also check generic column names as fallback
      if (dealerKey !== 'generic') {
        const genericTemplate = DEALER_TEMPLATES['generic'];
        if (colMap.productName === -1) colMap.productName = findColumn(genericTemplate.columnMap.product);
        if (colMap.metal === -1) colMap.metal = findColumn(genericTemplate.columnMap.metal);
        if (colMap.quantity === -1) colMap.quantity = findColumn(genericTemplate.columnMap.quantity);
        if (colMap.unitPrice === -1) colMap.unitPrice = findColumn(genericTemplate.columnMap.unitPrice);
        if (colMap.date === -1) colMap.date = findColumn(genericTemplate.columnMap.date);
        if (colMap.ozt === -1) colMap.ozt = findColumn(genericTemplate.columnMap.ozt);
      }

      // Check if we have at least a product name column
      if (colMap.productName === -1) {
        Alert.alert(
          'Missing Columns',
          `Couldn't find a product name column in this ${template.name} export. This didn't count against your scan limit.\n\nExpected columns: ${template.columnMap.product?.join(', ')}`
        );
        return;
      }

      // Parse data rows
      const parsedData = [];
      let skippedCount = 0;

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const productName = String(row[colMap.productName] || '').trim();
        if (!productName) continue;

        // Get metal from column or auto-detect from product name
        let metal = null;
        if (colMap.metal !== -1) {
          const metalRaw = String(row[colMap.metal] || '').toLowerCase().trim();
          metal = metalRaw.includes('gold') ? 'gold'
            : metalRaw.includes('silver') ? 'silver'
            : metalRaw.includes('platinum') ? 'platinum'
            : metalRaw.includes('palladium') ? 'palladium'
            : null;
        }
        if (!metal) {
          metal = detectMetalFromName(productName);
        }

        // Skip if we still can't determine the metal
        if (!metal) {
          if (__DEV__) console.log(`⏭️ Skipping (no metal detected): ${productName}`);
          skippedCount++;
          continue;
        }

        // Get OZT from column or auto-detect from product name
        let ozt = colMap.ozt !== -1 ? parseFloat(row[colMap.ozt]) : null;
        if (!ozt || ozt <= 0) {
          ozt = detectOztFromName(productName);
        }
        if (!ozt || ozt <= 0) {
          ozt = 1; // Default to 1 oz if can't detect
        }

        // Get dealer from column or use template's auto-dealer
        let source = '';
        if (colMap.dealer !== -1 && row[colMap.dealer]) {
          source = String(row[colMap.dealer]);
        } else if (template.autoDealer) {
          source = template.autoDealer;
        }

        // Parse other fields
        const quantity = colMap.quantity !== -1 ? (parseInt(row[colMap.quantity]) || 1) : 1;
        const unitPrice = colMap.unitPrice !== -1 ? (parseFloat(row[colMap.unitPrice]) || 0) : 0;
        const dateRaw = colMap.date !== -1 ? row[colMap.date] : null;
        const datePurchased = dateRaw ? parseDate(String(dateRaw)) : '';

        parsedData.push({
          productName,
          metal,
          quantity,
          unitPrice,
          datePurchased,
          source,
          ozt,
          autoDetected: {
            metal: colMap.metal === -1 || !row[colMap.metal],
            ozt: colMap.ozt === -1 || !row[colMap.ozt] || parseFloat(row[colMap.ozt]) <= 0,
          },
        });
      }

      if (parsedData.length === 0) {
        Alert.alert(
          'No Data Found',
          `No valid items found in spreadsheet.${skippedCount > 0 ? ` ${skippedCount} items skipped (couldn't detect metal type).` : ''}\n\nThis didn't count against your scan limit.`
        );
        return;
      }

      // Only increment scan count on successful parsing
      await incrementScanCount();

      // Clear pending file and dealer selector
      setPendingImportFile(null);
      setShowDealerSelector(false);
      setSelectedDealer(null);

      // Show preview
      setImportData(parsedData);
      setShowImportPreview(true);

      const message = skippedCount > 0
        ? `📊 Parsed ${parsedData.length} items from ${template.name} (${skippedCount} skipped)`
        : `📊 Parsed ${parsedData.length} items from ${template.name}`;
      if (__DEV__) console.log(message);

    } catch (error) {
      console.error('❌ Process spreadsheet error:', error);
      Alert.alert('Import Failed', `Could not process spreadsheet. This didn't count against your scan limit.\n\n${error.message}`);
    }
  };

  // Handle dealer selection from modal
  const handleDealerSelected = async (dealerKey) => {
    if (!pendingImportFile) return;
    await processSpreadsheetWithDealer(pendingImportFile.rows, pendingImportFile.headers, dealerKey);
  };

  const confirmImport = () => {
    try {
      let silverCount = 0;
      let goldCount = 0;

      importData.forEach((item, index) => {
        const newItem = {
          id: Date.now() + index,
          productName: item.productName,
          source: item.source,
          datePurchased: item.datePurchased,
          ozt: item.ozt,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxes: 0,
          shipping: 0,
          spotPrice: 0,
          premium: 0,
        };

        if (item.metal === 'silver') {
          setSilverItems(prev => [...prev, newItem]);
          silverCount++;
        } else {
          setGoldItems(prev => [...prev, newItem]);
          goldCount++;
        }
      });

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        'Import Successful',
        `Imported ${importData.length} items:\n${silverCount} Silver, ${goldCount} Gold`,
        [{ text: 'Great!', onPress: () => {
          setShowImportPreview(false);
          setImportData([]);
          setMetalTab(silverCount > 0 && goldCount > 0 ? 'both' : silverCount > 0 ? 'silver' : 'gold');
        }}]
      );
    } catch (error) {
      console.error('❌ Confirm import error:', error);
      Alert.alert('Import Failed', error.message);
    }
  };

  // Add all scanned items at once
  const confirmScannedItems = () => {
    try {
      let silverCount = 0;
      let goldCount = 0;

      scannedItems.forEach((item, index) => {
        const newItem = {
          id: Date.now() + index,
          productName: item.productName,
          source: item.source,
          datePurchased: item.datePurchased,
          ozt: item.ozt,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          taxes: item.taxes,
          shipping: item.shipping,
          spotPrice: item.spotPrice,
          premium: item.premium,
        };

        if (item.metal === 'silver') {
          setSilverItems(prev => [...prev, newItem]);
          silverCount++;
        } else {
          setGoldItems(prev => [...prev, newItem]);
          goldCount++;
        }
      });

      // Haptic feedback
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert(
        'Items Added Successfully',
        `Added ${scannedItems.length} item${scannedItems.length > 1 ? 's' : ''} from receipt:\n${silverCount} Silver, ${goldCount} Gold`,
        [{ text: 'Great!', onPress: () => {
          setShowScannedItemsPreview(false);
          setScannedItems([]);
          setScannedMetadata({ purchaseDate: '', dealer: '' });
          setMetalTab(silverCount > 0 && goldCount > 0 ? 'both' : silverCount > 0 ? 'silver' : 'gold');
          setTab('holdings');
        }}]
      );
    } catch (error) {
      console.error('❌ Add scanned items error:', error);
      Alert.alert('Add Failed', error.message);
    }
  };

  // Add a single scanned item and go to next or close
  const addScannedItemIndividually = (index) => {
    const item = scannedItems[index];
    const newItem = {
      id: Date.now(),
      productName: item.productName,
      source: item.source,
      datePurchased: item.datePurchased,
      ozt: item.ozt,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      taxes: item.taxes,
      shipping: item.shipping,
      spotPrice: item.spotPrice,
      premium: item.premium,
    };

    if (item.metal === 'silver') {
      setSilverItems(prev => [...prev, newItem]);
    } else {
      setGoldItems(prev => [...prev, newItem]);
    }

    // Remove this item from scannedItems
    const remainingItems = scannedItems.filter((_, i) => i !== index);
    setScannedItems(remainingItems);

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    // If no more items, close the modal
    if (remainingItems.length === 0) {
      Alert.alert('All Items Added', 'All scanned items have been added to your holdings!', [
        { text: 'View Holdings', onPress: () => {
          setShowScannedItemsPreview(false);
          setTab('holdings');
        }}
      ]);
    }
  };

  // Update scanned item price inline (with auto-recalculation)
  const updateScannedItemPrice = (index, field, value) => {
    const updatedItems = [...scannedItems];
    const item = updatedItems[index];
    const numValue = parseFloat(value) || 0;
    const qty = item.quantity || 1;

    if (field === 'unitPrice') {
      // User edited unit price - recalculate ext price
      item.unitPrice = numValue;
      item.extPrice = Math.round(numValue * qty * 100) / 100;
    } else if (field === 'extPrice') {
      // User edited ext price - recalculate unit price
      item.extPrice = numValue;
      item.unitPrice = Math.round((numValue / qty) * 100) / 100;
    }

    // Recalculate premium
    if (item.unitPrice > 0 && item.spotPrice > 0 && item.ozt > 0) {
      item.premium = Math.round((item.unitPrice - (item.spotPrice * item.ozt)) * 100) / 100;

      // Clear warning if price is now valid (at or above spot value)
      const minExpectedPrice = item.spotPrice * item.ozt;
      if (item.unitPrice >= minExpectedPrice) {
        item.priceWarning = null;
      }
    }

    setScannedItems(updatedItems);
  };

  // Edit a scanned item before adding
  const editScannedItem = (index) => {
    const item = scannedItems[index];

    // Pre-fill form with scanned item data
    setForm({
      productName: item.productName,
      source: item.source,
      datePurchased: item.datePurchased,
      ozt: item.ozt.toString(),
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
      taxes: item.taxes.toString(),
      shipping: item.shipping.toString(),
      spotPrice: item.spotPrice.toString(),
      premium: item.premium.toString(),
    });
    setSpotPriceSource(null); // Clear source warning when editing

    // Set metal tab
    setMetalTab(item.metal);

    // Store the index so we can update it after editing
    setEditingItem({ ...item, scannedIndex: index });

    // Close preview modal and open edit modal
    setShowScannedItemsPreview(false);
    setShowAddModal(true);
  };

  // Edit an imported item before confirming import
  const editImportedItem = (index) => {
    const item = importData[index];

    // Pre-fill form with imported item data
    setForm({
      productName: item.productName || '',
      source: item.source || '',
      datePurchased: item.datePurchased || '',
      ozt: item.ozt ? item.ozt.toString() : '',
      quantity: item.quantity ? item.quantity.toString() : '1',
      unitPrice: item.unitPrice ? item.unitPrice.toString() : '',
      taxes: '0',
      shipping: '0',
      spotPrice: '0',
      premium: '0',
    });
    setSpotPriceSource(null); // Clear source warning when editing

    // Set metal tab
    setMetalTab(item.metal || 'silver');

    // Store the index so we can update it after editing
    setEditingItem({ ...item, importIndex: index });

    // Close preview modal and open edit modal
    setShowImportPreview(false);
    setShowAddModal(true);
  };

  // ============================================
  // CRUD OPERATIONS
  // ============================================

  const savePurchase = () => {
    Keyboard.dismiss();

    if (!form.productName || !form.unitPrice) {
      Alert.alert('Required Fields', 'Please enter product name and unit price.');
      return;
    }

    const item = {
      id: editingItem?.id || Date.now(),
      productName: form.productName, source: form.source, datePurchased: form.datePurchased,
      ozt: parseFloat(form.ozt) || 0, quantity: parseInt(form.quantity) || 1,
      unitPrice: parseFloat(form.unitPrice) || 0, taxes: parseFloat(form.taxes) || 0,
      shipping: parseFloat(form.shipping) || 0, spotPrice: parseFloat(form.spotPrice) || 0,
      premium: parseFloat(form.premium) || 0,
    };

    // Check if editing a scanned item
    if (editingItem && editingItem.scannedIndex !== undefined) {
      // Update the scanned item and return to preview
      const updatedItem = {
        ...item,
        metal: metalTab,
      };

      const updatedScannedItems = [...scannedItems];
      updatedScannedItems[editingItem.scannedIndex] = updatedItem;
      setScannedItems(updatedScannedItems);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setShowAddModal(false);
      setShowScannedItemsPreview(true);
      return;
    }

    // Check if editing an imported item
    if (editingItem && editingItem.importIndex !== undefined) {
      // Update the imported item and return to preview
      const updatedItem = {
        productName: form.productName,
        source: form.source,
        datePurchased: form.datePurchased,
        ozt: parseFloat(form.ozt) || 0,
        quantity: parseInt(form.quantity) || 1,
        unitPrice: parseFloat(form.unitPrice) || 0,
        metal: metalTab,
      };

      const updatedImportData = [...importData];
      updatedImportData[editingItem.importIndex] = updatedItem;
      setImportData(updatedImportData);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setShowAddModal(false);
      setShowImportPreview(true);
      return;
    }

    // Normal add/edit flow for holdings
    // IMPORTANT: metalTab can be 'silver', 'gold', or 'both' - we must check explicitly
    const targetMetal = metalTab === 'both' ? 'silver' : metalTab; // Default to silver if 'both' (shouldn't happen but safety)

    if (targetMetal === 'silver') {
      if (editingItem) {
        setSilverItems(prev => prev.map(i => i.id === editingItem.id ? item : i));
      } else {
        setSilverItems(prev => [...prev, item]);
        // Check for review prompt after adding (not editing)
        checkAndRequestReview('holdings');
      }
    } else {
      if (editingItem) {
        setGoldItems(prev => prev.map(i => i.id === editingItem.id ? item : i));
      } else {
        setGoldItems(prev => [...prev, item]);
        // Check for review prompt after adding (not editing)
        checkAndRequestReview('holdings');
      }
    }

    // Haptic feedback on successful add
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    resetForm();
    setShowAddModal(false);
  };

  const resetForm = () => {
    setForm({
      productName: '', source: '', datePurchased: '', ozt: '',
      quantity: '1', unitPrice: '', taxes: '0', shipping: '0',
      spotPrice: '', premium: '0',
    });
    setEditingItem(null);
    setSpotPriceSource(null);
  };

  const deleteItem = (id, metal) => {
    // Haptic feedback
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Delete Item',
      'Are you sure you want to delete this item? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            // Haptic feedback on delete
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

            if (metal === 'silver') setSilverItems(prev => prev.filter(i => i.id !== id));
            else setGoldItems(prev => prev.filter(i => i.id !== id));

            // Close detail view if open
            if (showDetailView) {
              setShowDetailView(false);
              setDetailItem(null);
              setDetailMetal(null);
            }
          },
        },
      ]
    );
  };

  const viewItemDetail = (item, metal) => {
    setDetailItem(item);
    setDetailMetal(metal);
    setShowDetailView(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  };

  const sortItems = (items, metal) => {
    const itemsWithMetal = items.map(item => ({ ...item, metal }));
    const spot = metal === 'silver' ? silverSpot : goldSpot;

    switch (sortBy) {
      case 'date-newest':
        return [...itemsWithMetal].sort((a, b) => {
          if (!a.datePurchased) return 1;
          if (!b.datePurchased) return -1;
          return new Date(b.datePurchased) - new Date(a.datePurchased);
        });
      case 'date-oldest':
        return [...itemsWithMetal].sort((a, b) => {
          if (!a.datePurchased) return 1;
          if (!b.datePurchased) return -1;
          return new Date(a.datePurchased) - new Date(b.datePurchased);
        });
      case 'value-high':
        return [...itemsWithMetal].sort((a, b) => (b.ozt * b.quantity * spot) - (a.ozt * a.quantity * spot));
      case 'value-low':
        return [...itemsWithMetal].sort((a, b) => (a.ozt * a.quantity * spot) - (b.ozt * b.quantity * spot));
      case 'name':
        return [...itemsWithMetal].sort((a, b) => a.productName.localeCompare(b.productName));
      case 'metal':
        // Already filtered by metal in most cases
        return itemsWithMetal;
      default:
        return itemsWithMetal;
    }
  };

  const editItem = (item, metal) => {
    setMetalTab(metal);
    setForm({
      productName: item.productName, source: item.source, datePurchased: item.datePurchased,
      ozt: item.ozt.toString(), quantity: item.quantity.toString(), unitPrice: item.unitPrice.toString(),
      taxes: item.taxes.toString(), shipping: item.shipping.toString(), spotPrice: item.spotPrice.toString(),
      premium: item.premium.toString(),
    });
    setEditingItem(item);
    setSpotPriceSource(null); // Clear source warning when editing existing item
    setShowAddModal(true);
  };

  const exportCSV = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const all = [
        ...silverItems.map(i => ({ ...i, metal: 'Silver' })),
        ...goldItems.map(i => ({ ...i, metal: 'Gold' })),
      ];

      if (all.length === 0) {
        Alert.alert('No Data', 'You have no holdings to export.');
        return;
      }

      const headers = 'Metal,Product,Source,Date,OZT,Qty,Unit Price,Taxes,Shipping,Spot,Premium,Total Premium\n';
      const rows = all.map(i =>
        `${i.metal},"${i.productName}","${i.source}",${i.datePurchased},${i.ozt},${i.quantity},${i.unitPrice},${i.taxes},${i.shipping},${i.spotPrice},${i.premium},${i.premium * i.quantity}`
      ).join('\n');

      const filepath = `${FileSystem.documentDirectory}stack-export-${Date.now()}.csv`;
      await FileSystem.writeAsStringAsync(filepath, headers + rows);
      await Sharing.shareAsync(filepath);

      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Export CSV error:', error);
      Alert.alert('Export Failed', error.message || 'Could not export CSV file.');
    }
  };

  // ============================================
  // SHARE MY STACK
  // ============================================
  const shareMyStack = async () => {
    try {
      if (!shareViewRef.current) {
        Alert.alert('Error', 'Unable to generate share image');
        return;
      }

      setIsGeneratingShare(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      // Brief delay to ensure view is rendered
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture the view as an image
      const uri = await shareViewRef.current.capture();

      // Share the image
      await Sharing.shareAsync(uri, {
        mimeType: 'image/png',
        dialogTitle: 'Share My Stack',
        UTI: 'public.png',
      });

      setIsGeneratingShare(false);
      setShowSharePreview(false);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (error) {
      console.error('Share My Stack error:', error);
      setIsGeneratingShare(false);
      Alert.alert('Share Failed', error.message || 'Could not generate share image.');
    }
  };

  // ============================================
  // LOADING & AUTH SCREENS
  // ============================================

  if (isLoading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.silver} />
        <Text style={{ color: colors.muted, marginTop: 16 }}>Loading your stack...</Text>
      </View>
    );
  }

  if (!isAuthenticated) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ fontSize: 48, marginBottom: 16 }}>🪙</Text>
        <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700', marginBottom: 8 }}>Stack Tracker Pro</Text>
        <Text style={{ color: colors.muted, marginBottom: 32 }}>Authenticate to continue</Text>
        <TouchableOpacity style={[styles.button, { backgroundColor: colors.silver }]} onPress={authenticate}>
          <Text style={{ color: '#000', fontWeight: '600' }}>Unlock</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const currentColor = metalTab === 'silver' ? colors.silver : metalTab === 'gold' ? colors.gold : colors.gold;
  const items = metalTab === 'silver' ? silverItems : metalTab === 'gold' ? goldItems : [];
  const spot = metalTab === 'silver' ? silverSpot : goldSpot;

  // ============================================
  // MAIN RENDER
  // ============================================

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.8)', borderBottomColor: colors.border }]}>
        <View style={styles.headerContent}>
          <View style={styles.logo}>
            <View style={[styles.logoIcon, { backgroundColor: colors.gold }]}>
              <Text style={{ fontSize: 20 }}>🪙</Text>
            </View>
            <View>
              <Text style={[styles.logoTitle, { color: colors.text }]}>Stack Tracker Pro</Text>
              <Text style={[styles.logoSubtitle, { color: colors.muted }]}>Make Stacking Great Again 🚀</Text>
            </View>
          </View>
          <TouchableOpacity style={[styles.privacyBadge, { backgroundColor: isDarkMode ? 'rgba(34,197,94,0.15)' : 'rgba(34,197,94,0.1)', borderColor: isDarkMode ? 'rgba(34,197,94,0.3)' : 'rgba(34,197,94,0.2)' }]} onPress={() => setShowPrivacyModal(true)}>
            <Text style={{ color: colors.success, fontSize: 11 }}>🔒 Private</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={
          (tab === 'dashboard' || tab === 'analytics') ? (
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={tab === 'dashboard' ? onRefreshDashboard : onRefreshAnalytics}
              tintColor={colors.gold}
              colors={[colors.gold]}
            />
          ) : undefined
        }
      >

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <>
            {/* Portfolio Value */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>💰 Portfolio Value</Text>
              <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700', marginBottom: 4 }}>
                ${totalMeltValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <Text style={{ color: totalGainLoss >= 0 ? colors.success : colors.error, fontSize: 16 }}>
                {totalGainLoss >= 0 ? '▲' : '▼'} ${Math.abs(totalGainLoss).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(1)}%)
              </Text>
            </View>

            {/* Today's Change */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📅 Today's Change</Text>
              {showDailyChange ? (
                <>
                  <Text style={{ color: isDailyChangePositive ? colors.success : colors.error, fontSize: 32, fontWeight: '700', marginBottom: 4 }}>
                    {isDailyChangePositive ? '+' : ''}{dailyChange >= 0 ? '' : '-'}${Math.abs(dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={{ color: isDailyChangePositive ? colors.success : colors.error, fontSize: 16 }}>
                    {isDailyChangePositive ? '▲' : '▼'} {isDailyChangePositive ? '+' : ''}{dailyChangePct.toFixed(2)}%
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                    Baseline: ${midnightBaseline.toLocaleString(undefined, { minimumFractionDigits: 2 })} (@ Ag ${midnightSnapshot?.silverSpot}, Au ${midnightSnapshot?.goldSpot})
                  </Text>
                </>
              ) : (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: colors.muted, fontSize: 24, textAlign: 'center' }}>—</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    {!spotPricesLive ? 'Waiting for live prices...' :
                     !midnightSnapshot ? 'No baseline yet. Check back tomorrow!' :
                     'No data yet'}
                  </Text>
                </View>
              )}
            </View>

            {/* Holdings Pie Chart */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📊 Holdings Breakdown</Text>
              <PieChart
                data={[
                  { label: 'Gold', value: goldMeltValue, color: colors.gold },
                  { label: 'Silver', value: silverMeltValue, color: colors.silver },
                ]}
                size={140}
                cardBgColor={colors.cardBg}
                textColor={colors.text}
                mutedColor={colors.muted}
              />
            </View>

            {/* Gold/Silver Ratio */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>⚖️ Gold/Silver Ratio</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>{goldSilverRatio.toFixed(1)}</Text>
                <Text style={{ color: colors.muted, marginLeft: 8 }}>:1</Text>
              </View>
              <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8 }}>
                {goldSilverRatio > 80 ? (
                  <Text style={{ color: colors.silver }}>📈 HIGH - Silver may be undervalued</Text>
                ) : goldSilverRatio < 60 ? (
                  <Text style={{ color: colors.gold }}>📉 LOW - Gold may be undervalued</Text>
                ) : (
                  <Text style={{ color: colors.muted }}>⚖️ Normal range (60-80)</Text>
                )}
              </View>
            </View>

            {/* Quick Stats */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📈 Quick Stats</Text>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Silver Holdings</Text>
                <Text style={[styles.statRowValue, { color: colors.silver }]}>{totalSilverOzt.toFixed(2)} oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Gold Holdings</Text>
                <Text style={[styles.statRowValue, { color: colors.gold }]}>{totalGoldOzt.toFixed(3)} oz</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Cost Basis</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Premiums Paid</Text>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.statRowValue, { color: colors.gold }]}>${totalPremiumsPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
                  {totalPremiumsPct > 0 && (
                    <Text style={{ color: colors.gold, fontSize: 11, marginTop: 2 }}>+{totalPremiumsPct.toFixed(1)}%</Text>
                  )}
                </View>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Silver Cost</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>${formatCurrency(avgSilverCostPerOz)}/oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Gold Cost</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>${formatCurrency(avgGoldCostPerOz)}/oz</Text>
              </View>
            </View>

            {/* Milestones */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>🏆 Stack Milestones</Text>
              <ProgressBar value={totalSilverOzt} max={nextSilverMilestone} color={colors.silver} label={`Silver: ${totalSilverOzt.toFixed(0)} / ${nextSilverMilestone} oz`} />
              <ProgressBar value={totalGoldOzt} max={nextGoldMilestone} color={colors.gold} label={`Gold: ${totalGoldOzt.toFixed(2)} / ${nextGoldMilestone} oz`} />
            </View>

            {/* Live Spot Prices */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>💹 Live Spot Prices</Text>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, backgroundColor: `${colors.silver}22`, padding: 16, borderRadius: 12 }}>
                  <Text style={{ color: colors.silver, fontSize: 12 }}>🥈 Silver</Text>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${formatCurrency(silverSpot)}</Text>
                  {spotChange.silver.percent !== null ? (
                    <TouchableOpacity onPress={toggleSpotChangeDisplayMode} activeOpacity={0.7}>
                      <Text style={{
                        color: spotChange.silver.amount >= 0 ? '#22C55E' : '#EF4444',
                        fontSize: 13,
                        fontWeight: '600',
                        marginTop: 4
                      }}>
                        {spotChangeDisplayMode === 'percent'
                          ? `${spotChange.silver.percent >= 0 ? '+' : ''}${spotChange.silver.percent.toFixed(2)}%`
                          : `${spotChange.silver.amount >= 0 ? '+' : ''}$${spotChange.silver.amount.toFixed(2)}`
                        }
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Change: --</Text>
                  )}
                </View>
                <View style={{ flex: 1, backgroundColor: `${colors.gold}22`, padding: 16, borderRadius: 12 }}>
                  <Text style={{ color: colors.gold, fontSize: 12 }}>🥇 Gold</Text>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${formatCurrency(goldSpot)}</Text>
                  {spotChange.gold.percent !== null ? (
                    <TouchableOpacity onPress={toggleSpotChangeDisplayMode} activeOpacity={0.7}>
                      <Text style={{
                        color: spotChange.gold.amount >= 0 ? '#22C55E' : '#EF4444',
                        fontSize: 13,
                        fontWeight: '600',
                        marginTop: 4
                      }}>
                        {spotChangeDisplayMode === 'percent'
                          ? `${spotChange.gold.percent >= 0 ? '+' : ''}${spotChange.gold.percent.toFixed(2)}%`
                          : `${spotChange.gold.amount >= 0 ? '+' : ''}$${spotChange.gold.amount.toFixed(2)}`
                        }
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>Change: --</Text>
                  )}
                </View>
              </View>

              {/* Last Updated */}
              <View style={{ marginTop: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center' }}>
                  Source: {priceSource}
                  {priceTimestamp && ` • Updated ${new Date(priceTimestamp).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`}
                </Text>
              </View>
            </View>
          </>
        )}

        {/* HOLDINGS TAB */}
        {tab === 'holdings' && (
          <>
            {/* Segmented Control Filter */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 10 }}>
              <View style={{
                flex: 1,
                flexDirection: 'row',
                backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                borderRadius: 10,
                padding: 3,
              }}>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: metalTab === 'silver' ? (isDarkMode ? 'rgba(156,163,175,0.25)' : '#fff') : 'transparent',
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMetalTab('silver');
                  }}
                >
                  <Text style={{ color: metalTab === 'silver' ? colors.silver : colors.muted, fontWeight: '600', fontSize: 13 }}>🥈 Silver</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: metalTab === 'gold' ? (isDarkMode ? 'rgba(251,191,36,0.2)' : '#fff') : 'transparent',
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMetalTab('gold');
                  }}
                >
                  <Text style={{ color: metalTab === 'gold' ? colors.gold : colors.muted, fontWeight: '600', fontSize: 13 }}>🥇 Gold</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{
                    flex: 1,
                    paddingVertical: 8,
                    borderRadius: 8,
                    alignItems: 'center',
                    backgroundColor: metalTab === 'both' ? (isDarkMode ? 'rgba(251,191,36,0.2)' : '#fff') : 'transparent',
                  }}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setMetalTab('both');
                  }}
                >
                  <Text style={{ color: metalTab === 'both' ? colors.gold : colors.muted, fontWeight: '600', fontSize: 13 }}>All</Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSortMenu(true);
                }}
              >
                <Text style={{ color: colors.muted, fontSize: 14 }}>↕️</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: colors.gold }]} onPress={handleAddPurchase}>
                <Text style={{ color: '#000', fontWeight: '600' }}>+ Add Purchase</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.buttonOutline, { flex: 1, borderColor: colors.gold, borderWidth: 1.5 }]} onPress={importSpreadsheet}>
                <Text style={{ color: colors.gold, fontWeight: '600' }}>📊 Import CSV</Text>
              </TouchableOpacity>
            </View>

            {/* Show filtered items or both with grouping */}
            {metalTab !== 'both' ? (
              <>
                {sortItems(items, metalTab).map(item => {
                  const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={[styles.itemCard, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : `${colors.gold}15`, borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : `${colors.gold}30` }]}
                      onPress={() => viewItemDetail(item, metalTab)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.itemTitle, { color: colors.text }]}>{item.productName}</Text>
                        {item.datePurchased && (
                          <Text style={[styles.itemSubtitle, { fontSize: 11, marginBottom: 2 }]}>📅 {item.datePurchased}</Text>
                        )}
                        <Text style={styles.itemSubtitle}>{item.quantity}x @ ${formatCurrency(item.unitPrice)} • {(item.ozt * item.quantity).toFixed(2)} oz</Text>
                        <Text style={[styles.itemSubtitle, { color: colors.gold }]}>
                          Premium: ${formatCurrency(item.premium * item.quantity)}
                          {itemPremiumPct > 0 && <Text style={{ fontSize: 11 }}> (+{itemPremiumPct.toFixed(1)}%)</Text>}
                        </Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[styles.itemValue, { color: currentColor }]}>${formatCurrency(item.ozt * item.quantity * spot)}</Text>
                        <Text style={{ color: colors.muted, fontSize: 11 }}>melt</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}

                {items.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>🪙</Text>
                    <Text style={{ color: colors.muted }}>No {metalTab} holdings yet</Text>
                  </View>
                )}
              </>
            ) : (
              <>
                {/* Silver Items Group */}
                {silverItems.length > 0 && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: 8 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                      <Text style={{ color: colors.silver, fontWeight: '600', marginHorizontal: 12 }}>🥈 SILVER ({silverItems.length})</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    </View>
                    {sortItems(silverItems, 'silver').map(item => {
                      const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.itemCard, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : `${colors.gold}15`, borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : `${colors.gold}30` }]}
                          onPress={() => viewItemDetail(item, 'silver')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>{item.productName}</Text>
                            {item.datePurchased && (
                              <Text style={[styles.itemSubtitle, { fontSize: 11, marginBottom: 2 }]}>📅 {item.datePurchased}</Text>
                            )}
                            <Text style={styles.itemSubtitle}>{item.quantity}x @ ${formatCurrency(item.unitPrice)} • {(item.ozt * item.quantity).toFixed(2)} oz</Text>
                            <Text style={[styles.itemSubtitle, { color: colors.gold }]}>
                              Premium: ${formatCurrency(item.premium * item.quantity)}
                              {itemPremiumPct > 0 && <Text style={{ fontSize: 11 }}> (+{itemPremiumPct.toFixed(1)}%)</Text>}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.itemValue, { color: colors.silver }]}>${formatCurrency(item.ozt * item.quantity * silverSpot)}</Text>
                            <Text style={{ color: colors.muted, fontSize: 11 }}>melt</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Gold Items Group */}
                {goldItems.length > 0 && (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, marginTop: silverItems.length > 0 ? 24 : 8 }}>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                      <Text style={{ color: colors.gold, fontWeight: '600', marginHorizontal: 12 }}>🥇 GOLD ({goldItems.length})</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: colors.border }} />
                    </View>
                    {sortItems(goldItems, 'gold').map(item => {
                      const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={[styles.itemCard, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.2)' : `${colors.gold}15`, borderColor: isDarkMode ? 'rgba(255,255,255,0.05)' : `${colors.gold}30` }]}
                          onPress={() => viewItemDetail(item, 'gold')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.itemTitle, { color: colors.text }]}>{item.productName}</Text>
                            {item.datePurchased && (
                              <Text style={[styles.itemSubtitle, { fontSize: 11, marginBottom: 2 }]}>📅 {item.datePurchased}</Text>
                            )}
                            <Text style={styles.itemSubtitle}>{item.quantity}x @ ${formatCurrency(item.unitPrice)} • {(item.ozt * item.quantity).toFixed(2)} oz</Text>
                            <Text style={[styles.itemSubtitle, { color: colors.gold }]}>
                              Premium: ${formatCurrency(item.premium * item.quantity)}
                              {itemPremiumPct > 0 && <Text style={{ fontSize: 11 }}> (+{itemPremiumPct.toFixed(1)}%)</Text>}
                            </Text>
                          </View>
                          <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[styles.itemValue, { color: colors.gold }]}>${formatCurrency(item.ozt * item.quantity * goldSpot)}</Text>
                            <Text style={{ color: colors.muted, fontSize: 11 }}>melt</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </>
                )}

                {/* Empty state */}
                {silverItems.length === 0 && goldItems.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={{ fontSize: 48, marginBottom: 16 }}>🪙</Text>
                    <Text style={{ color: colors.muted }}>No holdings yet</Text>
                  </View>
                )}
              </>
            )}
          </>
        )}

        {/* TOOLS TAB */}
        {tab === 'tools' && (
          <>
            <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={() => setShowSpeculationModal(true)}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>🔮 Speculation Tool</Text>
              <Text style={{ color: colors.muted }}>What if silver hits $100? What if gold hits $10,000?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={() => setShowJunkCalcModal(true)}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>🧮 Junk Silver Calculator</Text>
              <Text style={{ color: colors.muted }}>Calculate melt value of constitutional silver</Text>
            </TouchableOpacity>

            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📊 Break-Even Analysis</Text>
              <View style={{ backgroundColor: `${colors.silver}22`, padding: 12, borderRadius: 8, marginBottom: 8 }}>
                <Text style={{ color: colors.silver }}>Silver: ${formatCurrency(silverBreakeven)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{silverSpot >= silverBreakeven ? '✅ Profitable!' : `Need +$${formatCurrency(silverBreakeven - silverSpot)}`}</Text>
              </View>
              <View style={{ backgroundColor: `${colors.gold}22`, padding: 12, borderRadius: 8 }}>
                <Text style={{ color: colors.gold }}>Gold: ${formatCurrency(goldBreakeven)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{goldSpot >= goldBreakeven ? '✅ Profitable!' : `Need +$${formatCurrency(goldBreakeven - goldSpot)}`}</Text>
              </View>
            </View>

            <TouchableOpacity style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]} onPress={exportCSV}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📤 Export CSV</Text>
              <Text style={{ color: colors.muted }}>Download holdings spreadsheet</Text>
            </TouchableOpacity>
          </>
        )}

        {/* ANALYTICS TAB */}
        {tab === 'analytics' && (
          <>
            {/* Analytics Header */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>📈 Portfolio Analytics</Text>
                  {!hasGoldAccess && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                      <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '600' }}>🔒 GOLD</Text>
                    </View>
                  )}
                </View>
                {analyticsLoading && hasGoldAccess && <ActivityIndicator size="small" color={colors.gold} />}
              </View>
              <Text style={{ color: colors.muted }}>
                {hasGoldAccess
                  ? 'Track your portfolio performance with historical data and insights'
                  : 'See what Gold members get access to'}
              </Text>
            </View>

            {/* Analytics Content - Blurred for non-Gold users */}
            <View style={{ position: 'relative' }}>
              {/* Content with blur effect for non-Gold */}
              <View style={{ opacity: hasGoldAccess ? 1 : 0.25 }} pointerEvents={hasGoldAccess ? 'auto' : 'none'}>
              <>
                {/* Time Range Selector */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Time Range</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {['1W', '1M', '3M', '6M', '1Y', 'ALL'].map((range) => (
                      <TouchableOpacity
                        key={range}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 8,
                          borderRadius: 8,
                          backgroundColor: analyticsRange === range ? colors.gold : (isDarkMode ? '#27272a' : '#f4f4f5'),
                        }}
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          setAnalyticsRange(range);
                        }}
                      >
                        <Text style={{
                          color: analyticsRange === range ? '#000' : colors.text,
                          fontWeight: analyticsRange === range ? '600' : '400',
                        }}>
                          {range === 'ALL' ? 'All Time' : range}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                {/* Portfolio Value Chart */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Portfolio Value</Text>
                  {analyticsSnapshots.length > 1 ? (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                      <LineChart
                        data={{
                          labels: analyticsSnapshots.slice(-7).map(s => {
                            const d = new Date(s.date);
                            return `${d.getMonth() + 1}/${d.getDate()}`;
                          }),
                          datasets: [{
                            data: analyticsSnapshots.slice(-7).map(s => s.total_value || 0),
                            color: (opacity = 1) => `rgba(251, 191, 36, ${opacity})`,
                            strokeWidth: 2,
                          }],
                        }}
                        width={Math.max(SCREEN_WIDTH - 48, analyticsSnapshots.slice(-7).length * 50)}
                        height={200}
                        yAxisLabel="$"
                        yAxisSuffix=""
                        chartConfig={{
                          backgroundColor: colors.cardBg,
                          backgroundGradientFrom: colors.cardBg,
                          backgroundGradientTo: colors.cardBg,
                          decimalPlaces: 0,
                          color: (opacity = 1) => `rgba(251, 191, 36, ${opacity})`,
                          labelColor: (opacity = 1) => colors.muted,
                          style: { borderRadius: 8 },
                          propsForDots: {
                            r: '4',
                            strokeWidth: '2',
                            stroke: colors.gold,
                          },
                        }}
                        bezier
                        style={{ borderRadius: 8 }}
                      />
                    </ScrollView>
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                      <Text style={{ fontSize: 32, marginBottom: 12 }}>📊</Text>
                      <Text style={{ color: colors.muted, textAlign: 'center' }}>
                        {analyticsSnapshots.length === 0
                          ? (silverItems.length === 0 && goldItems.length === 0
                            ? 'Add some holdings to see your portfolio analytics!'
                            : 'Loading historical data...')
                          : 'Need at least 2 data points to show a chart.'}
                      </Text>
                    </View>
                  )}
                </View>

                {/* Holdings Breakdown */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Holdings Breakdown</Text>
                  {totalMeltValue > 0 ? (
                    <PieChart
                      data={[
                        { label: 'Gold', value: totalGoldOzt * goldSpot, color: colors.gold },
                        { label: 'Silver', value: totalSilverOzt * silverSpot, color: colors.silver },
                      ]}
                      size={160}
                      cardBgColor={colors.cardBg}
                      textColor={colors.text}
                      mutedColor={colors.muted}
                    />
                  ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 20 }}>
                      <Text style={{ color: colors.muted }}>Add holdings to see breakdown</Text>
                    </View>
                  )}
                </View>

                {/* Cost Basis Analysis */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Cost Basis Analysis</Text>

                  {/* Gold Analysis */}
                  {goldItems.length > 0 && (
                    <View style={{ marginBottom: 16 }}>
                      <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8 }}>Gold</Text>
                      {(() => {
                        const totalGoldCost = goldItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const goldMeltValue = totalGoldOzt * goldSpot;
                        const goldPL = goldMeltValue - totalGoldCost;
                        const goldPLPercent = totalGoldCost > 0 ? (goldPL / totalGoldCost) * 100 : 0;
                        const avgGoldCostPerOz = totalGoldOzt > 0 ? totalGoldCost / totalGoldOzt : 0;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Total Cost</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(totalGoldCost)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Current Value</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(goldMeltValue)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(avgGoldCostPerOz)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Unrealized P/L</Text>
                              <Text style={{ color: goldPL >= 0 ? colors.success : colors.error }}>
                                {goldPL >= 0 ? '+' : ''}${formatCurrency(goldPL)} ({goldPLPercent >= 0 ? '+' : ''}{goldPLPercent.toFixed(1)}%)
                              </Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {/* Silver Analysis */}
                  {silverItems.length > 0 && (
                    <View>
                      <Text style={{ color: colors.silver, fontWeight: '600', marginBottom: 8 }}>Silver</Text>
                      {(() => {
                        const totalSilverCost = silverItems.reduce((sum, item) => sum + ((item.unitPrice || 0) * (item.quantity || 1)), 0);
                        const silverMeltValue = totalSilverOzt * silverSpot;
                        const silverPL = silverMeltValue - totalSilverCost;
                        const silverPLPercent = totalSilverCost > 0 ? (silverPL / totalSilverCost) * 100 : 0;
                        const avgSilverCostPerOz = totalSilverOzt > 0 ? totalSilverCost / totalSilverOzt : 0;
                        return (
                          <>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Total Cost</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(totalSilverCost)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Current Value</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(silverMeltValue)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Avg Cost/oz</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(avgSilverCostPerOz)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Unrealized P/L</Text>
                              <Text style={{ color: silverPL >= 0 ? colors.success : colors.error }}>
                                {silverPL >= 0 ? '+' : ''}${formatCurrency(silverPL)} ({silverPLPercent >= 0 ? '+' : ''}{silverPLPercent.toFixed(1)}%)
                              </Text>
                            </View>
                          </>
                        );
                      })()}
                    </View>
                  )}

                  {goldItems.length === 0 && silverItems.length === 0 && (
                    <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>
                      Add holdings to see cost analysis
                    </Text>
                  )}
                </View>

                {/* Premium Analysis */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Premium Analysis</Text>

                  {(() => {
                    // Calculate average premium for each metal
                    const goldPremiums = goldItems.filter(i => i.premium && i.premium > 0);
                    const silverPremiums = silverItems.filter(i => i.premium && i.premium > 0);

                    const avgGoldPremium = goldPremiums.length > 0
                      ? goldPremiums.reduce((sum, i) => sum + (i.premium || 0), 0) / goldPremiums.length
                      : 0;
                    const avgSilverPremium = silverPremiums.length > 0
                      ? silverPremiums.reduce((sum, i) => sum + (i.premium || 0), 0) / silverPremiums.length
                      : 0;

                    // Calculate average premium percent
                    const avgGoldPremiumPct = goldPremiums.length > 0
                      ? goldPremiums.reduce((sum, i) => sum + calculatePremiumPercent(i.premium || 0, i.unitPrice || 0), 0) / goldPremiums.length
                      : 0;
                    const avgSilverPremiumPct = silverPremiums.length > 0
                      ? silverPremiums.reduce((sum, i) => sum + calculatePremiumPercent(i.premium || 0, i.unitPrice || 0), 0) / silverPremiums.length
                      : 0;

                    return (
                      <>
                        {goldPremiums.length > 0 && (
                          <View style={{ marginBottom: 16 }}>
                            <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8 }}>Gold ({goldPremiums.length} items with premium data)</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Avg Premium/oz</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(avgGoldPremium)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: colors.muted }}>Avg Premium %</Text>
                              <Text style={{ color: colors.text }}>{avgGoldPremiumPct.toFixed(1)}%</Text>
                            </View>
                          </View>
                        )}

                        {silverPremiums.length > 0 && (
                          <View>
                            <Text style={{ color: colors.silver, fontWeight: '600', marginBottom: 8 }}>Silver ({silverPremiums.length} items with premium data)</Text>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                              <Text style={{ color: colors.muted }}>Avg Premium/oz</Text>
                              <Text style={{ color: colors.text }}>${formatCurrency(avgSilverPremium)}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                              <Text style={{ color: colors.muted }}>Avg Premium %</Text>
                              <Text style={{ color: colors.text }}>{avgSilverPremiumPct.toFixed(1)}%</Text>
                            </View>
                          </View>
                        )}

                        {goldPremiums.length === 0 && silverPremiums.length === 0 && (
                          <Text style={{ color: colors.muted, textAlign: 'center', paddingVertical: 20 }}>
                            Premium data not available. Add items with premium info to see analysis.
                          </Text>
                        )}
                      </>
                    );
                  })()}
                </View>

                {/* Purchase Stats */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 12 }]}>Purchase Statistics</Text>

                  {(() => {
                    const allItems = [...goldItems, ...silverItems];
                    const itemsWithDates = allItems.filter(i => i.datePurchased);
                    const dealers = [...new Set(allItems.map(i => i.source).filter(Boolean))];

                    // Find earliest and latest purchase
                    const sortedByDate = itemsWithDates.sort((a, b) =>
                      new Date(a.datePurchased) - new Date(b.datePurchased)
                    );
                    const firstPurchase = sortedByDate[0]?.datePurchased;
                    const lastPurchase = sortedByDate[sortedByDate.length - 1]?.datePurchased;

                    return (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted }}>Total Items</Text>
                          <Text style={{ color: colors.text }}>{allItems.length}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted }}>Unique Dealers</Text>
                          <Text style={{ color: colors.text }}>{dealers.length}</Text>
                        </View>
                        {firstPurchase && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: colors.muted }}>First Purchase</Text>
                            <Text style={{ color: colors.text }}>{firstPurchase}</Text>
                          </View>
                        )}
                        {lastPurchase && lastPurchase !== firstPurchase && (
                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Text style={{ color: colors.muted }}>Latest Purchase</Text>
                            <Text style={{ color: colors.text }}>{lastPurchase}</Text>
                          </View>
                        )}
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted }}>Total Gold</Text>
                          <Text style={{ color: colors.gold }}>{totalGoldOzt.toFixed(4)} oz</Text>
                        </View>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <Text style={{ color: colors.muted }}>Total Silver</Text>
                          <Text style={{ color: colors.silver }}>{totalSilverOzt.toFixed(4)} oz</Text>
                        </View>
                      </>
                    );
                  })()}
                </View>

                {/* Data Points Info */}
                <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                  <Text style={[styles.cardTitle, { color: colors.text, marginBottom: 8 }]}>Chart Data</Text>
                  <Text style={{ color: colors.muted, marginBottom: 8 }}>
                    {analyticsSnapshots.length} data point{analyticsSnapshots.length !== 1 ? 's' : ''} in selected range
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 12 }}>
                    Historical values are calculated from your holdings and past spot prices. Daily snapshots are saved automatically.
                  </Text>
                </View>
              </>
              </View>

              {/* Upgrade Overlay for non-Gold users */}
              {!hasGoldAccess && (
                <View style={{
                  position: 'absolute',
                  top: 80,
                  left: 0,
                  right: 0,
                  alignItems: 'center',
                  zIndex: 10,
                }}>
                  <View style={{
                    backgroundColor: 'rgba(26, 26, 46, 0.95)',
                    borderRadius: 20,
                    padding: 24,
                    marginHorizontal: 20,
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: 'rgba(251, 191, 36, 0.3)',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    elevation: 5,
                  }}>
                    <Text style={{ fontSize: 40, marginBottom: 12 }}>📊</Text>
                    <Text style={{ color: colors.gold, fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
                      Unlock Portfolio Analytics
                    </Text>
                    <Text style={{ color: colors.muted, textAlign: 'center', marginBottom: 20, lineHeight: 20 }}>
                      Track your portfolio value over time, analyze cost basis, see premium trends, and more
                    </Text>
                    <TouchableOpacity
                      style={{
                        backgroundColor: colors.gold,
                        paddingVertical: 14,
                        paddingHorizontal: 32,
                        borderRadius: 12,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      }}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        setShowPaywallModal(true);
                      }}
                    >
                      <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Upgrade to Gold</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <>
            {/* iCloud Sync Section - iOS only */}
            {Platform.OS === 'ios' && (
              <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>☁️ iCloud Sync</Text>
                    {!hasGoldAccess && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                        <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '600' }}>🔒 GOLD</Text>
                      </View>
                    )}
                  </View>
                  {iCloudSyncing && hasGoldAccess && <ActivityIndicator size="small" color={colors.gold} />}
                </View>

                {!hasGoldAccess ? (
                  <>
                    <Text style={{ color: colors.muted, marginBottom: 12 }}>
                      Upgrade to Gold to sync your portfolio across all your Apple devices
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.gold,
                        padding: 12,
                        borderRadius: 8,
                        gap: 8,
                      }}
                      onPress={() => setShowPaywallModal(true)}
                    >
                      <Text style={{ color: '#000', fontWeight: '600' }}>Unlock iCloud Sync</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.muted, marginBottom: 12 }}>
                      {iCloudAvailable
                        ? 'Automatically sync holdings across your Apple devices'
                        : 'Sign in to iCloud in Settings to enable sync'}
                    </Text>

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: isDarkMode ? '#27272a' : '#f4f4f5',
                        padding: 12,
                        borderRadius: 8,
                        marginBottom: 12,
                        opacity: iCloudAvailable ? 1 : 0.5,
                      }}
                      onPress={() => toggleiCloudSync(!iCloudSyncEnabled)}
                      disabled={!iCloudAvailable}
                    >
                      <Text style={{ color: colors.text, fontWeight: '500' }}>Enable iCloud Sync</Text>
                      <View style={{
                        width: 44,
                        height: 24,
                        borderRadius: 12,
                        backgroundColor: iCloudSyncEnabled ? colors.success : (isDarkMode ? '#52525b' : '#d4d4d8'),
                        justifyContent: 'center',
                        padding: 2,
                      }}>
                        <View style={{
                          width: 20,
                          height: 20,
                          borderRadius: 10,
                          backgroundColor: '#fff',
                          alignSelf: iCloudSyncEnabled ? 'flex-end' : 'flex-start',
                        }} />
                      </View>
                    </TouchableOpacity>

                    {iCloudSyncEnabled && (
                      <>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <Text style={{ color: colors.muted, fontSize: 12 }}>
                            {lastSyncTime
                              ? `Last synced: ${new Date(lastSyncTime).toLocaleString()}`
                              : 'Not synced yet'}
                          </Text>
                          <TouchableOpacity
                            onPress={triggerManualSync}
                            style={{ backgroundColor: isDarkMode ? '#27272a' : '#e4e4e7', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                            disabled={iCloudSyncing}
                          >
                            <Text style={{ color: colors.gold, fontWeight: '500', fontSize: 12 }}>
                              {iCloudSyncing ? 'Syncing...' : 'Sync Now'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={{ color: colors.muted, fontSize: 11, fontStyle: 'italic' }}>
                          Changes sync automatically when you add or edit holdings
                        </Text>
                      </>
                    )}
                  </>
                )}
              </View>
            )}

            {/* Price Alerts Section (Gold/Lifetime Feature) */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[styles.cardTitle, { color: colors.text }]}>🔔 Price Alerts</Text>
                  {!hasGoldAccess && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                      <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '600' }}>🔒 GOLD</Text>
                    </View>
                  )}
                </View>
                {alertsLoading && hasGoldAccess && <ActivityIndicator size="small" color={colors.gold} />}
              </View>

              {!hasGoldAccess ? (
                <>
                  <Text style={{ color: colors.muted, marginBottom: 12 }}>
                    Get notified when gold or silver hits your target price
                  </Text>
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.gold,
                      padding: 12,
                      borderRadius: 8,
                      gap: 8,
                    }}
                    onPress={() => setShowPaywallModal(true)}
                  >
                    <Text style={{ color: '#000', fontWeight: '600' }}>Unlock Price Alerts</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <>
                  <Text style={{ color: colors.muted, marginBottom: 12 }}>
                    Get push notifications when spot prices hit your targets
                  </Text>

                  {/* Add New Alert Button */}
                  <TouchableOpacity
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      backgroundColor: colors.gold,
                      padding: 12,
                      borderRadius: 8,
                      gap: 8,
                      marginBottom: priceAlerts.length > 0 ? 16 : 0,
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      setShowAddAlertModal(true);
                    }}
                  >
                    <Text style={{ color: '#000', fontWeight: '600' }}>+ Add Price Alert</Text>
                  </TouchableOpacity>

                  {/* Active Alerts List */}
                  {priceAlerts.filter(a => a.active).length > 0 && (
                    <View>
                      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Active Alerts</Text>
                      {priceAlerts.filter(a => a.active).map((alert) => (
                        <View
                          key={alert.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 16 }}>{alert.metal === 'gold' ? '🥇' : '🥈'}</Text>
                              <Text style={{ color: colors.text, fontWeight: '600' }}>
                                {alert.metal === 'gold' ? 'Gold' : 'Silver'} {alert.direction === 'above' ? '↑' : '↓'} ${parseFloat(alert.target_price).toFixed(2)}
                              </Text>
                            </View>
                            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                              Notify when {alert.direction} ${parseFloat(alert.target_price).toFixed(2)}/oz
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => deletePriceAlert(alert.id)}
                            style={{ padding: 8 }}
                          >
                            <Text style={{ color: colors.error, fontSize: 16 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Triggered Alerts */}
                  {priceAlerts.filter(a => a.triggered).length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      <Text style={{ color: colors.muted, fontWeight: '600', marginBottom: 8 }}>Triggered</Text>
                      {priceAlerts.filter(a => a.triggered).slice(0, 3).map((alert) => (
                        <View
                          key={alert.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            backgroundColor: isDarkMode ? 'rgba(34,197,94,0.1)' : 'rgba(34,197,94,0.1)',
                            padding: 12,
                            borderRadius: 8,
                            marginBottom: 8,
                            opacity: 0.7,
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <Text style={{ fontSize: 16 }}>✓</Text>
                              <Text style={{ color: colors.success, fontWeight: '600' }}>
                                {alert.metal === 'gold' ? 'Gold' : 'Silver'} hit ${parseFloat(alert.target_price).toFixed(2)}
                              </Text>
                            </View>
                            <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                              {alert.triggered_at ? new Date(alert.triggered_at).toLocaleDateString() : 'Recently'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => deletePriceAlert(alert.id)}
                            style={{ padding: 8 }}
                          >
                            <Text style={{ color: colors.muted, fontSize: 14 }}>✕</Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  )}

                  {priceAlerts.length === 0 && !alertsLoading && (
                    <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4, fontStyle: 'italic' }}>
                      No alerts set. Tap above to create one!
                    </Text>
                  )}
                </>
              )}
            </View>

            {/* Home Screen Widget Section (iOS only, Gold/Lifetime Feature) */}
            {Platform.OS === 'ios' && (
              <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={[styles.cardTitle, { color: colors.text }]}>📱 Home Screen Widget</Text>
                    {!hasGoldAccess && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
                        <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '600' }}>🔒 GOLD</Text>
                      </View>
                    )}
                  </View>
                </View>

                {!hasGoldAccess ? (
                  <>
                    <Text style={{ color: colors.muted, marginBottom: 12 }}>
                      View your portfolio value and spot prices on your home screen
                    </Text>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: colors.gold,
                        padding: 12,
                        borderRadius: 8,
                        gap: 8,
                      }}
                      onPress={() => setShowPaywallModal(true)}
                    >
                      <Text style={{ color: '#000', fontWeight: '600' }}>Unlock Home Widget</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.muted, marginBottom: 12 }}>
                      Add the Stack Tracker widget to your home screen to see your portfolio at a glance.
                    </Text>

                    {/* Widget Preview */}
                    <View style={{
                      backgroundColor: '#1a1a2e',
                      borderRadius: 16,
                      padding: 16,
                      marginBottom: 12,
                    }}>
                      <Text style={{ color: colors.gold, fontSize: 11, fontWeight: '600', marginBottom: 8 }}>
                        Stack Tracker Pro
                      </Text>
                      <Text style={{ color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 4 }}>
                        {formatCurrency(totalMeltValue, 0)}
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <Text style={{ color: colors.gold, fontSize: 12 }}>🥇 Gold ${goldSpot.toFixed(0)}</Text>
                        <Text style={{ color: colors.silver, fontSize: 12 }}>🥈 Silver ${silverSpot.toFixed(2)}</Text>
                      </View>
                      <Text style={{ color: '#71717a', fontSize: 9 }}>Widget preview</Text>
                    </View>

                    {/* Instructions */}
                    <View style={{ backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8 }}>
                      <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 6, fontSize: 13 }}>How to add widget:</Text>
                      <Text style={{ color: colors.muted, fontSize: 12, lineHeight: 18 }}>
                        1. Long-press your home screen{'\n'}
                        2. Tap the + button (top left){'\n'}
                        3. Search for "Stack Tracker"{'\n'}
                        4. Choose small or medium size{'\n'}
                        5. Tap "Add Widget"
                      </Text>
                    </View>
                  </>
                )}
              </View>
            )}

            {/* Appearance Section */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>🎨 Appearance</Text>
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                {[
                  { key: 'light', label: '☀️ Light' },
                  { key: 'dark', label: '🌙 Dark' },
                  { key: 'system', label: '⚙️ System' },
                ].map((option) => (
                  <TouchableOpacity
                    key={option.key}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 8,
                      backgroundColor: themePreference === option.key
                        ? (isDarkMode ? 'rgba(251,191,36,0.2)' : 'rgba(217,119,6,0.2)')
                        : colors.cardBg,
                      borderWidth: 1,
                      borderColor: themePreference === option.key ? colors.gold : colors.border,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      changeTheme(option.key);
                    }}
                  >
                    <Text style={{
                      color: themePreference === option.key ? colors.gold : colors.text,
                      fontWeight: themePreference === option.key ? '600' : '400',
                      fontSize: 13,
                    }}>
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                {themePreference === 'system' ? 'Following iOS settings' : `${themePreference === 'dark' ? 'Dark' : 'Light'} mode enabled`}
              </Text>
            </View>

            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📦 Manual Backup</Text>
              <Text style={{ color: colors.muted, marginBottom: 16 }}>Export to Files, Google Drive, or any storage</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: colors.success }]} onPress={createBackup}>
                  <Text style={{ color: '#000', fontWeight: '600' }}>📤 Backup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonOutline, { flex: 1 }]} onPress={restoreBackup}>
                  <Text style={{ color: colors.text }}>📥 Restore</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Share My Stack Section */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>📸 Share My Stack</Text>
              <Text style={{ color: colors.muted, marginBottom: 16 }}>Create a shareable image of your portfolio summary</Text>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: colors.gold }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSharePreview(true);
                }}
                disabled={silverItems.length === 0 && goldItems.length === 0}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>
                  {silverItems.length === 0 && goldItems.length === 0 ? 'Add holdings first' : '🖼️ Generate Share Image'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>⚙️ Settings</Text>

              {!hasGold && !hasLifetimeAccess && (
                <TouchableOpacity
                  style={[styles.statRow, {
                    backgroundColor: 'rgba(251, 191, 36, 0.1)',
                    borderRadius: 8,
                    padding: 12,
                    marginBottom: 12,
                    borderWidth: 1,
                    borderColor: 'rgba(251, 191, 36, 0.3)'
                  }]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setShowPaywallModal(true);
                  }}
                >
                  <Text style={{ color: colors.gold, fontWeight: '600' }}>👑 Upgrade to Gold</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity style={styles.statRow} onPress={exportCSV}>
                <Text style={{ color: colors.text }}>📤 Export CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statRow} onPress={() => setShowPrivacyModal(true)}>
                <Text style={{ color: colors.text }}>🔒 Privacy Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statRow} onPress={fetchSpotPrices}>
                <Text style={{ color: colors.text }}>🔄 Refresh Prices</Text>
              </TouchableOpacity>

              {/* Scan Usage - only show for free users */}
              {!hasGold && !hasLifetimeAccess && (
                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border }}>
                  <View>
                    <Text style={{ color: colors.text, fontSize: 14 }}>📷 Scan Usage</Text>
                    <Text style={{ color: scanUsage.scansUsed >= scanUsage.scansLimit ? colors.error : colors.muted, fontSize: 12, marginTop: 2 }}>
                      {scanUsage.scansUsed}/{scanUsage.scansLimit} scans used this month
                    </Text>
                    {scanUsage.resetsAt && (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                        Resets {new Date(scanUsage.resetsAt).toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>

            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>About</Text>
              <Text style={{ color: colors.muted }}>Stack Tracker Pro v1.0.1</Text>
              <Text style={{ color: colors.gold, fontStyle: 'italic', marginTop: 8 }}>"We CAN'T access your data."</Text>

              {hasLifetimeAccess && (
                <View style={{ marginTop: 12, padding: 8, backgroundColor: 'rgba(34,197,94,0.1)', borderRadius: 8 }}>
                  <Text style={{ color: colors.success, fontSize: 12, fontWeight: '600' }}>
                    ✓ Lifetime Access Active
                  </Text>
                </View>
              )}

              {/* Legal Links */}
              <View style={{ marginTop: 20, flexDirection: 'row', justifyContent: 'center', gap: 16 }}>
                <TouchableOpacity onPress={() => Linking.openURL('https://stack-tracker-pro-production.up.railway.app/privacy')}>
                  <Text style={{ color: colors.muted, fontSize: 13, textDecorationLine: 'underline' }}>Privacy Policy</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => Linking.openURL('https://stack-tracker-pro-production.up.railway.app/terms')}>
                  <Text style={{ color: colors.muted, fontSize: 13, textDecorationLine: 'underline' }}>Terms of Use</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Help & Tips Section */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Help & Tips</Text>
              <TouchableOpacity
                style={styles.statRow}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowHelpModal(true);
                }}
              >
                <Text style={{ color: colors.text }}>📖 View Help Guide</Text>
              </TouchableOpacity>
            </View>

            {/* Advanced Section */}
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Advanced</Text>

              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600', marginBottom: 4 }}>Support ID</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginBottom: 8 }}>Share this with support if you need help with your account</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: colors.text, fontSize: 11, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', flex: 1 }} numberOfLines={1}>
                  {revenueCatUserId || 'Loading...'}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (revenueCatUserId) {
                      Clipboard.setString(revenueCatUserId);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                      Alert.alert('Copied', 'Support ID copied to clipboard');
                    }
                  }}
                  style={{ backgroundColor: '#27272a', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 }}
                  disabled={!revenueCatUserId}
                >
                  <Text style={{ color: revenueCatUserId ? colors.gold : colors.muted, fontSize: 11, fontWeight: '600' }}>Copy</Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}

        <View style={{ height: (tab === 'settings' || tab === 'analytics') ? 300 : 100 }} />
      </ScrollView>

      {/* Upgrade to Gold Banner */}
      {!hasGold && !hasLifetimeAccess && !upgradeBannerDismissed && (
        <View style={styles.upgradeBanner}>
          <TouchableOpacity
            style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingLeft: 16 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              setShowPaywallModal(true);
            }}
            activeOpacity={0.7}
          >
            <Text style={{ fontSize: 16, marginRight: 8 }}>👑</Text>
            <Text style={{ color: '#1a1a2e', fontSize: 14, fontWeight: '600', flex: 1 }}>
              Unlock unlimited features - Upgrade to Gold
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ paddingHorizontal: 16, paddingVertical: 12 }}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setUpgradeBannerDismissed(true);
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={{ color: '#1a1a2e', fontSize: 18, fontWeight: '700' }}>✕</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Bottom Tabs */}
      <View style={[styles.bottomTabs, { backgroundColor: isDarkMode ? 'rgba(0,0,0,0.8)' : 'rgba(255,255,255,0.95)', borderTopColor: colors.border }]}>
        {[
          { key: 'dashboard', icon: '📊', label: 'Dashboard' },
          { key: 'holdings', icon: '🪙', label: 'Holdings' },
          { key: 'analytics', icon: '📈', label: 'Analytics' },
          { key: 'tools', icon: '🧮', label: 'Tools' },
          { key: 'settings', icon: '⚙️', label: 'Settings' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={styles.bottomTab} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setTab(t.key); }}>
            <Text style={{ fontSize: 18, marginBottom: 2 }}>{t.icon}</Text>
            <Text style={{ color: tab === t.key ? colors.text : colors.muted, fontSize: 9 }}>{t.label}</Text>
            {tab === t.key && <View style={{ position: 'absolute', bottom: -4, left: 8, right: 8, height: 2, backgroundColor: colors.gold, borderRadius: 1 }} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* ADD/EDIT MODAL - Custom with sticky save button */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={[styles.modalKeyboardView, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff' }]}
          >
            <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff' }]}>
              {/* Header */}
              <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
                <Text style={[styles.modalTitle, { color: colors.text }]}>{editingItem ? 'Edit' : 'Add'} Purchase</Text>
                <TouchableOpacity
                  onPress={() => {
                    // If editing a scanned item, return to scan results without losing data
                    if (editingItem?.scannedIndex !== undefined) {
                      resetForm();
                      setShowAddModal(false);
                      setShowScannedItemsPreview(true);
                    } else if (editingItem?.importIndex !== undefined) {
                      // If editing an imported item, return to import preview
                      resetForm();
                      setShowAddModal(false);
                      setShowImportPreview(true);
                    } else {
                      resetForm();
                      setShowAddModal(false);
                    }
                  }}
                  style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Scrollable Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
              >
                  {scanStatus && (
                    <View style={[styles.scanStatus, { backgroundColor: scanStatus === 'success' ? `${colors.success}22` : scanStatus === 'error' ? `${colors.error}22` : `${colors.gold}22` }]}>
                      <Text style={{ color: scanStatus === 'success' ? colors.success : scanStatus === 'error' ? colors.error : colors.gold }}>{scanMessage}</Text>
                    </View>
                  )}

                  <View style={[styles.card, { backgroundColor: isDarkMode ? 'rgba(148,163,184,0.1)' : `${colors.gold}15` }]}>
                    <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12 }}>📷 AI Receipt Scanner</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold, flex: 1 }]} onPress={() => showScanningTips('camera')}>
                        <Text style={{ color: '#000' }}>📷 Take Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold, flex: 1 }]} onPress={() => showScanningTips('gallery')}>
                        <Text style={{ color: '#000' }}>🖼️ Upload Photos</Text>
                      </TouchableOpacity>
                    </View>
                    {!hasGold && !hasLifetimeAccess && (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                        {scanUsage.scansUsed >= scanUsage.scansLimit ? (
                          <Text style={{ color: colors.error }}>All {scanUsage.scansLimit} free scans used.{scanUsage.resetsAt ? ` Resets ${new Date(scanUsage.resetsAt).toLocaleDateString()}.` : ''}</Text>
                        ) : (
                          <Text>Scans: {scanUsage.scansUsed}/{scanUsage.scansLimit}{scanUsage.resetsAt ? ` (resets ${new Date(scanUsage.resetsAt).toLocaleDateString()})` : ''}</Text>
                        )}
                      </Text>
                    )}
                    {hasGold && (
                      <Text style={{ color: colors.gold, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                        ✓ Unlimited scans with Gold
                      </Text>
                    )}
                    {hasLifetimeAccess && !hasGold && (
                      <Text style={{ color: colors.success, fontSize: 11, marginTop: 8, textAlign: 'center' }}>
                        ✓ Unlimited scans (Lifetime Access)
                      </Text>
                    )}
                  </View>

                  <View style={styles.metalTabs}>
                    <TouchableOpacity style={[styles.metalTab, { borderColor: metalTab === 'silver' ? colors.silver : colors.border, backgroundColor: metalTab === 'silver' ? `${colors.silver}22` : 'transparent' }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMetalTab('silver'); }}>
                      <Text style={{ color: metalTab === 'silver' ? colors.silver : colors.muted }}>🥈 Silver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.metalTab, { borderColor: metalTab === 'gold' ? colors.gold : colors.border, backgroundColor: metalTab === 'gold' ? `${colors.gold}22` : 'transparent' }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMetalTab('gold'); }}>
                      <Text style={{ color: metalTab === 'gold' ? colors.gold : colors.muted }}>🥇 Gold</Text>
                    </TouchableOpacity>
                  </View>

                  <FloatingInput label="Product Name *" value={form.productName} onChangeText={v => setForm(p => ({ ...p, productName: v }))} placeholder="American Silver Eagle" colors={colors} isDarkMode={isDarkMode} />
                  <FloatingInput label="Dealer" value={form.source} onChangeText={v => setForm(p => ({ ...p, source: v }))} placeholder="APMEX" colors={colors} isDarkMode={isDarkMode} />
                  <FloatingInput label="Date (YYYY-MM-DD)" value={form.datePurchased} onChangeText={handleDateChange} placeholder="2025-12-25" colors={colors} isDarkMode={isDarkMode} />

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="OZT per unit *" value={form.ozt} onChangeText={v => setForm(p => ({ ...p, ozt: v }))} placeholder="1" keyboardType="decimal-pad" colors={colors} isDarkMode={isDarkMode} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Quantity" value={form.quantity} onChangeText={v => setForm(p => ({ ...p, quantity: v }))} placeholder="1" keyboardType="number-pad" colors={colors} isDarkMode={isDarkMode} /></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Unit Price *" value={form.unitPrice} onChangeText={v => setForm(p => ({ ...p, unitPrice: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Spot at Purchase" value={form.spotPrice} onChangeText={v => { setForm(p => ({ ...p, spotPrice: v })); setSpotPriceSource(null); }} placeholder="Auto" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
                  </View>

                  {/* Accuracy indicators for historical spot prices */}
                  {spotPriceSource === 'price_log' && (
                    <Text style={{ color: '#22C55E', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      ✅ Exact price from our records
                    </Text>
                  )}
                  {spotPriceSource === 'etf_derived' && (
                    <Text style={{ color: '#3B82F6', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      📊 Daily ETF-derived price. You can adjust if needed.
                    </Text>
                  )}
                  {(spotPriceSource === 'macrotrends' || spotPriceSource === 'static-json' || spotPriceSource === 'static-json-nearest') && (
                    <Text style={{ color: '#E69500', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      ⚠️ Monthly average (daily price unavailable). You can edit this manually.
                    </Text>
                  )}
                  {(spotPriceSource === 'current-spot' || spotPriceSource === 'current-fallback' || spotPriceSource === 'client-fallback' || spotPriceSource === 'current_fallback') && (
                    <Text style={{ color: '#E69500', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      ⚠️ Historical price unavailable - using today's spot. You can edit this manually.
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Taxes" value={form.taxes} onChangeText={v => setForm(p => ({ ...p, taxes: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Shipping" value={form.shipping} onChangeText={v => setForm(p => ({ ...p, shipping: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
                  </View>

                  <View style={[styles.card, { backgroundColor: `${colors.gold}15` }]}>
                    <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8 }}>Premium (Auto-calculated)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><FloatingInput label="Per Unit" value={form.premium} onChangeText={v => setForm(p => ({ ...p, premium: v }))} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
                      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                        {(() => {
                          const totalPremium = parseFloat(form.premium || 0) * parseInt(form.quantity || 1);
                          const unitPrice = parseFloat(form.unitPrice || 0);
                          const premiumPct = calculatePremiumPercent(parseFloat(form.premium || 0), unitPrice);
                          return (
                            <>
                              <Text style={{ color: colors.muted, fontSize: 12 }}>Total: ${formatCurrency(totalPremium)}</Text>
                              {premiumPct > 0 && (
                                <Text style={{ color: colors.gold, fontSize: 11, marginTop: 2 }}>+{premiumPct.toFixed(1)}%</Text>
                              )}
                            </>
                          );
                        })()}
                      </View>
                    </View>
                  </View>
                </ScrollView>

                {/* Sticky Save Button */}
                <View style={[styles.stickyButtonContainer, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff', borderTopColor: colors.border }]}>
                  <TouchableOpacity style={[styles.button, { backgroundColor: colors.gold }]} onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); savePurchase(); }}>
                    <Text style={{ color: '#000', fontWeight: '600' }}>{editingItem ? 'Update' : 'Add'} Purchase</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
      </Modal>

      {/* SPECULATION MODAL */}
      <ModalWrapper
        visible={showSpeculationModal}
        onClose={() => setShowSpeculationModal(false)}
        title="🔮 What If..."
        colors={colors}
        isDarkMode={isDarkMode}
      >
        {/* Inputs at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}><FloatingInput label="Silver Price" value={specSilverPrice} onChangeText={setSpecSilverPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
          <View style={{ flex: 1 }}><FloatingInput label="Gold Price" value={specGoldPrice} onChangeText={setSpecGoldPrice} keyboardType="decimal-pad" prefix="$" colors={colors} isDarkMode={isDarkMode} /></View>
        </View>

        {/* Quick presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {[
            { s: 100, g: 5000, label: 'Bull' },
            { s: 150, g: 7500, label: 'Moon 🚀' },
            { s: 500, g: 15000, label: 'Hyper' },
          ].map((preset, i) => (
            <TouchableOpacity key={i} style={{ backgroundColor: colors.border, padding: 12, borderRadius: 12, marginRight: 8 }} onPress={() => { setSpecSilverPrice(preset.s.toString()); setSpecGoldPrice(preset.g.toString()); Keyboard.dismiss(); }}>
              <Text style={{ color: colors.text }}>{preset.label}</Text>
              <Text style={{ color: colors.muted, fontSize: 10 }}>${preset.s} / ${preset.g}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Results */}
        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success, fontWeight: '600' }}>Projected Value</Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>${specTotalValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
          <Text style={{ color: specGainLoss >= 0 ? colors.success : colors.error }}>{specGainLoss >= 0 ? '+' : ''}{specGainLossPct.toFixed(1)}% from cost basis</Text>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={[styles.card, { flex: 1, backgroundColor: `${colors.silver}22` }]}>
            <Text style={{ color: colors.silver, fontSize: 12 }}>Silver</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>${(totalSilverOzt * specSilverNum).toLocaleString()}</Text>
          </View>
          <View style={[styles.card, { flex: 1, backgroundColor: `${colors.gold}22` }]}>
            <Text style={{ color: colors.gold, fontSize: 12 }}>Gold</Text>
            <Text style={{ color: colors.text, fontSize: 18, fontWeight: '600' }}>${(totalGoldOzt * specGoldNum).toLocaleString()}</Text>
          </View>
        </View>
      </ModalWrapper>

      {/* JUNK SILVER MODAL */}
      <ModalWrapper
        visible={showJunkCalcModal}
        onClose={() => setShowJunkCalcModal(false)}
        title="🧮 Junk Silver Calculator"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        {/* Type selector at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[{ k: '90', l: '90%' }, { k: '40', l: '40%' }, { k: '35', l: 'War Nickels' }].map(t => (
            <TouchableOpacity key={t.k} style={[styles.metalTab, { flex: 1, borderColor: junkType === t.k ? colors.silver : colors.border, backgroundColor: junkType === t.k ? `${colors.silver}22` : 'transparent' }]} onPress={() => { setJunkType(t.k); Keyboard.dismiss(); }}>
              <Text style={{ color: junkType === t.k ? colors.silver : colors.muted, fontSize: 12 }}>{t.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input */}
        <FloatingInput label={junkType === '35' ? '# of Nickels' : 'Face Value ($)'} value={junkFaceValue} onChangeText={setJunkFaceValue} keyboardType="decimal-pad" prefix={junkType === '35' ? '' : '$'} colors={colors} isDarkMode={isDarkMode} />

        {/* Results */}
        <View style={[styles.card, { backgroundColor: `${colors.silver}22` }]}>
          <Text style={{ color: colors.silver }}>Silver Content</Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>{junkOzt.toFixed(3)} oz</Text>
        </View>

        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success }}>Melt Value @ ${formatCurrency(silverSpot)}/oz</Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>${formatCurrency(junkMeltValue)}</Text>
        </View>

        <View style={{ backgroundColor: isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)', padding: 12, borderRadius: 8 }}>
          <Text style={{ color: colors.muted, fontSize: 11 }}>
            {junkType === '90' && '90% silver: Pre-1965 dimes, quarters, halves. Multiply face value × 0.715 for oz.'}
            {junkType === '40' && '40% silver: 1965-1970 Kennedy halves. Multiply face value × 0.295 for oz.'}
            {junkType === '35' && '35% silver: War Nickels (1942-1945). Each contains 0.0563 oz silver.'}
          </Text>
        </View>
      </ModalWrapper>

      {/* PRIVACY MODAL */}
      <ModalWrapper
        visible={showPrivacyModal}
        onClose={() => setShowPrivacyModal(false)}
        title="🔒 Privacy Architecture"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.success }]}>✅ What We Do</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Store data locally on YOUR device</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Process receipts in memory only</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Delete images immediately</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.error }]}>❌ What We DON'T Do</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Store your data on servers</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Track your holdings</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Share any information</Text>
        </View>
        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success, fontWeight: '600' }}>Our Promise</Text>
          <Text style={{ color: colors.muted, fontStyle: 'italic' }}>"We architected the system so we CAN'T access your data."</Text>
        </View>
      </ModalWrapper>

      {/* Help & Tips Modal */}
      <ModalWrapper
        visible={showHelpModal}
        onClose={() => setShowHelpModal(false)}
        title="📖 Help & Tips"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Getting Started</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Add purchases manually by tapping "+" on the Holdings tab</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Or use AI Receipt Scanner to automatically extract data from receipts and invoices</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>AI Receipt Scanner</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Tap "Take Photo" to capture a receipt with your camera</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Tap "Upload Photo" to select an existing image from your gallery</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• The AI will extract product name, quantity, price, dealer, and date</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Review and edit the extracted data before saving</Text>
          <Text style={[styles.privacyItem, { marginTop: 8, color: colors.text }]}>• Free users get 5 scans per month (resets monthly)</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Gold/Lifetime subscribers get unlimited scans</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Backup & Restore</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Your data is stored locally on your device only - we can't access it</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Use "Backup" to save your portfolio to iCloud Drive, Google Drive, or any cloud storage</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Use "Restore" to load a backup onto this device or a new device</Text>
          <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 8, marginTop: 8 }}>
            <Text style={{ color: colors.gold, fontSize: 13, fontWeight: '600' }}>⚠️ IMPORTANT: Backup regularly to avoid data loss!</Text>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Using Multiple Devices</Text>
          {Platform.OS === 'ios' ? (
            <>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                <Text style={[styles.privacyItem, { color: colors.text }]}>• iCloud Sync</Text>
                <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                  <Text style={{ color: colors.gold, fontSize: 10, fontWeight: '600' }}>GOLD</Text>
                </View>
              </View>
              <Text style={[styles.privacyItem, { paddingLeft: 12, marginTop: 4, color: colors.text }]}>Automatically sync holdings across all your Apple devices</Text>
              <Text style={[styles.privacyItem, { marginTop: 12, color: colors.text }]}>• Manual Backup/Restore (all users)</Text>
              <Text style={[styles.privacyItem, { paddingLeft: 12, marginTop: 4, color: colors.muted, fontSize: 12 }]}>Export/import for cross-platform or offline backup</Text>
            </>
          ) : (
            <>
              <Text style={[styles.privacyItem, { color: colors.text }]}>• Use Manual Backup to export your holdings</Text>
              <Text style={[styles.privacyItem, { marginTop: 8, color: colors.text }]}>• To use on multiple devices:</Text>
              <Text style={[styles.privacyItem, { paddingLeft: 12, color: colors.text }]}>1. Backup from your primary device</Text>
              <Text style={[styles.privacyItem, { paddingLeft: 12, color: colors.text }]}>2. Restore on your secondary device</Text>
            </>
          )}
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Export CSV</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Export your entire portfolio as a CSV spreadsheet</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Use for your own records, tax preparation, or importing to other tools</Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>Support</Text>
          <Text style={[styles.privacyItem, { color: colors.text }]}>• Need help? Email stacktrackerpro@gmail.com</Text>
          <Text style={[styles.privacyItem, { marginTop: 4, color: colors.muted, fontSize: 12 }]}>Include your Support ID (found in Settings → Advanced) for faster assistance</Text>
        </View>
      </ModalWrapper>

      {/* Gold Paywall */}
      <GoldPaywall
        visible={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        onPurchaseSuccess={checkEntitlements}
      />

      {/* Add Price Alert Modal */}
      <ModalWrapper
        visible={showAddAlertModal}
        onClose={() => {
          setShowAddAlertModal(false);
          setNewAlert({ metal: 'silver', targetPrice: '', direction: 'above' });
        }}
        title="Add Price Alert"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <View style={{ marginBottom: 20 }}>
          <Text style={{ color: colors.muted, marginBottom: 16 }}>
            Get notified when spot prices reach your target. Current prices: Gold ${goldSpot.toFixed(2)}, Silver ${silverSpot.toFixed(2)}
          </Text>

          {/* Metal Selection */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Metal</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {['silver', 'gold'].map((metal) => (
              <TouchableOpacity
                key={metal}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: newAlert.metal === metal
                    ? (metal === 'gold' ? colors.gold : colors.silver)
                    : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNewAlert(prev => ({ ...prev, metal }));
                }}
              >
                <Text style={{
                  color: newAlert.metal === metal ? '#000' : colors.text,
                  fontWeight: '600',
                }}>
                  {metal === 'gold' ? '🥇 Gold' : '🥈 Silver'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Direction Selection */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Alert When Price Goes...</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
            {[
              { key: 'above', label: '↑ Above' },
              { key: 'below', label: '↓ Below' },
            ].map((option) => (
              <TouchableOpacity
                key={option.key}
                style={{
                  flex: 1,
                  paddingVertical: 12,
                  borderRadius: 8,
                  backgroundColor: newAlert.direction === option.key
                    ? (option.key === 'above' ? colors.success : colors.error)
                    : (isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)'),
                  alignItems: 'center',
                }}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setNewAlert(prev => ({ ...prev, direction: option.key }));
                }}
              >
                <Text style={{
                  color: newAlert.direction === option.key ? '#fff' : colors.text,
                  fontWeight: '600',
                }}>
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Target Price Input */}
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 8 }}>Target Price ($/oz)</Text>
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: isDarkMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.05)',
            borderRadius: 8,
            paddingHorizontal: 12,
            borderWidth: 1,
            borderColor: colors.border,
          }}>
            <Text style={{ color: colors.text, fontSize: 16, marginRight: 4 }}>$</Text>
            <TextInput
              style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: 14 }}
              value={newAlert.targetPrice}
              onChangeText={(value) => setNewAlert(prev => ({ ...prev, targetPrice: value }))}
              keyboardType="decimal-pad"
              placeholder={newAlert.metal === 'gold' ? '4500.00' : '75.00'}
              placeholderTextColor={colors.muted}
            />
          </View>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4 }}>
            Current {newAlert.metal === 'gold' ? 'gold' : 'silver'} spot: ${newAlert.metal === 'gold' ? goldSpot.toFixed(2) : silverSpot.toFixed(2)}/oz
          </Text>
        </View>

        {/* Create Alert Button */}
        <TouchableOpacity
          style={{
            backgroundColor: colors.gold,
            padding: 16,
            borderRadius: 10,
            alignItems: 'center',
          }}
          onPress={createPriceAlert}
        >
          <Text style={{ color: '#000', fontWeight: '700', fontSize: 16 }}>Create Alert</Text>
        </TouchableOpacity>

        {!expoPushToken && (
          <Text style={{ color: colors.error, fontSize: 11, textAlign: 'center', marginTop: 12 }}>
            Push notifications not enabled. Enable notifications in Settings to receive alerts.
          </Text>
        )}
      </ModalWrapper>

      {/* Scanned Items Preview Modal */}
      <ModalWrapper
        visible={showScannedItemsPreview}
        onClose={() => {
          setShowScannedItemsPreview(false);
          setScannedItems([]);
          setScannedMetadata({ purchaseDate: '', dealer: '' });
        }}
        title="Receipt Scanned"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <View style={{ marginBottom: 16 }}>
          <Text style={{ color: colors.success, fontSize: 18, fontWeight: '600', marginBottom: 4 }}>
            ✅ Found {scannedItems.length} Item{scannedItems.length > 1 ? 's' : ''}
          </Text>
          {scannedMetadata.dealer && (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Dealer: {scannedMetadata.dealer}</Text>
          )}
          {scannedMetadata.purchaseDate && (
            <Text style={{ color: colors.muted, fontSize: 12 }}>Date: {scannedMetadata.purchaseDate}</Text>
          )}
        </View>

        {scannedItems.map((item, index) => {
          const itemMetal = item.metal || 'silver';
          const itemColor = itemMetal === 'silver' ? colors.silver : colors.gold;

          return (
            <View key={index} style={[styles.card, { marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName || 'Unknown Item'}</Text>
                  <Text style={{ color: itemColor, fontSize: 12, marginTop: 2 }}>
                    {itemMetal.toUpperCase()} • {item.ozt ?? 0} oz{(item.quantity ?? 1) > 1 ? ` • Qty: ${item.quantity}` : ''}
                  </Text>
                </View>
              </View>

              {/* Editable Price Fields */}
              <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 4 }}>Unit Price</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 6, paddingHorizontal: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>$</Text>
                    <TextInput
                      style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 }}
                      value={(item.unitPrice ?? 0).toFixed(2)}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => updateScannedItemPrice(index, 'unitPrice', value)}
                      selectTextOnFocus
                    />
                  </View>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.muted, fontSize: 10, marginBottom: 4 }}>Line Total{(item.quantity ?? 1) > 1 ? ` (×${item.quantity})` : ''}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.cardBg, borderRadius: 6, paddingHorizontal: 8 }}>
                    <Text style={{ color: colors.text, fontSize: 14 }}>$</Text>
                    <TextInput
                      style={{ flex: 1, color: colors.text, fontSize: 14, paddingVertical: 8 }}
                      value={(item.extPrice ?? 0).toFixed(2)}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => updateScannedItemPrice(index, 'extPrice', value)}
                      selectTextOnFocus
                    />
                  </View>
                </View>
              </View>

              {(item.spotPrice ?? 0) > 0 && (
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }}>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Spot: ${(item.spotPrice ?? 0).toFixed(2)}
                  </Text>
                  {(item.premium ?? 0) !== 0 && (
                    <Text style={{ color: (item.premium ?? 0) > 0 ? colors.gold : colors.error, fontSize: 11 }}>
                      Premium: ${(item.premium ?? 0).toFixed(2)}
                    </Text>
                  )}
                </View>
              )}

              {/* Price warning for suspicious values */}
              {item.priceWarning && (
                <View style={{ backgroundColor: 'rgba(239, 68, 68, 0.15)', padding: 8, borderRadius: 6, marginTop: 8 }}>
                  <Text style={{ color: colors.error, fontSize: 11 }}>⚠️ {item.priceWarning}</Text>
                </View>
              )}

              <TouchableOpacity
                style={{
                  marginTop: 10,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  backgroundColor: 'rgba(251,191,36,0.2)',
                  borderRadius: 6,
                  alignSelf: 'flex-start',
                }}
                onPress={() => editScannedItem(index)}
              >
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>✏️ Edit All Details</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        {/* AI Disclaimer */}
        <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 12, marginBottom: 8 }}>
          AI scanner may make mistakes. Please verify all values before adding.
        </Text>

        <View style={{ marginTop: 8 }}>
          <TouchableOpacity
            style={[styles.button, { backgroundColor: colors.success, marginBottom: 8 }]}
            onPress={confirmScannedItems}
          >
            <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>
              {scannedItems.length === 1
                ? '✅ Add Item'
                : `✅ Add All ${scannedItems.length} Items`}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.buttonOutline]}
            onPress={() => {
              setShowScannedItemsPreview(false);
              setScannedItems([]);
              setScannedMetadata({ purchaseDate: '', dealer: '' });
            }}
          >
            <Text style={{ color: colors.text }}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </ModalWrapper>

      {/* Dealer Selector Modal */}
      <Modal visible={showDealerSelector} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff', maxHeight: '80%' }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Select Dealer</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowDealerSelector(false);
                  setPendingImportFile(null);
                  setSelectedDealer(null);
                }}
                style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
              <Text style={{ color: colors.muted, marginBottom: 16, fontSize: 14 }}>
                Select the dealer this CSV export came from. This helps us map the columns correctly and auto-detect product details.
              </Text>

              {Object.entries(DEALER_TEMPLATES).map(([key, template]) => (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.card,
                    {
                      backgroundColor: colors.cardBg,
                      borderColor: selectedDealer === key ? colors.gold : colors.border,
                      borderWidth: selectedDealer === key ? 2 : 1,
                      marginBottom: 12,
                      padding: 16,
                    },
                  ]}
                  onPress={() => setSelectedDealer(key)}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Text style={{ color: colors.text, fontWeight: '600', fontSize: 16 }}>{template.name}</Text>
                    {selectedDealer === key && <Text style={{ color: colors.gold, fontSize: 18 }}>✓</Text>}
                  </View>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>{template.instructions}</Text>
                </TouchableOpacity>
              ))}

              <View style={{ height: 20 }} />
            </ScrollView>

            {/* Footer buttons */}
            <View style={{ flexDirection: 'row', gap: 8, padding: 20, paddingTop: 0 }}>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1 }]}
                onPress={() => {
                  setShowDealerSelector(false);
                  setPendingImportFile(null);
                  setSelectedDealer(null);
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: selectedDealer ? colors.success : colors.muted, opacity: selectedDealer ? 1 : 0.5 }]}
                onPress={() => selectedDealer && handleDealerSelected(selectedDealer)}
                disabled={!selectedDealer}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>Continue</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Import Preview Modal */}
      {/* Import Preview Modal - Custom structure for FlatList */}
      <Modal visible={showImportPreview} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: isDarkMode ? '#1a1a2e' : '#ffffff' }]}>
            {/* Header */}
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Import Preview</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowImportPreview(false);
                  setImportData([]);
                }}
                style={[styles.closeButton, { backgroundColor: isDarkMode ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)' }]}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={[styles.closeButtonText, { color: colors.text }]}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* FlatList with header and footer */}
            <FlatList
              data={importData}
              keyExtractor={(item, index) => index.toString()}
              ListHeaderComponent={
                <Text style={{ color: colors.text, marginBottom: 16, fontWeight: '600', paddingHorizontal: 20 }}>
                  Found {importData.length} item{importData.length > 1 ? 's' : ''}. Tap any item to edit before importing:
                </Text>
              }
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item, index }) => {
                const itemColor = item.metal === 'silver' ? colors.silver : colors.gold;
                const hasAutoDetected = item.autoDetected && (item.autoDetected.metal || item.autoDetected.ozt);

                return (
                  <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border, marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor, marginHorizontal: 20 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName}</Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, flexWrap: 'wrap', gap: 4 }}>
                          <Text style={{ color: itemColor, fontSize: 12 }}>
                            {item.metal.toUpperCase()} • {item.ozt} oz{item.quantity > 1 ? ` • Qty: ${item.quantity}` : ''}
                          </Text>
                          {item.autoDetected?.metal && (
                            <View style={{ backgroundColor: 'rgba(251,191,36,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.gold, fontSize: 9, fontWeight: '600' }}>AUTO-METAL</Text>
                            </View>
                          )}
                          {item.autoDetected?.ozt && (
                            <View style={{ backgroundColor: 'rgba(148,163,184,0.2)', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                              <Text style={{ color: colors.silver, fontSize: 9, fontWeight: '600' }}>AUTO-OZT</Text>
                            </View>
                          )}
                        </View>
                      </View>
                      <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>
                        ${(item.unitPrice * item.quantity).toFixed(2)}
                      </Text>
                    </View>

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>
                        ${item.unitPrice.toFixed(2)} per item
                      </Text>
                      {item.datePurchased && (
                        <Text style={{ color: colors.muted, fontSize: 11 }}>
                          {item.datePurchased}
                        </Text>
                      )}
                    </View>

                    {item.source && (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                        From: {item.source}
                      </Text>
                    )}

                    <TouchableOpacity
                      style={{
                        marginTop: 8,
                        paddingVertical: 6,
                        paddingHorizontal: 12,
                        backgroundColor: 'rgba(251,191,36,0.2)',
                        borderRadius: 6,
                        alignSelf: 'flex-start',
                      }}
                      onPress={() => editImportedItem(index)}
                    >
                      <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>✏️ Edit</Text>
                    </TouchableOpacity>
                  </View>
                );
              }}
            />

            {/* Footer buttons */}
            <View style={{ flexDirection: 'row', gap: 8, padding: 20, paddingTop: 0 }}>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1 }]}
                onPress={() => {
                  setShowImportPreview(false);
                  setImportData([]);
                }}
              >
                <Text style={{ color: colors.text }}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: colors.success }]}
                onPress={confirmImport}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>Import {importData.length} Items</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail View Modal */}
      <ModalWrapper
        visible={showDetailView}
        onClose={() => {
          setShowDetailView(false);
          setDetailItem(null);
          setDetailMetal(null);
        }}
        title="Item Details"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        {detailItem && (
          <>
            <View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.border }]}>
              <Text style={[styles.cardTitle, { fontSize: 20, color: colors.text }]}>{detailItem.productName}</Text>
              {detailItem.datePurchased && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>📅 Purchase Date</Text>
                  <Text style={[styles.statRowValue, { color: colors.text }]}>{detailItem.datePurchased}</Text>
                </View>
              )}
              {detailItem.source && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>🏪 Source</Text>
                  <Text style={[styles.statRowValue, { color: colors.text }]}>{detailItem.source}</Text>
                </View>
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Quantity</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>{detailItem.quantity}x</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Unit Price</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>${formatCurrency(detailItem.unitPrice)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Troy Ounces (each)</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>{detailItem.ozt} oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Total Weight</Text>
                <Text style={[styles.statRowValue, { color: colors.text }]}>{(detailItem.ozt * detailItem.quantity).toFixed(2)} oz</Text>
              </View>
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Premium (per unit)</Text>
                <Text style={[styles.statRowValue, { color: colors.gold }]}>${formatCurrency(detailItem.premium)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Total Premium</Text>
                <Text style={[styles.statRowValue, { color: colors.gold }]}>
                  ${formatCurrency(detailItem.premium * detailItem.quantity)}
                </Text>
              </View>
              {detailItem.taxes > 0 && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Taxes</Text>
                  <Text style={[styles.statRowValue, { color: colors.text }]}>${formatCurrency(detailItem.taxes)}</Text>
                </View>
              )}
              {detailItem.shipping > 0 && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Shipping</Text>
                  <Text style={[styles.statRowValue, { color: colors.text }]}>${formatCurrency(detailItem.shipping)}</Text>
                </View>
              )}
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: 14, fontWeight: '600' }]}>Total Cost Basis</Text>
                <Text style={[styles.statRowValue, { fontSize: 16, color: colors.text }]}>
                  ${formatCurrency((detailItem.unitPrice * detailItem.quantity) + detailItem.taxes + detailItem.shipping)}
                </Text>
              </View>
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: 14, fontWeight: '600' }]}>Current Melt Value</Text>
                <Text style={[styles.statRowValue, { fontSize: 16, color: detailMetal === 'silver' ? colors.silver : colors.gold }]}>
                  ${formatCurrency(detailItem.ozt * detailItem.quantity * (detailMetal === 'silver' ? silverSpot : goldSpot))}
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <TouchableOpacity
                style={[styles.button, { flex: 1, backgroundColor: detailMetal === 'silver' ? colors.silver : colors.gold }]}
                onPress={() => {
                  setShowDetailView(false);
                  editItem(detailItem, detailMetal);
                }}
              >
                <Text style={{ color: '#000', fontWeight: '600' }}>✏️ Edit</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonOutline, { flex: 1, borderColor: colors.error }]}
                onPress={() => deleteItem(detailItem.id, detailMetal)}
              >
                <Text style={{ color: colors.error, fontWeight: '600' }}>🗑 Delete</Text>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ModalWrapper>

      {/* Sort Menu Modal */}
      <ModalWrapper
        visible={showSortMenu}
        onClose={() => setShowSortMenu(false)}
        title="Sort Holdings"
        colors={colors}
        isDarkMode={isDarkMode}
      >
        <TouchableOpacity
          style={[styles.card, sortBy === 'date-newest' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('date-newest');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>📅 Date (Newest First)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Most recent purchases first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'date-oldest' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('date-oldest');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>📅 Date (Oldest First)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Earliest purchases first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'value-high' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('value-high');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>💰 Value (High to Low)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Highest melt value first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'value-low' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('value-low');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>💰 Value (Low to High)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Lowest melt value first</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.card, sortBy === 'name' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('name');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0, color: colors.text }]}>🔤 Name (A-Z)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Alphabetical by product name</Text>
        </TouchableOpacity>
      </ModalWrapper>

      {/* Share My Stack Preview Modal */}
      <Modal visible={showSharePreview} animationType="slide" transparent>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center', padding: 20 }}>
          {/* Shareable View - Captured by ViewShot */}
          <ViewShot
            ref={shareViewRef}
            options={{ format: 'png', quality: 1.0, result: 'tmpfile' }}
            style={{ width: SCREEN_WIDTH - 40 }}
          >
            <View style={{
              backgroundColor: '#1a1a2e',
              borderRadius: 20,
              padding: 24,
              width: '100%',
            }}>
              {/* Header */}
              <View style={{ alignItems: 'center', marginBottom: 20 }}>
                <Text style={{ fontSize: 24, marginBottom: 8 }}>🪙</Text>
                <Text style={{ color: '#fbbf24', fontSize: 18, fontWeight: '700' }}>My Precious Metals Stack</Text>
              </View>

              {/* Portfolio Value */}
              <View style={{
                backgroundColor: 'rgba(251, 191, 36, 0.1)',
                borderRadius: 16,
                padding: 20,
                alignItems: 'center',
                marginBottom: 20,
                borderWidth: 1,
                borderColor: 'rgba(251, 191, 36, 0.2)',
              }}>
                <Text style={{ color: '#71717a', fontSize: 12, marginBottom: 4 }}>Total Portfolio Value</Text>
                <Text style={{ color: '#fff', fontSize: 36, fontWeight: '700' }}>{formatCurrency(totalMeltValue, 0)}</Text>
              </View>

              {/* Gold & Silver Breakdown */}
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
                {/* Gold */}
                <View style={{
                  flex: 1,
                  backgroundColor: 'rgba(251, 191, 36, 0.08)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(251, 191, 36, 0.15)',
                }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>🥇</Text>
                  <Text style={{ color: '#fbbf24', fontWeight: '600', marginBottom: 8 }}>Gold</Text>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{totalGoldOzt.toFixed(3)} oz</Text>
                  <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>{formatCurrency(totalGoldOzt * goldSpot, 0)}</Text>
                </View>

                {/* Silver */}
                <View style={{
                  flex: 1,
                  backgroundColor: 'rgba(156, 163, 175, 0.08)',
                  borderRadius: 12,
                  padding: 16,
                  borderWidth: 1,
                  borderColor: 'rgba(156, 163, 175, 0.15)',
                }}>
                  <Text style={{ fontSize: 20, marginBottom: 4 }}>🥈</Text>
                  <Text style={{ color: '#9ca3af', fontWeight: '600', marginBottom: 8 }}>Silver</Text>
                  <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{totalSilverOzt.toFixed(2)} oz</Text>
                  <Text style={{ color: '#71717a', fontSize: 12, marginTop: 4 }}>{formatCurrency(totalSilverOzt * silverSpot, 0)}</Text>
                </View>
              </View>

              {/* Spot Prices */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 20, marginBottom: 16 }}>
                <Text style={{ color: '#71717a', fontSize: 11 }}>Gold: ${goldSpot.toFixed(0)}/oz</Text>
                <Text style={{ color: '#71717a', fontSize: 11 }}>Silver: ${silverSpot.toFixed(2)}/oz</Text>
              </View>

              {/* Watermark */}
              <View style={{ alignItems: 'center', paddingTop: 12, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
                <Text style={{ color: '#52525b', fontSize: 11 }}>Tracked with Stack Tracker Pro</Text>
              </View>
            </View>
          </ViewShot>

          {/* Action Buttons */}
          <View style={{ width: '100%', marginTop: 20, gap: 12 }}>
            <TouchableOpacity
              style={{
                backgroundColor: colors.gold,
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 8,
              }}
              onPress={shareMyStack}
              disabled={isGeneratingShare}
            >
              {isGeneratingShare ? (
                <ActivityIndicator color="#000" />
              ) : (
                <>
                  <Text style={{ color: '#000', fontWeight: '600', fontSize: 16 }}>Share</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: 'rgba(255,255,255,0.1)',
                padding: 16,
                borderRadius: 12,
                alignItems: 'center',
              }}
              onPress={() => setShowSharePreview(false)}
            >
              <Text style={{ color: '#fff', fontWeight: '600' }}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* First Launch Tutorial */}
      <Tutorial
        visible={showTutorial}
        onComplete={handleTutorialComplete}
      />
    </SafeAreaView>
  );
}

// Export App wrapped with ErrorBoundary to catch any crashes
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

// ============================================
// STYLES
// ============================================

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f0f' },
  header: { backgroundColor: 'rgba(0,0,0,0.4)', borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 20, paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0 },
  headerContent: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 16 },
  logo: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  logoIcon: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  logoTitle: { color: '#fff', fontWeight: '700', fontSize: 18 },
  logoSubtitle: { color: '#71717a', fontSize: 11 },
  privacyBadge: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: 'rgba(34,197,94,0.15)', borderRadius: 20, borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)' },
  content: { flex: 1, padding: 20 },
  upgradeBanner: {
    flexDirection: 'row',
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(251, 191, 36, 0.3)',
    shadowColor: '#fbbf24',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 8,
  },
  bottomTabs: { flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.8)', borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingBottom: Platform.OS === 'ios' ? 20 : 10, paddingTop: 10 },
  bottomTab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  metalTabs: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  metalTab: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)', alignItems: 'center' },
  card: { backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 16, padding: 20, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  cardTitle: { fontSize: 16, fontWeight: '600', color: '#fff', marginBottom: 12 },
  statRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  statRowLabel: { color: '#71717a', fontSize: 13 },
  statRowValue: { color: '#fff', fontWeight: '600' },
  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.1)', marginVertical: 12 },
  button: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  buttonOutline: { paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' },
  itemCard: { backgroundColor: 'rgba(0,0,0,0.2)', borderRadius: 12, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)', flexDirection: 'row', alignItems: 'center' },
  itemTitle: { color: '#fff', fontWeight: '600', marginBottom: 4 },
  itemSubtitle: { color: '#71717a', fontSize: 12 },
  itemValue: { fontWeight: '600', fontSize: 16 },
  emptyState: { alignItems: 'center', padding: 40 },
  floatingContainer: { marginBottom: 12 },
  floatingLabel: { color: '#a1a1aa', fontSize: 12, marginBottom: 6, fontWeight: '500' },
  inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)', borderRadius: 10, paddingHorizontal: 12 },
  floatingInput: { flex: 1, padding: 12, paddingLeft: 0, color: '#fff', fontSize: 14 },
  inputPrefix: { color: '#71717a', fontSize: 14, marginRight: 2 },

  // Modal styles - improved
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'flex-start', paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalKeyboardView: { flex: 1, backgroundColor: '#1a1a2e' },
  modalContent: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    flex: 1,
    height: '100%'
  },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22 },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },

  scanStatus: { padding: 12, borderRadius: 10, marginBottom: 16 },
  privacyItem: { color: '#a1a1aa', fontSize: 13, lineHeight: 24 },

  // Sticky button container for Add/Edit modal
  stickyButtonContainer: {
    paddingTop: 12,
    paddingBottom: Platform.OS === 'ios' ? 20 : 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    backgroundColor: '#1a1a2e',
  },
});
