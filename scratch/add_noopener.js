const fs = require('fs');
const path = require('path');

// Recursively find all HTML files in a directory
function getHtmlFiles(dir, filesList = []) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      // Exclude node_modules and .git
      if (file !== 'node_modules' && file !== '.git' && file !== '.gemini' && file !== 'brain') {
        getHtmlFiles(filePath, filesList);
      }
    } else if (filePath.endsWith('.html')) {
      filesList.push(filePath);
    }
  });
  return filesList;
}

const rootDir = path.join(__dirname, '..');
const htmlFiles = getHtmlFiles(rootDir);

console.log(`Found ${htmlFiles.length} HTML files to process.`);

htmlFiles.forEach(filePath => {
  let content = fs.readFileSync(filePath, 'utf8');
  let updated = false;

  // Regex to match anchor tags with target="_blank"
  // It handles double or single quotes and different ordering of attributes
  const regex = /<a\s+([^>]*?)target="_blank"([^>]*?)>/gi;
  const newContent = content.replace(regex, (match, before, after) => {
    // If the link already contains rel=, do not alter it
    if (before.includes('rel=') || after.includes('rel=')) {
      return match;
    }
    updated = true;
    // Format the new anchor tag with rel="noopener noreferrer"
    // Trim spaces cleanly
    const beforeStr = before ? before.trimEnd() + ' ' : '';
    const afterStr = after ? ' ' + after.trimStart() : '';
    return `<a ${beforeStr}target="_blank" rel="noopener noreferrer"${afterStr}>`;
  });

  if (updated) {
    fs.writeFileSync(filePath, newContent, 'utf8');
    console.log(`- Updated: ${path.relative(rootDir, filePath)}`);
  }
});

console.log('Finished updating target="_blank" links with rel="noopener noreferrer".');
