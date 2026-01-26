-- Enable Reranking for Sage Agent
-- Configures the Sage agent to use two-stage retrieval with Cohere reranker for improved note relevance

-- ============================================================================
-- Update Sage Agent with Reranker Configuration
-- ============================================================================
-- Sage Agent ID: 3AB78346-897F-4238-AA6A-F10A131CC691
-- Reranker Model: rerank-v3.5 (1AF4B81D-B7A2-41E4-8514-E72A619E63DE)
--
-- Configuration:
--   enabled: true - Enable two-stage retrieval
--   rerankerModelId: Cohere rerank-v3.5 model
--   retrievalMultiplier: 3 - Fetch 3x candidates before reranking
--   minRelevanceThreshold: 0 - Accept all reranked results (filter in code if needed)
--   fallbackOnError: true - Gracefully fall back to vector search if reranking fails

UPDATE ${flyway:defaultSchema}.AIAgent
SET RerankerConfiguration = '{"enabled":true,"rerankerModelId":"1AF4B81D-B7A2-41E4-8514-E72A619E63DE","retrievalMultiplier":3,"minRelevanceThreshold":0,"fallbackOnError":true}'
WHERE ID = '3AB78346-897F-4238-AA6A-F10A131CC691';
