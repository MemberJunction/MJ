import env from 'env-var';
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ quiet: true });

// Google API OAuth credentials - now optional to support per-request credential override
// When not set, credentials must be provided via API
export const GMAIL_CLIENT_ID = env.get('GMAIL_CLIENT_ID').default('').asString();
export const GMAIL_CLIENT_SECRET = env.get('GMAIL_CLIENT_SECRET').default('').asString();
export const GMAIL_REDIRECT_URI = env.get('GMAIL_REDIRECT_URI').default('').asString();
export const GMAIL_REFRESH_TOKEN = env.get('GMAIL_REFRESH_TOKEN').default('').asString();

// Service account email (optional)
export const GMAIL_SERVICE_ACCOUNT_EMAIL = env.get('GMAIL_SERVICE_ACCOUNT_EMAIL').default('').asString();

// Scopes for Gmail API
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.compose'
];
