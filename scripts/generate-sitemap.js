const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const productsPath = path.join(rootDir, 'products.json');
const products = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

const urls = [
  'https://gliciouspics.com/',
  'https://gliciouspics.com/pages/underwater.html',
  'https://gliciouspics.com/pages/landscapes.html',
  'https://gliciouspics.com/pages/flora-fauna.html',
  'https://gliciouspics.com/pages/nightscapes.html',
  'https://gliciouspics.com/pages/aerial.html',
  'https://gliciouspics.com/pages/travel.html',
  'https://gliciouspics.com/pages/panoramas.html',
  'https://gliciouspics.com/pages/faq.html',
  'https://gliciouspics.com/pages/cart.html',
  'https://gliciouspics.com/pages/privacy.html',
  'https://gliciouspics.com/pages/terms.html',
  'https://gliciouspics.com/pages/returns.html'
];

// Add panoramas
if (products.panoramas) {
  products.panoramas.forEach(p => {
    urls.push(`https://gliciouspics.com/pages/product.html?id=${p.id}`);
  });
}

// Add aerials
if (products.aerial) {
  products.aerial.forEach(p => {
    urls.push(`https://gliciouspics.com/pages/product.html?id=${p.id}`);
  });
}

// Add standards
if (products.standard) {
  products.standard.forEach(p => {
    urls.push(`https://gliciouspics.com/pages/product.html?id=${p.id}`);
  });
}

// Build XML
let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

urls.forEach(url => {
  // Escape XML characters (like &)
  const escapedUrl = url.replace(/&/g, '&amp;');
  xml += `  <url>\n    <loc>${escapedUrl}</loc>\n  </url>\n`;
});

xml += `</urlset>\n`;

fs.writeFileSync(path.join(rootDir, 'sitemap.xml'), xml, 'utf8');
console.log(`Generated sitemap.xml with ${urls.length} URLs successfully!`);
