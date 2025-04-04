import * as env from 'env-var';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

// Twilio credentials
export const TWILIO_ACCOUNT_SID = env.get('TWILIO_ACCOUNT_SID').required().asString();
export const TWILIO_AUTH_TOKEN = env.get('TWILIO_AUTH_TOKEN').required().asString();
export const TWILIO_PHONE_NUMBER = env.get('TWILIO_PHONE_NUMBER').required().asString();

// Optional WhatsApp number (if using WhatsApp messaging)
export const TWILIO_WHATSAPP_NUMBER = env.get('TWILIO_WHATSAPP_NUMBER').default('').asString();

// Optional Facebook Page ID (if using Facebook Messenger)
export const TWILIO_FACEBOOK_PAGE_ID = env.get('TWILIO_FACEBOOK_PAGE_ID').default('').asString();
