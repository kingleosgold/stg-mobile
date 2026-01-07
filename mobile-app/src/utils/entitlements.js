/**
 * Stack Tracker Pro - Entitlements Utility
 * RevenueCat entitlement checking functions
 */

import Purchases from 'react-native-purchases';

/**
 * Check if user has Gold entitlement (premium subscription)
 * @returns {Promise<boolean>} True if user has active Gold entitlement
 */
export const hasGoldEntitlement = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return activeEntitlements['Gold'] !== undefined;
  } catch (error) {
    if (__DEV__) console.log('Error checking Gold entitlement:', error);
    return false;
  }
};

/**
 * Get all user entitlements
 * @returns {Promise<object>} Customer info with all entitlements
 */
export const getUserEntitlements = async () => {
  try {
    const customerInfo = await Purchases.getCustomerInfo();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    return {
      hasGold: activeEntitlements['Gold'] !== undefined,
      entitlements: activeEntitlements,
      originalAppUserId: customerInfo?.originalAppUserId || null,
    };
  } catch (error) {
    if (__DEV__) console.log('Error getting user entitlements:', error);
    return {
      hasGold: false,
      entitlements: {},
      originalAppUserId: null,
    };
  }
};

/**
 * Initialize RevenueCat Purchases SDK
 * @param {string} apiKey - RevenueCat API key
 * @returns {Promise<boolean>} True if initialization succeeded
 */
export const initializePurchases = async (apiKey) => {
  try {
    // Validate apiKey before calling configure
    if (!apiKey || typeof apiKey !== 'string' || apiKey.length < 10) {
      console.error('Invalid RevenueCat API key provided');
      return false;
    }

    // Check if Purchases is available
    if (!Purchases || typeof Purchases.configure !== 'function') {
      console.error('RevenueCat Purchases SDK not available');
      return false;
    }

    await Purchases.configure({ apiKey });
    if (__DEV__) console.log('RevenueCat initialized successfully');
    return true;
  } catch (error) {
    // Log error details but don't crash
    console.error('Failed to initialize RevenueCat:', error?.message || error);
    return false;
  }
};

/**
 * Restore previous purchases
 * @returns {Promise<boolean>} True if restoration was successful
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    // Safety check for entitlements
    const activeEntitlements = customerInfo?.entitlements?.active || {};
    const hasGold = activeEntitlements['Gold'] !== undefined;
    return hasGold;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};
