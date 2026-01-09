/**
 * Stack Tracker Pro - React Native App
 * Privacy-First Precious Metals Portfolio Tracker
 * "Make Stacking Great Again" Edition 🪙
 */

import React, { useState, useEffect, Component } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Modal, Platform, SafeAreaView, StatusBar, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Dimensions, AppState, FlatList, Clipboard, Linking,
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
import { initializePurchases, hasGoldEntitlement, getUserEntitlements } from './src/utils/entitlements';
import GoldPaywall from './src/components/GoldPaywall';
import Tutorial from './src/components/Tutorial';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE_URL = Constants.expoConfig?.extra?.apiUrl || 'https://stack-tracker-pro-production.up.railway.app';

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

const FloatingInput = ({ label, value, onChangeText, placeholder, keyboardType, prefix, editable = true }) => (
  <View style={styles.floatingContainer}>
    <Text style={styles.floatingLabel}>{label}</Text>
    <View style={[styles.inputRow, !editable && { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
      {prefix && <Text style={styles.inputPrefix}>{prefix}</Text>}
      <TextInput
        style={[styles.floatingInput, prefix && { paddingLeft: 4 }]}
        placeholder={placeholder}
        placeholderTextColor="#52525b"
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

const PieChart = ({ data, size = 150 }) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return null;

  let currentAngle = 0;
  const segments = data.map((item) => {
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
          backgroundColor: '#1a1a2e',
          top: size * 0.2,
          left: size * 0.2,
          justifyContent: 'center',
          alignItems: 'center',
        }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
            ${(total / 1000).toFixed(1)}k
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', marginTop: 12, gap: 16 }}>
        {segments.map((segment, index) => (
          <View key={index} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: segment.color, marginRight: 6 }} />
            <Text style={{ color: '#a1a1aa', fontSize: 12 }}>{segment.label} {(segment.percentage * 100).toFixed(0)}%</Text>
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

// Modal wrapper with proper keyboard handling
const ModalWrapper = ({ visible, onClose, title, children }) => (
  <Modal visible={visible} animationType="slide" transparent>
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <View style={styles.modalOverlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalKeyboardView}
        >
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalContent}>
              {/* Header - always visible */}
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>{title}</Text>
                <TouchableOpacity
                  onPress={onClose}
                  style={styles.closeButton}
                  hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                >
                  <Text style={styles.closeButtonText}>✕</Text>
                </TouchableOpacity>
              </View>

              {/* Tap to dismiss hint */}
              <TouchableOpacity onPress={Keyboard.dismiss} style={styles.dismissHint}>
                <Text style={{ color: '#52525b', fontSize: 11 }}>Tap here to hide keyboard</Text>
              </TouchableOpacity>

              {/* Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 40 }}
              >
                {children}
              </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </View>
    </TouchableWithoutFeedback>
  </Modal>
);

// ============================================
// MAIN APP
// ============================================

// Main app content (wrapped by ErrorBoundary below)
function AppContent() {
  // Core State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [metalTab, setMetalTab] = useState('both'); // Changed from 'silver' to 'both'

  // Spot Prices - Updated defaults for Dec 2025
  const [silverSpot, setSilverSpot] = useState(77);
  const [goldSpot, setGoldSpot] = useState(4530);
  const [priceSource, setPriceSource] = useState('cached');
  const [priceTimestamp, setPriceTimestamp] = useState(null);

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

  // Daily Snapshot State
  const [midnightValue, setMidnightValue] = useState(null);
  const [midnightDate, setMidnightDate] = useState(null);

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

  // Scan State
  const [scanStatus, setScanStatus] = useState(null);
  const [scanMessage, setScanMessage] = useState('');
  const [editingItem, setEditingItem] = useState(null);

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

  // Colors
  const colors = {
    silver: '#94a3b8',
    gold: '#fbbf24',
    success: '#22c55e',
    error: '#ef4444',
    text: '#e4e4e7',
    muted: '#71717a',
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

  // Daily change calculation (updates with spot price changes)
  const dailyChange = midnightValue !== null ? (totalMeltValue - midnightValue) : 0;
  const dailyChangePct = (midnightValue !== null && midnightValue > 0) ? ((dailyChange / midnightValue) * 100) : 0;
  const isDailyChangePositive = dailyChange >= 0;
  const showDailyChange = midnightValue !== null && midnightDate === new Date().toDateString();

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
      const [silver, gold, silverS, goldS, timestamp, hasSeenTutorial, storedMidnightValue, storedMidnightDate] = await Promise.all([
        AsyncStorage.getItem('stack_silver'),
        AsyncStorage.getItem('stack_gold'),
        AsyncStorage.getItem('stack_silver_spot'),
        AsyncStorage.getItem('stack_gold_spot'),
        AsyncStorage.getItem('stack_price_timestamp'),
        AsyncStorage.getItem('stack_has_seen_tutorial'),
        AsyncStorage.getItem('stack_midnight_value'),
        AsyncStorage.getItem('stack_midnight_date'),
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
      if (storedMidnightValue) setMidnightValue(parseFloat(storedMidnightValue) || 0);
      if (storedMidnightDate) setMidnightDate(storedMidnightDate);

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

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    if (isAuthenticated && dataLoaded) saveData('stack_silver', silverItems);
  }, [silverItems, isAuthenticated, dataLoaded]);

  useEffect(() => {
    // Only save after initial data has been loaded to prevent overwriting with empty arrays
    if (isAuthenticated && dataLoaded) saveData('stack_gold', goldItems);
  }, [goldItems, isAuthenticated, dataLoaded]);

  useEffect(() => { authenticate(); }, []);

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
          // Use production key for production builds, test key for development
          const apiKey = __DEV__
            ? 'test_LkMLacPMbzdsKIpCuG6QgATsBnNi'  // Sandbox/test key
            : 'appl_WDKPrWsOHfWzfJhxOGluQYsniLW';   // Production key

          if (__DEV__) console.log('🔧 Initializing RevenueCat with key:', apiKey.substring(0, 10) + '...');

          const initialized = await initializePurchases(apiKey);
          if (initialized) {
            // Additional delay before checking entitlements
            await new Promise(resolve => setTimeout(resolve, 100));
            await checkEntitlements();
            if (__DEV__) console.log('✅ RevenueCat setup complete');
          } else {
            if (__DEV__) console.log('⚠️ RevenueCat initialization returned false, skipping entitlements');
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

  // Daily Snapshot: Check if it's a new day and update midnight value
  useEffect(() => {
    const checkAndUpdateMidnightSnapshot = async () => {
      if (!isAuthenticated) return;

      const today = new Date().toDateString(); // e.g., "Mon Dec 29 2025"

      // If no midnight date or it's a new day
      if (!midnightDate || midnightDate !== today) {
        // Save current portfolio value as the new midnight snapshot
        const currentValue = totalMeltValue;

        await AsyncStorage.setItem('stack_midnight_value', currentValue.toString());
        await AsyncStorage.setItem('stack_midnight_date', today);

        setMidnightValue(currentValue);
        setMidnightDate(today);

        console.log(`📸 Daily snapshot updated: $${currentValue.toFixed(2)} on ${today}`);
      }
    };

    // Check on app open and when portfolio value changes
    checkAndUpdateMidnightSnapshot();
  }, [isAuthenticated, totalMeltValue, midnightDate]);

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
        await AsyncStorage.setItem('stack_price_timestamp', data.timestamp || new Date().toISOString());

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

  const fetchHistoricalSpot = async (date, metal) => {
    if (!date || date.length < 10) return { price: null, source: null };
    try {
      const url = `${API_BASE_URL}/api/historical-spot?date=${date}&metal=${metal || metalTab}`;
      if (__DEV__) console.log(`📅 Fetching historical spot: ${url}`);
      const response = await fetch(url);
      const data = await response.json();
      if (__DEV__) {
        console.log('📅 Historical spot API response:', JSON.stringify(data, null, 2));
        if (data.source === 'static-json' || data.source === 'static-json-nearest') {
          console.log('⚠️ WARNING: Using monthly average from static data');
        }
        if (data.source === 'current-fallback') {
          console.log('⚠️ WARNING: No historical data found, using current spot price as fallback');
        }
      }
      if (data.success && data.price) {
        return { price: data.price, source: data.source };
      }
    } catch (error) {
      if (__DEV__) console.log('❌ Could not fetch historical spot:', error.message);
    }
    // Return current spot as fallback with source indicator
    return { price: metal === 'gold' ? goldSpot : silverSpot, source: 'client-fallback' };
  };

  const handleDateChange = async (date) => {
    setForm(prev => ({ ...prev, datePurchased: date }));
    setSpotPriceSource(null); // Clear previous source while loading
    if (date.length === 10) {
      const result = await fetchHistoricalSpot(date, metalTab);
      if (result.price) {
        setForm(prev => ({ ...prev, spotPrice: result.price.toString() }));
        setSpotPriceSource(result.source);
      }
    }
  };

  // ============================================
  // RECEIPT SCANNING
  // ============================================

  const scanReceipt = async (source = 'gallery') => {
    // Check scan limit first
    if (!checkScanLimit()) return;

    let result;

    if (source === 'camera') {
      // Request camera permission
      const permissionResult = await ImagePicker.requestCameraPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your camera to take photos of receipts.');
        return;
      }

      result = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8 });
    } else {
      // Request media library permission
      const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permissionResult.granted) {
        Alert.alert('Permission Required', 'Please allow access to your photos.');
        return;
      }

      result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    }

    if (result.canceled) return;

    // Safety check for assets array
    if (!result.assets || result.assets.length === 0) {
      Alert.alert('Error', 'No image selected');
      return;
    }

    setScanStatus('scanning');
    setScanMessage('Analyzing receipt...');

    try {
      const formData = new FormData();
      formData.append('receipt', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'receipt.jpg' });

      if (__DEV__) console.log('📤 Sending receipt to server...');

      const response = await fetch(`${API_BASE_URL}/api/scan-receipt`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      if (__DEV__) console.log('📥 Response status:', response.status);

      const data = await response.json();
      if (__DEV__) console.log('📄 Full server response:', JSON.stringify(data, null, 2));

      // Handle multi-item receipt response
      if (data.success && data.items && data.items.length > 0) {
        // Only increment scan count on successful extraction
        await incrementScanCount();

        const items = data.items;
        const purchaseDate = data.purchaseDate || '';
        const dealer = data.dealer || '';

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

          const unitPrice = parseFloat(item.unitPrice) || 0;
          const ozt = parseFloat(item.ozt) || 0;
          const spotNum = parseFloat(spotPrice) || 0;
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
            quantity: parseInt(item.quantity) || 1,
            unitPrice: parseFloat(item.unitPrice) || 0,
            taxes: 0,
            shipping: 0,
            spotPrice: parseFloat(spotPrice) || 0,
            premium: parseFloat(premium) || 0,
          });
        }

        // Store scanned items and metadata
        setScannedItems(processedItems);
        setScannedMetadata({ purchaseDate, dealer });

        // Show success message
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
  // SPREADSHEET IMPORT
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

      // Auto-map column names (flexible matching)
      const headers = rows[0].map(h => String(h || '').toLowerCase().trim());
      const findColumn = (possibleNames) => {
        for (const name of possibleNames) {
          const index = headers.findIndex(h => h.includes(name));
          if (index !== -1) return index;
        }
        return -1;
      };

      const colMap = {
        productName: findColumn(['product', 'name', 'item', 'description']),
        metal: findColumn(['metal', 'type']),
        quantity: findColumn(['quantity', 'qty', 'count', 'amount']),
        unitPrice: findColumn(['price', 'unit price', 'cost', 'unit cost']),
        date: findColumn(['date', 'purchased', 'purchase date', 'order date']),
        dealer: findColumn(['dealer', 'source', 'vendor', 'seller']),
        ozt: findColumn(['oz', 'ozt', 'ounces', 'troy oz', 'weight']),
      };

      // Check if essential columns exist
      if (colMap.productName === -1 || colMap.metal === -1) {
        Alert.alert(
          'Missing Columns',
          "Spreadsheet must have at least \"Product Name\" and \"Metal Type\" columns. This didn't count against your scan limit.\n\nAccepted column names:\n- Product: product, name, item, description\n- Metal: metal, type"
        );
        return;
      }

      // Parse data rows
      const parsedData = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length === 0) continue;

        const productName = row[colMap.productName];
        const metalRaw = String(row[colMap.metal] || '').toLowerCase().trim();

        // Skip if essential data is missing
        if (!productName || !metalRaw) continue;

        const metal = metalRaw.includes('gold') ? 'gold' : metalRaw.includes('silver') ? 'silver' : null;
        if (!metal) continue; // Skip non-gold/silver items

        parsedData.push({
          productName: String(productName || ''),
          metal,
          quantity: parseInt(row[colMap.quantity]) || 1,
          unitPrice: parseFloat(row[colMap.unitPrice]) || 0,
          datePurchased: row[colMap.date] ? String(row[colMap.date]) : '',
          source: row[colMap.dealer] ? String(row[colMap.dealer]) : '',
          ozt: parseFloat(row[colMap.ozt]) || 1,
        });
      }

      if (parsedData.length === 0) {
        Alert.alert('No Data Found', "No valid items found in spreadsheet. This didn't count against your scan limit.\n\nMake sure you have Product Name and Metal Type columns.");
        return;
      }

      // Only increment scan count on successful parsing
      await incrementScanCount();

      // Show preview
      setImportData(parsedData);
      setShowImportPreview(true);

      if (__DEV__) console.log(`📊 Parsed ${parsedData.length} items from spreadsheet`);
    } catch (error) {
      console.error('❌ Import error:', error);
      Alert.alert('Import Failed', `Could not import spreadsheet. This didn't count against your scan limit.\n\n${error.message}`);
    }
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
    if (metalTab === 'silver') {
      if (editingItem) {
        setSilverItems(prev => prev.map(i => i.id === editingItem.id ? item : i));
      } else {
        setSilverItems(prev => [...prev, item]);
      }
    } else {
      if (editingItem) {
        setGoldItems(prev => prev.map(i => i.id === editingItem.id ? item : i));
      } else {
        setGoldItems(prev => [...prev, item]);
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.logo}>
            <View style={[styles.logoIcon, { backgroundColor: colors.gold }]}>
              <Text style={{ fontSize: 20 }}>🪙</Text>
            </View>
            <View>
              <Text style={styles.logoTitle}>Stack Tracker Pro</Text>
              <Text style={styles.logoSubtitle}>Make Stacking Great Again 🚀</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.privacyBadge} onPress={() => setShowPrivacyModal(true)}>
            <Text style={{ color: colors.success, fontSize: 11 }}>🔒 Private</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >

        {/* DASHBOARD TAB */}
        {tab === 'dashboard' && (
          <>
            {/* Portfolio Value */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>💰 Portfolio Value</Text>
              <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700', marginBottom: 4 }}>
                ${totalMeltValue.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </Text>
              <Text style={{ color: totalGainLoss >= 0 ? colors.success : colors.error, fontSize: 16 }}>
                {totalGainLoss >= 0 ? '▲' : '▼'} ${Math.abs(totalGainLoss).toLocaleString(undefined, { minimumFractionDigits: 2 })} ({totalGainLossPct >= 0 ? '+' : ''}{totalGainLossPct.toFixed(1)}%)
              </Text>
            </View>

            {/* Today's Change */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📅 Today's Change</Text>
              {showDailyChange ? (
                <>
                  <Text style={{ color: isDailyChangePositive ? colors.success : colors.error, fontSize: 32, fontWeight: '700', marginBottom: 4 }}>
                    {isDailyChangePositive ? '+' : ''}{dailyChange >= 0 ? '' : '-'}${Math.abs(dailyChange).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </Text>
                  <Text style={{ color: isDailyChangePositive ? colors.success : colors.error, fontSize: 16 }}>
                    {isDailyChangePositive ? '▲' : '▼'} {isDailyChangePositive ? '+' : ''}{dailyChangePct.toFixed(2)}%
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11, marginTop: 8 }}>
                    Since midnight (${midnightValue.toLocaleString(undefined, { minimumFractionDigits: 2 })})
                  </Text>
                </>
              ) : (
                <View style={{ paddingVertical: 12 }}>
                  <Text style={{ color: colors.muted, fontSize: 24, textAlign: 'center' }}>—</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 4 }}>
                    No data yet. Check back tomorrow!
                  </Text>
                </View>
              )}
            </View>

            {/* Holdings Pie Chart */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 Holdings Breakdown</Text>
              <PieChart
                data={[
                  { label: 'Silver', value: silverMeltValue, color: colors.silver },
                  { label: 'Gold', value: goldMeltValue, color: colors.gold },
                ]}
                size={140}
              />
            </View>

            {/* Gold/Silver Ratio */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚖️ Gold/Silver Ratio</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>{goldSilverRatio.toFixed(1)}</Text>
                <Text style={{ color: colors.muted, marginLeft: 8 }}>:1</Text>
              </View>
              <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8 }}>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>📈 Quick Stats</Text>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Silver Holdings</Text>
                <Text style={[styles.statRowValue, { color: colors.silver }]}>{totalSilverOzt.toFixed(2)} oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Gold Holdings</Text>
                <Text style={[styles.statRowValue, { color: colors.gold }]}>{totalGoldOzt.toFixed(3)} oz</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Cost Basis</Text>
                <Text style={styles.statRowValue}>${totalCostBasis.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
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
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Silver Cost</Text>
                <Text style={styles.statRowValue}>${formatCurrency(avgSilverCostPerOz)}/oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Gold Cost</Text>
                <Text style={styles.statRowValue}>${formatCurrency(avgGoldCostPerOz)}/oz</Text>
              </View>
            </View>

            {/* Milestones */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>🏆 Stack Milestones</Text>
              <ProgressBar value={totalSilverOzt} max={nextSilverMilestone} color={colors.silver} label={`Silver: ${totalSilverOzt.toFixed(0)} / ${nextSilverMilestone} oz`} />
              <ProgressBar value={totalGoldOzt} max={nextGoldMilestone} color={colors.gold} label={`Gold: ${totalGoldOzt.toFixed(2)} / ${nextGoldMilestone} oz`} />
            </View>

            {/* Live Spot Prices */}
            <View style={styles.card}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <Text style={styles.cardTitle}>💹 Live Spot Prices</Text>
                <TouchableOpacity onPress={fetchSpotPrices}>
                  <Text style={{ color: colors.muted }}>🔄 Refresh</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flexDirection: 'row', gap: 12 }}>
                <View style={{ flex: 1, backgroundColor: `${colors.silver}22`, padding: 16, borderRadius: 12 }}>
                  <Text style={{ color: colors.silver, fontSize: 12 }}>🥈 Silver</Text>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${formatCurrency(silverSpot)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: `${colors.gold}22`, padding: 16, borderRadius: 12 }}>
                  <Text style={{ color: colors.gold, fontSize: 12 }}>🥇 Gold</Text>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${formatCurrency(goldSpot)}</Text>
                </View>
              </View>

              {/* Gold/Silver Ratio */}
              <View style={{ marginTop: 12, padding: 12, backgroundColor: 'rgba(251, 191, 36, 0.1)', borderRadius: 8 }}>
                <Text style={{ color: colors.muted, fontSize: 11, textAlign: 'center' }}>
                  Gold/Silver Ratio: <Text style={{ color: colors.gold, fontWeight: '600' }}>{goldSpot > 0 && silverSpot > 0 ? (goldSpot / silverSpot).toFixed(1) : '-'}</Text>
                </Text>
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
            <View style={styles.metalTabs}>
              <TouchableOpacity
                style={[styles.metalTab, { borderColor: metalTab === 'silver' ? colors.silver : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'silver' ? `${colors.silver}22` : 'transparent' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMetalTab('silver');
                }}
              >
                <Text style={{ color: metalTab === 'silver' ? colors.silver : colors.muted, fontWeight: '600' }}>🥈 Silver ({silverItems.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.metalTab, { borderColor: metalTab === 'gold' ? colors.gold : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'gold' ? `${colors.gold}22` : 'transparent' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMetalTab('gold');
                }}
              >
                <Text style={{ color: metalTab === 'gold' ? colors.gold : colors.muted, fontWeight: '600' }}>🥇 Gold ({goldItems.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.metalTab, { borderColor: metalTab === 'both' ? colors.gold : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'both' ? `${colors.gold}22` : 'transparent' }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMetalTab('both');
                }}
              >
                <Text style={{ color: metalTab === 'both' ? colors.gold : colors.muted, fontWeight: '600' }}>💰 Both ({silverItems.length + goldItems.length})</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: currentColor }]} onPress={handleAddPurchase}>
                <Text style={{ color: '#000', fontWeight: '600' }}>+ Add Purchase</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.buttonOutline, { paddingHorizontal: 16 }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setShowSortMenu(true);
                }}
              >
                <Text style={{ color: colors.text, fontSize: 18 }}>⬍⬍</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.buttonOutline, { marginBottom: 16 }]} onPress={importSpreadsheet}>
              <Text style={{ color: colors.text, fontWeight: '600' }}>📊 Import from Spreadsheet</Text>
            </TouchableOpacity>

            {/* Show filtered items or both with grouping */}
            {metalTab !== 'both' ? (
              <>
                {sortItems(items, metalTab).map(item => {
                  const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.itemCard}
                      onPress={() => viewItemDetail(item, metalTab)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.itemTitle}>{item.productName}</Text>
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
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      <Text style={{ color: colors.silver, fontWeight: '600', marginHorizontal: 12 }}>🥈 SILVER ({silverItems.length})</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                    </View>
                    {sortItems(silverItems, 'silver').map(item => {
                      const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.itemCard}
                          onPress={() => viewItemDetail(item, 'silver')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{item.productName}</Text>
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
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                      <Text style={{ color: colors.gold, fontWeight: '600', marginHorizontal: 12 }}>🥇 GOLD ({goldItems.length})</Text>
                      <View style={{ flex: 1, height: 1, backgroundColor: 'rgba(255,255,255,0.1)' }} />
                    </View>
                    {sortItems(goldItems, 'gold').map(item => {
                      const itemPremiumPct = calculatePremiumPercent(item.premium, item.unitPrice);
                      return (
                        <TouchableOpacity
                          key={item.id}
                          style={styles.itemCard}
                          onPress={() => viewItemDetail(item, 'gold')}
                          activeOpacity={0.7}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={styles.itemTitle}>{item.productName}</Text>
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
            <TouchableOpacity style={styles.card} onPress={() => setShowSpeculationModal(true)}>
              <Text style={styles.cardTitle}>🔮 Speculation Tool</Text>
              <Text style={{ color: colors.muted }}>What if silver hits $100? What if gold hits $10,000?</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.card} onPress={() => setShowJunkCalcModal(true)}>
              <Text style={styles.cardTitle}>🧮 Junk Silver Calculator</Text>
              <Text style={{ color: colors.muted }}>Calculate melt value of constitutional silver</Text>
            </TouchableOpacity>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>📊 Break-Even Analysis</Text>
              <View style={{ backgroundColor: `${colors.silver}22`, padding: 12, borderRadius: 8, marginBottom: 8 }}>
                <Text style={{ color: colors.silver }}>Silver: ${formatCurrency(silverBreakeven)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{silverSpot >= silverBreakeven ? '✅ Profitable!' : `Need +$${formatCurrency(silverBreakeven - silverSpot)}`}</Text>
              </View>
              <View style={{ backgroundColor: `${colors.gold}22`, padding: 12, borderRadius: 8 }}>
                <Text style={{ color: colors.gold }}>Gold: ${formatCurrency(goldBreakeven)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{goldSpot >= goldBreakeven ? '✅ Profitable!' : `Need +$${formatCurrency(goldBreakeven - goldSpot)}`}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.card} onPress={exportCSV}>
              <Text style={styles.cardTitle}>📤 Export CSV</Text>
              <Text style={{ color: colors.muted }}>Download holdings spreadsheet</Text>
            </TouchableOpacity>
          </>
        )}

        {/* SETTINGS TAB */}
        {tab === 'settings' && (
          <>
            <View style={styles.card}>
              <Text style={styles.cardTitle}>☁️ Cloud Backup</Text>
              <Text style={{ color: colors.muted, marginBottom: 16 }}>Save to iCloud, Google Drive, or any cloud storage</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <TouchableOpacity style={[styles.button, { flex: 1, backgroundColor: colors.success }]} onPress={createBackup}>
                  <Text style={{ color: '#000', fontWeight: '600' }}>📤 Backup</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.buttonOutline, { flex: 1 }]} onPress={restoreBackup}>
                  <Text style={{ color: colors.text }}>📥 Restore</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>⚙️ Settings</Text>

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
                <View style={{ marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
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

            <View style={styles.card}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={{ color: colors.muted }}>Stack Tracker Pro v1.0.2</Text>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Help & Tips</Text>
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
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Advanced</Text>

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

        <View style={{ height: tab === 'settings' ? 300 : 100 }} />
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
      <View style={styles.bottomTabs}>
        {[
          { key: 'dashboard', icon: '📊', label: 'Dashboard' },
          { key: 'holdings', icon: '🪙', label: 'Holdings' },
          { key: 'tools', icon: '🧮', label: 'Tools' },
          { key: 'settings', icon: '⚙️', label: 'Settings' },
        ].map(t => (
          <TouchableOpacity key={t.key} style={styles.bottomTab} onPress={() => setTab(t.key)}>
            <Text style={{ fontSize: 20 }}>{t.icon}</Text>
            <Text style={{ color: tab === t.key ? colors.text : colors.muted, fontSize: 10 }}>{t.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* ADD/EDIT MODAL - Custom with sticky save button */}
      <Modal visible={showAddModal} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalContent}>
                {/* Header */}
                <View style={styles.modalHeader}>
                  <Text style={styles.modalTitle}>{editingItem ? 'Edit' : 'Add'} Purchase</Text>
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
                    style={styles.closeButton}
                    hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
                  >
                    <Text style={styles.closeButtonText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* Tap to dismiss hint */}
                <TouchableOpacity onPress={Keyboard.dismiss} style={styles.dismissHint}>
                  <Text style={{ color: '#52525b', fontSize: 11 }}>Tap here to hide keyboard</Text>
                </TouchableOpacity>

                {/* Scrollable Content */}
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 20 }}
                >
                  {scanStatus && (
                    <View style={[styles.scanStatus, { backgroundColor: scanStatus === 'success' ? `${colors.success}22` : scanStatus === 'error' ? `${colors.error}22` : `${colors.gold}22` }]}>
                      <Text style={{ color: scanStatus === 'success' ? colors.success : scanStatus === 'error' ? colors.error : colors.gold }}>{scanMessage}</Text>
                    </View>
                  )}

                  <View style={[styles.card, { backgroundColor: 'rgba(148,163,184,0.1)' }]}>
                    <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12 }}>📷 AI Receipt Scanner</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.silver, flex: 1 }]} onPress={() => scanReceipt('camera')}>
                        <Text style={{ color: '#000' }}>📷 Take Photo</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.button, { backgroundColor: colors.silver, flex: 1 }]} onPress={() => scanReceipt('gallery')}>
                        <Text style={{ color: '#000' }}>🖼️ Upload Photo</Text>
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
                    <TouchableOpacity style={[styles.metalTab, { borderColor: metalTab === 'silver' ? colors.silver : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'silver' ? `${colors.silver}22` : 'transparent' }]} onPress={() => setMetalTab('silver')}>
                      <Text style={{ color: metalTab === 'silver' ? colors.silver : colors.muted }}>🥈 Silver</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.metalTab, { borderColor: metalTab === 'gold' ? colors.gold : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'gold' ? `${colors.gold}22` : 'transparent' }]} onPress={() => setMetalTab('gold')}>
                      <Text style={{ color: metalTab === 'gold' ? colors.gold : colors.muted }}>🥇 Gold</Text>
                    </TouchableOpacity>
                  </View>

                  <FloatingInput label="Product Name *" value={form.productName} onChangeText={v => setForm(p => ({ ...p, productName: v }))} placeholder="American Silver Eagle" />
                  <FloatingInput label="Dealer" value={form.source} onChangeText={v => setForm(p => ({ ...p, source: v }))} placeholder="APMEX" />
                  <FloatingInput label="Date (YYYY-MM-DD)" value={form.datePurchased} onChangeText={handleDateChange} placeholder="2025-12-25" />

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="OZT per unit *" value={form.ozt} onChangeText={v => setForm(p => ({ ...p, ozt: v }))} placeholder="1" keyboardType="decimal-pad" /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Quantity" value={form.quantity} onChangeText={v => setForm(p => ({ ...p, quantity: v }))} placeholder="1" keyboardType="number-pad" /></View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Unit Price *" value={form.unitPrice} onChangeText={v => setForm(p => ({ ...p, unitPrice: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Spot at Purchase" value={form.spotPrice} onChangeText={v => { setForm(p => ({ ...p, spotPrice: v })); setSpotPriceSource(null); }} placeholder="Auto" keyboardType="decimal-pad" prefix="$" /></View>
                  </View>

                  {/* Warning for inaccurate historical spot prices */}
                  {(spotPriceSource === 'static-json' || spotPriceSource === 'static-json-nearest') && (
                    <Text style={{ color: '#E69500', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      ⚠️ Daily price unavailable - using monthly average. You can edit this manually.
                    </Text>
                  )}
                  {(spotPriceSource === 'current-fallback' || spotPriceSource === 'client-fallback') && (
                    <Text style={{ color: '#E69500', fontSize: 12, marginTop: -4, marginBottom: 4 }}>
                      ⚠️ Historical price unavailable - using today's spot. You can edit this manually.
                    </Text>
                  )}

                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <View style={{ flex: 1 }}><FloatingInput label="Taxes" value={form.taxes} onChangeText={v => setForm(p => ({ ...p, taxes: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" /></View>
                    <View style={{ flex: 1 }}><FloatingInput label="Shipping" value={form.shipping} onChangeText={v => setForm(p => ({ ...p, shipping: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" /></View>
                  </View>

                  <View style={[styles.card, { backgroundColor: `${colors.gold}15` }]}>
                    <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8 }}>Premium (Auto-calculated)</Text>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      <View style={{ flex: 1 }}><FloatingInput label="Per Unit" value={form.premium} onChangeText={v => setForm(p => ({ ...p, premium: v }))} keyboardType="decimal-pad" prefix="$" /></View>
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
                <View style={styles.stickyButtonContainer}>
                  <TouchableOpacity style={[styles.button, { backgroundColor: currentColor }]} onPress={savePurchase}>
                    <Text style={{ color: '#000', fontWeight: '600' }}>{editingItem ? 'Update' : 'Add'} Purchase</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* SPECULATION MODAL */}
      <ModalWrapper
        visible={showSpeculationModal}
        onClose={() => setShowSpeculationModal(false)}
        title="🔮 What If..."
      >
        {/* Inputs at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
          <View style={{ flex: 1 }}><FloatingInput label="Silver Price" value={specSilverPrice} onChangeText={setSpecSilverPrice} keyboardType="decimal-pad" prefix="$" /></View>
          <View style={{ flex: 1 }}><FloatingInput label="Gold Price" value={specGoldPrice} onChangeText={setSpecGoldPrice} keyboardType="decimal-pad" prefix="$" /></View>
        </View>

        {/* Quick presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          {[
            { s: 100, g: 5000, label: 'Bull' },
            { s: 150, g: 7500, label: 'Moon 🚀' },
            { s: 500, g: 15000, label: 'Hyper' },
          ].map((preset, i) => (
            <TouchableOpacity key={i} style={{ backgroundColor: 'rgba(255,255,255,0.1)', padding: 12, borderRadius: 12, marginRight: 8 }} onPress={() => { setSpecSilverPrice(preset.s.toString()); setSpecGoldPrice(preset.g.toString()); Keyboard.dismiss(); }}>
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
      >
        {/* Type selector at TOP */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 16 }}>
          {[{ k: '90', l: '90%' }, { k: '40', l: '40%' }, { k: '35', l: 'War Nickels' }].map(t => (
            <TouchableOpacity key={t.k} style={[styles.metalTab, { flex: 1, borderColor: junkType === t.k ? colors.silver : 'rgba(255,255,255,0.1)', backgroundColor: junkType === t.k ? `${colors.silver}22` : 'transparent' }]} onPress={() => { setJunkType(t.k); Keyboard.dismiss(); }}>
              <Text style={{ color: junkType === t.k ? colors.silver : colors.muted, fontSize: 12 }}>{t.l}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Input */}
        <FloatingInput label={junkType === '35' ? '# of Nickels' : 'Face Value ($)'} value={junkFaceValue} onChangeText={setJunkFaceValue} keyboardType="decimal-pad" prefix={junkType === '35' ? '' : '$'} />

        {/* Results */}
        <View style={[styles.card, { backgroundColor: `${colors.silver}22` }]}>
          <Text style={{ color: colors.silver }}>Silver Content</Text>
          <Text style={{ color: colors.text, fontSize: 28, fontWeight: '700' }}>{junkOzt.toFixed(3)} oz</Text>
        </View>

        <View style={[styles.card, { backgroundColor: `${colors.success}22` }]}>
          <Text style={{ color: colors.success }}>Melt Value @ ${formatCurrency(silverSpot)}/oz</Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>${formatCurrency(junkMeltValue)}</Text>
        </View>

        <View style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 12, borderRadius: 8 }}>
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
      >
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.success }]}>✅ What We Do</Text>
          <Text style={styles.privacyItem}>• Store data locally on YOUR device</Text>
          <Text style={styles.privacyItem}>• Process receipts in memory only</Text>
          <Text style={styles.privacyItem}>• Delete images immediately</Text>
        </View>
        <View style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.error }]}>❌ What We DON'T Do</Text>
          <Text style={styles.privacyItem}>• Store your data on servers</Text>
          <Text style={styles.privacyItem}>• Track your holdings</Text>
          <Text style={styles.privacyItem}>• Share any information</Text>
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
      >
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Getting Started</Text>
          <Text style={styles.privacyItem}>• Add purchases manually by tapping "+" on the Holdings tab</Text>
          <Text style={styles.privacyItem}>• Or use AI Receipt Scanner to automatically extract data from receipts and invoices</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>AI Receipt Scanner</Text>
          <Text style={styles.privacyItem}>• Tap "Take Photo" to capture a receipt with your camera</Text>
          <Text style={styles.privacyItem}>• Tap "Upload Photo" to select an existing image from your gallery</Text>
          <Text style={styles.privacyItem}>• The AI will extract product name, quantity, price, dealer, and date</Text>
          <Text style={styles.privacyItem}>• Review and edit the extracted data before saving</Text>
          <Text style={[styles.privacyItem, { marginTop: 8 }]}>• Free users get 5 scans per month (resets monthly)</Text>
          <Text style={styles.privacyItem}>• Gold/Lifetime subscribers get unlimited scans</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Backup & Restore</Text>
          <Text style={styles.privacyItem}>• Your data is stored locally on your device only - we can't access it</Text>
          <Text style={styles.privacyItem}>• Use "Backup" to save your portfolio to iCloud Drive, Google Drive, or any cloud storage</Text>
          <Text style={styles.privacyItem}>• Use "Restore" to load a backup onto this device or a new device</Text>
          <View style={{ backgroundColor: 'rgba(251, 191, 36, 0.15)', padding: 10, borderRadius: 8, marginTop: 8 }}>
            <Text style={{ color: colors.gold, fontSize: 13, fontWeight: '600' }}>⚠️ IMPORTANT: Backup regularly to avoid data loss!</Text>
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Using Multiple Devices</Text>
          <Text style={styles.privacyItem}>• Stack Tracker Pro does not automatically sync between devices</Text>
          <Text style={[styles.privacyItem, { marginTop: 8 }]}>• To use on multiple devices (iPhone + iPad):</Text>
          <Text style={[styles.privacyItem, { paddingLeft: 12 }]}>1. Backup from your primary device</Text>
          <Text style={[styles.privacyItem, { paddingLeft: 12 }]}>2. Restore on your secondary device</Text>
          <Text style={[styles.privacyItem, { marginTop: 8, color: colors.muted, fontSize: 12 }]}>Note: Changes on one device won't appear on the other unless you backup and restore again</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Export CSV</Text>
          <Text style={styles.privacyItem}>• Export your entire portfolio as a CSV spreadsheet</Text>
          <Text style={styles.privacyItem}>• Use for your own records, tax preparation, or importing to other tools</Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Support</Text>
          <Text style={styles.privacyItem}>• Need help? Email stacktrackerpro@gmail.com</Text>
          <Text style={[styles.privacyItem, { marginTop: 4, color: colors.muted, fontSize: 12 }]}>Include your Support ID (found in Settings → Advanced) for faster assistance</Text>
        </View>
      </ModalWrapper>

      {/* Gold Paywall */}
      <GoldPaywall
        visible={showPaywallModal}
        onClose={() => setShowPaywallModal(false)}
        onPurchaseSuccess={checkEntitlements}
      />

      {/* Scanned Items Preview Modal */}
      <ModalWrapper
        visible={showScannedItemsPreview}
        onClose={() => {
          setShowScannedItemsPreview(false);
          setScannedItems([]);
          setScannedMetadata({ purchaseDate: '', dealer: '' });
        }}
        title="Receipt Scanned"
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
          const itemColor = item.metal === 'silver' ? colors.silver : colors.gold;
          const totalValue = item.unitPrice * item.quantity;

          return (
            <View key={index} style={[styles.card, { marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName}</Text>
                  <Text style={{ color: itemColor, fontSize: 12, marginTop: 2 }}>
                    {item.metal.toUpperCase()} • {item.ozt} oz{item.quantity > 1 ? ` • Qty: ${item.quantity}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.success, fontWeight: '600', fontSize: 16 }}>
                  ${totalValue.toFixed(2)}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                <Text style={{ color: colors.muted, fontSize: 11 }}>
                  ${item.unitPrice.toFixed(2)} per item
                </Text>
                {item.spotPrice > 0 && (
                  <Text style={{ color: colors.muted, fontSize: 11 }}>
                    Spot: ${item.spotPrice.toFixed(2)}
                  </Text>
                )}
              </View>

              {item.premium !== 0 && (
                <Text style={{ color: item.premium > 0 ? colors.gold : colors.error, fontSize: 11, marginTop: 2 }}>
                  Premium: ${item.premium.toFixed(2)}
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
                onPress={() => editScannedItem(index)}
              >
                <Text style={{ color: colors.gold, fontSize: 12, fontWeight: '600' }}>✏️ Edit</Text>
              </TouchableOpacity>
            </View>
          );
        })}

        <View style={{ marginTop: 16 }}>
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

      {/* Import Preview Modal */}
      {/* Import Preview Modal - Custom structure for FlatList */}
      <Modal visible={showImportPreview} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Import Preview</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowImportPreview(false);
                  setImportData([]);
                }}
                style={styles.closeButton}
                hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
              >
                <Text style={styles.closeButtonText}>✕</Text>
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

                return (
                  <View style={[styles.card, { marginBottom: 12, padding: 12, borderLeftWidth: 3, borderLeftColor: itemColor, marginHorizontal: 20 }]}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontWeight: '600', fontSize: 14 }}>{item.productName}</Text>
                        <Text style={{ color: itemColor, fontSize: 12, marginTop: 2 }}>
                          {item.metal.toUpperCase()} • {item.ozt} oz{item.quantity > 1 ? ` • Qty: ${item.quantity}` : ''}
                        </Text>
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
      >
        {detailItem && (
          <>
            <View style={styles.card}>
              <Text style={[styles.cardTitle, { fontSize: 20 }]}>{detailItem.productName}</Text>
              {detailItem.datePurchased && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>📅 Purchase Date</Text>
                  <Text style={styles.statRowValue}>{detailItem.datePurchased}</Text>
                </View>
              )}
              {detailItem.source && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>🏪 Source</Text>
                  <Text style={styles.statRowValue}>{detailItem.source}</Text>
                </View>
              )}
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Quantity</Text>
                <Text style={styles.statRowValue}>{detailItem.quantity}x</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Unit Price</Text>
                <Text style={styles.statRowValue}>${formatCurrency(detailItem.unitPrice)}</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Troy Ounces (each)</Text>
                <Text style={styles.statRowValue}>{detailItem.ozt} oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Total Weight</Text>
                <Text style={styles.statRowValue}>{(detailItem.ozt * detailItem.quantity).toFixed(2)} oz</Text>
              </View>
              <View style={styles.divider} />
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
                  <Text style={styles.statRowValue}>${formatCurrency(detailItem.taxes)}</Text>
                </View>
              )}
              {detailItem.shipping > 0 && (
                <View style={styles.statRow}>
                  <Text style={styles.statRowLabel}>Shipping</Text>
                  <Text style={styles.statRowValue}>${formatCurrency(detailItem.shipping)}</Text>
                </View>
              )}
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={[styles.statRowLabel, { fontSize: 14, fontWeight: '600' }]}>Total Cost Basis</Text>
                <Text style={[styles.statRowValue, { fontSize: 16 }]}>
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
      >
        <TouchableOpacity
          style={[styles.card, sortBy === 'date-newest' && { backgroundColor: 'rgba(251,191,36,0.15)', borderColor: colors.gold }]}
          onPress={() => {
            setSortBy('date-newest');
            setShowSortMenu(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }}
        >
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>📅 Date (Newest First)</Text>
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
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>📅 Date (Oldest First)</Text>
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
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>💰 Value (High to Low)</Text>
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
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>💰 Value (Low to High)</Text>
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
          <Text style={[styles.cardTitle, { marginBottom: 0 }]}>🔤 Name (A-Z)</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Alphabetical by product name</Text>
        </TouchableOpacity>
      </ModalWrapper>

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
  dismissHint: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },

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
