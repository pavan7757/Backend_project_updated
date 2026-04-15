#!/bin/bash
# Compress and optimize indexes

find indexes/ -name "*.idx" -exec gzip -9 {} \;
echo "📈 Memory mapped indexes optimized"
du -sh indexes/
