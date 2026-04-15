require('dotenv').config();

const express = require('express');
const cors = require('cors');
const InvertedIndex = require('./inverted-index').default || require('./inverted-index');
const MongoDBIndexer = require('./mongodb-indexer').default || require('./mongodb-indexer');
const fs = require('fs');
const path = require('path');

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

// Ensure indexes directory exists with proper path resolution
const indexesDir = path.join(__dirname, '..', 'indexes');
if (!fs.existsSync(indexesDir)) {
  fs.mkdirSync(indexesDir, { recursive: true });
}

app.use('/indexes', express.static(indexesDir));

// Serve Frontend (Static Files)
const publicDir = path.join(__dirname, '..', 'public');
app.use(express.static(publicDir));

// Serve index.html at root
app.get('/', (req, res) => {
    res.sendFile(path.join(publicDir, 'index.html'));
});

// Initialize search engines
const invertedIndex = new InvertedIndex(path.join(indexesDir, 'main.idx'));
const documentStore = new Map();
let mongoIndexer = null;
let mongodbConnected = false;
let server = null;

// Input validation helpers
const validateSearchQuery = (q) => {
  if (!q || typeof q !== 'string') {
    throw new Error('Search query is required and must be a string');
  }
  if (q.trim().length < 1) {
    throw new Error('Search query cannot be empty');
  }
  if (q.length > 500) {
    throw new Error('Search query is too long (max 500 characters)');
  }
  return q.trim();
};

const validateLimit = (limit) => {
  const parsed = parseInt(limit, 10) || 10;
  return Math.min(Math.max(parsed, 1), 100); // Between 1-100
};

// Search API (Inverted Index - Super Fast)
app.get('/search', async (req, res) => {
  try {
    const { q, field, boost, limit } = req.query;
    
    // Validate input
    const query = validateSearchQuery(q);
    const resultLimit = validateLimit(limit);
    const boostFields = field ? { [field]: parseFloat(boost) || 2.0 } : {};
    
    console.log(`[SEARCH] Query: "${query.substring(0, 50)}..." | Limit: ${resultLimit}`);
    
    const results = invertedIndex.search(query, { boostFields, limit: resultLimit });
    console.log(`[SEARCH] Found ${results.length} results`);
    
    // Local document store makes added docs searchable immediately
    let enrichedResults = results.map(([docId, score]) => {
      const stored = documentStore.get(docId);
      return {
        docId,
        score: Math.round(score * 100) / 100,
        title: stored?.title || docId,
        content: stored?.content || '',
        description: stored?.description || ''
      };
    });
    
    if (mongodbConnected && mongoIndexer) {
      try {
        const docIds = results.map(([docId]) => docId);
        if (docIds.length > 0) {
          const documents = await mongoIndexer.db.collection('documents').find({ 
            _id: { $in: docIds } 
          }).toArray();
          
          const docMap = new Map(documents.map(doc => [doc._id.toString(), doc]));
          
          enrichedResults = results.map(([docId, score]) => {
            const doc = docMap.get(docId);
            const localDoc = documentStore.get(docId);
            return {
              docId,
              score: Math.round(score * 100) / 100,
              title: doc?.title || localDoc?.title || docId,
              content: doc?.content || localDoc?.content || '',
              description: doc?.description || localDoc?.description || ''
            };
          });
        }
      } catch (dbError) {
        console.error('[SEARCH] MongoDB enrichment failed:', dbError.message);
        // Fall back to local results
      }
    }
    
    res.json({
      query,
      mongodb: mongodbConnected,
      results: enrichedResults,
      total: results.length
    });
  } catch (error) {
    console.error('[SEARCH ERROR]', error.message);
    res.status(400).json({ error: error.message });
  }
});

// Add Document API (Index + MongoDB)
app.post('/index', async (req, res) => {
  try {
    const { title, content, description, fields = {} } = req.body;
    
    // Validate required fields
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    }
    
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Content is required and must be a non-empty string' });
    }
    
    const cleanTitle = title.trim().substring(0, 255);
    const cleanContent = content.trim().substring(0, 10000);
    const cleanDescription = description ? description.trim().substring(0, 500) : '';
    
    let docId = cleanTitle.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    if (!docId) {
      docId = Date.now().toString();
    }
    
    if (documentStore.has(docId)) {
      docId = `${docId}-${Date.now()}`;
    }
    
    documentStore.set(docId, {
      title: cleanTitle,
      content: cleanContent,
      description: cleanDescription
    });
    
    // Always save to Inverted Index
    const fullText = `${cleanTitle} ${cleanContent} ${cleanDescription}`.trim();
    await invertedIndex.addDocument(docId, fullText, fields);
    
    console.log(`[INDEX] Added document: ${docId}`);
    
    // Save to MongoDB if connected
    let mongoId = null;
    if (mongodbConnected && mongoIndexer) {
      try {
        const mongoDoc = await mongoIndexer.db.collection('documents').insertOne({
          _id: docId,
          title: cleanTitle,
          content: cleanContent,
          description: cleanDescription,
          createdAt: new Date()
        });
        mongoId = mongoDoc.insertedId.toString();
        console.log(`[INDEX] Synced to MongoDB: ${mongoId}`);
      } catch (dbError) {
        console.error('[INDEX] MongoDB save failed:', dbError.message);
        // Continue - local index still works
      }
    }
    
    res.json({ 
      status: 'indexed', 
      docId,
      mongodb: mongodbConnected,
      mongoId: mongoId || null
    });
  } catch (error) {
    console.error('[INDEX ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Health Check API
app.get('/health', async (req, res) => {
  try {
    let mongoCount = 0;
    if (mongodbConnected && mongoIndexer) {
      try {
        mongoCount = await mongoIndexer.db.collection('documents').countDocuments();
      } catch (dbError) {
        console.warn('[HEALTH] MongoDB query failed:', dbError.message);
      }
    }
    
    res.json({
      status: 'healthy',
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      mongodbConnected,
      invertedIndex: { 
        docs: invertedIndex.docCount, 
        terms: invertedIndex.termCount 
      },
      mongodb: { 
        connected: mongodbConnected, 
        docs: mongoCount 
      }
    });
  } catch (error) {
    console.error('[HEALTH ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Inverted Index metadata (limited response)
app.get('/index-data', (req, res) => {
  try {
    const maxTerms = 1000; // Limit response size
    const simplifiedIndex = {};
    let count = 0;
    
    for (const [term, postings] of invertedIndex.index.entries()) {
      if (count >= maxTerms) break;
      simplifiedIndex[term] = Array.from(new Set(postings.map(post => post.docId)));
      count++;
    }
    
    res.json({
      docs: invertedIndex.docCount,
      terms: invertedIndex.termCount,
      displayed_terms: count,
      index: simplifiedIndex
    });
  } catch (error) {
    console.error('[INDEX-DATA ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Sync API (MongoDB → Inverted Index)
app.post('/sync', async (req, res) => {
  if (!mongodbConnected || !mongoIndexer) {
    return res.status(400).json({ error: 'MongoDB not connected' });
  }
  try {
    console.log('[SYNC] Starting MongoDB to Inverted Index sync...');
    await mongoIndexer.syncToInvertedIndex(invertedIndex);
    console.log('[SYNC] Sync completed successfully');
    res.json({ status: 'synced', invertedIndex: { docs: invertedIndex.docCount, terms: invertedIndex.termCount } });
  } catch (error) {
    console.error('[SYNC ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = parseInt(process.env.PORT, 10) || 3000;
const MAX_PORT_ATTEMPTS = 5;
const NODE_ENV = process.env.NODE_ENV || 'development';
const DEBUG = process.env.DEBUG === 'true';

function startServer(port, attempt = 1) {
  server = app.listen(port, async () => {
    console.log('\n' + '='.repeat(50));
    console.log('🚀 AI SEARCH ENGINE STARTING');
    console.log('='.repeat(50));
    console.log(`📦 Environment: ${NODE_ENV}`);
    console.log(`🔧 Port: ${port}`);
    console.log(`📝 Debug: ${DEBUG ? 'ON' : 'OFF'}`);
    
    try {
      // Load Inverted Index (always works)
      console.log('📚 Loading Inverted Index...');
      await invertedIndex.loadIndex();
      console.log(`✅ Index loaded: ${invertedIndex.docCount} docs, ${invertedIndex.termCount} terms`);
      
      // Try MongoDB Atlas
      console.log('🔌 Attempting MongoDB connection...');
      mongoIndexer = new MongoDBIndexer();
      await mongoIndexer.connect();
      mongodbConnected = true;
      console.log('✅ MongoDB Atlas Connected!');
      
      // Sync existing MongoDB documents to inverted index
      console.log('🔄 Syncing MongoDB documents...');
      await mongoIndexer.syncToInvertedIndex(invertedIndex);
      console.log(`✅ Synced MongoDB documents - Total: ${invertedIndex.docCount} docs`);
    } catch (error) {
      console.warn('⚠️  MongoDB connection failed:', error.message);
      console.log('ℹ️  Inverted Index will work without MongoDB');
      mongodbConnected = false;
    }
    
    console.log(''.padEnd(50, '-'));
    console.log(`🌐 Frontend: http://localhost:${port}`);
    console.log(`📊 APIs: http://localhost:${port}/health`);
    console.log('='.repeat(50) + '\n');
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use.`);
      if (attempt < MAX_PORT_ATTEMPTS) {
        const nextPort = port + 1;
        console.log(`🔄 Retrying on port ${nextPort}...`);
        startServer(nextPort, attempt + 1);
      } else {
        console.error(`❌ Unable to start server after ${MAX_PORT_ATTEMPTS} attempts.`);
        process.exit(1);
      }
    } else {
      console.error('❌ Server error:', error.message);
      process.exit(1);
    }
  });
}

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`\n📴 Received ${signal}, shutting down gracefully...`);
  
  if (server) {
    server.close(async () => {
      console.log('🛑 Server closed');
      
      // Close MongoDB connection
      if (mongoIndexer && mongoIndexer.client) {
        try {
          await mongoIndexer.client.close();
          console.log('🛑 MongoDB connection closed');
        } catch (error) {
          console.error('Error closing MongoDB:', error.message);
        }
      }
      
      console.log('✅ Shutdown complete');
      process.exit(0);
    });
    
    // Force exit after 30 seconds
    setTimeout(() => {
      console.error('❌ Forced shutdown after 30 seconds');
      process.exit(1);
    }, 30000);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error.message);
  process.exit(1);
});

startServer(PORT);
