/**
 * Expo Push Notifications Service
 * 
 * Sends push notifications via Expo Push Notification API
 * Documentation: https://docs.expo.dev/push-notifications/sending-notifications/
 */

const axios = require('axios');

const EXPO_PUSH_API_URL = 'https://exp.host/--/api/v2/push/send';

/**
 * Send a push notification via Expo
 * 
 * @param {string} expoPushToken - Expo push token (ExponentPushToken[...])
 * @param {object} notification - Notification content
 * @param {string} notification.title - Notification title
 * @param {string} notification.body - Notification body
 * @param {object} notification.data - Optional data payload
 * @param {string} notification.sound - Sound to play (default: 'default')
 * @param {string} notification.priority - Priority (default: 'high')
 * @param {number} notification.badge - Badge count (iOS)
 * @returns {Promise<object>} Expo API response
 */
async function sendPushNotification(expoPushToken, notification) {
  if (!expoPushToken || !expoPushToken.startsWith('ExponentPushToken[')) {
    throw new Error(`Invalid Expo push token: ${expoPushToken}`);
  }

  const message = {
    to: expoPushToken,
    sound: notification.sound || 'default',
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    priority: notification.priority || 'high',
    badge: notification.badge || undefined,
    channelId: 'default', // Android notification channel
  };

  try {
    console.log(`📤 Sending push notification to ${expoPushToken.substring(0, 30)}...`);
    console.log(`   Title: ${message.title}`);
    console.log(`   Body: ${message.body}`);

    const response = await axios.post(EXPO_PUSH_API_URL, message, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: 10000,
    });

    const result = response.data;
    console.log('✅ Push notification sent successfully:', result);

    // Check for errors in response
    if (result.data && result.data.length > 0) {
      const ticket = result.data[0];
      if (ticket.status === 'error') {
        console.error('❌ Expo push error:', ticket.message, ticket.details);
        return {
          success: false,
          error: ticket.message,
          details: ticket.details,
          ticket,
        };
      }

      return {
        success: true,
        ticket,
        receiptId: ticket.id,
      };
    }

    return { success: true, result };
  } catch (error) {
    console.error('❌ Failed to send push notification:', error.message);
    
    if (error.response) {
      console.error('   Response status:', error.response.status);
      console.error('   Response data:', JSON.stringify(error.response.data));
    }

    throw error;
  }
}

/**
 * Send push notifications to multiple recipients (batch)
 * 
 * @param {Array<{token: string, notification: object}>} notifications - Array of token/notification pairs
 * @returns {Promise<Array<object>>} Array of results
 */
async function sendBatchPushNotifications(notifications) {
  const messages = notifications.map(({ token, notification }) => ({
    to: token,
    sound: notification.sound || 'default',
    title: notification.title,
    body: notification.body,
    data: notification.data || {},
    priority: notification.priority || 'high',
    badge: notification.badge || undefined,
    channelId: 'default',
  }));

  try {
    console.log(`📤 Sending batch of ${messages.length} push notifications...`);

    const response = await axios.post(EXPO_PUSH_API_URL, messages, {
      headers: {
        'Accept': 'application/json',
        'Accept-encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
      },
      timeout: 30000, // Longer timeout for batch
    });

    const tickets = response.data.data || [];
    console.log(`✅ Batch sent, ${tickets.length} tickets received`);

    return tickets.map((ticket, index) => ({
      token: notifications[index].token,
      success: ticket.status !== 'error',
      ticket,
      error: ticket.status === 'error' ? ticket.message : null,
    }));
  } catch (error) {
    console.error('❌ Failed to send batch push notifications:', error.message);
    throw error;
  }
}

/**
 * Check receipt status for a push notification
 * Used to verify delivery after sending
 * 
 * @param {string} receiptId - Receipt ID from sendPushNotification
 * @returns {Promise<object>} Receipt status
 */
async function checkPushReceipt(receiptId) {
  try {
    const response = await axios.post(
      'https://exp.host/--/api/v2/push/getReceipts',
      { ids: [receiptId] },
      {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    const receipt = response.data.data[receiptId];
    
    if (!receipt) {
      return { found: false };
    }

    return {
      found: true,
      status: receipt.status, // 'ok' or 'error'
      message: receipt.message,
      details: receipt.details,
    };
  } catch (error) {
    console.error('❌ Failed to check push receipt:', error.message);
    throw error;
  }
}

/**
 * Validate if a token is a valid Expo push token format
 * 
 * @param {string} token - Token to validate
 * @returns {boolean} True if valid format
 */
function isValidExpoPushToken(token) {
  return (
    typeof token === 'string' &&
    token.startsWith('ExponentPushToken[') &&
    token.endsWith(']') &&
    token.length > 20
  );
}

module.exports = {
  sendPushNotification,
  sendBatchPushNotifications,
  checkPushReceipt,
  isValidExpoPushToken,
};
