import { supabase } from '../lib/supabase';

// Local holding structure (from App.js)
export interface LocalHolding {
  id: number;
  productName: string;
  source: string;
  datePurchased: string;
  ozt: number;
  quantity: number;
  unitPrice: number;
  taxes: number;
  shipping: number;
  spotPrice: number;
  premium: number;
  costBasis?: number; // Optional: manually adjusted total cost basis
}

// Supabase holding structure
// Note: Extra fields (local_id, source, taxes, shipping, spot_price, premium) are stored as JSON in notes
export interface SupabaseHolding {
  id: string;
  user_id: string;
  metal: 'silver' | 'gold' | 'platinum' | 'palladium';
  type: string; // productName
  weight: number; // ozt
  weight_unit: string;
  quantity: number;
  purchase_price: number; // unitPrice
  purchase_date: string | null;
  notes: string | null; // JSON string containing extra fields
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Extra data stored in notes as JSON
interface HoldingNotes {
  local_id?: number;
  source?: string;
  taxes?: number;
  shipping?: number;
  spot_price?: number;
  premium?: number;
  cost_basis?: number;
}

// Validate and format date for Supabase (must be YYYY-MM-DD or null)
function formatDateForSupabase(dateStr: string | undefined | null): string | null {
  if (!dateStr || dateStr.trim() === '') return null;

  // Check if already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try to parse and reformat
  try {
    const date = new Date(dateStr);
    if (!isNaN(date.getTime())) {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      if (y >= 1900 && y <= 2100) {
        return `${y}-${m}-${d}`;
      }
    }
  } catch (e) {
    // Ignore parse errors
  }

  // Invalid date - return null to prevent Supabase error 22008
  console.warn('Invalid date format, setting to null:', dateStr);
  return null;
}

// Convert local holding to Supabase format
export function localToSupabase(
  holding: LocalHolding,
  metal: 'silver' | 'gold',
  userId: string
): Omit<SupabaseHolding, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  // Store extra fields in notes as JSON
  const notesData: HoldingNotes = {
    local_id: holding.id,
    source: holding.source || undefined,
    taxes: holding.taxes || undefined,
    shipping: holding.shipping || undefined,
    spot_price: holding.spotPrice || undefined,
    premium: holding.premium || undefined,
    cost_basis: holding.costBasis || undefined,
  };

  return {
    user_id: userId,
    metal,
    type: holding.productName,
    weight: holding.ozt,
    weight_unit: 'oz',
    quantity: holding.quantity,
    purchase_price: holding.unitPrice,
    purchase_date: formatDateForSupabase(holding.datePurchased),
    notes: JSON.stringify(notesData),
  };
}

// Convert Supabase holding to local format
export function supabaseToLocal(holding: SupabaseHolding): LocalHolding {
  // Parse extra fields from notes JSON
  let notesData: HoldingNotes = {};
  if (holding.notes) {
    try {
      notesData = JSON.parse(holding.notes);
    } catch (e) {
      // notes might be plain text, not JSON
      console.warn('Could not parse notes as JSON:', holding.notes);
    }
  }

  return {
    id: notesData.local_id || Date.now(),
    productName: holding.type || '',
    source: notesData.source || '',
    datePurchased: holding.purchase_date || '',
    ozt: holding.weight || 0,
    quantity: holding.quantity || 1,
    unitPrice: holding.purchase_price || 0,
    taxes: notesData.taxes || 0,
    shipping: notesData.shipping || 0,
    spotPrice: notesData.spot_price || 0,
    premium: notesData.premium || 0,
    costBasis: notesData.cost_basis,
  };
}

// Fetch all holdings for a user
export async function fetchHoldings(userId: string): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  error: Error | null;
}> {
  try {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw error;

    const silverItems: LocalHolding[] = [];
    const goldItems: LocalHolding[] = [];

    (data || []).forEach((holding: SupabaseHolding) => {
      const localHolding = supabaseToLocal(holding);
      // Attach supabase_id for future updates
      (localHolding as any).supabase_id = holding.id;

      if (holding.metal === 'silver') {
        silverItems.push(localHolding);
      } else if (holding.metal === 'gold') {
        goldItems.push(localHolding);
      }
    });

    return { silverItems, goldItems, error: null };
  } catch (err) {
    console.error('Error fetching holdings:', err);
    return { silverItems: [], goldItems: [], error: err as Error };
  }
}

// Add a new holding
export async function addHolding(
  userId: string,
  holding: LocalHolding,
  metal: 'silver' | 'gold'
): Promise<{ data: SupabaseHolding | null; error: Error | null }> {
  try {
    const supabaseHolding = localToSupabase(holding, metal, userId);

    const { data, error } = await supabase
      .from('holdings')
      .insert(supabaseHolding)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err) {
    console.error('Error adding holding:', err);
    return { data: null, error: err as Error };
  }
}

// Update an existing holding
export async function updateHolding(
  supabaseId: string,
  holding: LocalHolding,
  metal: 'silver' | 'gold'
): Promise<{ data: SupabaseHolding | null; error: Error | null }> {
  try {
    // Store extra fields in notes as JSON
    const notesData: HoldingNotes = {
      local_id: holding.id,
      source: holding.source || undefined,
      taxes: holding.taxes || undefined,
      shipping: holding.shipping || undefined,
      spot_price: holding.spotPrice || undefined,
      premium: holding.premium || undefined,
      cost_basis: holding.costBasis || undefined,
    };

    const updateData = {
      type: holding.productName,
      weight: holding.ozt,
      quantity: holding.quantity,
      purchase_price: holding.unitPrice,
      purchase_date: formatDateForSupabase(holding.datePurchased),
      metal,
      notes: JSON.stringify(notesData),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from('holdings')
      .update(updateData)
      .eq('id', supabaseId)
      .select()
      .single();

    if (error) throw error;

    return { data, error: null };
  } catch (err) {
    console.error('Error updating holding:', err);
    return { data: null, error: err as Error };
  }
}

// Soft delete a holding
export async function deleteHolding(
  supabaseId: string
): Promise<{ error: Error | null }> {
  try {
    const { error } = await supabase
      .from('holdings')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', supabaseId);

    if (error) throw error;

    return { error: null };
  } catch (err) {
    console.error('Error deleting holding:', err);
    return { error: err as Error };
  }
}

// Find holding by local_id in notes JSON
export async function findHoldingByLocalId(
  userId: string,
  localId: number,
  metal: 'silver' | 'gold'
): Promise<SupabaseHolding | null> {
  try {
    const { data, error } = await supabase
      .from('holdings')
      .select('*')
      .eq('user_id', userId)
      .eq('metal', metal)
      .is('deleted_at', null);

    if (error) throw error;

    // Search for matching local_id in notes JSON
    const match = (data || []).find((h: SupabaseHolding) => {
      if (!h.notes) return false;
      try {
        const notesData = JSON.parse(h.notes);
        return notesData.local_id === localId;
      } catch (e) {
        return false;
      }
    });

    return match || null;
  } catch (err) {
    console.error('Error finding holding by local ID:', err);
    return null;
  }
}

// Sync local holdings to Supabase (for first-time migration)
export async function syncLocalToSupabase(
  userId: string,
  silverItems: LocalHolding[],
  goldItems: LocalHolding[]
): Promise<{
  syncedCount: number;
  skippedCount: number;
  error: Error | null;
}> {
  let syncedCount = 0;
  let skippedCount = 0;

  try {
    // Get existing holdings to avoid duplicates
    const { data: existingHoldings, error: fetchError } = await supabase
      .from('holdings')
      .select('notes')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    // Build set of existing local_ids (stored in notes JSON)
    const existingLocalIds = new Set<number>();
    (existingHoldings || []).forEach((h: any) => {
      if (h.notes) {
        try {
          const notesData = JSON.parse(h.notes);
          if (notesData.local_id) {
            existingLocalIds.add(notesData.local_id);
          }
        } catch (e) {
          // Ignore parse errors
        }
      }
    });

    // Prepare holdings to insert
    const holdingsToInsert: any[] = [];

    // Process silver items
    for (const item of silverItems) {
      if (existingLocalIds.has(item.id)) {
        skippedCount++;
        continue;
      }
      holdingsToInsert.push(localToSupabase(item, 'silver', userId));
    }

    // Process gold items
    for (const item of goldItems) {
      if (existingLocalIds.has(item.id)) {
        skippedCount++;
        continue;
      }
      holdingsToInsert.push(localToSupabase(item, 'gold', userId));
    }

    // Batch insert
    if (holdingsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('holdings')
        .insert(holdingsToInsert);

      if (insertError) throw insertError;

      syncedCount = holdingsToInsert.length;
    }

    return { syncedCount, skippedCount, error: null };
  } catch (err) {
    console.error('Error syncing local to Supabase:', err);
    return { syncedCount, skippedCount, error: err as Error };
  }
}

// Full sync: Supabase is source of truth when signed in
// Only uploads local holdings if Supabase is empty (first-time migration)
export async function fullSync(
  userId: string,
  localSilver: LocalHolding[],
  localGold: LocalHolding[],
  isFirstSync: boolean = false
): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  syncedToCloud: number;
  error: Error | null;
}> {
  try {
    // First, fetch what's in Supabase (source of truth)
    const { silverItems: remoteSilver, goldItems: remoteGold, error: fetchError } = await fetchHoldings(userId);

    if (fetchError) throw fetchError;

    const hasRemoteData = remoteSilver.length > 0 || remoteGold.length > 0;
    const hasLocalData = localSilver.length > 0 || localGold.length > 0;

    // If this is first sync AND Supabase is empty AND we have local data,
    // migrate local holdings to Supabase
    let syncedCount = 0;
    if (isFirstSync && !hasRemoteData && hasLocalData) {
      console.log('First sync with empty Supabase - migrating local holdings...');
      const { syncedCount: uploaded, error: syncError } = await syncLocalToSupabase(
        userId,
        localSilver,
        localGold
      );

      if (syncError) {
        console.warn('Migration to cloud had errors:', syncError);
      } else {
        syncedCount = uploaded;
        // Re-fetch after migration to get the items with supabase_ids
        const { silverItems: newSilver, goldItems: newGold } = await fetchHoldings(userId);
        return {
          silverItems: newSilver,
          goldItems: newGold,
          syncedToCloud: syncedCount,
          error: null,
        };
      }
    }

    // Return Supabase holdings as source of truth
    // This REPLACES local holdings, not merges
    return {
      silverItems: remoteSilver,
      goldItems: remoteGold,
      syncedToCloud: syncedCount,
      error: null,
    };
  } catch (err) {
    console.error('Error in full sync:', err);
    return {
      silverItems: localSilver,
      goldItems: localGold,
      syncedToCloud: 0,
      error: err as Error,
    };
  }
}
