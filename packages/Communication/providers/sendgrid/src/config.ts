// TEMPORARY
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ quiet: true });

export const __API_KEY = process.env.COMMUNICATION_VENDOR_API_KEY__SENDGRID;