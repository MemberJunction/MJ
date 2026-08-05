import env from 'env-var';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ quiet: true });

/**
 * The Expo Push API endpoint. Overridable via the EXPO_PUSH_API_URL environment
 * variable (useful for testing or self-hosted proxies), otherwise defaults to
 * Expo's public push service.
 */
export const EXPO_PUSH_API_URL = env
  .get('EXPO_PUSH_API_URL')
  .default('https://exp.host/--/api/v2/push/send')
  .asString();

/**
 * Optional Expo access token. When configured, it is sent as a Bearer token to
 * raise Expo's rate limits and enable enhanced push security. The provider
 * degrades gracefully (still sends) when this is not set.
 */
export const EXPO_ACCESS_TOKEN = env.get('EXPO_ACCESS_TOKEN').default('').asString();
