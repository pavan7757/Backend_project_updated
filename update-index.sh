#!/bin/bash
# Update indexes from MongoDB and compress

echo "🔄 Updating indexes from MongoDB..."
node -e "
  const MongoDBIndexer = require('./src/mongodb-indexer');
  const InvertedIndex = require('./src/inverted-index');
  (async () => {
    const mongo = new MongoDBIndexer();
    await mongo.connect();
    const index = new InvertedIndex();
    await index.loadIndex();
    await mongo.syncToInvertedIndex(index);
    console.log('✅ Sync complete');
  })().catch(console.error);
"

echo "🗜️  Optimizing compression..."
./scripts/optimize-index.sh



