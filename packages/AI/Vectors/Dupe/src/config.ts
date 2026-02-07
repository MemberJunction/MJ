import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const openAIAPIKey: string = process.env.OPENAI_API_KEY;
export const pineconeHost: string = process.env.PINECONE_HOST;
export const pineconeAPIKey: string = process.env.PINECONE_API_KEY;
export const pineconeDefaultIndex: string = process.env.PINECONE_DEFAULT_INDEX;

export const dbHost = process.env.DB_HOST;
export const dbPort = Number(process.env.DB_PORT) || 1433;
export const dbUsername = process.env.DB_USERNAME;
export const dbPassword = process.env.DB_PASSWORD;
export const dbDatabase = process.env.DB_DATABASE;
export const serverPort = Number(process.env.PORT) || 8000;

export const currentUserEmail = process.env.CURRENT_USER_EMAIL;

export const mistralAPIKey = process.env.MISTRAL_API_KEY;