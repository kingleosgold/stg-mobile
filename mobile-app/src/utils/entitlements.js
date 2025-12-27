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
    return customerInfo.entitlements.active['Gold'] !== undefined;
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
    return {
      hasGold: customerInfo.entitlements.active['Gold'] !== undefined,
      entitlements: customerInfo.entitlements.active,
      originalAppUserId: customerInfo.originalAppUserId,
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
 */
export const initializePurchases = async (apiKey) => {
  try {
    await Purchases.configure({ apiKey });
    if (__DEV__) console.log('RevenueCat initialized successfully');
  } catch (error) {
    console.error('Failed to initialize RevenueCat:', error);
  }
};

/**
 * Restore previous purchases
 * @returns {Promise<boolean>} True if restoration was successful
 */
export const restorePurchases = async () => {
  try {
    const customerInfo = await Purchases.restorePurchases();
    const hasGold = customerInfo.entitlements.active['Gold'] !== undefined;
    return hasGold;
  } catch (error) {
    console.error('Error restoring purchases:', error);
    throw error;
  }
};
