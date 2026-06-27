/* G.Licious Pics — cart.js */

function getPagesPath(filename) {
  const path = window.location.pathname;
  return path.includes('/pages/') ? filename : 'pages/' + filename;
}

function getProductPageUrl(productId) {
  return getPagesPath('product.html') + '?id=' + encodeURIComponent(productId);
}

function getCartPageUrl() {
  return getPagesPath('cart.html');
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function showAddedToCartToast(product) {
  let container = document.getElementById('cart-toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'cart-toast-container';
    container.className = 'cart-toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'cart-toast';
  toast.innerHTML =
    '<p class="cart-toast-message"><strong>' + escapeHtml(product.title) + '</strong> added to cart</p>' +
    '<a href="' + getCartPageUrl() + '" class="cart-toast-link">View Cart</a>' +
    '<button type="button" class="cart-toast-dismiss" aria-label="Dismiss">&times;</button>';

  container.appendChild(toast);

  requestAnimationFrame(function() {
    toast.classList.add('visible');
  });

  function dismiss() {
    toast.classList.remove('visible');
    setTimeout(function() {
      toast.remove();
    }, 300);
  }

  toast.querySelector('.cart-toast-dismiss').addEventListener('click', dismiss);
  setTimeout(dismiss, 6000);
}

// Retrieve cart from localStorage
function getCart() {
  try {
    const cart = localStorage.getItem('glicious_cart');
    return cart ? JSON.parse(cart) : [];
  } catch (e) {
    console.error('Error parsing cart from localStorage', e);
    return [];
  }
}

// Save cart to localStorage
function saveCart(cart) {
  try {
    localStorage.setItem('glicious_cart', JSON.stringify(cart));
    // Dispatch custom event to notify other scripts of update
    window.dispatchEvent(new CustomEvent('cart-updated'));
    updateCartNavUI();
  } catch (e) {
    console.error('Error saving cart to localStorage', e);
  }
}

// Add item to cart
function addToCart(product) {
  // Expected product properties: id, title, size, material, price, quantity, thumbnail
  const cart = getCart();
  
  // Check if item with same id, size, and material already exists
  const existingIndex = cart.findIndex(item => 
    item.id === product.id && 
    item.size === product.size && 
    item.material === product.material
  );

  if (existingIndex > -1) {
    cart[existingIndex].quantity = Number(cart[existingIndex].quantity) + Number(product.quantity || 1);
  } else {
    cart.push({
      id: product.id,
      title: product.title,
      size: product.size,
      material: product.material,
      price: Number(product.price),
      quantity: Number(product.quantity || 1),
      thumbnail: product.thumbnail
    });
  }

  saveCart(cart);
  showAddedToCartToast(product);
}

// Remove item by index
function removeFromCart(index) {
  const cart = getCart();
  if (index >= 0 && index < cart.length) {
    cart.splice(index, 1);
    saveCart(cart);
  }
}

// Update quantity by index
function updateQuantity(index, newQuantity) {
  const cart = getCart();
  if (index >= 0 && index < cart.length && newQuantity > 0) {
    cart[index].quantity = Number(newQuantity);
    saveCart(cart);
  }
}

// Get total price
function getCartTotal() {
  const cart = getCart();
  return cart.reduce((total, item) => total + (Number(item.price) * Number(item.quantity)), 0);
}

// Get total number of items
function getCartCount() {
  const cart = getCart();
  return cart.reduce((count, item) => count + Number(item.quantity), 0);
}

// Update navigation UI badge
function updateCartNavUI() {
  const badge = document.querySelector('.cart-count');
  if (badge) {
    const count = getCartCount();
    badge.textContent = count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

// Automatically update on page load
document.addEventListener('DOMContentLoaded', updateCartNavUI);
