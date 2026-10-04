const rawUrl = (window.SUPABASE_URL || 'YOUR_SUPABASE_URL').trim();
const rawAnonKey = (window.SUPABASE_ANON_KEY || 'YOUR_SUPABASE_ANON_KEY').trim();

const supabaseConfig = {
  url: rawUrl,
  anonKey: rawAnonKey,
  enabled: Boolean(
    rawUrl &&
      rawAnonKey &&
      !rawUrl.includes('YOUR_SUPABASE_URL') &&
      !rawAnonKey.includes('YOUR_SUPABASE_ANON_KEY') &&
      window.supabase
  )
};

let supabaseClient;
let cartRealtimeChannel;

function getSupabaseClient() {
  if (!supabaseConfig.enabled || !window.supabase) {
    return null;
  }

  if (!supabaseClient) {
    supabaseClient = window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey);
  }

  return supabaseClient;
}

async function signInWithGoogle() {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error('Supabase is not configured.') };
  }

  return client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}${window.location.pathname}`
    }
  });
}

async function signInAdminWithGoogle() {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error('Supabase is not configured.') };
  }

  return client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${window.location.origin}/admin.html`
    }
  });
}

async function getCurrentUser() {
  const client = getSupabaseClient();
  if (!client) {
    return { user: null, error: new Error('Supabase is not configured.') };
  }

  const { data, error } = await client.auth.getUser();
  return { user: data?.user || null, error };
}

async function signOutFromSupabase() {
  const client = getSupabaseClient();
  if (!client) {
    return { error: new Error('Supabase is not configured.') };
  }

  return client.auth.signOut();
}

function normalizeCartRows(rows) {
  return (rows || []).map((item) => ({
    productId: item.product_id,
    size: item.size,
    quantity: Number(item.quantity)
  }));
}

async function fetchUserCart() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Sign in to load your shared cart.');

  const { data, error } = await client
    .from('cart_items')
    .select('product_id, size, quantity')
    .eq('user_id', userId)
    .order('updated_at', { ascending: true });

  if (error) throw error;
  return normalizeCartRows(data);
}

async function addUserCartItem(productId, size, quantity = 1) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { data, error } = await client.rpc('cart_add_item', {
    p_product_id: productId,
    p_size: size,
    p_quantity: quantity
  });
  if (error) throw error;
  return normalizeCartRows(data);
}

async function setUserCartQuantity(productId, size, quantity) {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { data, error } = await client.rpc('cart_set_quantity', {
    p_product_id: productId,
    p_size: size,
    p_quantity: quantity
  });
  if (error) throw error;
  return normalizeCartRows(data);
}

async function mergeGuestCart(items) {
  if (!items.length) return fetchUserCart();

  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { error } = await client.rpc('cart_merge_guest_items', { p_items: items });
  if (error) throw error;
  return fetchUserCart();
}

async function clearUserCart() {
  const client = getSupabaseClient();
  if (!client) throw new Error('Supabase is not configured.');

  const { data: sessionData, error: sessionError } = await client.auth.getSession();
  if (sessionError) throw sessionError;
  const userId = sessionData.session?.user.id;
  if (!userId) throw new Error('Sign in to update your shared cart.');

  const { error } = await client.from('cart_items').delete().eq('user_id', userId);
  if (error) throw error;
}

function watchUserCart(userId, onCartChanged) {
  const client = getSupabaseClient();
  if (!client) return;

  if (cartRealtimeChannel) {
    client.removeChannel(cartRealtimeChannel);
    cartRealtimeChannel = null;
  }

  cartRealtimeChannel = client
    .channel(`cart-items-${userId}`)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'cart_items',
        filter: `user_id=eq.${userId}`
      },
      () => {
        fetchUserCart()
          .then(onCartChanged)
          .catch((error) => console.error('Could not refresh shared cart:', error));
      }
    )
    .subscribe((status, error) => {
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.error('Shared cart realtime subscription failed:', error || status);
      }
    });
}

function stopWatchingUserCart() {
  const client = getSupabaseClient();
  if (!client || !cartRealtimeChannel) return;
  client.removeChannel(cartRealtimeChannel);
  cartRealtimeChannel = null;
}

function normalizeProduct(product) {
  return {
    ...product,
    price: Number(product.price) || 0,
    category: product.category || 'Uncategorized',
    image: product.image || 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80',
    sizes: Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ['One Size']
  };
}

async function fetchProductsFromSupabase() {
  if (!supabaseConfig.enabled || !window.supabase) {
    console.info('Supabase is not configured; using sample products.');
    return sampleProducts;
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return sampleProducts;
    }

    const { data, error } = await supabase.from('products').select('*');

    if (error) {
      throw error;
    }

    if (!data || !data.length) {
      console.info('Supabase products table is empty; using sample products.');
      return sampleProducts;
    }

    console.info(`Loaded ${data.length} products from Supabase.`);
    return data.map(normalizeProduct);
  } catch (error) {
    console.error('Supabase fetch error:', error);
    return sampleProducts;
  }
}

async function saveOrderToSupabase(orderData) {
  if (!supabaseConfig.enabled || !window.supabase) {
    console.info('Supabase is not configured; checkout is running in demo mode.');
    return { success: true, persisted: false, data: null };
  }

  try {
    const supabase = getSupabaseClient();
    if (!supabase) {
      return { success: false, error: new Error('Supabase client is unavailable.') };
    }

    const { data, error } = await supabase.rpc('place_order', {
      p_customer: orderData.customer,
      p_items: orderData.items
    });

    if (error) {
      throw error;
    }

    return { success: true, persisted: true, data: data && data[0] };
  } catch (error) {
    console.error('Supabase order save error:', error);
    return { success: false, error };
  }
}

window.supabaseConfig = supabaseConfig;
window.getSupabaseClient = getSupabaseClient;
window.signInWithGoogle = signInWithGoogle;
window.signInAdminWithGoogle = signInAdminWithGoogle;
window.getCurrentUser = getCurrentUser;
window.signOutFromSupabase = signOutFromSupabase;
window.fetchUserCart = fetchUserCart;
window.addUserCartItem = addUserCartItem;
window.setUserCartQuantity = setUserCartQuantity;
window.mergeGuestCart = mergeGuestCart;
window.clearUserCart = clearUserCart;
window.watchUserCart = watchUserCart;
window.stopWatchingUserCart = stopWatchingUserCart;
window.fetchProductsFromSupabase = fetchProductsFromSupabase;
window.saveOrderToSupabase = saveOrderToSupabase;
