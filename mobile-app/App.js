/**
 * Stack Tracker Pro - React Native App
 * Privacy-First Precious Metals Portfolio Tracker
 * "Make Stacking Great Again" Edition 🪙
 */

import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput,
  Alert, Modal, Platform, SafeAreaView, StatusBar, ActivityIndicator,
  Keyboard, TouchableWithoutFeedback, KeyboardAvoidingView, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import * as LocalAuthentication from 'expo-local-authentication';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const API_BASE_URL = 'https://stack-tracker-pro-production.up.railway.app';

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

export default function App() {
  // Core State
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [metalTab, setMetalTab] = useState('silver');

  // Spot Prices - Updated defaults for Dec 2025
  const [silverSpot, setSilverSpot] = useState(77);
  const [goldSpot, setGoldSpot] = useState(4530);
  const [priceSource, setPriceSource] = useState('cached');

  // Portfolio Data
  const [silverItems, setSilverItems] = useState([]);
  const [goldItems, setGoldItems] = useState([]);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);
  const [showSpeculationModal, setShowSpeculationModal] = useState(false);
  const [showJunkCalcModal, setShowJunkCalcModal] = useState(false);

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

  const totalGainLoss = totalMeltValue - totalCostBasis;
  const totalGainLossPct = totalCostBasis > 0 ? ((totalGainLoss / totalCostBasis) * 100) : 0;

  const goldSilverRatio = silverSpot > 0 ? (goldSpot / silverSpot) : 0;

  const avgSilverCostPerOz = totalSilverOzt > 0 ? (silverCostBasis / totalSilverOzt) : 0;
  const avgGoldCostPerOz = totalGoldOzt > 0 ? (goldCostBasis / totalGoldOzt) : 0;

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
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();

      if (hasHardware && isEnrolled) {
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Stack Tracker Pro',
          fallbackLabel: 'Use Passcode',
        });
        if (result.success) {
          setIsAuthenticated(true);
          loadData();
        }
      } else {
        setIsAuthenticated(true);
        loadData();
      }
    } catch (e) {
      setIsAuthenticated(true);
      loadData();
    }
  };

  const loadData = async () => {
    try {
      const [silver, gold, silverS, goldS] = await Promise.all([
        AsyncStorage.getItem('stack_silver'),
        AsyncStorage.getItem('stack_gold'),
        AsyncStorage.getItem('stack_silver_spot'),
        AsyncStorage.getItem('stack_gold_spot'),
      ]);

      if (silver) setSilverItems(JSON.parse(silver));
      if (gold) setGoldItems(JSON.parse(gold));
      if (silverS) setSilverSpot(parseFloat(silverS));
      if (goldS) setGoldSpot(parseFloat(goldS));

      fetchSpotPrices();
    } catch (error) {
      console.error('Error loading data:', error);
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
    if (isAuthenticated) saveData('stack_silver', silverItems);
  }, [silverItems, isAuthenticated]);

  useEffect(() => {
    if (isAuthenticated) saveData('stack_gold', goldItems);
  }, [goldItems, isAuthenticated]);

  useEffect(() => { authenticate(); }, []);

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

  const fetchSpotPrices = async () => {
    setPriceSource('loading...');
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(`${API_BASE_URL}/api/spot-prices`, {
        signal: controller.signal
      });
      clearTimeout(timeoutId);

      const data = await response.json();
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
      } else {
        setPriceSource('cached');
      }
    } catch (error) {
      console.log('Using cached spot prices:', error.message);
      setPriceSource('cached');
    }
  };

  const fetchHistoricalSpot = async (date, metal) => {
    if (!date || date.length < 10) return null;
    try {
      const response = await fetch(`${API_BASE_URL}/api/historical-spot?date=${date}&metal=${metal || metalTab}`);
      const data = await response.json();
      if (data.success && data.price) return data.price;
    } catch (error) {
      console.log('Could not fetch historical spot');
    }
    return metal === 'gold' ? goldSpot : silverSpot;
  };

  const handleDateChange = async (date) => {
    setForm(prev => ({ ...prev, datePurchased: date }));
    if (date.length === 10) {
      const historicalPrice = await fetchHistoricalSpot(date, metalTab);
      if (historicalPrice) {
        setForm(prev => ({ ...prev, spotPrice: historicalPrice.toString() }));
      }
    }
  };

  // ============================================
  // RECEIPT SCANNING
  // ============================================

  const scanReceipt = async () => {
    const permissionResult = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permissionResult.granted) {
      Alert.alert('Permission Required', 'Please allow access to your photos.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
    if (result.canceled) return;

    setScanStatus('scanning');
    setScanMessage('Analyzing receipt...');

    try {
      const formData = new FormData();
      formData.append('receipt', { uri: result.assets[0].uri, type: 'image/jpeg', name: 'receipt.jpg' });

      console.log('📤 Sending receipt to server...');

      const response = await fetch(`${API_BASE_URL}/api/scan-receipt`, {
        method: 'POST',
        body: formData,
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      console.log('📥 Response status:', response.status);

      const data = await response.json();
      console.log('📄 Full server response:', JSON.stringify(data, null, 2));

      // Server returns data directly in the response (not wrapped in data.data)
      if (data.success) {
        const d = data;
        const extractedMetal = d.metal === 'gold' ? 'gold' : 'silver';
        // Server returns 'purchaseDate', not 'datePurchased'
        const newDate = d.purchaseDate || '';

        setMetalTab(extractedMetal);

        let spotPrice = '';
        if (newDate.length === 10) {
          const historicalPrice = await fetchHistoricalSpot(newDate, extractedMetal);
          if (historicalPrice) spotPrice = historicalPrice.toString();
        }

        const unitPrice = parseFloat(d.unitPrice) || 0;
        const ozt = parseFloat(d.ozt) || 0;
        const spotNum = parseFloat(spotPrice) || 0;
        let premium = '0';
        if (unitPrice > 0 && spotNum > 0 && ozt > 0) {
          premium = (unitPrice - (spotNum * ozt)).toFixed(2);
        }

        setForm({
          // Map server fields to app fields:
          // description -> productName, dealer -> source, purchaseDate -> datePurchased
          productName: d.description || '',
          source: d.dealer || '',
          datePurchased: newDate,
          ozt: d.ozt?.toString() || '',
          quantity: d.quantity?.toString() || '1',
          unitPrice: d.unitPrice?.toString() || '',
          taxes: '0',  // Server doesn't extract taxes
          shipping: '0',  // Server doesn't extract shipping
          spotPrice: spotPrice,
          premium: premium,
        });

        setScanStatus('success');
        setScanMessage('Receipt analyzed!');
        console.log('✅ Receipt scan successful');
      } else {
        console.log('⚠️ Server returned success=false or missing data');
        setScanStatus('error');
        setScanMessage('Could not analyze.');
      }
    } catch (error) {
      console.error('❌ Scan receipt error:', error);
      console.error('Error message:', error.message);
      console.error('Error stack:', error.stack);
      setScanStatus('error');
      setScanMessage('Network error: ' + error.message);
    }

    setTimeout(() => { setScanStatus(null); setScanMessage(''); }, 5000);
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
  };

  const deleteItem = (id, metal) => {
    Alert.alert('Delete Item', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: () => {
          if (metal === 'silver') setSilverItems(prev => prev.filter(i => i.id !== id));
          else setGoldItems(prev => prev.filter(i => i.id !== id));
        },
      },
    ]);
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
    setShowAddModal(true);
  };

  const exportCSV = async () => {
    const all = [
      ...silverItems.map(i => ({ ...i, metal: 'Silver' })),
      ...goldItems.map(i => ({ ...i, metal: 'Gold' })),
    ];

    const headers = 'Metal,Product,Source,Date,OZT,Qty,Unit Price,Taxes,Shipping,Spot,Premium,Total Premium\n';
    const rows = all.map(i =>
      `${i.metal},"${i.productName}","${i.source}",${i.datePurchased},${i.ozt},${i.quantity},${i.unitPrice},${i.taxes},${i.shipping},${i.spotPrice},${i.premium},${i.premium * i.quantity}`
    ).join('\n');

    const filepath = `${FileSystem.documentDirectory}stack-export-${Date.now()}.csv`;
    await FileSystem.writeAsStringAsync(filepath, headers + rows);
    await Sharing.shareAsync(filepath);
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

  const currentColor = metalTab === 'silver' ? colors.silver : colors.gold;
  const items = metalTab === 'silver' ? silverItems : goldItems;
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
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">

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
                <Text style={[styles.statRowValue, { color: colors.gold }]}>${totalPremiumsPaid.toLocaleString(undefined, { minimumFractionDigits: 2 })}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Silver Cost</Text>
                <Text style={styles.statRowValue}>${avgSilverCostPerOz.toFixed(2)}/oz</Text>
              </View>
              <View style={styles.statRow}>
                <Text style={styles.statRowLabel}>Avg Gold Cost</Text>
                <Text style={styles.statRowValue}>${avgGoldCostPerOz.toFixed(2)}/oz</Text>
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
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${silverSpot.toFixed(2)}</Text>
                </View>
                <View style={{ flex: 1, backgroundColor: `${colors.gold}22`, padding: 16, borderRadius: 12 }}>
                  <Text style={{ color: colors.gold, fontSize: 12 }}>🥇 Gold</Text>
                  <Text style={{ color: colors.text, fontSize: 24, fontWeight: '700' }}>${goldSpot.toFixed(2)}</Text>
                </View>
              </View>
              <Text style={{ color: colors.muted, fontSize: 10, textAlign: 'center', marginTop: 8 }}>Source: {priceSource}</Text>
            </View>
          </>
        )}

        {/* HOLDINGS TAB */}
        {tab === 'holdings' && (
          <>
            <View style={styles.metalTabs}>
              <TouchableOpacity
                style={[styles.metalTab, { borderColor: metalTab === 'silver' ? colors.silver : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'silver' ? `${colors.silver}22` : 'transparent' }]}
                onPress={() => setMetalTab('silver')}
              >
                <Text style={{ color: metalTab === 'silver' ? colors.silver : colors.muted, fontWeight: '600' }}>🥈 Silver ({silverItems.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.metalTab, { borderColor: metalTab === 'gold' ? colors.gold : 'rgba(255,255,255,0.1)', backgroundColor: metalTab === 'gold' ? `${colors.gold}22` : 'transparent' }]}
                onPress={() => setMetalTab('gold')}
              >
                <Text style={{ color: metalTab === 'gold' ? colors.gold : colors.muted, fontWeight: '600' }}>🥇 Gold ({goldItems.length})</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={[styles.button, { backgroundColor: currentColor, marginBottom: 16 }]} onPress={() => { resetForm(); setShowAddModal(true); }}>
              <Text style={{ color: '#000', fontWeight: '600' }}>+ Add Purchase</Text>
            </TouchableOpacity>

            {items.map(item => (
              <TouchableOpacity key={item.id} style={styles.itemCard} onPress={() => editItem(item, metalTab)} onLongPress={() => deleteItem(item.id, metalTab)}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.itemTitle}>{item.productName}</Text>
                  <Text style={styles.itemSubtitle}>{item.quantity}x @ ${item.unitPrice.toLocaleString()} • {(item.ozt * item.quantity).toFixed(2)} oz</Text>
                  <Text style={[styles.itemSubtitle, { color: colors.gold }]}>Premium: ${(item.premium * item.quantity).toFixed(2)}</Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.itemValue, { color: currentColor }]}>${(item.ozt * item.quantity * spot).toFixed(2)}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>melt</Text>
                </View>
              </TouchableOpacity>
            ))}

            {items.length === 0 && (
              <View style={styles.emptyState}>
                <Text style={{ fontSize: 48, marginBottom: 16 }}>🪙</Text>
                <Text style={{ color: colors.muted }}>No {metalTab} holdings yet</Text>
              </View>
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
                <Text style={{ color: colors.silver }}>Silver: ${silverBreakeven.toFixed(2)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{silverSpot >= silverBreakeven ? '✅ Profitable!' : `Need +${(silverBreakeven - silverSpot).toFixed(2)}`}</Text>
              </View>
              <View style={{ backgroundColor: `${colors.gold}22`, padding: 12, borderRadius: 8 }}>
                <Text style={{ color: colors.gold }}>Gold: ${goldBreakeven.toFixed(2)}/oz needed</Text>
                <Text style={{ color: colors.muted, fontSize: 11 }}>{goldSpot >= goldBreakeven ? '✅ Profitable!' : `Need +${(goldBreakeven - goldSpot).toFixed(2)}`}</Text>
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
              <TouchableOpacity style={styles.statRow} onPress={exportCSV}>
                <Text style={{ color: colors.text }}>📤 Export CSV</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statRow} onPress={() => setShowPrivacyModal(true)}>
                <Text style={{ color: colors.text }}>🔒 Privacy Info</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.statRow} onPress={fetchSpotPrices}>
                <Text style={{ color: colors.text }}>🔄 Refresh Prices</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>About</Text>
              <Text style={{ color: colors.muted }}>Stack Tracker Pro v1.0.0</Text>
              <Text style={{ color: colors.gold, fontStyle: 'italic', marginTop: 8 }}>"We CAN'T access your data."</Text>
            </View>
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>

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

      {/* ADD/EDIT MODAL */}
      <ModalWrapper
        visible={showAddModal}
        onClose={() => { resetForm(); setShowAddModal(false); }}
        title={`${editingItem ? 'Edit' : 'Add'} Purchase`}
      >
        {scanStatus && (
          <View style={[styles.scanStatus, { backgroundColor: scanStatus === 'success' ? `${colors.success}22` : scanStatus === 'error' ? `${colors.error}22` : `${colors.gold}22` }]}>
            <Text style={{ color: scanStatus === 'success' ? colors.success : scanStatus === 'error' ? colors.error : colors.gold }}>{scanMessage}</Text>
          </View>
        )}

        <View style={[styles.card, { backgroundColor: 'rgba(148,163,184,0.1)' }]}>
          <Text style={{ color: colors.text, fontWeight: '600', marginBottom: 12 }}>📷 AI Receipt Scanner</Text>
          <TouchableOpacity style={[styles.button, { backgroundColor: colors.silver }]} onPress={scanReceipt}>
            <Text style={{ color: '#000' }}>🖼 Scan from Gallery</Text>
          </TouchableOpacity>
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
          <View style={{ flex: 1 }}><FloatingInput label="Spot at Purchase" value={form.spotPrice} onChangeText={v => setForm(p => ({ ...p, spotPrice: v }))} placeholder="Auto" keyboardType="decimal-pad" prefix="$" /></View>
        </View>

        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><FloatingInput label="Taxes" value={form.taxes} onChangeText={v => setForm(p => ({ ...p, taxes: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" /></View>
          <View style={{ flex: 1 }}><FloatingInput label="Shipping" value={form.shipping} onChangeText={v => setForm(p => ({ ...p, shipping: v }))} placeholder="0" keyboardType="decimal-pad" prefix="$" /></View>
        </View>

        <View style={[styles.card, { backgroundColor: `${colors.gold}15` }]}>
          <Text style={{ color: colors.gold, fontWeight: '600', marginBottom: 8 }}>Premium (Auto-calculated)</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}><FloatingInput label="Per Unit" value={form.premium} onChangeText={v => setForm(p => ({ ...p, premium: v }))} keyboardType="decimal-pad" prefix="$" /></View>
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 12 }}>Total: ${(parseFloat(form.premium || 0) * parseInt(form.quantity || 1)).toFixed(2)}</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={[styles.button, { backgroundColor: currentColor, marginTop: 8 }]} onPress={savePurchase}>
          <Text style={{ color: '#000', fontWeight: '600' }}>{editingItem ? 'Update' : 'Add'} Purchase</Text>
        </TouchableOpacity>
      </ModalWrapper>

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
          <Text style={{ color: colors.success }}>Melt Value @ ${silverSpot.toFixed(2)}/oz</Text>
          <Text style={{ color: colors.text, fontSize: 36, fontWeight: '700' }}>${junkMeltValue.toFixed(2)}</Text>
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
    </SafeAreaView>
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
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.9)', justifyContent: 'flex-start', paddingTop: Platform.OS === 'ios' ? 60 : 40 },
  modalKeyboardView: { flex: 1 },
  modalContent: { backgroundColor: '#1a1a2e', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, flex: 1, maxHeight: '95%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.1)' },
  modalTitle: { color: '#fff', fontSize: 20, fontWeight: '700' },
  closeButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 22 },
  closeButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  dismissHint: { alignItems: 'center', paddingVertical: 8, marginBottom: 8 },

  scanStatus: { padding: 12, borderRadius: 10, marginBottom: 16 },
  privacyItem: { color: '#a1a1aa', fontSize: 13, lineHeight: 24 },
});
