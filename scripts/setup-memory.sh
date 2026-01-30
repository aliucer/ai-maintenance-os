#!/bin/bash
# Setup Memory Infrastructure
# Creates pgvector extension (if needed) and HNSW index for vector search

set -e

echo "Setting up Memory Infrastructure"
echo "===================================="

# Database connection
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-maintain}"
DB_NAME="${DB_NAME:-maintain}"
CONTAINER="${CONTAINER:-demo-postgres-1}"

echo ""
echo "--- Step 1: Verify pgvector extension ---"
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
CREATE EXTENSION IF NOT EXISTS vector;
SELECT extname, extversion FROM pg_extension WHERE extname = 'vector';
"

echo ""
echo "--- Step 2: Check memory_documents table ---"
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
SELECT table_name FROM information_schema.tables WHERE table_name = 'memory_documents';
"

echo ""
echo "--- Step 2.5: Ensure Vector Dimensions are 3072 ---"
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
ALTER TABLE memory_documents ALTER COLUMN embedding TYPE vector(3072);
"

echo ""
echo "--- Step 3: Create HNSW index for vector search ---"
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
CREATE INDEX IF NOT EXISTS memory_documents_embedding_idx 
ON memory_documents 
USING hnsw (embedding vector_cosine_ops)
WITH (m = 16, ef_construction = 64);
"

echo ""
echo "--- Step 4: Verify index ---"
docker exec $CONTAINER psql -U $DB_USER -d $DB_NAME -c "
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'memory_documents';
"

echo ""
echo "[INFO] Memory infrastructure ready!"
echo ""
echo "Vector dimensions: 3072 "
echo "Index type: HNSW (Hierarchical Navigable Small World)"
echo "Distance metric: Cosine similarity"
