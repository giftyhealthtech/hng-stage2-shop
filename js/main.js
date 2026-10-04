const STORAGE_KEY = 'maisonEtoileCart';
let currentProducts = [...sampleProducts];

function formatCurrency(value) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(value);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[character]);
}

function showToast(message) {
  let toast = document.querySelector('.toast');

  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add('visible');

  clearTimeout(showToast.timeoutId);
  showToast.timeoutId = setTimeout(() => {
    toast.classList.remove('visible');
  }, 2200);
}

function getCart() {
  const savedCart = localStorage.getItem(STORAGE_KEY);
  return savedCart ? JSON.parse(savedCart) : [];
}

function saveCart(cart) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
}

function getProductById(productId) {
  return currentProducts.find((product) => String(product.id) === String(productId));
}

function getCartItemCount() {
  return getCart().reduce((total, item) => total + item.quantity, 0);
}

function updateCartBadge() {
  const cartCount = document.querySelector('.cart-count');
  if (!cartCount) return;
  cartCount.textContent = getCartItemCount();
}

function addToCart(productId, selectedSize = 'One Size') {
  const cart = getCart();
  const product = getProductById(productId);
  const existingItem = cart.find(
    (item) => String(item.productId) === String(productId) && item.size === selectedSize
  );

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({
      productId: product ? product.id : productId,
      size: selectedSize,
      quantity: 1
    });
  }

  saveCart(cart);
  updateCartBadge();
  if (product) {
    showToast(`${product.name} added to cart`);
  }
}

function removeFromCart(productId, size = null) {
  const cart = getCart().filter((item) => {
    if (size) {
      return !(String(item.productId) === String(productId) && item.size === size);
    }
    return String(item.productId) !== String(productId);
  });

  saveCart(cart);
  updateCartBadge();
  showToast('Item removed from cart');

  if (document.body.dataset.page === 'cart') {
    renderCartPage();
  }
}

function updateQuantity(productId, size, change) {
  const cart = getCart();
  const item = cart.find(
    (entry) => String(entry.productId) === String(productId) && entry.size === size
  );

  if (!item) return;

  item.quantity += change;

  if (item.quantity <= 0) {
    removeFromCart(productId, size);
    return;
  }

  saveCart(cart);
  updateCartBadge();
  showToast('Cart updated');

  if (document.body.dataset.page === 'cart') {
    renderCartPage();
  }
}

function getCartTotal() {
  const cart = getCart();

  return cart.reduce((total, item) => {
    const product = getProductById(item.productId);
    if (!product) return total;
    return total + product.price * item.quantity;
  }, 0);
}

async function loadProducts() {
  if (typeof fetchProductsFromSupabase === 'function') {
    const supabaseProducts = await fetchProductsFromSupabase();
    if (supabaseProducts && supabaseProducts.length) {
      currentProducts = supabaseProducts.map((product) => ({
        ...product,
        sizes: Array.isArray(product.sizes) ? product.sizes : ['One Size']
      }));
      return currentProducts;
    }
  }

  currentProducts = [...sampleProducts];
  return currentProducts;
}

function renderFeaturedProducts() {
  const container = document.querySelector('#featured-products');
  if (!container) return;

  const featured = currentProducts.slice(0, 3);
  container.innerHTML = featured
    .map(
      (product) => `
        <article class="product-card">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
          <div class="product-info">
            <div class="product-meta">
              <h3 class="product-name">${escapeHtml(product.name)}</h3>
              <span class="price">${formatCurrency(product.price)}</span>
            </div>
            <div class="category">${escapeHtml(product.category)}</div>
            <a class="details-link" href="product.html?id=${encodeURIComponent(product.id)}">View Details</a>
          </div>
        </article>
      `
    )
    .join('');
}

function compareProductDates(firstProduct, secondProduct) {
  const firstDate = Date.parse(firstProduct.created_at || '');
  const secondDate = Date.parse(secondProduct.created_at || '');

  if (Number.isFinite(firstDate) && Number.isFinite(secondDate) && firstDate !== secondDate) {
    return firstDate - secondDate;
  }

  const firstId = Number(firstProduct.id);
  const secondId = Number(secondProduct.id);

  if (Number.isFinite(firstId) && Number.isFinite(secondId)) {
    return firstId - secondId;
  }

  return String(firstProduct.id).localeCompare(String(secondProduct.id));
}

function renderShopProducts(searchTerm = '', activeCategory = 'all', sortOrder = 'featured') {
  const container = document.querySelector('#product-grid');
  if (!container) return;

  let filteredProducts = currentProducts.filter((product) => {
    const matchesSearch =
      product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = activeCategory === 'all' || product.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  if (sortOrder === 'low-high') {
    filteredProducts = filteredProducts.sort((a, b) => a.price - b.price);
  } else if (sortOrder === 'high-low') {
    filteredProducts = filteredProducts.sort((a, b) => b.price - a.price);
  } else if (sortOrder === 'newest') {
    filteredProducts = filteredProducts.sort((a, b) => compareProductDates(b, a));
  } else if (sortOrder === 'oldest') {
    filteredProducts = filteredProducts.sort(compareProductDates);
  }

  if (!filteredProducts.length) {
    container.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <h3>No products match your search.</h3>
        <p>Try another keyword or choose a different category.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filteredProducts
    .map(
      (product) => `
        <article class="product-card">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
          <div class="product-info">
            <div class="product-meta">
              <h3 class="product-name">${escapeHtml(product.name)}</h3>
              <span class="price">${formatCurrency(product.price)}</span>
            </div>
            <div class="category">${escapeHtml(product.category)}</div>
            <a class="details-link" href="product.html?id=${encodeURIComponent(product.id)}">View Details</a>
          </div>
        </article>
      `
    )
    .join('');
}

function initShopFilters() {
  const searchInput = document.querySelector('#shop-search');
  const filterContainer = document.querySelector('#shop-filters');
  const sortSelect = document.querySelector('#sort-price');
  if (!searchInput || !filterContainer || !sortSelect) return;

  const categories = ['all', ...new Set(currentProducts.map((product) => product.category))];

  filterContainer.innerHTML = categories
    .map(
      (category) => `
        <button
          type="button"
          class="filter-btn ${category === 'all' ? 'active' : ''}"
          data-filter="${escapeHtml(category)}"
        >
          ${category === 'all' ? 'All' : escapeHtml(category)}
        </button>
      `
    )
    .join('');

  let activeCategory = 'all';
  let searchTerm = '';
  let sortOrder = 'featured';

  const refreshProducts = () => renderShopProducts(searchTerm, activeCategory, sortOrder);

  searchInput.addEventListener('input', (event) => {
    searchTerm = event.target.value.trim();
    refreshProducts();
  });

  sortSelect.addEventListener('change', (event) => {
    sortOrder = event.target.value;
    refreshProducts();
  });

  filterContainer.querySelectorAll('.filter-btn').forEach((button) => {
    button.addEventListener('click', () => {
      activeCategory = button.dataset.filter;

      filterContainer.querySelectorAll('.filter-btn').forEach((btn) => {
        btn.classList.toggle('active', btn === button);
      });

      refreshProducts();
    });
  });
}

function renderProductDetailPage() {
  const detailContainer = document.querySelector('#product-detail-content');
  if (!detailContainer) return;

  const params = new URLSearchParams(window.location.search);
  const productId = params.get('id') || currentProducts[0].id;
  const product = getProductById(productId);

  if (!product) {
    detailContainer.innerHTML = '<div class="empty-state"><p>Product not found.</p></div>';
    return;
  }

  const selectedSize = product.sizes[0];
  detailContainer.innerHTML = `
    <div class="product-detail-inner">
      <div class="product-gallery">
        <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
      </div>

      <div class="product-summary">
        <div class="category">${escapeHtml(product.category)}</div>
        <h2>${escapeHtml(product.name)}</h2>
        <div class="summary-row">
          <strong class="price">${formatCurrency(product.price)}</strong>
          <span>Free shipping over $200</span>
        </div>

        <p class="product-description">${escapeHtml(product.description)}</p>

        <div class="size-group">
          <span class="size-label">Select size</span>
          <div class="size-options">
            ${product.sizes
              .map(
                (size) => `
                  <button class="size-option ${size === selectedSize ? 'selected' : ''}" type="button" data-size="${escapeHtml(size)}">${escapeHtml(size)}</button>
                `
              )
              .join('')}
          </div>
        </div>

        <div class="checkout-area">
          <button class="btn" type="button" id="add-to-cart-btn">Add to cart</button>
          <a class="link-btn" href="shop.html">Continue shopping</a>
        </div>
      </div>
    </div>
  `;

  const sizeButtons = document.querySelectorAll('.size-option');
  let chosenSize = selectedSize;

  sizeButtons.forEach((button) => {
    button.addEventListener('click', () => {
      sizeButtons.forEach((btn) => btn.classList.remove('selected'));
      button.classList.add('selected');
      chosenSize = button.dataset.size;
    });
  });

  const addButton = document.querySelector('#add-to-cart-btn');
  addButton.addEventListener('click', () => {
    addToCart(product.id, chosenSize);
  });
}

function renderCartPage() {
  const container = document.querySelector('#cart-items');
  const summary = document.querySelector('#cart-summary');

  if (!container || !summary) return;

  const cart = getCart();

  if (!cart.length) {
    container.innerHTML = `
      <div class="empty-state">
        <h3>Your cart is empty</h3>
        <p>Start with a few pieces from the collection.</p>
        <a class="btn" href="shop.html">Shop the Collection</a>
      </div>
    `;
    summary.innerHTML = `
      <h3>Order Summary</h3>
      <ul class="summary-list">
        <li><span>Subtotal</span><span>${formatCurrency(0)}</span></li>
        <li><span>Shipping</span><span>Calculated at checkout</span></li>
      </ul>
      <div class="summary-total"><span>Total</span><span>${formatCurrency(0)}</span></div>
      <a class="btn" href="shop.html">Continue shopping</a>
    `;
    return;
  }

  container.innerHTML = cart
    .map((item) => {
      const product = getProductById(item.productId);
      if (!product) return '';

      return `
        <div class="cart-item">
          <img src="${escapeHtml(product.image)}" alt="${escapeHtml(product.name)}" />
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <small>${escapeHtml(product.category)} • Size ${escapeHtml(item.size)}</small>
            <div class="qty-control">
              <button type="button" data-action="decrease" data-product-id="${escapeHtml(product.id)}" data-size="${escapeHtml(item.size)}">-</button>
              <span class="qty-value">${item.quantity}</span>
              <button type="button" data-action="increase" data-product-id="${escapeHtml(product.id)}" data-size="${escapeHtml(item.size)}">+</button>
            </div>
            <a href="#" class="remove-link" data-remove-id="${escapeHtml(product.id)}" data-remove-size="${escapeHtml(item.size)}">Remove</a>
          </div>
          <strong>${formatCurrency(product.price * item.quantity)}</strong>
        </div>
      `;
    })
    .join('');

  const subtotal = getCartTotal();
  summary.innerHTML = `
    <h3>Order Summary</h3>
    <ul class="summary-list">
      <li><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></li>
      <li><span>Shipping</span><span>Free</span></li>
    </ul>
    <div class="summary-total"><span>Total</span><span>${formatCurrency(subtotal)}</span></div>
    <a class="btn" href="checkout.html">Proceed to Checkout</a>
  `;

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const productId = button.dataset.productId;
      const size = button.dataset.size;
      const action = button.dataset.action;

      if (action === 'increase') updateQuantity(productId, size, 1);
      if (action === 'decrease') updateQuantity(productId, size, -1);
    });
  });

  document.querySelectorAll('[data-remove-id]').forEach((button) => {
    button.addEventListener('click', (event) => {
      event.preventDefault();
      const productId = button.dataset.removeId;
      const size = button.dataset.removeSize;
      removeFromCart(productId, size);
    });
  });
}

function renderCheckoutPage() {
  const summary = document.querySelector('#checkout-summary');
  if (!summary) return;

  const subtotal = getCartTotal();
  summary.innerHTML = `
    <h3>Order Summary</h3>
    <ul class="summary-list">
      <li><span>Subtotal</span><span>${formatCurrency(subtotal)}</span></li>
      <li><span>Shipping</span><span>Free</span></li>
      <li><span>Estimated tax</span><span>${formatCurrency(subtotal * 0.08)}</span></li>
    </ul>
    <div class="summary-total"><span>Total</span><span>${formatCurrency(subtotal * 1.08)}</span></div>
  `;

  const form = document.querySelector('#checkout-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();

    const cart = getCart();
    if (!cart.length) {
      showToast('Your cart is empty');
      return;
    }

    const formValues = new FormData(form);
    const customer = {
      firstName: formValues.get('firstName').trim(),
      lastName: formValues.get('lastName').trim(),
      email: formValues.get('email').trim(),
      address: formValues.get('address').trim(),
      city: formValues.get('city').trim(),
      postalCode: formValues.get('postalCode').trim(),
      country: formValues.get('country').trim()
    };
    const items = cart.map((item) => ({
      productId: item.productId,
      size: item.size,
      quantity: item.quantity
    }));
    const submitButton = form.querySelector('[type="submit"]');

    submitButton.disabled = true;
    try {
      const result = await saveOrderToSupabase({ customer, items });
      if (!result.success) {
        throw result.error || new Error('Order save failed.');
      }

      const finalTotal = result.persisted
        ? Number(result.data.total)
        : getCartTotal() * 1.08;
      localStorage.setItem('lastOrderTotal', JSON.stringify(finalTotal));
      localStorage.setItem('lastOrderId', result.data?.order_id || '');
      localStorage.setItem('lastOrderPersisted', String(Boolean(result.persisted)));
      localStorage.removeItem(STORAGE_KEY);
      updateCartBadge();
      window.location.href = 'success.html';
    } catch (error) {
      console.error('Checkout error:', error);
      showToast('Could not save your order. Please try again.');
      submitButton.disabled = false;
    }
  });
}

function renderSuccessPage() {
  const total = JSON.parse(localStorage.getItem('lastOrderTotal') || '0');
  const message = document.querySelector('#success-total');
  const orderId = document.querySelector('#success-order-id');
  const status = document.querySelector('#success-status');

  if (message) {
    message.textContent = formatCurrency(total);
  }

  if (orderId) {
    orderId.textContent = localStorage.getItem('lastOrderId') || 'Demo order';
  }

  if (status) {
    const persisted = localStorage.getItem('lastOrderPersisted') === 'true';
    status.textContent = persisted
      ? 'Your order is saved in Supabase. Payment has not been collected yet.'
      : 'Demo checkout only: this order was not saved to Supabase, and payment has not been collected.';
  }
}

async function initLoginPage() {
  const title = document.querySelector('#auth-title');
  const message = document.querySelector('#auth-message');
  const actions = document.querySelector('#auth-actions');
  if (!title || !message || !actions) return;

  const renderAuthState = async () => {
    const { user, error } = await getCurrentUser();

    if (error) {
      message.textContent = 'Connect Supabase Auth to enable Google sign-in.';
    }

    if (user) {
      title.textContent = 'You are signed in';
      message.textContent = user.email || 'Google account connected.';
      actions.innerHTML = '<button class="btn" id="google-sign-out" type="button">Sign out</button>';
      document.querySelector('#google-sign-out').addEventListener('click', async () => {
        const button = document.querySelector('#google-sign-out');
        button.disabled = true;
        const result = await signOutFromSupabase();
        if (result.error) {
          message.textContent = result.error.message;
          button.disabled = false;
          return;
        }
        await renderAuthState();
      });
      return;
    }

    title.textContent = 'Sign in or create an account';
    actions.innerHTML = '<button class="btn" id="google-sign-in" type="button">Continue with Google</button>';
    document.querySelector('#google-sign-in').addEventListener('click', async (event) => {
      const button = event.currentTarget;
      button.disabled = true;
      message.textContent = 'Connecting to Google...';

      const result = await signInWithGoogle();
      if (result.error) {
        message.textContent = result.error.message;
        button.disabled = false;
      }
    });
  };

  await renderAuthState();
}

async function initPage() {
  updateCartBadge();
  await loadProducts();

  const page = document.body.dataset.page;

  if (page === 'home') {
    renderFeaturedProducts();
  }

  if (page === 'shop') {
    initShopFilters();
    renderShopProducts();
  }

  if (page === 'product') {
    renderProductDetailPage();
  }

  if (page === 'cart') {
    renderCartPage();
  }

  if (page === 'checkout') {
    renderCheckoutPage();
  }

  if (page === 'success') {
    renderSuccessPage();
  }

  if (page === 'login') {
    initLoginPage();
  }
}

document.addEventListener('DOMContentLoaded', initPage);
