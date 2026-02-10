/**
 * Price Alerts Service
 *
 * Handles price alert CRUD operations and push notifications.
 * Gold/Lifetime subscribers only.
 */

const { Expo } = require('expo-server-sdk');
const { getSupabase, isSupabaseAvailable } = require('../supabaseClient');

const expo = new Expo();

/**
 * Create a new price alert
 */
async function createAlert({ userId, metal, targetPrice, direction, pushToken }) {
  if (!isSupabaseAvailable()) {
    throw new Error('Database not available');
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('price_alerts')
    .insert({
      user_id: userId,
      metal,
      target_price: targetPrice,
      direction,
      push_token: pushToken,
      enabled: true,
      triggered: false,
    })
    .select()
    .single();

  if (error) {
    console.error('Error creating alert:', error);
    throw error;
  }

  console.log(`🔔 Alert created: ${metal} ${direction} $${targetPrice} for user ${userId.substring(0, 8)}...`);
  return data;
}

/**
 * Get all alerts for a user
 */
async function getAlertsForUser(userId) {
  if (!isSupabaseAvailable()) {
    throw new Error('Database not available');
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching alerts:', error);
    throw error;
  }

  return data || [];
}

/**
 * Delete an alert
 */
async function deleteAlert(alertId, userId) {
  if (!isSupabaseAvailable()) {
    throw new Error('Database not available');
  }

  const supabase = getSupabase();

  // Delete only if the alert belongs to the user
  const { error } = await supabase
    .from('price_alerts')
    .delete()
    .eq('id', alertId)
    .eq('user_id', userId);

  if (error) {
    console.error('Error deleting alert:', error);
    throw error;
  }

  console.log(`🗑️ Alert ${alertId} deleted`);
  return true;
}

/**
 * Check all active alerts against current prices and send notifications
 */
async function checkAlerts(currentPrices) {
  console.log('🔔 [priceAlerts.checkAlerts] Called with prices:', currentPrices);

  if (!isSupabaseAvailable()) {
    console.log('🔔 [priceAlerts.checkAlerts] Database not available, skipping');
    return { checked: 0, triggered: 0 };
  }

  const supabase = getSupabase();

  // Get all active, non-triggered alerts
  const { data: alerts, error } = await supabase
    .from('price_alerts')
    .select('*')
    .eq('enabled', true)
    .eq('triggered', false);

  if (error) {
    console.error('🔔 [priceAlerts.checkAlerts] Error fetching alerts:', error);
    return { checked: 0, triggered: 0, error: error.message };
  }

  if (!alerts || alerts.length === 0) {
    console.log('🔔 [priceAlerts.checkAlerts] No active alerts found');
    return { checked: 0, triggered: 0 };
  }

  console.log(`🔔 [priceAlerts.checkAlerts] Found ${alerts.length} active alerts`);

  console.log(`🔍 Checking ${alerts.length} active alerts...`);

  const triggeredAlerts = [];
  const notifications = [];

  for (const alert of alerts) {
    const currentPrice = alert.metal === 'gold' ? currentPrices.gold : currentPrices.silver;
    const targetPrice = parseFloat(alert.target_price);

    let isTriggered = false;

    if (alert.direction === 'above' && currentPrice >= targetPrice) {
      isTriggered = true;
    } else if (alert.direction === 'below' && currentPrice <= targetPrice) {
      isTriggered = true;
    }

    if (isTriggered) {
      triggeredAlerts.push(alert.id);

      // Queue push notification if we have a valid token
      if (alert.push_token && Expo.isExpoPushToken(alert.push_token)) {
        const metalName = alert.metal === 'gold' ? 'Gold' : 'Silver';
        const emoji = alert.metal === 'gold' ? '🥇' : '🥈';

        notifications.push({
          to: alert.push_token,
          sound: 'default',
          title: `${emoji} ${metalName} Price Alert!`,
          body: `${metalName} is now ${alert.direction === 'above' ? 'above' : 'below'} $${targetPrice}/oz (Current: $${currentPrice.toFixed(2)})`,
          data: {
            metal: alert.metal,
            targetPrice,
            currentPrice,
            alertId: alert.id,
          },
        });
      }
    }
  }

  // Mark triggered alerts
  if (triggeredAlerts.length > 0) {
    const { error: updateError } = await supabase
      .from('price_alerts')
      .update({
        triggered: true,
        triggered_at: new Date().toISOString(),
        enabled: false, // Deactivate after triggering
      })
      .in('id', triggeredAlerts);

    if (updateError) {
      console.error('Error marking alerts as triggered:', updateError);
    }

    console.log(`🚨 ${triggeredAlerts.length} alerts triggered!`);
  }

  // Send push notifications
  if (notifications.length > 0) {
    try {
      const chunks = expo.chunkPushNotifications(notifications);
      const tickets = [];

      for (const chunk of chunks) {
        try {
          const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
          tickets.push(...ticketChunk);
        } catch (error) {
          console.error('Error sending push notification chunk:', error);
        }
      }

      console.log(`📱 Sent ${notifications.length} push notifications`);
    } catch (error) {
      console.error('Error sending push notifications:', error);
    }
  }

  return {
    checked: alerts.length,
    triggered: triggeredAlerts.length,
  };
}

/**
 * Get count of active alerts for a user
 */
async function getAlertCount(userId) {
  if (!isSupabaseAvailable()) {
    return 0;
  }

  const supabase = getSupabase();

  const { count, error } = await supabase
    .from('price_alerts')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('enabled', true);

  if (error) {
    console.error('Error counting alerts:', error);
    return 0;
  }

  return count || 0;
}

module.exports = {
  createAlert,
  getAlertsForUser,
  deleteAlert,
  checkAlerts,
  getAlertCount,
};
