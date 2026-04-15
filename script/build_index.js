#!/usr/bin/env node
/**
 * Build and compress inverted indexes
 * Node.js equivalent of build-index.sh
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const InvertedIndex = require('../src/inverted-index');

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

async function main() {
  try {
    console.log('🏗️  Building inverted index...');
    const index = new InvertedIndex();
    await index.addDocument('1', 'Sample document for testing search engine');
    await index.addDocument('2', 'Node.js inverted index with MongoDB and Express');
    console.log('✅ Index built');

    console.log('🗜️  Compressing indexes...');
    const indexesDir = path.join(__dirname, '../indexes');
    
    if (!fs.existsSync(indexesDir)) {
      fs.mkdirSync(indexesDir, { recursive: true });
    }

    const files = fs.readdirSync(indexesDir).filter(f => f.endsWith('.idx'));
    
    for (const file of files) {
      const filePath = path.join(indexesDir, file);
      await compressFile(filePath);
    }
    
    console.log('✅ Indexes compressed');

    console.log('📊 Index stats:');
    const files_final = fs.readdirSync(indexesDir);
    files_final.forEach(file => {
      const filePath = path.join(indexesDir, file);
      const stats = fs.statSync(filePath);
      const sizeKb = (stats.size / 1024).toFixed(2);
      console.log(`  ${file} - ${sizeKb} KB`);
    });

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();