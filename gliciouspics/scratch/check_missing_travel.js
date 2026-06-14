const fs = require('fs');
const path = require('path');

// 1. Load products.json travel
const productsPath = path.join(__dirname, '..', 'products.json');
const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
const travelProductIds = productsData.standard
  .filter(p => p.category === 'travel')
  .map(p => p.id);

// 2. Read travel.html
const htmlPath = path.join(__dirname, '..', 'pages', 'travel.html');
const htmlContent = fs.readFileSync(htmlPath, 'utf8');

console.log("Travel products in products.json NOT linked in travel.html:");
travelProductIds.forEach(id => {
  if (!htmlContent.includes(id)) {
    console.log(`- ${id}`);
    const prod = productsData.standard.find(p => p.id === id);
    console.log(`  Hero URL: ${prod.images.hero}`);
  }
});
