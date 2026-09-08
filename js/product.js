// G.licious Pics — Shared Product Page Logic
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

  const THUMB_TRANSFORM = 'f_auto,q_auto,c_fill,w_300,h_300';
  const preloadedUrls = {};
  let mainSwapToken = 0;
  let lightboxSwapToken = 0;

  function preloadImage(url) {
    if (!url || preloadedUrls[url]) return;
    preloadedUrls[url] = true;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  }

  function preloadNeighbors(urls, index) {
    if (!urls.length) return;
    preloadImage(urls[index]);
    preloadImage(urls[(index + 1) % urls.length]);
    preloadImage(urls[(index - 1 + urls.length) % urls.length]);
  }

  function ensureImageLoader(parent) {
    if (!parent) return null;
    let loader = parent.querySelector(':scope > .image-loader');
    if (!loader) {
      loader = document.createElement('div');
      loader.className = 'image-loader';
      loader.setAttribute('aria-hidden', 'true');
      parent.appendChild(loader);
    }
    return loader;
  }

  function setImageLoading(wrap, isLoading) {
    if (!wrap) return;
    wrap.classList.toggle('is-loading', isLoading);
    wrap.setAttribute('aria-busy', isLoading ? 'true' : 'false');
  }

  function nextSwapToken(kind) {
    if (kind === 'lightbox') return ++lightboxSwapToken;
    return ++mainSwapToken;
  }

  function currentSwapToken(kind) {
    return kind === 'lightbox' ? lightboxSwapToken : mainSwapToken;
  }

  function swapImageWhenReady(img, src, alt, wrap, kind, options) {
    if (!img || !src) return;
    const currentSrc = img.getAttribute('src') || '';
    if (currentSrc === src) {
      setImageLoading(wrap, false);
      return;
    }

    const token = nextSwapToken(kind);
    const apply = function () {
      if (token !== currentSwapToken(kind)) return;
      img.src = src;
      img.alt = alt || '';
      setImageLoading(wrap, false);
    };

    const pre = new Image();
    pre.onload = apply;
    pre.onerror = apply;
    pre.src = src;
    if (pre.complete) {
      apply();
      return;
    }

    if (options && options.quiet) return;

    ensureImageLoader(wrap);
    setImageLoading(wrap, true);
  }

  // ── THUMBNAIL SWITCHER ────────────────────────────────────────────────────
  function getActiveThumbIndex() {
    const thumbs = document.querySelectorAll('.thumb');
    for (let i = 0; i < thumbs.length; i++) {
      if (thumbs[i].classList.contains('active')) return i;
    }
    return 0;
  }

  function selectThumb(index) {
    document.querySelectorAll('.thumb').forEach((t, i) => {
      t.classList.toggle('active', i === index);
    });

    const src = productGallery.displayUrls[index];
    const mainWrap = document.getElementById('main-image-wrap');
    const mainImg = mainWrap && mainWrap.querySelector('img');
    swapImageWhenReady(mainImg, src, productGallery.alt, mainWrap, 'main');
    preloadNeighbors(productGallery.displayUrls, index);
    preloadNeighbors(productGallery.lightboxUrls, index);
  }

  // ── IMAGE LIGHTBOX ────────────────────────────────────────────────────────
  const productGallery = {
    displayUrls: [],
    lightboxUrls: [],
    alt: '',
    index: 0
  };

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
    const lightbox = document.getElementById('product-lightbox');
    const counter = document.getElementById('product-lightbox-counter');
    const prevBtn = document.getElementById('product-lightbox-prev');
    const nextBtn = document.getElementById('product-lightbox-next');
    if (!img) return;

    resetLightboxZoom();
    const displaySrc = productGallery.displayUrls[imageLightbox.index];
    const fullSrc = imageLightbox.urls[imageLightbox.index];
    if (displaySrc && img.getAttribute('src') !== fullSrc) {
      img.src = displaySrc;
      img.alt = imageLightbox.alt;
    }
    swapImageWhenReady(img, fullSrc, imageLightbox.alt, lightbox, 'lightbox', { quiet: true });
    preloadNeighbors(imageLightbox.urls, imageLightbox.index);

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
    lightboxSwapToken++;
    setImageLoading(lightbox, false);
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

    // Zoom event listeners removed as requested to disable zoom-on-hover effect
  }

  function setupProductGallery(displayUrls, lightboxUrls, alt) {
    productGallery.displayUrls = displayUrls;
    productGallery.lightboxUrls = lightboxUrls;
    productGallery.alt = alt;
    imageLightbox.urls = lightboxUrls;
    imageLightbox.alt = alt;
    initImageLightboxListeners();

    displayUrls.forEach(function (url, i) {
      if (i === 0) return;
      preloadImage(url);
    });
    preloadNeighbors(lightboxUrls, 0);

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
    // 1. Filter out the current product and panorama images
    const pool = allProducts.filter(p => p.id !== currentProduct.id && p.category !== 'panoramas');

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
    document.title = product.title + ' — G.licious Pics';
    
    // Dynamic SEO Descriptions & Open Graph Metadata
    const description = product.description || 'Fine Art Photography Print by Gentry.';
    updateMetaTag('name', 'description', description);
    updateMetaTag('property', 'og:url', window.location.href);
    updateMetaTag('property', 'og:title', product.title + ' — G.licious Pics');
    updateMetaTag('property', 'og:description', description);
    
    const shareImgUrl = addTransform(product.images.hero, 'f_auto,q_auto,w_1200,h_630,c_fill');
    updateMetaTag('property', 'og:image', shareImgUrl);
    
    // Twitter Cards
    updateMetaTag('property', 'twitter:url', window.location.href);
    updateMetaTag('property', 'twitter:title', product.title + ' — G.licious Pics');
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
        "name": "G.licious Pics"
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

    // Main image & lightbox transforms (panoramas use w_2400 to span full width sharply on desktop/retina)
    const isPano = product.format === 'panorama';
    const displayTransform = isPano ? 'f_auto,q_auto,w_2400' : 'f_auto,q_auto,w_1600';
    const lightboxTransform = isPano ? 'f_auto,q_auto,w_3200' : 'f_auto,q_auto,w_2400';

    // Main image — display-sized; lightbox uses a larger derivative
    const mainWrap = document.getElementById('main-image-wrap');
    mainWrap.innerHTML = '';
    const mainImg = document.createElement('img');
    mainImg.src = addTransform(product.images.hero, displayTransform);
    mainImg.alt = product.title;
    mainImg.decoding = 'async';
    mainImg.fetchPriority = 'high';
    mainWrap.appendChild(mainImg);

    // Thumbnails: hero + extras, deduplicated
    const seen = {};
    const thumbUrls = [product.images.hero].concat(product.images.thumbnails || []).filter(url => {
      if (seen[url]) return false; seen[url] = true; return true;
    });

    const displayUrls = thumbUrls.map(url => addTransform(url, displayTransform));
    const lightboxUrls = thumbUrls.map(url => addTransform(url, lightboxTransform));

    const thumbsEl = document.getElementById('thumbnails');
    thumbsEl.innerHTML = '';
    thumbUrls.forEach((url, i) => {
      const div = document.createElement('div');
      div.className = 'thumb' + (i === 0 ? ' active' : '');
      div.onclick = () => selectThumb(i);
      const img = document.createElement('img');
      img.src = addTransform(url, THUMB_TRANSFORM);
      img.alt = product.title + ' view ' + (i + 1);
      img.decoding = 'async';
      div.appendChild(img);
      thumbsEl.appendChild(div);
    });

    setupProductGallery(displayUrls, lightboxUrls, product.title);

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

    function parseSizeArea(sizeStr) {
      const parts = String(sizeStr).toLowerCase().split('x').map(n => parseFloat(n.trim()));
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * parts[1];
      }
      return 0;
    }

    const sizes = Array.from(sizeSet).sort((a, b) => parseSizeArea(a) - parseSizeArea(b));

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

      const metalNotice = document.getElementById('metal-notice');
      if (metalNotice) {
        if (mat === 'Chromaluxe Metal') {
          metalNotice.style.display = 'block';
        } else {
          metalNotice.style.display = 'none';
        }
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
        showValidationError('Please select both a print material and size.');
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
          thumbnail: addTransform(product.images.hero, 'f_auto,q_auto,w_400')
        });
      }
    };

    // Render suggestions
    renderSuggestions(allProducts, product);
  }

  // ── NOT-FOUND STATE ───────────────────────────────────────────────────────
  function renderNotFound() {
    document.title = 'Coming Soon — G.licious Pics';
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
        if (product) {
          renderProduct(product, all);
          return;
        }
        // If not found in cache, fall through to fetch a fresh version of the catalog
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
