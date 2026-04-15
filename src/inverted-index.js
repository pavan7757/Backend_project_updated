const fs = require('fs').promises;
const path = require('path');
const { createReadStream, createWriteStream } = require('fs');

class InvertedIndex {
  constructor(indexPath = './indexes/main.idx') {
    this.indexPath = indexPath;
    this.index = new Map();
    this.docCount = 0;
    this.termCount = 0;
  }

  // Tokenize and normalize text
  tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2);
  }

  // Add document to index
  async addDocument(docId, content, fields = {}) {
    const tokens = this.tokenize(content);
    const postings = new Map();

    // Create field-aware postings - accumulate positions for same word
    tokens.forEach((token, pos) => {
      const key = `${token}-${docId}`; // Unique key per word per document
      if (!postings.has(key)) {
        postings.set(key, {
          docId,
          positions: [],
          fields: Object.keys(fields),
          boost: fields.boost || 1.0,
          term: token
        });
      }
      postings.get(key).positions.push(pos);
    });

    // Update main index
    for (const [key, posting] of postings) {
      const term = posting.term;
      if (!this.index.has(term)) {
        this.index.set(term, []);
        this.termCount++;
      }
      this.index.get(term).push(posting);
    }

    this.docCount++;
    await this.flush();
  }

  // Unix memory mapping for fast lookups
  async loadIndex() {
    try {
      if (!fs.existsSync(this.indexPath)) {
        console.log(`📚 Creating new index at: ${this.indexPath}`);
        return;
      }
      
      const stream = createReadStream(this.indexPath);
      const data = await new Promise((resolve, reject) => {
        let chunks = [];
        stream.on('data', chunk => chunks.push(chunk));
        stream.on('end', () => resolve(Buffer.concat(chunks)));
        stream.on('error', reject);
      });
      
      // Deserialize index
      const indexData = JSON.parse(data.toString());
      this.index = new Map(Object.entries(indexData));
      
      // Set counters from loaded data
      this.termCount = this.index.size;
      this.docCount = new Set(
        Array.from(this.index.values()).flat().map(p => p.docId)
      ).size;
      
      console.log(`📚 Index loaded from: ${this.indexPath}`);
    } catch (e) {
      if (e instanceof SyntaxError) {
        console.warn(`⚠️  Index file corrupt, creating new index...`);
      } else {
        console.log('📚 Creating new index...');
      }
      this.index = new Map();
      this.docCount = 0;
      this.termCount = 0;
    }
  }

  // Search with field boosting
  search(query, options = {}) {
    const queryTokens = this.tokenize(query);
    const results = new Map();

    queryTokens.forEach(token => {
      const postings = this.index.get(token);
      if (postings) {
        postings.forEach(posting => {
          const score = this.calculateScore(posting, options);
          const currentScore = results.get(posting.docId) || 0;
          results.set(posting.docId, Math.max(currentScore, score));
        });
      }
    });

    return Array.from(results.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, options.limit || 10);
  }

  calculateScore(posting, options) {
    // Exact word count as score
    let score = posting.positions.length;

    // Field boosting: title matches get extra boost
    if (options.boostFields) {
      posting.fields.forEach(field => {
        if (options.boostFields[field]) {
          score *= options.boostFields[field];
        }
      });
    }

    // Apply document-level boost
    return score * posting.boost;
  }

  async flush() {
    await fs.writeFile(this.indexPath, JSON.stringify(
      Object.fromEntries(this.index), null, 2
    ));
  }
}

module.exports = InvertedIndex;
