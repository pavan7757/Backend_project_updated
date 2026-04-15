require('dotenv').config();
const { MongoClient } = require('mongodb');

class MongoDBIndexer {
  constructor() {
    this.uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    this.dbName = process.env.MONGODB_DB_NAME || 'search_engine';
    this.client = null;
    this.db = null;
  }

  async connect() {
    if (!this.uri) {
      throw new Error('MONGODB_URI or MONGO_URI must be set in .env or environment variables');
    }

    console.log('🔌 Connecting to MongoDB...');
    this.client = new MongoClient(this.uri, {
      maxPoolSize: 10,
      minPoolSize: 2,
      maxIdleTimeMS: 45000
    });
    
    await this.client.connect();
    this.db = this.client.db(this.dbName);

    // Create text index for text search
    await this.db.collection('documents').createIndex({
      title: 'text', content: 'text', description: 'text'
    }, {
      weights: { title: 10, content: 5, description: 1 },
      name: 'full_text_search'
    }).catch(err => {
      if (err.code === 85) {
        console.log('ℹ️  Text index already exists');
      } else {
        throw err;
      }
    });

    const isAtlas = this.uri.includes('mongodb+srv');
    console.log('✅ MongoDB Connected:', isAtlas ? 'Atlas' : 'Direct');
    return this.db;
  }

  async searchMongo(query) {
    try {
      return await this.db.collection('documents').find({
        $text: { $search: query }
      }).toArray();
    } catch (error) {
      console.error('MongoDB search error:', error.message);
      return [];
    }
  }

  async syncToInvertedIndex(index) {
    try {
      const cursor = this.db.collection('documents').find({});
      let count = 0;
      await cursor.forEach(doc => {
        const text = `${doc.title || ''} ${doc.content || ''} ${doc.description || ''}`.trim();
        index.addDocument(doc._id.toString(), text, {});
        count++;
      });
      console.log(`✅ Synced ${count} docs from MongoDB`);
      return count;
    } catch (error) {
      console.error('Sync error:', error.message);
      throw error;
    }
  }

  async close() {
    if (this.client) {
      try {
        await this.client.close();
        console.log('✅ MongoDB connection closed');
      } catch (error) {
        console.error('Error closing MongoDB:', error.message);
      }
    }
  }
}

module.exports = MongoDBIndexer;
