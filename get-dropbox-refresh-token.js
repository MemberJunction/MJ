/**
 * Dropbox OAuth 2.0 Refresh Token Generator
 *
 * This script helps you get a refresh token for Dropbox API access.
 * The refresh token never expires and can be used to automatically
 * get new access tokens when they expire.
 *
 * Usage:
 * 1. Set your APP_KEY and APP_SECRET below
 * 2. Run: node get-dropbox-refresh-token.js
 * 3. Follow the prompts to authorize the app
 * 4. Copy the refresh token to your SQL script
 */

const readline = require('readline');
const https = require('https');

// ============================================
// OAuth 2.0 Flow Implementation
// ============================================

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function main() {
  console.log('\n======================================');
  console.log('Dropbox Refresh Token Generator');
  console.log('======================================\n');

  // Get app credentials from user
  const APP_KEY = await question('Enter your Dropbox App Key: ');
  const APP_SECRET = await question('Enter your Dropbox App Secret: ');

  if (!APP_KEY.trim() || !APP_SECRET.trim()) {
    console.error('\nError: App Key and App Secret are required.');
    rl.close();
    return;
  }

  // Step 1: Generate authorization URL
  const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${APP_KEY.trim()}&token_access_type=offline&response_type=code`;

  console.log('Step 1: Authorize the application');
  console.log('-----------------------------------');
  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, you will be redirected to a URL.');
  console.log('Copy the "code" parameter from that URL.\n');

  // Step 2: Get authorization code from user
  const authCode = await question('Enter the authorization code: ');

  if (!authCode.trim()) {
    console.error('Error: No authorization code provided.');
    rl.close();
    return;
  }

  console.log('\nStep 2: Exchanging code for refresh token...\n');

  // Step 3: Exchange code for refresh token
  const tokenData = await exchangeCodeForToken(authCode.trim(), APP_KEY.trim(), APP_SECRET.trim());

  if (tokenData.error) {
    console.error('Error getting refresh token:', tokenData.error_description || tokenData.error);
    rl.close();
    return;
  }

  // Step 4: Display results
  console.log('======================================');
  console.log('SUCCESS! Here are your tokens:');
  console.log('======================================\n');
  console.log('Refresh Token (never expires):');
  console.log(tokenData.refresh_token);
  console.log('\nAccess Token (expires in ~4 hours):');
  console.log(tokenData.access_token);
  console.log('\n======================================');
  console.log('SQL Update Script');
  console.log('======================================\n');
  console.log('Copy this SQL to update your database:\n');
  console.log(`UPDATE [__mj].[FileStorageProvider]`);
  console.log(`SET [Configuration] = '{`);
  console.log(`  "refreshToken": "${tokenData.refresh_token}",`);
  console.log(`  "clientID": "${APP_KEY.trim()}",`);
  console.log(`  "clientSecret": "${APP_SECRET.trim()}"`);
  console.log(`}'`);
  console.log(`WHERE ID = 'C9B9433E-F36B-1410-8DA0-00021F8B792E' AND Name = 'Dropbox';`);
  console.log('\n======================================\n');

  rl.close();
}

function exchangeCodeForToken(code, appKey, appSecret) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({
      code: code,
      grant_type: 'authorization_code',
      client_id: appKey,
      client_secret: appSecret
    }).toString();

    const options = {
      hostname: 'api.dropboxapi.com',
      port: 443,
      path: '/oauth2/token',
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    req.write(postData);
    req.end();
  });
}

// Run the script
main().catch((error) => {
  console.error('Unexpected error:', error);
  rl.close();
});
