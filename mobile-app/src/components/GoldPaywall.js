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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Purchases from 'react-native-purchases';
import { restorePurchases } from '../utils/entitlements';

const GoldPaywall = ({ visible, onClose, onPurchaseSuccess }) => {
  const [offerings, setOfferings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [purchasing, setPurchasing] = useState(null);
  const [restoring, setRestoring] = useState(false);
  const [notifyEmail, setNotifyEmail] = useState('');
  const [notifySaved, setNotifySaved] = useState(false);

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

  const handleNotifyMe = async () => {
    if (!notifyEmail || !notifyEmail.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return;
    }

    try {
      // Save email to AsyncStorage
      await AsyncStorage.setItem('gold_notify_email', notifyEmail);
      setNotifySaved(true);

      Alert.alert(
        'Thanks!',
        "We'll notify you when Gold memberships are available.",
        [{ text: 'Got it', onPress: onClose }]
      );
    } catch (error) {
      console.error('Error saving email:', error);
      Alert.alert('Error', 'Could not save email. Please try again.');
    }
  };

  const handlePurchase = async (packageToPurchase) => {
    try {
      setPurchasing(packageToPurchase.identifier);
      const { customerInfo } = await Purchases.purchasePackage(packageToPurchase);

      if (customerInfo.entitlements.active['Gold']) {
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

  // Fallback UI when offerings aren't available yet
  const renderFallbackPackage = (title, price, description, isPopular = false) => {
    return (
      <View
        key={title}
        style={[
          styles.packageCard,
          isPopular && styles.popularPackage,
          { opacity: 0.7 },
        ]}
      >
        {isPopular && (
          <View style={styles.popularBadge}>
            <Text style={styles.popularText}>MOST POPULAR</Text>
          </View>
        )}

        <View style={styles.packageHeader}>
          <Text style={styles.packageTitle}>{title}</Text>
          <Text style={styles.packagePrice}>{price}</Text>
        </View>

        <Text style={styles.packageDescription}>{description}</Text>

        <View style={[styles.subscribeButton, { backgroundColor: '#52525b' }]}>
          <Text style={styles.subscribeButtonText}>Coming Soon</Text>
        </View>
      </View>
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
              <>
                {/* Coming Soon Message */}
                <View style={styles.comingSoonContainer}>
                  <Text style={styles.comingSoonTitle}>🚀 Coming Soon!</Text>
                  <Text style={styles.comingSoonMessage}>
                    Gold memberships are being activated. Your developer account is being set up with Apple and Google.
                  </Text>
                  <Text style={[styles.comingSoonMessage, { marginTop: 8, fontSize: 14 }]}>
                    Try again in 24 hours, or leave your email to be notified when it's ready!
                  </Text>
                </View>

                {/* Static Pricing Preview */}
                {renderFallbackPackage(
                  'Monthly',
                  '$4.99/mo',
                  'Perfect for trying out Gold tier'
                )}
                {renderFallbackPackage(
                  'Yearly',
                  '$39.99/yr',
                  'Save 33% compared to monthly',
                  true
                )}
                {renderFallbackPackage(
                  'Lifetime',
                  '$29.99',
                  'One-time payment, stack forever'
                )}

                {/* Notify Me Section */}
                <View style={styles.notifyContainer}>
                  <Text style={styles.notifyLabel}>Get notified when Gold launches:</Text>
                  <TextInput
                    style={styles.notifyInput}
                    placeholder="your@email.com"
                    placeholderTextColor="#52525b"
                    value={notifyEmail}
                    onChangeText={setNotifyEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <TouchableOpacity
                    style={[
                      styles.notifyButton,
                      notifySaved && { backgroundColor: '#22c55e' }
                    ]}
                    onPress={handleNotifyMe}
                    disabled={notifySaved}
                  >
                    <Text style={styles.notifyButtonText}>
                      {notifySaved ? '✓ You\'ll be notified!' : 'Notify Me'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </ScrollView>

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
  comingSoonContainer: {
    backgroundColor: 'rgba(251, 191, 36, 0.1)',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(251, 191, 36, 0.3)',
  },
  comingSoonTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#fbbf24',
    marginBottom: 8,
    textAlign: 'center',
  },
  comingSoonMessage: {
    fontSize: 15,
    color: '#d4d4d8',
    textAlign: 'center',
    lineHeight: 22,
  },
  notifyContainer: {
    marginTop: 20,
    padding: 16,
    backgroundColor: '#27293d',
    borderRadius: 12,
  },
  notifyLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#fff',
    marginBottom: 12,
    textAlign: 'center',
  },
  notifyInput: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    fontSize: 16,
    color: '#fff',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
  },
  notifyButton: {
    backgroundColor: '#fbbf24',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  notifyButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1a1a2e',
  },
});

export default GoldPaywall;
