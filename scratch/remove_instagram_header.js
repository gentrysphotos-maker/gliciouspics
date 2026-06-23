const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const pagesDir = path.join(rootDir, 'pages');

const files = [
  path.join(rootDir, 'index.html'),
  path.join(pagesDir, 'underwater.html'),
  path.join(pagesDir, 'travel.html'),
  path.join(pagesDir, 'product-standard.html'),
  path.join(pagesDir, 'product-panorama.html'),
  path.join(pagesDir, 'product-aerial.html'),
  path.join(pagesDir, 'panoramas.html'),
  path.join(pagesDir, 'nightscapes.html'),
  path.join(pagesDir, 'landscapes.html'),
  path.join(pagesDir, 'flora-fauna.html'),
  path.join(pagesDir, 'faq.html'),
  path.join(pagesDir, 'cart.html'),
  path.join(pagesDir, 'aerial.html'),
  path.join(pagesDir, 'privacy.html'),
  path.join(pagesDir, 'terms.html'),
  path.join(pagesDir, 'returns.html')
];

// Regex to match the Instagram link inside <div class="nav-socials"> ONLY
const regex = /<div class="nav-socials">([\s\S]*?)<a href="https:\/\/instagram\.com\/g\.liciouspics" target="_blank" aria-label="Instagram">[\s\S]*?<\/a>([\s\S]*?)<\/div>/gi;

files.forEach(file => {
  if (fs.existsSync(file)) {
    let content = fs.readFileSync(file, 'utf8');
    content = content.replace(/\r\n/g, '\n');

    if (regex.test(content)) {
      // Perform the replacement
      content = content.replace(regex, '<div class="nav-socials">$1$2</div>');
      
      // Clean up whitespace formatting
      content = content.replace(/<div class="nav-socials">\s*<\/div>/gi, '<div class="nav-socials"></div>');
      content = content.replace(/<div class="nav-socials">\s*\n\s*/gi, '<div class="nav-socials">\n      ');
      
      fs.writeFileSync(file, content, 'utf8');
      console.log(`Removed Instagram header icon from ${path.basename(file)}`);
    } else {
      console.warn(`Could not find header Instagram icon in ${path.basename(file)}`);
    }
  } else {
    console.warn(`File ${path.basename(file)} does not exist.`);
  }
});
