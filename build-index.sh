#!/bin/bash
# Build and compress inverted indexes

echo "🏗️  Building inverted index..."
node -e "
  const InvertedIndex = require('./src/inverted-index');
  const index = new InvertedIndex();
  index.addDocument('1', 'Sample document for testing search engine');
  index.addDocument('2', 'Node.js inverted index with MongoDB and Express');
  console.log('✅ Index built');
"

echo "🗜️  Compressing indexes..."
gzip -9 indexes/*.idx
echo "✅ Indexes compressed"

echo "📊 Index stats:"
ls -lh indexes/
