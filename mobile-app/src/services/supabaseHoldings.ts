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
}

// Supabase holding structure
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
  notes: string | null;
  metadata: {
    local_id?: number;
    source?: string;
    taxes?: number;
    shipping?: number;
    spot_price?: number;
    premium?: number;
  } | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// Convert local holding to Supabase format
export function localToSupabase(
  holding: LocalHolding,
  metal: 'silver' | 'gold',
  userId: string
): Omit<SupabaseHolding, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  return {
    user_id: userId,
    metal,
    type: holding.productName,
    weight: holding.ozt,
    weight_unit: 'oz',
    quantity: holding.quantity,
    purchase_price: holding.unitPrice,
    purchase_date: holding.datePurchased || null,
    notes: null,
    metadata: {
      local_id: holding.id,
      source: holding.source || undefined,
      taxes: holding.taxes || undefined,
      shipping: holding.shipping || undefined,
      spot_price: holding.spotPrice || undefined,
      premium: holding.premium || undefined,
    },
  };
}

// Convert Supabase holding to local format
export function supabaseToLocal(holding: SupabaseHolding): LocalHolding {
  const metadata = holding.metadata || {};
  return {
    id: metadata.local_id || Date.now(),
    productName: holding.type,
    source: metadata.source || '',
    datePurchased: holding.purchase_date || '',
    ozt: holding.weight,
    quantity: holding.quantity,
    unitPrice: holding.purchase_price,
    taxes: metadata.taxes || 0,
    shipping: metadata.shipping || 0,
    spotPrice: metadata.spot_price || 0,
    premium: metadata.premium || 0,
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
    const updateData = {
      type: holding.productName,
      weight: holding.ozt,
      quantity: holding.quantity,
      purchase_price: holding.unitPrice,
      purchase_date: holding.datePurchased || null,
      metal,
      metadata: {
        local_id: holding.id,
        source: holding.source || undefined,
        taxes: holding.taxes || undefined,
        shipping: holding.shipping || undefined,
        spot_price: holding.spotPrice || undefined,
        premium: holding.premium || undefined,
      },
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

// Find holding by local_id in metadata
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

    // Search for matching local_id in metadata
    const match = (data || []).find((h: SupabaseHolding) =>
      h.metadata?.local_id === localId
    );

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
      .select('metadata')
      .eq('user_id', userId)
      .is('deleted_at', null);

    if (fetchError) throw fetchError;

    // Build set of existing local_ids
    const existingLocalIds = new Set<number>();
    (existingHoldings || []).forEach((h: any) => {
      if (h.metadata?.local_id) {
        existingLocalIds.add(h.metadata.local_id);
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

// Full sync: merge local and remote, preferring remote for conflicts
export async function fullSync(
  userId: string,
  localSilver: LocalHolding[],
  localGold: LocalHolding[]
): Promise<{
  silverItems: LocalHolding[];
  goldItems: LocalHolding[];
  syncedToCloud: number;
  error: Error | null;
}> {
  try {
    // First, upload any local items that don't exist in cloud
    const { syncedCount, error: syncError } = await syncLocalToSupabase(
      userId,
      localSilver,
      localGold
    );

    if (syncError) {
      console.warn('Sync to cloud had errors:', syncError);
    }

    // Then fetch all holdings from cloud (now includes newly synced)
    const { silverItems, goldItems, error: fetchError } = await fetchHoldings(userId);

    if (fetchError) throw fetchError;

    return {
      silverItems,
      goldItems,
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
