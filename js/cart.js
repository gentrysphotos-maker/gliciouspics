/* G.Licious Pics — cart.js */

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
