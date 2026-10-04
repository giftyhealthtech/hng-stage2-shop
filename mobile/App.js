import 'react-native-url-polyfill/auto';
import 'react-native-get-random-values';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  FlatList,
  Image,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import * as ExpoLinking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

WebBrowser.maybeCompleteAuthSession();

const GUEST_CART_KEY = 'maisonEtoileGuestCart';
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce'
      }
    })
  : null;

export default function App() {
  const [session, setSession] = useState(null);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedSizes, setSelectedSizes] = useState({});
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(Boolean(supabase));
  const [busyItem, setBusyItem] = useState('');
  const sessionRef = useRef(null);
  const cartSyncUserRef = useRef(null);
  const cartSyncPromiseRef = useRef(null);

  const productById = useMemo(
    () => new Map(products.map((product) => [String(product.id), product])),
    [products]
  );

  const showError = useCallback((error, fallback) => {
    console.error(fallback, error);
    setStatus(error?.message || fallback);
  }, []);

  const fetchCart = useCallback(async () => {
    if (!supabase) return [];
    const { data: cartRows, error } = await supabase
      .from('cart_items')
      .select('product_id, size, quantity')
      .order('updated_at', { ascending: true });
    if (error) throw error;

    const normalized = (cartRows || []).map((item) => ({
      productId: item.product_id,
      size: item.size,
      quantity: Number(item.quantity)
    }));
    setCart(normalized);
    return normalized;
  }, []);

  const fetchProducts = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase
      .from('products')
      .select('id, name, price, description, category, image, sizes')
      .order('created_at', { ascending: false });
    if (error) throw error;
    setProducts((data || []).map((product) => ({
      ...product,
      price: Number(product.price),
      sizes: Array.isArray(product.sizes) && product.sizes.length ? product.sizes : ['One Size']
    })));
  }, []);

  const mergeGuestCart = useCallback(async () => {
    const saved = await AsyncStorage.getItem(GUEST_CART_KEY);
    const guestItems = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(guestItems) || guestItems.length === 0) {
      await fetchCart();
      return;
    }

    const { error } = await supabase.rpc('cart_merge_guest_items', { p_items: guestItems });
    if (error) throw error;
    await AsyncStorage.removeItem(GUEST_CART_KEY);
    await fetchCart();
    setStatus('Guest cart merged with your account.');
  }, [fetchCart]);

  const handleSession = useCallback(async (newSession) => {
    sessionRef.current = newSession;
    setSession(newSession);
    if (!newSession?.user) {
      cartSyncUserRef.current = null;
      cartSyncPromiseRef.current = null;
      const saved = await AsyncStorage.getItem(GUEST_CART_KEY);
      setCart(saved ? JSON.parse(saved) : []);
      return;
    }

    if (cartSyncUserRef.current === newSession.user.id) return;
    if (cartSyncPromiseRef.current) return cartSyncPromiseRef.current;

    cartSyncPromiseRef.current = mergeGuestCart();
    try {
      await cartSyncPromiseRef.current;
      cartSyncUserRef.current = newSession.user.id;
    } finally {
      cartSyncPromiseRef.current = null;
    }
  }, [mergeGuestCart]);

  useEffect(() => {
    if (!supabase) {
      setStatus('Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env.local.');
      setLoading(false);
      return undefined;
    }

    let mounted = true;
    const initialize = async () => {
      try {
        const [{ data, error: sessionError }] = await Promise.all([
          supabase.auth.getSession(),
          fetchProducts()
        ]);
        if (sessionError) throw sessionError;
        if (mounted) await handleSession(data.session);
      } catch (error) {
        if (mounted) showError(error, 'Could not initialize the shop.');
      } finally {
        if (mounted) setLoading(false);
      }
    };

    initialize();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setTimeout(() => {
        if (mounted) {
          handleSession(newSession).catch((error) => showError(error, 'Could not sync your cart.'));
        }
      }, 0);
    });

    const appStateListener = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active' && mounted && sessionRef.current?.user) {
        fetchCart().catch((error) => showError(error, 'Could not refresh your cart.'));
      }
    });

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
      appStateListener.remove();
    };
  }, [fetchCart, fetchProducts, handleSession, showError]);

  useEffect(() => {
    if (!supabase || !session?.user) return undefined;

    const channel = supabase
      .channel(`mobile-cart-${session.user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cart_items',
          filter: `user_id=eq.${session.user.id}`
        },
        () => {
          fetchCart().catch((error) => showError(error, 'Could not refresh your cart.'));
        }
      )
      .subscribe((subscriptionStatus, error) => {
        if (subscriptionStatus === 'CHANNEL_ERROR' || subscriptionStatus === 'TIMED_OUT') {
          showError(error, `Cart live updates unavailable (${subscriptionStatus}).`);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchCart, session?.user?.id, showError]);

  const signInWithGoogle = async () => {
    if (!supabase) return;
    setStatus('Opening Google sign-in…');
    const redirectTo = ExpoLinking.createURL('auth/callback', { scheme: 'maisonetoile' });
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo,
        skipBrowserRedirect: true,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
    if (!data.url) throw new Error('Supabase did not return a Google sign-in URL.');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') {
      setStatus(result.type === 'cancel' ? 'Sign-in cancelled.' : 'Sign-in was closed.');
      return;
    }

    const callbackUrl = new URL(result.url);
    const callbackError = callbackUrl.searchParams.get('error_description')
      || callbackUrl.searchParams.get('error');
    if (callbackError) throw new Error(callbackError);

    const code = callbackUrl.searchParams.get('code');
    if (!code) throw new Error('Google sign-in did not return an authorization code.');
    const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
    setStatus('');
  };

  const changeCartItem = async (item, quantity) => {
    const itemKey = `${item.productId}:${item.size}`;
    setBusyItem(itemKey);
    try {
      if (session?.user) {
        const { error } = await supabase.rpc('cart_set_quantity', {
          p_product_id: item.productId,
          p_size: item.size,
          p_quantity: quantity
        });
        if (error) throw error;
        await fetchCart();
      } else {
        const nextCart = quantity > 0
          ? cart.map((entry) => (
              entry.productId === item.productId && entry.size === item.size
                ? { ...entry, quantity }
                : entry
            ))
          : cart.filter((entry) => !(entry.productId === item.productId && entry.size === item.size));
        setCart(nextCart);
        await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(nextCart));
      }
    } catch (error) {
      showError(error, 'Could not update this cart item.');
    } finally {
      setBusyItem('');
    }
  };

  const addToCart = async (product) => {
    const size = selectedSizes[product.id] || product.sizes[0];
    const existing = cart.find((item) => (
      String(item.productId) === String(product.id) && item.size === size
    ));
    if (existing?.quantity >= 20) {
      setStatus('A cart item cannot exceed quantity 20.');
      return;
    }

    try {
      if (session?.user) {
        const { error } = await supabase.rpc('cart_add_item', {
          p_product_id: product.id,
          p_size: size,
          p_quantity: 1
        });
        if (error) throw error;
        await fetchCart();
      } else {
        const nextCart = existing
          ? cart.map((item) => (
              String(item.productId) === String(product.id) && item.size === size
                ? { ...item, quantity: item.quantity + 1 }
                : item
            ))
          : [...cart, { productId: product.id, size, quantity: 1 }];
        setCart(nextCart);
        await AsyncStorage.setItem(GUEST_CART_KEY, JSON.stringify(nextCart));
      }
      setStatus(`${product.name} added to cart.`);
    } catch (error) {
      showError(error, 'Could not add this product to your cart.');
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showError(error, 'Could not sign out.');
  };

  const renderProduct = ({ item }) => (
    <View style={styles.productCard}>
      {item.image ? <Image source={{ uri: item.image }} style={styles.productImage} /> : null}
      <Text style={styles.category}>{item.category}</Text>
      <Text style={styles.productName}>{item.name}</Text>
      <Text style={styles.price}>${item.price.toFixed(2)}</Text>
      <Text style={styles.description}>{item.description}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.sizeList}>
        {item.sizes.map((size) => (
          <Pressable
            key={size}
            onPress={() => setSelectedSizes((previous) => ({ ...previous, [item.id]: size }))}
            style={[
              styles.sizeButton,
              (selectedSizes[item.id] || item.sizes[0]) === size && styles.selectedSize
            ]}
          >
            <Text style={(selectedSizes[item.id] || item.sizes[0]) === size ? styles.selectedSizeText : null}>
              {size}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
      <Pressable style={styles.primaryButton} onPress={() => addToCart(item)}>
        <Text style={styles.primaryButtonText}>Add to cart</Text>
      </Pressable>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color="#161616" />
        <Text style={styles.description}>Loading Maison Étoile…</Text>
      </SafeAreaView>
    );
  }

  const cartCount = cart.reduce((total, item) => total + item.quantity, 0);
  const cartTotal = cart.reduce((total, item) => {
    const product = productById.get(String(item.productId));
    return total + (product ? product.price * item.quantity : 0);
  }, 0);

  return (
    <SafeAreaView style={styles.safeArea}>
      <FlatList
        data={products}
        renderItem={renderProduct}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.content}
        ListHeaderComponent={(
          <View>
            <Text style={styles.brand}>Maison Étoile</Text>
            <Text style={styles.pageTitle}>The collection</Text>
            <View style={styles.accountRow}>
              {session?.user ? (
                <>
                  <Text style={styles.accountText}>{session.user.email || 'Signed in'}</Text>
                  <Pressable onPress={signOut}><Text style={styles.textButton}>Sign out</Text></Pressable>
                </>
              ) : (
                <Pressable style={styles.googleButton} onPress={() => signInWithGoogle().catch((error) => showError(error, 'Google sign-in failed.'))}>
                  <Text style={styles.googleButtonText}>Continue with Google</Text>
                </Pressable>
              )}
            </View>
            <View style={styles.cartPanel}>
              <Text style={styles.cartTitle}>Your cart · {cartCount} item{cartCount === 1 ? '' : 's'}</Text>
              {session?.user ? <Text style={styles.syncCaption}>Synced to your account · live updates enabled</Text> : (
                <Text style={styles.syncCaption}>Guest cart on this phone · sign in to sync across devices</Text>
              )}
              {cart.length === 0 ? <Text style={styles.description}>Your cart is empty.</Text> : null}
              {cart.map((item) => {
                const product = productById.get(String(item.productId));
                const itemKey = `${item.productId}:${item.size}`;
                return (
                  <View key={itemKey} style={styles.cartItem}>
                    <View style={styles.cartItemInfo}>
                      <Text style={styles.cartItemName}>{product?.name || 'Unavailable product'}</Text>
                      <Text style={styles.description}>Size {item.size} · {product ? `$${(product.price * item.quantity).toFixed(2)}` : ''}</Text>
                    </View>
                    <View style={styles.quantityControl}>
                      <Pressable disabled={busyItem === itemKey} onPress={() => changeCartItem(item, item.quantity - 1)}>
                        <Text style={styles.quantityButton}>−</Text>
                      </Pressable>
                      <Text>{item.quantity}</Text>
                      <Pressable disabled={busyItem === itemKey || item.quantity >= 20} onPress={() => changeCartItem(item, item.quantity + 1)}>
                        <Text style={styles.quantityButton}>+</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })}
              <Text style={styles.cartTotal}>Subtotal ${cartTotal.toFixed(2)}</Text>
            </View>
            {status ? <Text accessibilityRole="alert" style={styles.status}>{status}</Text> : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.description}>No products are available right now.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#f7f2eb' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f2eb', gap: 12 },
  content: { padding: 20, paddingBottom: 48 },
  brand: { fontSize: 14, letterSpacing: 3, textTransform: 'uppercase', color: '#5f574f', marginBottom: 8 },
  pageTitle: { fontFamily: 'Georgia', fontSize: 32, color: '#161616', marginBottom: 18 },
  accountRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, gap: 12 },
  accountText: { flex: 1, color: '#5f574f' },
  googleButton: { borderWidth: 1, borderColor: '#161616', padding: 12 },
  googleButtonText: { color: '#161616', fontWeight: '600' },
  textButton: { textDecorationLine: 'underline', color: '#161616' },
  cartPanel: { backgroundColor: '#fffdf9', borderWidth: 1, borderColor: 'rgba(22,22,22,0.12)', padding: 16, marginBottom: 20 },
  cartTitle: { fontSize: 18, fontWeight: '700', color: '#161616' },
  syncCaption: { color: '#5f574f', fontSize: 12, marginTop: 4, marginBottom: 8 },
  cartItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(22,22,22,0.12)' },
  cartItemInfo: { flex: 1, paddingRight: 8 },
  cartItemName: { fontWeight: '600', color: '#161616' },
  quantityControl: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  quantityButton: { fontSize: 23, color: '#161616', paddingHorizontal: 4 },
  cartTotal: { fontWeight: '700', textAlign: 'right', marginTop: 12, color: '#161616' },
  productCard: { backgroundColor: '#fffdf9', padding: 16, marginBottom: 16, borderWidth: 1, borderColor: 'rgba(22,22,22,0.12)' },
  productImage: { width: '100%', height: 280, backgroundColor: '#efe7de', marginBottom: 12 },
  category: { textTransform: 'uppercase', letterSpacing: 1, color: '#5f574f', fontSize: 11 },
  productName: { fontFamily: 'Georgia', fontSize: 22, color: '#161616', marginTop: 4 },
  price: { fontWeight: '700', marginTop: 4, color: '#161616' },
  description: { color: '#5f574f', marginTop: 6, lineHeight: 20 },
  sizeList: { marginTop: 14, flexGrow: 0 },
  sizeButton: { borderWidth: 1, borderColor: 'rgba(22,22,22,0.18)', paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 },
  selectedSize: { backgroundColor: '#161616', borderColor: '#161616' },
  selectedSizeText: { color: '#fffdf9' },
  primaryButton: { backgroundColor: '#161616', padding: 13, alignItems: 'center', marginTop: 14 },
  primaryButtonText: { color: '#fffdf9', fontWeight: '700' },
  status: { color: '#8b3a2f', marginBottom: 12 }
});
