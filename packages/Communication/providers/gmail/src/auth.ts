import { google } from 'googleapis';
import { LogError } from '@memberjunction/core';
import * as Config from './config';

// Create OAuth2 client
const oauth2Client = new google.auth.OAuth2(
  Config.GMAIL_CLIENT_ID,
  Config.GMAIL_CLIENT_SECRET,
  Config.GMAIL_REDIRECT_URI
);

// Set refresh token to automatically refresh access tokens
oauth2Client.setCredentials({
  refresh_token: Config.GMAIL_REFRESH_TOKEN
});

// Create and export Gmail API client
export const GmailClient = google.gmail({
  version: 'v1',
  auth: oauth2Client
});

// Helper function to get authenticated user information
export async function getAuthenticatedUser() {
  try {
    // Get user profile to verify authentication
    const response = await GmailClient.users.getProfile({
      userId: 'me'
    });
    
    return response.data;
  } catch (error) {
    LogError('Error authenticating with Gmail API:', undefined, error);
    return null;
  }
}