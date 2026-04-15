#!/usr/bin/env node
/**
 * Compress and optimize indexes
 * Node.js equivalent of optimize-index.sh
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

async function compressFile(filePath) {
  return new Promise((resolve, reject) => {
    const source = fs.createReadStream(filePath);
    const destination = fs.createWriteStream(`${filePath}.gz`);
    const gzip = zlib.createGzip({ level: 9 });

    source.pipe(gzip).pipe(destination);
    destination.on('finish', () => {
      fs.unlinkSync(filePath); // Remove original file
      resolve();
    });
    destination.on('error', reject);
  });
}

function getDirectorySize(dirPath) {
  let totalSize = 0;
  const files = fs.readdirSync(dirPath);
  
  files.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);
    totalSize += stats.size;
  });
  
  const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
  return `${sizeInMB} MB`;
}

async function main() {
  try {
    const indexesDir = path.join(__dirname, '../indexes');
    
    if (!fs.existsSync(indexesDir)) {
      console.log('❌ Indexes directory not found');
      return;
    }

    const files = fs.readdirSync(indexesDir).filter(f => f.endsWith('.idx'));
    
    for (const file of files) {
      const filePath = path.join(indexesDir, file);
      await compressFile(filePath);
    }

    console.log('📈 Memory mapped indexes optimized');
    console.log(`📊 Total size: ${getDirectorySize(indexesDir)}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
