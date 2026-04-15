# Prince — DevOps + Project Config

## My Files
- `Dockerfile`         → Container image definition
- `docker-compose.yml` → Multi-service orchestration
- `package.json`       → Project config + dependencies
- `build-index.sh`     → Build and compress inverted index
- `update-index.sh`    → Sync MongoDB → index + recompress
- `optimize-index.sh`  → Compress existing .idx files

## What I Built

### Dockerfile
- Base image: node:18-alpine (lightweight Linux)
- WORKDIR /app — sets working directory inside container
- Copies package*.json first, runs npm ci --omit=dev (production-only install, faster)
- Copies rest of application code
- EXPOSE 3000 — documents which port the app uses
- HEALTHCHECK — every 30s, pings /health endpoint; 3 retries before marking unhealthy
- CMD ["npm", "start"] — runs the server

### docker-compose.yml
- Two services: app + mongo
- app service:
  - Builds from local Dockerfile
  - Maps port 3000:3000
  - Sets env vars: NODE_ENV=production, MONGODB_URI, MONGODB_DB_NAME, DEBUG=false
  - depends_on: mongo (starts mongo first)
  - Volume: ./indexes:/app/indexes (index file persists on host machine)
  - restart: unless-stopped (auto-restarts on crash)
  - Network: search-engine-net (isolated bridge network)
- mongo service:
  - Uses official mongo:latest image
  - Maps port 27017:27017
  - Volume: mongo_data (named volume, data persists across restarts)
  - Same network as app
- Defined volumes: mongo_data
- Defined networks: search-engine-net (bridge driver)

### package.json
- Project name: inverted-index-search, version 1.0.0
- main: src/index.js
- type: commonjs
- Scripts:
  - start → node src/index.js
  - dev → nodemon src/index.js (auto-restart on file changes)
  - production → NODE_ENV=production node src/index.js
- Engine requirements: node >=16.0.0, npm >=7.0.0
- Dependencies: cors, dotenv, express, mongodb
- DevDependencies: nodemon

### build-index.sh
- Creates two sample documents (docId 1 and 2)
- Calls gzip -9 on all .idx files (maximum compression)
- Shows compressed file sizes

### update-index.sh
- Connects to MongoDB, loads existing index from disk
- Runs syncToInvertedIndex() to pull all MongoDB docs
- Then calls optimize-index.sh for compression

### optimize-index.sh
- Finds all .idx files in indexes/ folder
- Runs gzip -9 on each (highest compression level)
- Shows total disk usage of indexes/

## What to say in presentation
"Maine project ka DevOps aur deployment setup kiya. Dockerfile se poore application ko ek container mein pack kiya — matlab kisi bhi machine pe ek hi command se chal sakta hai. docker-compose mein app aur MongoDB dono ek saath start hote hain. Shell scripts se index build, update aur optimize karna automate kiya. Package.json mein sab dependencies define ki hain — cors, dotenv, express, mongodb."
