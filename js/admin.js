const ADMIN_IMAGE_BUCKET = 'product-images';
const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

const adminClient = window.getSupabaseClient();
const loginSection = document.querySelector('#admin-login');
const dashboardSection = document.querySelector('#admin-dashboard');
const loginForm = document.querySelector('#admin-login-form');
const loginMessage = document.querySelector('#admin-login-message');
const googleSignInButton = document.querySelector('#admin-google-sign-in');
const loginSignOutButton = document.querySelector('#admin-login-sign-out');
const productForm = document.querySelector('#product-form');
const productList = document.querySelector('#admin-products');
const adminStatus = document.querySelector('#admin-status');
const saveButton = document.querySelector('#save-product');
const formTitle = document.querySelector('#product-form-title');
const cancelEditButton = document.querySelector('#cancel-edit');

let currentAdminUser = null;
let products = [];
let editingProductId = null;

function setAdminStatus(message, isError = false) {
  adminStatus.textContent = message;
  adminStatus.classList.toggle('error', isError);
}

function setLoginMessage(message, isError = false) {
  loginMessage.textContent = message;
  loginMessage.classList.toggle('error', isError);
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

function getImageStoragePath(imageUrl) {
  if (!imageUrl) return null;

  try {
    const url = new URL(imageUrl);
    const marker = `/storage/v1/object/public/${ADMIN_IMAGE_BUCKET}/`;
    const markerIndex = url.pathname.indexOf(marker);
    return markerIndex === -1 ? null : decodeURIComponent(url.pathname.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

function setDashboardVisible(isVisible) {
  loginSection.hidden = isVisible;
  dashboardSection.hidden = !isVisible;
}

async function signOutAdmin() {
  const { error } = await adminClient.auth.signOut();
  if (error) {
    setLoginMessage(error.message, true);
    return;
  }

  currentAdminUser = null;
  setDashboardVisible(false);
  loginSignOutButton.hidden = true;
  setLoginMessage('You have been signed out.');
}

async function loadProducts() {
  setAdminStatus('Loading products…');
  const { data, error } = await adminClient
    .from('products')
    .select('id, name, price, description, category, image, sizes, created_at')
    .order('created_at', { ascending: false });

  if (error) throw error;

  products = data || [];
  renderProducts();
  setAdminStatus(`${products.length} product${products.length === 1 ? '' : 's'} in your catalog.`);
}

function renderProducts() {
  if (!products.length) {
    productList.innerHTML = '<p class="admin-help">No products found yet. Add your first item using the form.</p>';
    return;
  }

  productList.innerHTML = products.map((product) => `
    <article class="admin-product">
      <img src="${escapeHtml(product.image || '')}" alt="${escapeHtml(product.name)}" />
      <div class="admin-product-details">
        <h3>${escapeHtml(product.name)}</h3>
        <p>${escapeHtml(product.category)} · $${Number(product.price).toFixed(2)}</p>
        <p>${escapeHtml(Array.isArray(product.sizes) ? product.sizes.join(', ') : '')}</p>
        <div class="admin-product-actions">
          <button class="link-btn" type="button" data-edit-id="${escapeHtml(product.id)}">Edit</button>
          <button class="link-btn admin-delete" type="button" data-delete-id="${escapeHtml(product.id)}">Delete</button>
        </div>
      </div>
    </article>
  `).join('');

  productList.querySelectorAll('[data-edit-id]').forEach((button) => {
    button.addEventListener('click', () => startEditing(button.dataset.editId));
  });
  productList.querySelectorAll('[data-delete-id]').forEach((button) => {
    button.addEventListener('click', () => deleteProduct(button.dataset.deleteId));
  });
}

function startEditing(productId) {
  const product = products.find((entry) => String(entry.id) === String(productId));
  if (!product) return;

  editingProductId = product.id;
  productForm.elements.name.value = product.name;
  productForm.elements.price.value = product.price;
  productForm.elements.category.value = product.category;
  productForm.elements.description.value = product.description;
  productForm.elements.sizes.value = Array.isArray(product.sizes) ? product.sizes.join(', ') : '';
  productForm.elements.imageUrl.value = product.image || '';
  productForm.elements.imageFile.value = '';
  formTitle.textContent = 'Edit product';
  saveButton.textContent = 'Save changes';
  cancelEditButton.hidden = false;
  productForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetProductForm() {
  editingProductId = null;
  productForm.reset();
  formTitle.textContent = 'Add a product';
  saveButton.textContent = 'Add product';
  cancelEditButton.hidden = true;
}

async function uploadProductImage(file) {
  if (!file.type.startsWith('image/')) {
    throw new Error('Choose a valid image file.');
  }
  if (file.size > MAX_IMAGE_SIZE) {
    throw new Error('Images must be 5 MB or smaller.');
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
  const path = `${currentAdminUser.id}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await adminClient.storage
    .from(ADMIN_IMAGE_BUCKET)
    .upload(path, file, { contentType: file.type, cacheControl: '3600', upsert: false });

  if (error) throw error;
  const { data } = adminClient.storage.from(ADMIN_IMAGE_BUCKET).getPublicUrl(path);
  return { path, url: data.publicUrl };
}

async function removeProductImage(imageUrl) {
  const path = getImageStoragePath(imageUrl);
  if (!path) return;

  const { error } = await adminClient.storage.from(ADMIN_IMAGE_BUCKET).remove([path]);
  if (error) throw error;
}

async function saveProduct(event) {
  event.preventDefault();
  const wasEditing = Boolean(editingProductId);
  const formData = new FormData(productForm);
  const name = String(formData.get('name')).trim();
  const price = Number(formData.get('price'));
  const category = String(formData.get('category')).trim();
  const description = String(formData.get('description')).trim();
  const sizes = String(formData.get('sizes'))
    .split(',')
    .map((size) => size.trim())
    .filter(Boolean);
  const imageFile = formData.get('imageFile');
  const imageUrl = String(formData.get('imageUrl')).trim();
  const previousProduct = products.find((product) => product.id === editingProductId);

  if (!Number.isFinite(price) || price < 0) {
    setAdminStatus('Enter a valid non-negative price.', true);
    return;
  }
  if (!sizes.length) {
    setAdminStatus('Enter at least one size (use “One Size” for accessories).', true);
    return;
  }
  if (imageUrl && !/^https?:\/\//i.test(imageUrl)) {
    setAdminStatus('Image URLs must start with http:// or https://.', true);
    return;
  }

  saveButton.disabled = true;
  setAdminStatus(editingProductId ? 'Saving product changes…' : 'Adding product…');

  let uploadedImage = null;
  let productSaved = false;
  try {
    if (imageFile.size > 0) {
      uploadedImage = await uploadProductImage(imageFile);
    }

    const image = uploadedImage?.url || imageUrl || previousProduct?.image;
    if (!image) {
      throw new Error('Upload a product image or provide an image URL.');
    }

    const productData = { name, price, category, description, sizes, image };
    const query = editingProductId
      ? adminClient.from('products').update(productData).eq('id', editingProductId)
      : adminClient.from('products').insert(productData);
    const { error } = await query;
    if (error) throw error;
    productSaved = true;

    let previousImageCleanupFailed = false;
    if (previousProduct?.image && previousProduct.image !== image) {
      try {
        await removeProductImage(previousProduct.image);
      } catch (error) {
        console.error('Could not remove the replaced product image:', error);
        previousImageCleanupFailed = true;
      }
    }

    resetProductForm();
    try {
      await loadProducts();
    } catch (error) {
      console.error('Product saved, but the product list could not be refreshed:', error);
      setAdminStatus(`Product saved, but the list could not be refreshed: ${error.message}`, true);
      return;
    }
    if (previousImageCleanupFailed) {
      setAdminStatus('Product saved, but the previous image could not be removed from Storage.', true);
    } else {
      setAdminStatus(wasEditing ? 'Product updated.' : 'Product added.');
    }
  } catch (error) {
    if (uploadedImage && !productSaved) {
      try {
        const { error: cleanupError } = await adminClient.storage
          .from(ADMIN_IMAGE_BUCKET)
          .remove([uploadedImage.path]);
        if (cleanupError) {
          console.error('Could not clean up the unused product image:', cleanupError);
        }
      } catch (cleanupError) {
        console.error('Could not clean up the unused product image:', cleanupError);
      }
    }
    console.error('Product save failed:', error);
    setAdminStatus(error.message || 'Could not save this product.', true);
  } finally {
    saveButton.disabled = false;
  }
}

async function deleteProduct(productId) {
  const product = products.find((entry) => String(entry.id) === String(productId));
  if (!product || !window.confirm(`Delete “${product.name}” from the catalog?`)) return;

  setAdminStatus(`Deleting ${product.name}…`);
  const { error } = await adminClient.from('products').delete().eq('id', product.id);
  if (error) {
    console.error('Product delete failed:', error);
    setAdminStatus(error.message || 'Could not delete this product.', true);
    return;
  }

  let imageCleanupFailed = false;
  try {
    await removeProductImage(product.image);
  } catch (error) {
    console.error('Could not remove the deleted product image:', error);
    imageCleanupFailed = true;
  }

  products = products.filter((entry) => entry.id !== product.id);
  renderProducts();
  if (imageCleanupFailed) {
    setAdminStatus('Product deleted, but its image could not be removed from Storage.', true);
  } else {
    setAdminStatus('Product deleted.');
  }
}

async function showAdminDashboard(user) {
  currentAdminUser = user;
  if (!user) {
    setDashboardVisible(false);
    loginSignOutButton.hidden = true;
    return;
  }

  loginSignOutButton.hidden = false;
  setLoginMessage('Checking administrator access…');
  const { data: isAdmin, error } = await adminClient.rpc('is_admin');
  if (error) {
    setDashboardVisible(false);
    setLoginMessage('Could not verify admin access. Run supabase/admin-panel.sql and add this Google user to public.admin_users.', true);
    console.error('Admin access check failed:', error);
    return;
  }
  if (!isAdmin) {
    setDashboardVisible(false);
    setLoginMessage('This account is not authorized to manage the store.', true);
    return;
  }

  setDashboardVisible(true);
  setLoginMessage('');
  try {
    await loadProducts();
  } catch (error) {
    console.error('Could not load admin products:', error);
    setAdminStatus(error.message || 'Could not load products.', true);
  }
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!adminClient) {
    setLoginMessage('Supabase is not configured. Check js/config.js.', true);
    return;
  }

  const button = loginForm.querySelector('[type="submit"]');
  const formData = new FormData(loginForm);
  button.disabled = true;
  setLoginMessage('Signing in…');

  const { data, error } = await adminClient.auth.signInWithPassword({
    email: String(formData.get('email')).trim(),
    password: String(formData.get('password'))
  });
  button.disabled = false;

  if (error) {
    setLoginMessage(error.message, true);
    return;
  }

  await showAdminDashboard(data.user);
});

googleSignInButton.addEventListener('click', async () => {
  if (!adminClient) {
    setLoginMessage('Supabase is not configured. Check js/config.js.', true);
    return;
  }

  googleSignInButton.disabled = true;
  setLoginMessage('Redirecting to Google…');
  const { error } = await window.signInAdminWithGoogle();
  if (error) {
    setLoginMessage(error.message, true);
    googleSignInButton.disabled = false;
  }
});

document.querySelector('#admin-sign-out').addEventListener('click', async () => {
  const { error } = await adminClient.auth.signOut();
  if (error) {
    setAdminStatus(error.message, true);
    return;
  }
  currentAdminUser = null;
  setDashboardVisible(false);
  loginSignOutButton.hidden = true;
  setLoginMessage('You have been signed out.');
});

loginSignOutButton.addEventListener('click', signOutAdmin);
productForm.addEventListener('submit', saveProduct);
cancelEditButton.addEventListener('click', resetProductForm);

if (!adminClient) {
  setLoginMessage('Supabase is not configured. Check js/config.js.', true);
} else {
  adminClient.auth.getSession().then(({ data, error }) => {
    if (error) {
      setLoginMessage(error.message, true);
      return;
    }
    showAdminDashboard(data.session?.user || null);
  });
}
