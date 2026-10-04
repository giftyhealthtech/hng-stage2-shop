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
window.fetchProductsFromSupabase = fetchProductsFromSupabase;
window.saveOrderToSupabase = saveOrderToSupabase;
