const path = require('path');
const MongoDBIndexer = require('../src/mongodb-indexer');
const InvertedIndex = require('../src/inverted-index');
const { spawnSync } = require('child_process');

async function main() {
  try {
    console.log('🔄 Updating indexes from MongoDB...');
    
    const mongo = new MongoDBIndexer();
    await mongo.connect();
    
    const index = new InvertedIndex();
    await index.loadIndex();
    await mongo.syncToInvertedIndex(index);
    
    console.log('✅ Sync complete');

    console.log('🗜️  Optimizing compression...');
    
    // Call the optimize-index script
    const optimizeScript = path.join(__dirname, 'optimize-index.js');
    const result = spawnSync('node', [optimizeScript], { 
      stdio: 'inherit',
      cwd: __dirname 
    });

    if (result.error) {
      throw result.error;
    }

    console.log('✅ All indexes updated and optimized');

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

main();
