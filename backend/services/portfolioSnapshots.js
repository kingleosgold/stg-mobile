/**
 * Portfolio Snapshots Service
 *
 * Handles daily portfolio snapshot storage for analytics charts.
 * Gold/Lifetime subscribers only.
 */

const { getSupabase, isSupabaseAvailable } = require('../supabaseClient');

/**
 * Save or update a daily portfolio snapshot
 * Uses upsert to ensure only one snapshot per user per day
 */
async function saveSnapshot({
  userId,
  totalValue,
  goldValue,
  silverValue,
  goldOz,
  silverOz,
  goldSpot,
  silverSpot,
}) {
  if (!isSupabaseAvailable()) {
    throw new Error('Database not available');
  }

  const supabase = getSupabase();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .upsert(
      {
        user_id: userId,
        date: today,
        total_value: totalValue,
        gold_value: goldValue,
        silver_value: silverValue,
        gold_oz: goldOz,
        silver_oz: silverOz,
        gold_spot: goldSpot,
        silver_spot: silverSpot,
      },
      {
        onConflict: 'user_id,date',
      }
    )
    .select()
    .single();

  if (error) {
    console.error('Error saving snapshot:', error);
    throw error;
  }

  console.log(`📊 Snapshot saved for user ${userId.substring(0, 8)}... on ${today}`);
  return data;
}

/**
 * Get portfolio snapshots for a user within a date range
 *
 * @param {string} userId - User ID
 * @param {string} range - Time range: '1W', '1M', '3M', '6M', '1Y', 'all'
 */
async function getSnapshots(userId, range = '1M') {
  if (!isSupabaseAvailable()) {
    console.log('⚠️ Supabase not available for getSnapshots');
    return []; // Return empty array instead of throwing
  }

  const supabase = getSupabase();

  // Calculate start date based on range
  const now = new Date();
  let startDate;

  switch (range.toUpperCase()) {
    case '1W':
      startDate = new Date(now.setDate(now.getDate() - 7));
      break;
    case '1M':
      startDate = new Date(now.setMonth(now.getMonth() - 1));
      break;
    case '3M':
      startDate = new Date(now.setMonth(now.getMonth() - 3));
      break;
    case '6M':
      startDate = new Date(now.setMonth(now.getMonth() - 6));
      break;
    case '1Y':
      startDate = new Date(now.setFullYear(now.getFullYear() - 1));
      break;
    case 'ALL':
    default:
      startDate = new Date('2020-01-01'); // Far back enough to get all data
      break;
  }

  const startDateStr = startDate.toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('date', startDateStr)
    .order('date', { ascending: true });

  if (error) {
    console.error('Error fetching snapshots:', error.message || error);
    // Return empty array instead of throwing - allows app to calculate historical data
    return [];
  }

  console.log(`📊 Retrieved ${data?.length || 0} snapshots for user ${userId.substring(0, 8)}...`);
  return data || [];
}

/**
 * Get the most recent snapshot for a user
 */
async function getLatestSnapshot(userId) {
  if (!isSupabaseAvailable()) {
    return null;
  }

  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('portfolio_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .single();

  if (error && error.code !== 'PGRST116') {
    // PGRST116 is "no rows returned"
    console.error('Error fetching latest snapshot:', error);
    return null;
  }

  return data;
}

/**
 * Get snapshot count for a user
 */
async function getSnapshotCount(userId) {
  if (!isSupabaseAvailable()) {
    return 0;
  }

  const supabase = getSupabase();

  const { count, error } = await supabase
    .from('portfolio_snapshots')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  if (error) {
    console.error('Error counting snapshots:', error);
    return 0;
  }

  return count || 0;
}

/**
 * Delete old snapshots (keep last 365 days)
 * Can be called periodically for cleanup
 */
async function cleanupOldSnapshots(userId) {
  if (!isSupabaseAvailable()) {
    return 0;
  }

  const supabase = getSupabase();
  const cutoffDate = new Date();
  cutoffDate.setFullYear(cutoffDate.getFullYear() - 1);
  const cutoffDateStr = cutoffDate.toISOString().split('T')[0];

  const { error, count } = await supabase
    .from('portfolio_snapshots')
    .delete({ count: 'exact' })
    .eq('user_id', userId)
    .lt('date', cutoffDateStr);

  if (error) {
    console.error('Error cleaning up snapshots:', error);
    return 0;
  }

  if (count > 0) {
    console.log(`🧹 Cleaned up ${count} old snapshots for user ${userId.substring(0, 8)}...`);
  }

  return count || 0;
}

module.exports = {
  saveSnapshot,
  getSnapshots,
  getLatestSnapshot,
  getSnapshotCount,
  cleanupOldSnapshots,
};
