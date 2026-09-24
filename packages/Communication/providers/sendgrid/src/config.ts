// TEMPORARY
import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config({ quiet: true });

export const API_KEY = process.env.COMMUNICATION_VENDOR_API_KEY__SENDGRID;

/** @deprecated Use {@link API_KEY}. */
export const __API_KEY = API_KEY;