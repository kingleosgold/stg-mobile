/**
 * Supabase Client Configuration
 *
 * Used for:
 * - ETF ratio calibration storage
 * - Minute-level price logging
 * - Historical price lookups
 * - Push token registration
 * - Price alert sync
 *
 * IMPORTANT: Uses service role key to bypass RLS for backend operations.
 * The anon key is for client-side access with RLS; the backend needs
 * unrestricted access to manage push tokens and alerts across all users.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
// Use service role key for backend (bypasses RLS) — fall back to anon key
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

// Only initialize if credentials are configured
let supabase = null;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
  const keyType = process.env.SUPABASE_SERVICE_ROLE_KEY ? 'service_role' : 'anon';
  console.log(`✅ Supabase client initialized (${keyType} key)`);
} else {
  console.warn('⚠️ Supabase credentials not configured - database features disabled');
}

/**
 * Check if Supabase is available
 */
function isSupabaseAvailable() {
  return supabase !== null;
}

/**
 * Get the Supabase client (may be null if not configured)
 */
function getSupabase() {
  return supabase;
}

module.exports = {
  supabase,
  isSupabaseAvailable,
  getSupabase
};
