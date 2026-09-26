import dotenv from 'dotenv';
dotenv.config({ quiet: true });

/**
 * Qdrant connection URL. Defaults to localhost:6333 if not set.
 * For Qdrant Cloud, use the full cluster URL (e.g., https://xyz.us-east-1-0.aws.cloud.qdrant.io:6333).
 */
export const QdrantUrl: string = process.env.QDRANT_URL || 'http://localhost:6333';

/** @deprecated Use {@link QdrantUrl}. */
export const qdrantUrl = QdrantUrl;

/**
 * Qdrant API key. Required for Qdrant Cloud; optional for local instances.
 */
export const QdrantApiKey: string | undefined = process.env.QDRANT_API_KEY;

/** @deprecated Use {@link QdrantApiKey}. */
export const qdrantApiKey = QdrantApiKey;
