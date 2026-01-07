/**
 * Stack Tracker Pro - Gold Paywall Component
 * Premium subscription paywall with RevenueCat integration
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  ActivityIndicator,
  Alert,
  Platform,
  TextInput,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import * as Haptics from 'expo-haptics';
import { restorePurchases } from '../utils/entitlements';

const PRIVACY_URL = 'https://stack-tracker-pro-production.up.railway.app/privacy';
const TERMS_URL = 'https://stack-tracker-pro-production.up.railway.app/terms';

const GoldPaywall = ({ visible, onClose, onPurchaseSuccess }) => {
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    if (visible) {
      loadOfferings();
    }
  }, [visible]);

  const loadOfferings = async () => {
    try {
      setLoading(true);
      const offerings = await Purchases.getOfferings();
      if (offerings.current !== null) {
        setOfferings(offerings.current);
      } else {
        // No offerings available - will show fallback UI
        if (__DEV__) console.log('No offerings available, showing coming soon UI');
        setOfferings(null);
      }
    } catch (error) {
      // Error loading offerings - will show fallback UI
      if (__DEV__) console.log('Error loading offerings:', error);
      setOfferings(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async (packageToPurchase) => {
    try {
      // Haptic feedback when starting purchase
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      setPurchasing(packageToPurchase.identifier);
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      // Safety check for entitlements
      const activeEntitlements = customerInfo?.entitlements?.active || {};
      if (activeEntitlements['Gold']) {
        // Success haptic
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        Alert.alert(
          'Welcome to Gold!',
          'Your subscription is now active. Enjoy unlimited items!',
          [{ text: 'Start Stacking', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }}]
        );
      }
    } catch (error) {
      if (!error.userCancelled) {
        console.error('Purchase error:', error);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Purchase Failed', error.message);
      }
    } finally {
      setPurchasing(null);
    }
  };

  const handleRestore = async () => {
    try {
      setRestoring(true);
      const hasGold = await restorePurchases();

      if (hasGold) {
        Alert.alert(
          'Purchases Restored!',
          'Your Gold subscription has been restored.',
          [{ text: 'Continue', onPress: () => {
            onPurchaseSuccess?.();
            onClose();
          }}]
        );
      } else {
        Alert.alert('No Purchases Found', 'No active subscriptions were found to restore.');
      }
    } catch (error) {
      console.error('Restore error:', error);
      Alert.alert('Restore Failed', 'Could not restore purchases. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const renderPackage = (pkg, title, description, isPopular = false) => {
    const isPurchasing = purchasing === pkg.identifier;

    return (
      <TouchableOpacity
        key={pkg.identifier}
        style={[
          styles.packageCard,
          isPopular && styles.popularPackage,
        ]}
        onPress={() => handlePurchase(pkg)}
        disabled={isPurchasing || loading}
      >
        {isPopular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>MOST POPULAR</Text>
          </View>
        )}

        <View style={styles.packageHeader}>
          <Text style={styles.packageTitle}>{title}</Text>
          <Text style={styles.packagePrice}>
            {pkg.product.priceString}
          </Text>
        </View>

        <Text style={styles.packageDescription}>{description}</Text>

        {isPurchasing ? (
          <ActivityIndicator color="#fbbf24" style={{ marginTop: 12 }} />
        ) : (
          <View style={styles.subscribeButton}>
            <Text style={styles.subscribeButtonText}>Subscribe</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.goldIcon}>
              <Text style={styles.goldIconText}>👑</Text>
            </View>
            <Text style={styles.title}>Upgrade to Gold</Text>
            <Text style={styles.subtitle}>
              Unlock unlimited precious metals tracking
            </Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Features */}
          <View style={styles.featuresSection}>
            <Feature icon="∞" text="Unlimited gold & silver items" />
            <Feature icon="📷" text="AI receipt scanning" />
            <Feature icon="📊" text="Advanced analytics" />
            <Feature icon="📥" text="Cloud backup & sync" />
          </View>

          {/* Packages */}
          <ScrollView
            style={styles.packagesScroll}
            showsVerticalScrollIndicator={false}
          >
            {loading ? (
              <ActivityIndicator size="large" color="#fbbf24" style={{ marginTop: 40 }} />
            ) : offerings ? (
              <>
                {offerings.monthly && renderPackage(
                  offerings.monthly,
                  'Monthly',
                  'Perfect for trying out Gold tier'
                )}
                {offerings.annual && renderPackage(
                  offerings.annual,
                  'Yearly',
                  'Save 33% compared to monthly',
                  true
                )}
                {offerings.lifetime && renderPackage(
                  offerings.lifetime,
                  'Lifetime',
                  'One-time payment, stack forever'
                )}
              </>
            ) : (
              <View style={styles.errorContainer}>
                <Text style={styles.errorIcon}>⚠️</Text>
                <Text style={styles.errorTitle}>Unable to Load Subscriptions</Text>
                <Text style={styles.errorMessage}>
                  Could not connect to the subscription service. Please check your internet connection and try again.
                </Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={loadOfferings}
                >
                  <Text style={styles.retryButtonText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}
          </ScrollView>

          {/* Legal Links */}
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => Linking.openURL(PRIVACY_URL)}>
              <Text style={styles.legalLinkText}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalSeparator}>|</Text>
            <TouchableOpacity onPress={() => Linking.openURL(TERMS_URL)}>
              <Text style={styles.legalLinkText}>Terms of Use</Text>
            </TouchableOpacity>
          </View>

          {/* Restore Button */}
          <TouchableOpacity
            onPress={handleRestore}
            style={styles.restoreButton}
            disabled={restoring}
          >
            {restoring ? (
              <ActivityIndicator size="small" color="#a1a1aa" />
            ) : (
              <Text style={styles.restoreButtonText}>Restore Purchases</Text>
            )}
          </TouchableOpacity>

          {/* Footer */}
          <Text style={styles.footer}>
            Subscription automatically renews. Cancel anytime in App Store or Google Play.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const Feature = ({ icon, text }) => (
  <View style={styles.feature}>
    <Text style={styles.featureIcon}>{icon}</Text>
    <Text style={styles.featureText}>{text}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.9)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#1a1a2e',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 24,
    paddingBottom: Platform.OS === 'ios' ? 34 : 24,
    maxHeight: '90%',
  },
  header: {
    alignItems: 'center',
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  goldIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#fbbf24',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  goldIconText: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  closeButton: {
    position: 'absolute',
    top: 0,
    right: 24,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeButtonText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '600',
  },
  featuresSection: {
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  feature: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  featureIcon: {
    fontSize: 20,
    marginRight: 12,
    width: 24,
  },
  featureText: {
    fontSize: 16,
    color: '#d4d4d8',
    flex: 1,
  },
  packagesScroll: {
    paddingHorizontal: 24,
  },
  packageCard: {
    backgroundColor: '#27293d',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    borderWidth: 2,
    borderColor: 'transparent',
    position: 'relative',
  },
  popularPackage: {
    borderColor: '#fbbf24',
    backgroundColor: '#2a2a3e',
  },
  popularBadge: {
    position: 'absolute',
    top: -10,
    right: 20,
    backgroundColor: '#fbbf24',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  popularText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  packageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  packageTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
  },
  packagePrice: {
    fontSize: 24,
    fontWeight: '700',
    color: '#fbbf24',
  },
  packageDescription: {
    fontSize: 14,
    color: '#a1a1aa',
    marginBottom: 12,
  },
  subscribeButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  subscribeButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
  noOfferings: {
    color: '#a1a1aa',
    textAlign: 'center',
    marginTop: 40,
    fontSize: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 16,
    gap: 8,
  },
  legalLinkText: {
    fontSize: 13,
    color: '#a1a1aa',
    textDecorationLine: 'underline',
  },
  legalSeparator: {
    fontSize: 13,
    color: '#52525b',
  },
  restoreButton: {
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 12,
  },
  restoreButtonText: {
    fontSize: 15,
    color: '#a1a1aa',
    textDecorationLine: 'underline',
  },
  footer: {
    fontSize: 11,
    color: '#71717a',
    textAlign: 'center',
    paddingHorizontal: 24,
    marginTop: 8,
  },
  errorContainer: {
    alignItems: 'center',
    padding: 32,
    marginTop: 20,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorMessage: {
    fontSize: 15,
    color: '#a1a1aa',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  retryButton: {
    backgroundColor: '#fbbf24',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 8,
  },
  retryButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});

export default GoldPaywall;
