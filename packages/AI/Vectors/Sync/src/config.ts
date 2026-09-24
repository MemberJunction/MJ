import dotenv from 'dotenv';
dotenv.config({ quiet: true });

export const OpenAIAPIKey: string = process.env.OPENAI_API_KEY;

/** @deprecated Use {@link OpenAIAPIKey}. */
export const openAIAPIKey = OpenAIAPIKey;
export const PineconeHost: string = process.env.PINECONE_HOST;

/** @deprecated Use {@link PineconeHost}. */
export const pineconeHost = PineconeHost;
export const PineconeAPIKey: string = process.env.PINECONE_API_KEY;

/** @deprecated Use {@link PineconeAPIKey}. */
export const pineconeAPIKey = PineconeAPIKey;
export const PineconeDefaultIndex: string = process.env.PINECONE_DEFAULT_INDEX;

/** @deprecated Use {@link PineconeDefaultIndex}. */
export const pineconeDefaultIndex = PineconeDefaultIndex;

export const DbHost = process.env.DB_HOST;

/** @deprecated Use {@link DbHost}. */
export const dbHost = DbHost;
export const DbPort = Number(process.env.DB_PORT) || 1433;

/** @deprecated Use {@link DbPort}. */
export const dbPort = DbPort;
export const DbUsername = process.env.DB_USERNAME;

/** @deprecated Use {@link DbUsername}. */
export const dbUsername = DbUsername;
export const DbPassword = process.env.DB_PASSWORD;

/** @deprecated Use {@link DbPassword}. */
export const dbPassword = DbPassword;
export const DbDatabase = process.env.DB_DATABASE;

/** @deprecated Use {@link DbDatabase}. */
export const dbDatabase = DbDatabase;
export const ServerPort = Number(process.env.PORT) || 8000;

/** @deprecated Use {@link ServerPort}. */
export const serverPort = ServerPort;

export const CurrentUserEmail = process.env.CURRENT_USER_EMAIL;

/** @deprecated Use {@link CurrentUserEmail}. */
export const currentUserEmail = CurrentUserEmail;

export const MistralAPIKey = process.env.MISTRAL_API_KEY;

/** @deprecated Use {@link MistralAPIKey}. */
export const mistralAPIKey = MistralAPIKey;