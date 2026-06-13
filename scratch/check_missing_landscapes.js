const fs = require('fs');
const path = require('path');

// 1. Load products.json landscapes
const productsPath = path.join(__dirname, '..', 'products.json');
const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const landscapeProductIds = productsData.standard
  .filter(p => p.category === 'landscapes')
  .map(p => p.id);

// 2. Read landscapes.html
const htmlPath = path.join(__dirname, '..', 'pages', 'landscapes.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

console.log("Landscape products in products.json NOT linked in landscapes.html:");
landscapeProductIds.forEach(id => {
  if (!htmlContent.includes(id)) {
    console.log(`- ${id}`);
    const prod = productsData.standard.find(p => p.id === id);
    console.log(`  Hero URL: ${prod.images.hero}`);
  }
});
