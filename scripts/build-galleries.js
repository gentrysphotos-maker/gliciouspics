const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const productsPath = path.join(rootDir, 'products.json');
const pagesDir = path.join(rootDir, 'pages');

// Load products.json
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

// Helper to format Cloudinary URL transforms
function addTransform(url, transform) {
  const decodedUrl = decodeURIComponent(url);
  const index = decodedUrl.indexOf('/upload/');
  if (index !== -1) {
    return decodedUrl.slice(0, index + 8) + transform + '/' + decodedUrl.slice(index + 8);
  }
  return decodedUrl;
}

// Simple seedable pseudo-random generator (LCG)
function createRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

// Deterministic shuffle using category name as seed
function deterministicShuffle(array, seedString) {
  let seed = 0;
  for (let i = 0; i < seedString.length; i++) {
    seed = (seed << 5) - seed + seedString.charCodeAt(i);
    seed |= 0; // Convert to 32-bit integer
  }
  seed = Math.abs(seed);
  
  const rand = createRandom(seed);
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// Map categories and details
const categories = {
  underwater: {
    title: 'Underwater — G.Licious Pics',
    description: 'Fine art underwater photography prints by G.Licious — green sea turtles, marine wildlife, and tropical ocean waves.',
    titleDisplay: 'Underwater',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => (products.standard || []).filter(p => p.category === 'underwater'),
    layout: 'masonry'
  },
  landscapes: {
    title: 'Landscapes — G.Licious Pics',
    description: 'Fine art landscape photography prints by G.Licious — volcanic cliffs, coastal tidepools, mountain valleys, and tropical sunrises in Hawaii.',
    titleDisplay: 'Landscapes',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => (products.standard || []).filter(p => p.category === 'landscapes'),
    layout: 'masonry'
  },
  'flora-fauna': {
    title: 'Plants & Animals — G.Licious Pics',
    description: 'Fine art flora and fauna photography prints by G.Licious — tropical flowers, gecko lizards, chameleons, and local wildlife of Hawaii.',
    titleDisplay: 'Plants & Animals',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => (products.standard || []).filter(p => p.category === 'flora-fauna'),
    layout: 'masonry'
  },
  nightscapes: {
    title: 'Nightscapes — G.Licious Pics',
    description: 'Fine art nightscape photography prints by G.Licious — Milky Way skies, ocean tidepools under stars, and nighttime scenes in Oahu.',
    titleDisplay: 'Nightscapes',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => (products.standard || []).filter(p => p.category === 'nightscapes'),
    layout: 'masonry'
  },
  aerial: {
    title: 'Aerial — G.Licious Pics',
    description: 'Fine art aerial photography prints by G.Licious — Hawaii from above, drone perspectives of coastlines and terrain.',
    titleDisplay: 'Aerial',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => products.aerial || [],
    layout: 'masonry'
  },
  travel: {
    title: 'Travel — G.Licious Pics',
    description: 'Fine art travel photography prints by G.Licious — scenic mountaintops, honcho streets in Japan, temples, and international landscapes.',
    titleDisplay: 'Travel',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Interested in a print?',
    bottomText: 'Available in multiple sizes and mediums. Reach out for pricing and custom orders.',
    getProducts: () => (products.standard || []).filter(p => p.category === 'travel'),
    layout: 'masonry'
  },
  panoramas: {
    title: 'Panoramas — G.Licious Pics',
    description: 'Fine art panoramic photography prints by G.Licious — sweeping wide-format vistas of Hawaii and beyond.',
    titleDisplay: 'Panoramas',
    eyebrow: 'The Collection',
    bottomEyebrow: 'Make a statement',
    bottomText: 'Panoramas look incredible on Chromaluxe aluminum at large sizes. Ask about custom sizing.',
    introText: 'These wide-format panoramas are especially striking as large metal prints. Each image wraps across the wall — perfect for a living room or office statement piece.',
    getProducts: () => products.panoramas || [],
    layout: 'panoramas'
  }
};

const verticalPanoramas = [
  'hawaii-nature-heliconia-flower-panorama-print',
  'hawaii-hidden-gecko-nature-panorama',
  'hawaii-water-lily-flower-nature-panorama'
];

function buildHeader(title, description, isPano) {
  const customPanoStyles = isPano ? `  <style>
    .pano-grid {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .pano-item {
      position: relative;
      overflow: hidden;
      cursor: pointer;
      width: 100%;
    }
    .pano-item img {
      width: 100%;
      height: auto;
      display: block;
      transition: transform 0.5s ease, filter 0.4s ease;
      filter: brightness(0.9);
    }
    .pano-item:hover img { transform: scale(1.02); filter: brightness(1); }
    .pano-item .photo-overlay {
      position: absolute;
      inset: 0;
      background: rgba(0,0,0,0);
      display: flex;
      align-items: flex-end;
      padding: 1.5rem;
      transition: background 0.35s ease;
    }
    .pano-item:hover .photo-overlay { background: rgba(0,0,0,0.4); }
    .pano-item:hover .photo-overlay-btn { opacity: 1; transform: translateY(0); }
    .pano-vertical-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 4px;
    }
    @media (max-width: 768px) {
      .pano-vertical-row { grid-template-columns: 1fr; }
    }
  </style>` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <link rel="preconnect" href="https://res.cloudinary.com" crossorigin />
  <link rel="icon" type="image/svg+xml" href="../favicon.svg" />
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <meta name="description" content="${description}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Josefin+Sans:wght@200;300;400&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../css/style.css" />
  <script src="../js/cart.js"></script>
${customPanoStyles}

  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://gliciouspics.com/pages/${title.split(' ')[0].toLowerCase().replace('&', 'and')}.html" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:title" content="${title}" />
  <meta property="twitter:description" content="${description}" />
</head>
<body>
  <header class="site-header" id="site-header">
    <a href="../index.html" class="logo">G.Licious</a>
    <button class="nav-toggle" id="nav-toggle" aria-label="Toggle menu">
      <span></span><span></span><span></span>
    </button>
    <nav class="site-nav" id="site-nav">
      <a href="../index.html" class="nav-link">Home</a>
      <div class="nav-dropdown">
        <span class="nav-link dropdown-trigger active">Shop <span class="dropdown-chevron" aria-hidden="true">▾</span></span>
        <div class="dropdown-menu">
          <a href="underwater.html">Underwater</a>
          <a href="landscapes.html">Landscapes</a>
          <a href="flora-fauna.html">Plants &amp; Animals</a>
          <a href="nightscapes.html">Nightscapes</a>
          <a href="aerial.html">Aerial</a>
          <a href="travel.html">Travel</a>
          <a href="panoramas.html">Panoramas</a>
        </div>
      </div>
      <a href="../index.html#about" class="nav-link">About</a>
      <a href="../index.html#contact" class="nav-link">Contact</a>
      <div class="nav-socials">
        <a href="cart.html" class="nav-cart" aria-label="View Cart">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <path d="M16 10a4 4 0 0 1-8 0"></path>
          </svg>
          <span class="cart-count">0</span>
        </a>
      </div>
    </nav>
  </header>`;
}

function buildFooter() {
  return `  <footer class="site-footer">
    <div class="footer-inner">
      <a href="../index.html" class="footer-logo">G.Licious</a>
      <nav class="footer-nav">
        <a href="../index.html">Home</a>
        <a href="../index.html#galleries">Shop</a>
        <a href="../index.html#about">About</a>
        <a href="../index.html#contact">Contact</a>
        <a href="faq.html">FAQ</a>
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms of Service</a>
        <a href="returns.html">Returns &amp; Refunds</a>
      </nav>
      <div class="footer-socials">
        <a href="https://instagram.com/g.liciouspics" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="0.5" fill="currentColor"/></svg>
        </a>
      </div>
      <p class="footer-copy">© 2026 G.Licious Pics by Gentry. All rights reserved.</p>
    </div>
  </footer>
  <script src="../js/main.js"></script>
</body>
</html>`;
}

// Generate each category page
Object.keys(categories).forEach(catKey => {
  const cat = categories[catKey];
  let items = cat.getProducts();

  // Shuffle items deterministically based on the category name
  items = deterministicShuffle(items, catKey);

  console.log(`Generating ${catKey}.html with ${items.length} products...`);

  let bodyHtml = `
  <main class="gallery-page">
    <div class="gallery-page-header">
      <div>
        <span class="section-eyebrow">${cat.eyebrow}</span>
        <h1 class="section-title" style="margin-bottom:0">${cat.titleDisplay}</h1>
      </div>
      <a href="../index.html#contact" class="btn-outline">Order a Custom Print</a>
    </div>`;

  if (cat.introText) {
    bodyHtml += `
    <p style="color:var(--silver);font-size:0.9rem;margin-bottom:2.5rem;max-width:560px;">${cat.introText}</p>`;
  }

  if (cat.layout === 'masonry') {
    bodyHtml += `
    <div class="gallery-masonry">`;
    items.forEach(p => {
      bodyHtml += `
      <a href="product.html?id=${p.id}" class="gallery-masonry-item fade-up">
        <img src="${addTransform(p.images.hero, 'f_auto,q_auto,w_800')}" alt="${p.title}" loading="lazy" />
        <div class="photo-overlay"><span class="photo-overlay-btn">View + Buy Print</span></div>
      </a>`;
    });
    bodyHtml += `
    </div>`;
  } else if (cat.layout === 'panoramas') {
    const horizontalItems = items.filter(p => !verticalPanoramas.includes(p.id));
    const verticalItems = items.filter(p => verticalPanoramas.includes(p.id));

    // Render Wide/Horizontal Panoramas
    bodyHtml += `
    <div class="pano-grid">`;
    horizontalItems.forEach(p => {
      bodyHtml += `
      <a href="product.html?id=${p.id}" class="pano-item fade-up">
        <img src="${addTransform(p.images.hero, 'f_auto,q_auto,w_2400')}" alt="${p.title}" loading="lazy" />
        <div class="photo-overlay"><span class="photo-overlay-btn">View + Buy Print</span></div>
      </a>`;
    });
    bodyHtml += `
    </div>`;

    // Render Vertical Panoramas
    if (verticalItems.length > 0) {
      bodyHtml += `
    <div class="pano-vertical-row" style="margin-top:4px;">`;
      verticalItems.forEach(p => {
        bodyHtml += `
      <a href="product.html?id=${p.id}" class="pano-item fade-up">
        <img src="${addTransform(p.images.hero, 'f_auto,q_auto,w_1000')}" alt="${p.title}" loading="lazy" />
        <div class="photo-overlay"><span class="photo-overlay-btn">View + Buy Print</span></div>
      </a>`;
      });
      bodyHtml += `
    </div>`;
    }
  }

  bodyHtml += `
    <div style="text-align:center;margin-top:4rem;padding-top:3rem;border-top:1px solid var(--mid);">
      <span class="section-eyebrow">${cat.bottomEyebrow}</span>
      <p style="color:var(--silver);font-size:0.95rem;margin-bottom:1.5rem;">${cat.bottomText}</p>
      <a href="../index.html#contact" class="btn-primary">Request a Print</a>
    </div>
  </main>
`;

  const finalHtml = buildHeader(cat.title, cat.description, cat.layout === 'panoramas') + bodyHtml + buildFooter();
  fs.writeFileSync(path.join(pagesDir, `${catKey}.html`), finalHtml, 'utf8');
});

console.log('Successfully completed building all category gallery pages!');
