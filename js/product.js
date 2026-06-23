// G.Licious Pics — Shared Product Page Logic
// Handles fetching, rendering options, dynamic pricing, cart addition, and layout adaptions.

(function () {
  // ── HELPERS ──────────────────────────────────────────────────────────────

  // Read id parameter from URL query string
  function getProductId() {
    var params = new URLSearchParams(window.location.search);
    return params.get('id');
  }

  // Insert Cloudinary transform params into a bare upload URL
  function addTransform(url, transform) {
    var decodedUrl = decodeURIComponent(url);
    var index = decodedUrl.indexOf('/upload/');
    if (index !== -1) {
      return decodedUrl.slice(0, index + 8) + transform + '/' + decodedUrl.slice(index + 8);
    }
    return decodedUrl;
  }

  // ── THUMBNAIL SWITCHER ────────────────────────────────────────────────────
  function selectThumb(index, src, alt) {
    document.querySelectorAll('.thumb').forEach(function (t, i) {
      t.classList.toggle('active', i === index);
    });
    var mainWrap = document.getElementById('main-image-wrap');
    var mainImg = mainWrap.querySelector('img');
    if (mainImg && src) {
      mainImg.style.opacity = '0';
      var tempImg = new Image();
      tempImg.onload = function () {
        mainImg.src = src;
        mainImg.alt = alt || '';
        mainImg.style.opacity = '1';
      };
      tempImg.src = src;
    }
  }

  // ── RENDER SUGGESTIONS ───────────────────────────────────────────────────
  function renderSuggestions(allProducts, currentProduct) {
    // 1. Filter out the current product
    var pool = allProducts.filter(function (p) { return p.id !== currentProduct.id; });

    // 2. Shuffle the pool to ensure random selection
    pool.sort(function () { return 0.5 - Math.random(); });

    // 3. Select 4 products from distinct categories (prioritizing other categories)
    var selected = [];
    var seenCategories = new Set();

    for (var i = 0; i < pool.length; i++) {
      var p = pool[i];
      if (p.category !== currentProduct.category && !seenCategories.has(p.category)) {
        selected.push(p);
        seenCategories.add(p.category);
        if (selected.length === 4) break;
      }
    }

    // If we need more to fill 4 slots, grab any remaining products
    if (selected.length < 4) {
      for (var i = 0; i < pool.length; i++) {
        var p = pool[i];
        if (!selected.some(function (s) { return s.id === p.id; })) {
          selected.push(p);
          if (selected.length === 4) break;
        }
      }
    }

    var grid = document.getElementById('suggestions-grid');
    grid.innerHTML = '';

    selected.forEach(function (p) {
      var card = document.createElement('a');
      // Point all links to the unified product page with ID
      card.href = 'product.html?id=' + p.id;
      card.className = 'suggestion-card';

      var imgWrap = document.createElement('div');
      imgWrap.className = 'suggestion-img-wrap';

      var img = document.createElement('img');
      img.src = addTransform(p.images.hero, 'f_auto,q_auto,w_600');
      img.alt = p.title;
      img.loading = 'lazy';

      imgWrap.appendChild(img);

      var title = document.createElement('div');
      title.className = 'suggestion-title';
      title.textContent = p.title;

      var price = document.createElement('div');
      price.className = 'suggestion-price';
      price.textContent = 'Starting at $' + Number(p.startingPrice).toFixed(2);

      card.appendChild(imgWrap);
      card.appendChild(title);
      card.appendChild(price);

      grid.appendChild(card);
    });
  }

  // Helper to dynamically update or create head meta tags for SEO
  function updateMetaTag(attribute, attrValue, contentValue, keyName) {
    keyName = keyName || 'content';
    var selector = 'meta[' + attribute + '="' + attrValue + '"]';
    var tag = document.querySelector(selector);
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
    var description = product.description || 'Fine Art Photography Print by Gentry.';
    updateMetaTag('name', 'description', description);
    updateMetaTag('property', 'og:url', window.location.href);
    updateMetaTag('property', 'og:title', product.title + ' — G.Licious Pics');
    updateMetaTag('property', 'og:description', description);
    
    var shareImgUrl = addTransform(product.images.hero, 'f_auto,q_auto,w_1200,h_630,c_fill');
    updateMetaTag('property', 'og:image', shareImgUrl);
    
    // Twitter Cards
    updateMetaTag('property', 'twitter:url', window.location.href);
    updateMetaTag('property', 'twitter:title', product.title + ' — G.Licious Pics');
    updateMetaTag('property', 'twitter:description', description);
    updateMetaTag('property', 'twitter:image', shareImgUrl);

    // Canonical link tag (med-7)
    var canonicalUrl = 'https://gliciouspics.com/pages/product.html?id=' + product.id;
    var canonicalTag = document.querySelector('link[rel="canonical"]');
    if (canonicalTag) {
      canonicalTag.setAttribute('href', canonicalUrl);
    } else {
      canonicalTag = document.createElement('link');
      canonicalTag.setAttribute('rel', 'canonical');
      canonicalTag.setAttribute('href', canonicalUrl);
      document.head.appendChild(canonicalTag);
    }

    // Dynamic JSON-LD Structured Data (med-6)
    var lowPrice = product.startingPrice;
    var highPrice = product.startingPrice;
    var offerCount = 0;
    var priceList = [];
    
    Object.keys(product.pricing).forEach(function(m) {
      Object.keys(product.pricing[m]).forEach(function(s) {
        var val = product.pricing[m][s];
        if (val != null) {
          priceList.push(val);
        }
      });
    });
    if (priceList.length > 0) {
      lowPrice = Math.min.apply(null, priceList);
      highPrice = Math.max.apply(null, priceList);
      offerCount = priceList.length;
    }

    var jsonLdData = {
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

    var jsonLdSelector = 'script[type="application/ld+json"]';
    var scriptTag = document.querySelector(jsonLdSelector);
    if (!scriptTag) {
      scriptTag = document.createElement('script');
      scriptTag.setAttribute('type', 'application/ld+json');
      document.head.appendChild(scriptTag);
    }
    scriptTag.textContent = JSON.stringify(jsonLdData, null, 2);

    // Populate Breadcrumbs (med-9)
    var breadcrumbsEl = document.getElementById('breadcrumbs');
    if (breadcrumbsEl) {
      breadcrumbsEl.innerHTML = '';
      
      var homeLink = document.createElement('a');
      homeLink.href = '../index.html';
      homeLink.textContent = 'Home';
      
      var shopLink = document.createElement('a');
      shopLink.href = '../index.html#galleries';
      shopLink.textContent = 'Shop';
      
      var categoryName = product.category || 'Standard';
      var categoryUrl = product.category ? product.category + '.html' : 'landscapes.html';
      if (product.category === 'flora-fauna') {
        categoryName = 'Plants & Animals';
      } else {
        categoryName = categoryName.charAt(0).toUpperCase() + categoryName.slice(1);
      }
      
      var categoryLink = document.createElement('a');
      categoryLink.href = categoryUrl;
      categoryLink.textContent = categoryName;
      
      var currentSpan = document.createElement('span');
      currentSpan.className = 'breadcrumbs-current';
      currentSpan.textContent = product.title;
      
      function createSep() {
        var sep = document.createElement('span');
        sep.className = 'breadcrumbs-separator';
        sep.textContent = ' / ';
        return sep;
      }
      
      breadcrumbsEl.appendChild(homeLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(shopLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(categoryLink);
      breadcrumbsEl.appendChild(createSep());
      breadcrumbsEl.appendChild(currentSpan);
    }

    // Format-Aware Page Layout
    var layoutContainer = document.querySelector('.product-layout');
    if (layoutContainer && product.format) {
      // Clear standard formats and apply matching format class
      layoutContainer.classList.remove('format-standard', 'format-panorama', 'format-aerial');
      layoutContainer.classList.add('format-' + product.format);
    }

    document.getElementById('product-title').textContent = product.title;
    document.getElementById('product-description').textContent = product.description;

    // Main image
    var mainWrap = document.getElementById('main-image-wrap');
    mainWrap.innerHTML = '';
    var mainImg = document.createElement('img');
    mainImg.src = addTransform(product.images.hero, 'f_auto,q_auto,w_2400');
    mainImg.alt = product.title;
    mainWrap.appendChild(mainImg);

    // Thumbnails: hero + extras, deduplicated
    var seen = {};
    var thumbUrls = [product.images.hero].concat(product.images.thumbnails || []).filter(function (url) {
      if (seen[url]) return false; seen[url] = true; return true;
    });

    var thumbsEl = document.getElementById('thumbnails');
    thumbsEl.innerHTML = '';
    thumbUrls.forEach(function (url, i) {
      var div = document.createElement('div');
      div.className = 'thumb' + (i === 0 ? ' active' : '');
      var thumbSrc = addTransform(url, 'f_auto,q_auto,w_200');
      var fullSrc = addTransform(url, 'f_auto,q_auto,w_2400');
      (function (idx, s) { div.onclick = function () { selectThumb(idx, s, product.title); }; })(i, fullSrc);
      var img = document.createElement('img');
      img.src = thumbSrc;
      img.alt = product.title + ' view ' + (i + 1);
      div.appendChild(img);
      thumbsEl.appendChild(div);
    });

    // Price display
    var priceEl = document.getElementById('product-price');
    priceEl.textContent = 'Starting at $' + Number(product.startingPrice).toFixed(2);

    // Populate dropdowns from product.pricing dynamically
    var sizeEl = document.getElementById('select-size');
    var matEl = document.getElementById('select-material');

    var materials = Object.keys(product.pricing);
    var sizeSet = new Set();
    materials.forEach(function (m) {
      Object.keys(product.pricing[m]).forEach(function (s) {
        sizeSet.add(s);
      });
    });
    var sizes = Array.from(sizeSet);

    function showValidationError(msg) {
      var errEl = document.getElementById('validation-error');
      errEl.textContent = msg;
      errEl.style.display = 'block';
    }

    function clearValidationError() {
      var errEl = document.getElementById('validation-error');
      errEl.style.display = 'none';
      errEl.textContent = '';
    }

    function populateSizes(selectedMat) {
      var currentSize = sizeEl.value;
      sizeEl.innerHTML = '<option value="">Select</option>';
      sizes.forEach(function (s) {
        var isAvailable = !selectedMat || (product.pricing[selectedMat] && product.pricing[selectedMat][s] != null);
        if (isAvailable) {
          var opt = document.createElement('option');
          opt.value = s; opt.textContent = s;
          sizeEl.appendChild(opt);
        }
      });
      if (currentSize && Array.from(sizeEl.options).some(function (o) { return o.value === currentSize; })) {
        sizeEl.value = currentSize;
      } else {
        sizeEl.value = '';
      }
    }

    function populateMaterials(selectedSize) {
      var currentMat = matEl.value;
      matEl.innerHTML = '<option value="">Select</option>';
      materials.forEach(function (m) {
        var isAvailable = !selectedSize || (product.pricing[m] && product.pricing[m][selectedSize] != null);
        if (isAvailable) {
          var opt = document.createElement('option');
          opt.value = m; opt.textContent = m;
          matEl.appendChild(opt);
        }
      });
      if (currentMat && Array.from(matEl.options).some(function (o) { return o.value === currentMat; })) {
        matEl.value = currentMat;
      } else {
        matEl.value = '';
      }
    }

    populateSizes('');
    populateMaterials('');

    function updatePrice() {
      var size = sizeEl.value;
      var mat = matEl.value;
      if (size && mat && product.pricing[mat] && product.pricing[mat][size] != null) {
        priceEl.textContent = '$' + Number(product.pricing[mat][size]).toFixed(2);
      } else {
        priceEl.textContent = 'Starting at $' + Number(product.startingPrice).toFixed(2);
      }
    }

    sizeEl.addEventListener('change', function () {
      populateMaterials(sizeEl.value);
      populateSizes(matEl.value);
      updatePrice();
      clearValidationError();
    });

    matEl.addEventListener('change', function () {
      populateSizes(matEl.value);
      populateMaterials(sizeEl.value);
      updatePrice();
      clearValidationError();
    });

    // Add to Cart handler
    var addToCartBtn = document.getElementById('add-to-cart-btn');
    addToCartBtn.onclick = function () {
      var size = sizeEl.value;
      var mat = matEl.value;
      var qty = parseInt(document.getElementById('qty').value) || 1;

      if (!size || !mat) {
        showValidationError('Please select both a print size and material.');
        return;
      }

      var price = product.pricing[mat] && product.pricing[mat][size];
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

      // Change button text temporarily to show success
      var originalText = addToCartBtn.textContent;
      addToCartBtn.textContent = 'Added to Cart!';
      addToCartBtn.disabled = true;
      setTimeout(function () {
        addToCartBtn.textContent = originalText;
        addToCartBtn.disabled = false;
      }, 1500);
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
    var priceEl = document.getElementById('product-price');
    if (priceEl) priceEl.textContent = '';
    var sizeEl = document.getElementById('select-size');
    if (sizeEl) sizeEl.disabled = true;
    var matEl = document.getElementById('select-material');
    if (matEl) matEl.disabled = true;
  }

  // ── INIT: fetch products.json then render ─────────────────────────────────
  function init() {
    var id = getProductId();
    var cached = sessionStorage.getItem('glicious-products');
    if (cached) {
      try {
        var data = JSON.parse(cached);
        var all = [].concat(data.panoramas || [], data.standard || [], data.aerial || []);
        var product = all.find(function (p) { return p.id === id; });
        product ? renderProduct(product, all) : renderNotFound();
        return;
      } catch (e) {
        console.warn('Error parsing cached products.json, fetching fresh:', e);
      }
    }

    fetch('../products.json')
      .then(function (res) {
        return res.arrayBuffer();
      })
      .then(function (buffer) {
        var decoder = new TextDecoder('utf-8');
        var text = decoder.decode(buffer);
        try {
          sessionStorage.setItem('glicious-products', text);
        } catch (e) {
          console.warn('Could not cache products.json in sessionStorage:', e);
        }
        return JSON.parse(text);
      })
      .then(function (data) {
        var all = [].concat(data.panoramas || [], data.standard || [], data.aerial || []);
        var product = all.find(function (p) { return p.id === id; });

        product ? renderProduct(product, all) : renderNotFound();
      })
      .catch(function (err) {
        console.error('Could not load products.json:', err);
        renderNotFound();
      });
  }

  // ── ACCORDIONS ───────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('.accordion-trigger').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var item = btn.closest('.accordion-item');
        var body = item.querySelector('.accordion-body');
        var isOpen = item.classList.contains('open');
        document.querySelectorAll('.accordion-item.open').forEach(function (el) {
          el.classList.remove('open');
          el.querySelector('.accordion-body').style.maxHeight = '0';
          el.querySelector('.accordion-trigger').setAttribute('aria-expanded', 'false');
        });
        if (!isOpen) {
          item.classList.add('open');
          body.style.maxHeight = body.scrollHeight + 'px';
          btn.setAttribute('aria-expanded', 'true');
        }
      });
    });
  });

  init();
})();
