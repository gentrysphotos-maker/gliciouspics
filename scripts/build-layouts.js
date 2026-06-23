const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const templatesDir = path.join(rootDir, 'templates');
const pagesDir = path.join(rootDir, 'pages');

const headerTemplate = fs.readFileSync(path.join(templatesDir, 'header.html'), 'utf8');
const footerTemplate = fs.readFileSync(path.join(templatesDir, 'footer.html'), 'utf8');

function compileLayout(filePath, isRoot) {
  const filename = path.basename(filePath);
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/\r\n/g, '\n');

  // Relative prefix logic
  const pagesPrefix = isRoot ? 'pages/' : '';
  const indexLink = isRoot ? 'index.html' : '../index.html';
  const aboutLink = isRoot ? '#about' : '../index.html#about';
  const contactLink = isRoot ? '#contact' : '../index.html#contact';
  const shopFooterLink = isRoot ? '#galleries' : '../index.html#galleries';

  // Active status
  let homeActive = '';
  let shopActive = '';
  let cartActive = '';

  if (filename === 'index.html') {
    homeActive = 'active';
  } else if (filename === 'cart.html') {
    cartActive = 'active';
  } else if ([
    'underwater.html',
    'landscapes.html',
    'flora-fauna.html',
    'nightscapes.html',
    'aerial.html',
    'travel.html',
    'panoramas.html',
    'product.html'
  ].includes(filename)) {
    shopActive = 'active';
  }

  // Build header
  let headerHtml = headerTemplate
    .replace(/INDEX_LINK/g, indexLink)
    .replace(/ABOUT_LINK/g, aboutLink)
    .replace(/CONTACT_LINK/g, contactLink)
    .replace(/PAGES_PREFIX/g, pagesPrefix)
    .replace('HOME_ACTIVE', homeActive)
    .replace('SHOP_ACTIVE', shopActive)
    .replace('CART_ACTIVE', cartActive);

  // Build footer
  let footerHtml = footerTemplate
    .replace(/INDEX_LINK/g, indexLink)
    .replace(/ABOUT_LINK/g, aboutLink)
    .replace(/CONTACT_LINK/g, contactLink)
    .replace(/SHOP_FOOTER_LINK/g, shopFooterLink)
    .replace(/PAGES_PREFIX/g, pagesPrefix);

  // 1. Replace header
  // Matches <header class="site-header" id="site-header"> until </header> (including newline)
  const headerRegex = /<header class="site-header"[^>]*>([\s\S]*?)<\/header>/gi;
  if (headerRegex.test(content)) {
    content = content.replace(headerRegex, headerHtml);
  } else {
    // If not found, insert at body open
    const bodyOpenRegex = /(<body[^>]*>)/i;
    content = content.replace(bodyOpenRegex, `$1\n  ${headerHtml}`);
  }

  // 2. Replace footer
  const footerRegex = /<footer class="site-footer"([^>]*)>([\s\S]*?)<\/footer>/gi;
  if (footerRegex.test(content)) {
    content = content.replace(footerRegex, footerHtml);
  } else {
    // If not found, insert before body close
    content = content.replace('</body>', `\n  ${footerHtml}\n</body>`);
  }

  // 3. Accessibility: Add skip to content link if not already present
  // Clean any old skip-to-content links first to avoid duplicates
  content = content.replace(/<a href="#main-content" class="skip-to-content">[\s\S]*?<\/a>/gi, '');
  
  const skipLink = `  <a href="#main-content" class="skip-to-content">Skip to content</a>`;
  const bodyOpenMatch = content.match(/(<body[^>]*>)/i);
  if (bodyOpenMatch) {
    const bodyOpenTag = bodyOpenMatch[1];
    content = content.replace(bodyOpenTag, `${bodyOpenTag}\n${skipLink}`);
  }

  // 4. Accessibility: Ensure <main> has id="main-content"
  // First, normalize any existing main id
  content = content.replace(/<main\s+([^>]*?)id="main-content"([^>]*?)>/gi, '<main $1 $2>');
  content = content.replace(/<main\s+id="main-content"\s*>/gi, '<main>');
  
  // Now add id="main-content" to the opening <main> tag
  content = content.replace(/<main(\s+[^>]*?)?>/gi, (match, attrs) => {
    if (attrs) {
      // If there are other attributes, append id="main-content"
      return `<main id="main-content"${attrs}>`;
    }
    return `<main id="main-content">`;
  });

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Updated layout for ${isRoot ? '' : 'pages/'}${filename}`);
}

// 1. Process root pages
const rootPages = ['index.html', '404.html'];
rootPages.forEach(file => {
  const filePath = path.join(rootDir, file);
  if (fs.existsSync(filePath)) {
    compileLayout(filePath, true);
  }
});

// 2. Process all pages in pages/ (except excluded files)
const excludedPages = ['production-readiness-review.html'];
const pageFiles = fs.readdirSync(pagesDir).filter(file => file.endsWith('.html') && !excludedPages.includes(file));

pageFiles.forEach(file => {
  const filePath = path.join(pagesDir, file);
  compileLayout(filePath, false);
});

console.log('Successfully completed building layouts for all pages!');
