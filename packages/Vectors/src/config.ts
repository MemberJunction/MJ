import dotenv from 'dotenv';
dotenv.config();

export const openAIAPIKey: string = process.env.OPENAI_API_KEY;
export const pineconeHost: string = process.env.PINECONE_HOST;
export const pineconeAPIKey: string = process.env.PINECONE_API_KEY;

export const mistralAPIKey: string = process.env.MISTRAL_API_KEY;