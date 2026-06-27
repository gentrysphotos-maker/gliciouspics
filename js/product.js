// G.Licious Pics — Shared Product Page Logic
// Handles fetching, rendering options, dynamic pricing, cart addition, and layout adaptions.

(() => {
  // ── HELPERS ──────────────────────────────────────────────────────────────

  // Read id parameter from URL query string
  function getProductId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  // Insert Cloudinary transform params into a bare upload URL
  function addTransform(url, transform) {
    const decodedUrl = decodeURIComponent(url);
    const index = decodedUrl.indexOf('/upload/');
    if (index !== -1) {
      return decodedUrl.slice(0, index + 8) + transform + '/' + decodedUrl.slice(index + 8);
    }
    return decodedUrl;
  }

  // ── THUMBNAIL SWITCHER ────────────────────────────────────────────────────
  function getActiveThumbIndex() {
    const thumbs = document.querySelectorAll('.thumb');
    for (let i = 0; i < thumbs.length; i++) {
      if (thumbs[i].classList.contains('active')) return i;
    }
    return 0;
  }

  function selectThumb(index, src, alt) {
    document.querySelectorAll('.thumb').forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });
    const mainWrap = document.getElementById('main-image-wrap');
    const mainImg = mainWrap.querySelector('img');
    if (mainImg && src) {
      mainImg.style.opacity = '0';
      const tempImg = new Image();
      tempImg.onload = () => {
        mainImg.src = src;
        mainImg.alt = alt || '';
        mainImg.style.opacity = '1';
      };
      tempImg.src = src;
    }
  }

  // ── IMAGE LIGHTBOX ────────────────────────────────────────────────────────
  const imageLightbox = {
    urls: [],
    alt: '',
    index: 0,
    initialized: false
  };

  function resetLightboxZoom() {
    const zoomWrap = document.getElementById('product-lightbox-zoom');
    const img = document.getElementById('product-lightbox-img');
    if (zoomWrap) zoomWrap.classList.remove('is-zoomed');
    if (img) img.style.transformOrigin = 'center center';
  }

  function updateLightboxImage() {
    const img = document.getElementById('product-lightbox-img');
    const counter = document.getElementById('product-lightbox-counter');
    const prevBtn = document.getElementById('product-lightbox-prev');
    const nextBtn = document.getElementById('product-lightbox-next');
    if (!img) return;

    resetLightboxZoom();
    img.src = imageLightbox.urls[imageLightbox.index];
    img.alt = imageLightbox.alt;

    const hasMultiple = imageLightbox.urls.length > 1;
    if (prevBtn) {
      prevBtn.disabled = !hasMultiple;
      prevBtn.hidden = !hasMultiple;
    }
    if (nextBtn) {
      nextBtn.disabled = !hasMultiple;
      nextBtn.hidden = !hasMultiple;
    }
    if (counter) {
      counter.textContent = hasMultiple
        ? (imageLightbox.index + 1) + ' / ' + imageLightbox.urls.length
        : '';
    }
  }

  function openImageLightbox(index) {
    const lightbox = document.getElementById('product-lightbox');
    if (!lightbox || !imageLightbox.urls.length) return;

    imageLightbox.index = index;
    updateLightboxImage();
    lightbox.classList.add('open');
    lightbox.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';

    const closeBtn = document.getElementById('product-lightbox-close');
    if (closeBtn) closeBtn.focus();
  }

  function closeImageLightbox() {
    const lightbox = document.getElementById('product-lightbox');
    if (!lightbox) return;

    resetLightboxZoom();
    lightbox.classList.remove('open');
    lightbox.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  function stepLightbox(delta) {
    if (imageLightbox.urls.length <= 1) return;
    imageLightbox.index = (imageLightbox.index + delta + imageLightbox.urls.length) % imageLightbox.urls.length;
    updateLightboxImage();
  }

  function initImageLightboxListeners() {
    if (imageLightbox.initialized) return;
    imageLightbox.initialized = true;

    const lightbox = document.getElementById('product-lightbox');
    const closeBtn = document.getElementById('product-lightbox-close');
    const prevBtn = document.getElementById('product-lightbox-prev');
    const nextBtn = document.getElementById('product-lightbox-next');

    if (closeBtn) closeBtn.addEventListener('click', closeImageLightbox);
    if (prevBtn) prevBtn.addEventListener('click', () => stepLightbox(-1));
    if (nextBtn) nextBtn.addEventListener('click', () => stepLightbox(1));

    if (lightbox) {
      lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox) closeImageLightbox();
      });
    }

    document.addEventListener('keydown', (e) => {
      const isOpen = lightbox && lightbox.classList.contains('open');
      if (!isOpen) return;
      if (e.key === 'Escape') closeImageLightbox();
      if (e.key === 'ArrowLeft') stepLightbox(-1);
      if (e.key === 'ArrowRight') stepLightbox(1);
    });

    const zoomWrap = document.getElementById('product-lightbox-zoom');
    const zoomImg = document.getElementById('product-lightbox-img');
    if (zoomWrap && zoomImg) {
      zoomWrap.addEventListener('mouseenter', () => {
        zoomWrap.classList.add('is-zoomed');
      });
      zoomWrap.addEventListener('mouseleave', resetLightboxZoom);
      zoomWrap.addEventListener('mousemove', (e) => {
        if (!zoomWrap.classList.contains('is-zoomed')) return;
        const rect = zoomWrap.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        zoomImg.style.transformOrigin = x + '% ' + y + '%';
      });
    }
  }

  function setupProductGallery(urls, alt) {
    imageLightbox.urls = urls;
    imageLightbox.alt = alt;
    initImageLightboxListeners();

    const mainWrap = document.getElementById('main-image-wrap');
    if (!mainWrap) return;

    mainWrap.setAttribute('role', 'button');
    mainWrap.setAttribute('tabindex', '0');
    mainWrap.setAttribute('aria-label', 'View larger image');

    mainWrap.onclick = () => openImageLightbox(getActiveThumbIndex());
    mainWrap.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openImageLightbox(getActiveThumbIndex());
      }
    };
  }

  // ── RENDER SUGGESTIONS ───────────────────────────────────────────────────
  function renderSuggestions(allProducts, currentProduct) {
    // 1. Filter out the current product
    const pool = allProducts.filter(p => p.id !== currentProduct.id);

    // 2. Shuffle the pool to ensure random selection
    pool.sort(() => 0.5 - Math.random());

    // 3. Select 4 products from distinct categories (prioritizing other categories)
    const selected = [];
    const seenCategories = new Set();

    for (let i = 0; i < pool.length; i++) {
      const p = pool[i];
      if (p.category !== currentProduct.category && !seenCategories.has(p.category)) {
        selected.push(p);
        seenCategories.add(p.category);
        if (selected.length === 4) break;
      }
    }

    // If we need more to fill 4 slots, grab any remaining products
    if (selected.length < 4) {
      for (let i = 0; i < pool.length; i++) {
        const p = pool[i];
        if (!selected.some(s => s.id === p.id)) {
          selected.push(p);
          if (selected.length === 4) break;
        }
      }
    }

    const grid = document.getElementById('suggestions-grid');
    grid.innerHTML = '';

    selected.forEach(p => {
      const card = document.createElement('a');
      // Point all links to the unified product page with ID
      card.href = 'product.html?id=' + p.id;
      card.className = 'suggestion-card';

      const imgWrap = document.createElement('div');
      imgWrap.className = 'suggestion-img-wrap';

      const img = document.createElement('img');
      img.src = addTransform(p.images.hero, 'f_auto,q_auto,w_600');
      img.alt = p.title;
      img.loading = 'lazy';

      imgWrap.appendChild(img);

      const title = document.createElement('div');
      title.className = 'suggestion-title';
      title.textContent = p.title;

      const price = document.createElement('div');
      price.className = 'suggestion-price';
      price.textContent = 'Starting at $' + Number(p.startingPrice).toFixed(2);

      card.appendChild(imgWrap);
      card.appendChild(title);
      card.appendChild(price);

      grid.appendChild(card);
    });
  }

  // Helper to dynamically update or create head meta tags for SEO
  function updateMetaTag(attribute, attrValue, contentValue, keyName = 'content') {
    const selector = `meta[${attribute}="${attrValue}"]`;
    let tag = document.querySelector(selector);
    if (tag) {
      tag.setAttribute(keyName, contentValue);
    } else {
      tag = document.createElement('meta');
      tag.setAttribute(attribute, attrValue);
      tag.setAttribute(keyName, contentValue);
      document.head.appendChild(tag);
    }
  }

  // ── RENDER PRODUCT ───────────────────────────────────────────────────────
  function renderProduct(product, allProducts) {
    // Document Title
    document.title = product.title + ' — G.Licious Pics';
    
    // Dynamic SEO Descriptions & Open Graph Metadata
    const description = product.description || 'Fine Art Photography Print by Gentry.';
    updateMetaTag('name', 'description', description);
    updateMetaTag('property', 'og:url', window.location.href);
    updateMetaTag('property', 'og:title', product.title + ' — G.Licious Pics');
    updateMetaTag('property', 'og:description', description);
    
    const shareImgUrl = addTransform(product.images.hero, 'f_auto,q_auto,w_1200,h_630,c_fill');
    updateMetaTag('property', 'og:image', shareImgUrl);
    
    // Twitter Cards
    updateMetaTag('property', 'twitter:url', window.location.href);
    updateMetaTag('property', 'twitter:title', product.title + ' — G.Licious Pics');
    updateMetaTag('property', 'twitter:description', description);
    updateMetaTag('property', 'twitter:image', shareImgUrl);

    // Canonical link tag (med-7)
    const canonicalUrl = 'https://gliciouspics.com/pages/product.html?id=' + product.id;
    let canonicalTag = document.querySelector('link[rel="canonical"]');
    if (canonicalTag) {
      canonicalTag.setAttribute('href', canonicalUrl);
    } else {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      canonicalTag.setAttribute('href', canonicalUrl);
      document.head.appendChild(canonicalTag);
    }

    // Dynamic JSON-LD Structured Data (med-6)
    let lowPrice = product.startingPrice;
    let highPrice = product.startingPrice;
    let offerCount = 0;
    const priceList = [];
    
    Object.keys(product.pricing).forEach(m => {
      Object.keys(product.pricing[m]).forEach(s => {
        const val = product.pricing[m][s];
        if (val != null) {
          priceList.push(val);
        }
      });
    });
    if (priceList.length > 0) {
      lowPrice = Math.min(...priceList);
      highPrice = Math.max(...priceList);
      offerCount = priceList.length;
    }

    const jsonLdData = {
      "@context": "https://schema.org/",
      "@type": "Product",
      "name": product.title,
      "image": [
        addTransform(product.images.hero, 'f_auto,q_auto,w_1200')
      ],
      "description": description,
      "brand": {
        "@type": "Brand",
        "name": "G.Licious Pics"
      },
      "offers": {
        "@type": "AggregateOffer",
        "priceCurrency": "USD",
        "lowPrice": lowPrice.toFixed(2),
        "highPrice": highPrice.toFixed(2),
        "offerCount": offerCount.toString(),
        "price": lowPrice.toFixed(2),
        "availability": "https://schema.org/InStock",
        "url": window.location.href
      }
    };

    const jsonLdSelector = 'script[type="application/ld+json"]';
    let scriptTag = document.querySelector(jsonLdSelector);
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(jsonLdData, null, 2);

    // Populate Breadcrumbs (med-9)
    const breadcrumbsEl = document.getElementById('breadcrumbs');
    if (breadcrumbsEl) {
      breadcrumbsEl.innerHTML = '';
      
      const homeLink = document.createElement('a');
      homeLink.href = '../index.html';
      homeLink.textContent = 'Home';
      
      const shopLink = document.createElement('a');
      shopLink.href = '../index.html#galleries';
      shopLink.textContent = 'Shop';
      
      let categoryName = product.category || 'Standard';
      const categoryUrl = product.category ? product.category + '.html' : 'landscapes.html';
      if (product.category === 'flora-fauna') {
        categoryName = 'Plants & Animals';
      } else {
        categoryName = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
      }
      
      const categoryLink = document.createElement('a');
      categoryLink.href = categoryUrl;
      categoryLink.textContent = categoryName;
      
      const currentSpan = document.createElement('span');
      currentSpan.className = 'breadcrumbs-current';
      currentSpan.textContent = product.title;
      
      const createSep = () => {
        const sep = document.createElement('span');
        sep.className = 'breadcrumbs-separator';
        sep.textContent = ' / ';
        return sep;
      };
      
      breadcrumbsEl.appendChild(homeLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(shopLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(categoryLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(currentSpan);
    }

    // Format-Aware Page Layout
    const layoutContainer = document.querySelector('.product-layout');
    if (layoutContainer && product.format) {
      // Clear standard formats and apply matching format class
      layoutContainer.classList.remove('format-standard', 'format-panorama', 'format-aerial');
      layoutContainer.classList.add('format-' + product.format);
    }

    document.getElementById('product-title').textContent = product.title;
    document.getElementById('product-description').textContent = product.description;

    // Main image
    const mainWrap = document.getElementById('main-image-wrap');
    mainWrap.innerHTML = '';
    const mainImg = document.createElement('img');
    mainImg.src = addTransform(product.images.hero, 'f_auto,q_auto,w_2400');
    mainImg.alt = product.title;
    mainWrap.appendChild(mainImg);

    // Thumbnails: hero + extras, deduplicated
    const seen = {};
    const thumbUrls = [product.images.hero].concat(product.images.thumbnails || []).filter(url => {
      if (seen[url]) return false; seen[url] = true; return true;
    });

    const thumbsEl = document.getElementById('thumbnails');
    thumbsEl.innerHTML = '';
    thumbUrls.forEach((url, i) => {
      const div = document.createElement('div');
      div.className = 'thumb' + (i === 0 ? ' active' : '');
      const thumbSrc = addTransform(url, 'f_auto,q_auto,w_200');
      const fullSrc = addTransform(url, 'f_auto,q_auto,w_2400');
      div.onclick = () => selectThumb(i, fullSrc, product.title);
      const img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = product.title + ' view ' + (i + 1);
      div.appendChild(img);
      thumbsEl.appendChild(div);
    });

    const galleryFullUrls = thumbUrls.map(url => addTransform(url, 'f_auto,q_auto,w_2400'));
    setupProductGallery(galleryFullUrls, product.title);

    // Price display
    const priceEl = document.getElementById('product-price');
    priceEl.textContent = 'Starting at $' + Number(product.startingPrice).toFixed(2);

    // Populate dropdowns from product.pricing dynamically
    const sizeEl = document.getElementById('select-size');
    const matEl = document.getElementById('select-material');

    const materials = Object.keys(product.pricing);
    const sizeSet = new Set();
    materials.forEach(m => {
      Object.keys(product.pricing[m]).forEach(s => {
        sizeSet.add(s);
      });
    });
    const sizes = Array.from(sizeSet);

    function showValidationError(msg) {
      const errEl = document.getElementById('validation-error');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    function clearValidationError() {
      const errEl = document.getElementById('validation-error');
      errEl.style.display = 'none';
      errEl.textContent = '';
    }

    function populateSizes(selectedMat) {
      const currentSize = sizeEl.value;
      sizeEl.innerHTML = '<option value="">Select</option>';
      sizes.forEach(s => {
        const isAvailable = !selectedMat || (product.pricing[selectedMat] && product.pricing[selectedMat][s] != null);
        if (isAvailable) {
          const opt = document.createElement('option');
          opt.value = s; opt.textContent = s;
          sizeEl.appendChild(opt);
        }
      });
      if (currentSize && Array.from(sizeEl.options).some(o => o.value === currentSize)) {
        sizeEl.value = currentSize;
      } else {
        sizeEl.value = '';
      }
    }

    function populateMaterials(selectedSize) {
      const currentMat = matEl.value;
      matEl.innerHTML = '<option value="">Select</option>';
      materials.forEach(m => {
        const isAvailable = !selectedSize || (product.pricing[m] && product.pricing[m][selectedSize] != null);
        if (isAvailable) {
          const opt = document.createElement('option');
          opt.value = m; opt.textContent = m;
          matEl.appendChild(opt);
        }
      });
      if (currentMat && Array.from(matEl.options).some(o => o.value === currentMat)) {
        matEl.value = currentMat;
      } else {
        matEl.value = '';
      }
    }

    populateSizes('');
    populateMaterials('');

    function updatePrice() {
      const size = sizeEl.value;
      const mat = matEl.value;
      if (size && mat && product.pricing[mat] && product.pricing[mat][size] != null) {
        priceEl.textContent = '$' + Number(product.pricing[mat][size]).toFixed(2);
      } else {
        priceEl.textContent = 'Starting at $' + Number(product.startingPrice).toFixed(2);
      }
    }

    sizeEl.addEventListener('change', () => {
      populateMaterials(sizeEl.value);
      populateSizes(matEl.value);
      updatePrice();
      clearValidationError();
    });

    matEl.addEventListener('change', () => {
      populateSizes(matEl.value);
      populateMaterials(sizeEl.value);
      updatePrice();
      clearValidationError();
    });

    // Add to Cart handler
    const addToCartBtn = document.getElementById('add-to-cart-btn');
    addToCartBtn.onclick = () => {
      const size = sizeEl.value;
      const mat = matEl.value;
      const qty = parseInt(document.getElementById('qty').value) || 1;

      if (!size || !mat) {
        showValidationError('Please select both a print size and material.');
        return;
      }

      const price = product.pricing[mat] && product.pricing[mat][size];
      if (price == null) {
        showValidationError('This combination is not available.');
        return;
      }

      clearValidationError();

      if (typeof addToCart === 'function') {
        addToCart({
          id: product.id,
          title: product.title,
          size: size,
          material: mat,
          price: price,
          quantity: qty,
          thumbnail: addTransform(product.images.hero, 'f_auto,q_auto,w_200')
        });
      }
    };

    // Render suggestions
    renderSuggestions(allProducts, product);
  }

  // ── NOT-FOUND STATE ───────────────────────────────────────────────────────
  function renderNotFound() {
    document.title = 'Coming Soon — G.Licious Pics';
    document.getElementById('product-title').textContent = 'Coming Soon';
    document.getElementById('product-description').textContent =
      'This print is not yet listed in the shop. Browse the standard galleries or contact us to request a custom order.';
    const priceEl = document.getElementById('product-price');
    if (priceEl) priceEl.textContent = '';
    const sizeEl = document.getElementById('select-size');
    if (sizeEl) sizeEl.disabled = true;
    const matEl = document.getElementById('select-material');
    if (matEl) matEl.disabled = true;
  }

  // ── INIT: fetch products.json then render ─────────────────────────────────
  function init() {
    const id = getProductId();
    const cached = sessionStorage.getItem('glicious-products');
    if (cached) {
      try {
        const data = JSON.parse(cached);
        const all = [].concat(data.panoramas || [], data.standard || [], data.aerial || []);
        const product = all.find(p => p.id === id);
        product ? renderProduct(product, all) : renderNotFound();
        return;
      } catch (e) {
        console.warn('Error parsing cached products.json, fetching fresh:', e);
      }
    }

    fetch('../products.json')
      .then(res => res.arrayBuffer())
      .then(buffer => {
        const decoder = new TextDecoder('utf-8');
        const text = decoder.decode(buffer);
        try {
          sessionStorage.setItem('glicious-products', text);
        } catch (e) {
          console.warn('Could not cache products.json in sessionStorage:', e);
        }
        return JSON.parse(text);
      })
      .then(data => {
        const all = [].concat(data.panoramas || [], data.standard || [], data.aerial || []);
        const product = all.find(p => p.id === id);

        product ? renderProduct(product, all) : renderNotFound();
      })
      .catch(err => {
        console.error('Could not load products.json:', err);
        renderNotFound();
      });
  }

  // ── ACCORDIONS ───────────────────────────────────────────────────────────
  function setAccordionOpen(item, open) {
    const body = item.querySelector('.accordion-body');
    const btn = item.querySelector('.accordion-trigger');
    if (open) {
      item.classList.add('open');
      body.style.maxHeight = body.scrollHeight + 'px';
      btn.setAttribute('aria-expanded', 'true');
    } else {
      item.classList.remove('open');
      body.style.maxHeight = '0';
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    const materialsAccordion = document.getElementById('acc-materials');
    if (materialsAccordion) {
      setAccordionOpen(materialsAccordion, true);
    }

    document.querySelectorAll('.accordion-trigger').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.closest('.accordion-item');
        const isOpen = item.classList.contains('open');
        document.querySelectorAll('.accordion-item.open').forEach(el => {
          setAccordionOpen(el, false);
        });
        if (!isOpen) {
          setAccordionOpen(item, true);
        }
      });
    });
  });

  init();
})();
