const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pagesDir = path.join(rootDir, 'pages');

// 1. Update index.html
const indexPath = path.join(rootDir, 'index.html');
if (fs.existsSync(indexPath)) {
  let content = fs.readFileSync(indexPath, 'utf8');
  let normalizedContent = content.replace(/\r\n/g, '\n');
  
  const target = `<nav class="footer-nav">
        <a href="index.html">Home</a>
        <a href="#galleries">Shop</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        <a href="pages/faq.html">FAQ</a>
        <a href="pages/privacy.html">Privacy Policy</a>
        <a href="pages/terms.html">Terms of Service</a>
      </nav>`;
  const replacement = `<nav class="footer-nav">
        <a href="index.html">Home</a>
        <a href="#galleries">Shop</a>
        <a href="#about">About</a>
        <a href="#contact">Contact</a>
        <a href="pages/faq.html">FAQ</a>
        <a href="pages/privacy.html">Privacy Policy</a>
        <a href="pages/terms.html">Terms of Service</a>
        <a href="pages/returns.html">Returns &amp; Refunds</a>
      </nav>`;
  
  if (normalizedContent.includes(target)) {
    normalizedContent = normalizedContent.replace(target, replacement);
    fs.writeFileSync(indexPath, normalizedContent, 'utf8');
    console.log('Updated index.html footer with Returns & Refunds.');
  } else {
    console.warn('Could not find target footer in index.html');
  }
}

// 2. Update pages/*.html
const pages = [
  'underwater.html',
  'travel.html',
  'product-standard.html',
  'product-panorama.html',
  'product-aerial.html',
  'panoramas.html',
  'nightscapes.html',
  'landscapes.html',
  'flora-fauna.html',
  'faq.html',
  'cart.html',
  'aerial.html',
  'privacy.html',
  'terms.html'
];

pages.forEach(file => {
  const filePath = path.join(pagesDir, file);
  if (fs.existsSync(filePath)) {
    let content = fs.readFileSync(filePath, 'utf8');
    let normalizedContent = content.replace(/\r\n/g, '\n');
    const target = `<nav class="footer-nav">
        <a href="../index.html">Home</a>
        <a href="../index.html#galleries">Shop</a>
        <a href="../index.html#about">About</a>
        <a href="../index.html#contact">Contact</a>
        <a href="faq.html">FAQ</a>
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms of Service</a>
      </nav>`;
    const replacement = `<nav class="footer-nav">
        <a href="../index.html">Home</a>
        <a href="../index.html#galleries">Shop</a>
        <a href="../index.html#about">About</a>
        <a href="../index.html#contact">Contact</a>
        <a href="faq.html">FAQ</a>
        <a href="privacy.html">Privacy Policy</a>
        <a href="terms.html">Terms of Service</a>
        <a href="returns.html">Returns &amp; Refunds</a>
      </nav>`;

    if (normalizedContent.includes(target)) {
      normalizedContent = normalizedContent.replace(target, replacement);
      fs.writeFileSync(filePath, normalizedContent, 'utf8');
      console.log(`Updated pages/${file} footer with Returns & Refunds.`);
    } else {
      console.warn(`Could not find target footer in pages/${file}`);
    }
  } else {
    console.warn(`File pages/${file} does not exist.`);
  }
});
