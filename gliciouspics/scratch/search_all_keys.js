const fs = require('fs');
const path = require('path');
const productsPath = path.join(__dirname, '..', 'products.json');
const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));

const allProducts = [].concat(productsData.panoramas || [], productsData.standard || [], productsData.aerial || []);

console.log("Searching products fields for 'pattern':");
allProducts.forEach(p => {
  const str = JSON.stringify(p).toLowerCase();
  if (str.includes('pattern')) {
    console.log(`- ID: "${p.id}", Title: "${p.title}"`);
    console.log(`  Hero: ${p.images.hero}`);
  }
});
