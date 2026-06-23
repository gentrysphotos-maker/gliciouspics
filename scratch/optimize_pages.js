const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pagesDir = path.join(rootDir, 'pages');

// Map of page-specific OG images
const imageMap = {
  'index.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'underwater.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/underwater/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'landscapes.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/landscapes/seal-beach-hawaii-coastal-landscape-sunset-01.jpg',
  'flora-fauna.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/flora-fauna/oahu-gecko-tropical-heliconia-flower-wildlife-print-01.jpg',
  'nightscapes.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/nightscapes/oahu-makapuu-beach-night-sky-milky-way-photography.jpg',
  'aerial.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/aerial/hawaii-aerial-scenic-coastline-from-above-02.jpg',
  'travel.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/travel/fuji-love-mount-fuji-japan-travel-photography-01.jpg',
  'panoramas.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/panoramas/oahu-manoa-jungle-landscape-panorama-fine-art-print.jpg',
  'cart.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'faq.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'privacy.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'terms.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'returns.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'product-standard.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'product-panorama.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg',
  'product-aerial.html': 'https://res.cloudinary.com/dbqfibadw/image/upload/w_1200,h_630,c_fill,q_auto,f_auto/gliciouspics/homepage/hidden-honu-hawaii-green-sea-turtle-underwater.jpg'
};

function processFile(filePath, isRoot) {
  const filename = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\r\n/g, '\n');

  // 1. Clean existing OG and Twitter meta tags, and preconnect/favicon if present
  content = content.replace(/<meta property="og:[^>]*>/gi, '');
  content = content.replace(/<meta property="twitter:[^>]*>/gi, '');
  content = content.replace(/<meta name="twitter:[^>]*>/gi, '');
  content = content.replace(/<link rel="preconnect" href="https:\/\/res.cloudinary.com"[^>]*>/gi, '');
  content = content.replace(/<link rel="icon" type="image\/svg\+xml"[^>]*>/gi, '');

  // Clean double blank lines caused by regex cleanups
  content = content.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Extract title and description
  const titleMatch = content.match(/<title>(.*?)<\/title>/i);
  const title = titleMatch ? titleMatch[1].trim() : 'G.Licious Pics';

  const descMatch = content.match(/<meta name="description" content="(.*?)"/i) || content.match(/<meta name="description" content='(.*?)'/i);
  const description = descMatch ? descMatch[1].trim() : 'Fine art photography prints by G.Licious Pics';

  const pageUrl = isRoot ? 'https://gliciouspics.com/' : `https://gliciouspics.com/pages/${filename}`;
  const imageUrl = imageMap[filename] || imageMap['index.html'];

  const faviconPath = isRoot ? 'favicon.svg' : '../favicon.svg';

  // Construct tags to insert inside <head>
  const headInjects = `  <link rel="preconnect" href="https://res.cloudinary.com" crossorigin />
  <link rel="icon" type="image/svg+xml" href="${faviconPath}" />`;

  const metaInjects = `
  <!-- Open Graph / Facebook -->
  <meta property="og:type" content="website" />
  <meta property="og:url" content="${pageUrl}" />
  <meta property="og:title" content="${title}" />
  <meta property="og:description" content="${description}" />
  <meta property="og:image" content="${imageUrl}" />

  <!-- Twitter -->
  <meta property="twitter:card" content="summary_large_image" />
  <meta property="twitter:url" content="${pageUrl}" />
  <meta property="twitter:title" content="${title}" />
  <meta property="twitter:description" content="${description}" />
  <meta property="twitter:image" content="${imageUrl}" />`;

  // Inject preconnect & favicon right after <head>
  const headOpenIndex = content.indexOf('<head>');
  if (headOpenIndex !== -1) {
    const insertPos = headOpenIndex + '<head>'.length;
    content = content.slice(0, insertPos) + '\n' + headInjects + content.slice(insertPos);
  }

  // Inject meta tags right before </head>
  const headCloseIndex = content.indexOf('</head>');
  if (headCloseIndex !== -1) {
    content = content.slice(0, headCloseIndex) + metaInjects + '\n' + content.slice(headCloseIndex);
  }

  // Normalize final blank lines
  content = content.replace(/\n\n\n+/g, '\n\n');

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Processed and optimized ${filename}`);
}

// Process index.html
processFile(path.join(rootDir, 'index.html'), true);

// Process pages/*.html
const pages = Object.keys(imageMap).filter(f => f !== 'index.html');
pages.forEach(file => {
  const filePath = path.join(pagesDir, file);
  if (fs.existsSync(filePath)) {
    processFile(filePath, false);
  }
});
