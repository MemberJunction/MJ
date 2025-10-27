/**
 * Example: Custom Authentication Server
 *
 * This example demonstrates how to extend the ComponentRegistryAPIServer
 * to implement custom authentication using Bearer tokens stored in a database.
 */

import { ComponentRegistryAPIServer } from '../src/Server.js';
import { Request } from 'express';
import { Metadata, RunView } from '@memberjunction/global';

/**
 * Custom registry server with database-backed Bearer token authentication
 */
export class AuthenticatedRegistryServer extends ComponentRegistryAPIServer {
  private validTokensCache: Set<string> = new Set();
  private lastCacheUpdate: Date = new Date(0);
  private readonly CACHE_DURATION_MS = 5 * 60 * 1000; // 5 minutes

  /**
   * Override checkAPIKey to implement Bearer token validation
   */
  protected async checkAPIKey(req: Request): Promise<boolean> {
    // Extract Bearer token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.log('No Bearer token provided');
      return false;
    }

    const token = authHeader.substring(7); // Remove "Bearer " prefix

    // Check if we need to refresh the cache
    if (this.isCacheExpired()) {
      await this.refreshTokenCache();
    }

    // Validate token against cache
    const isValid = this.validTokensCache.has(token);

    if (isValid) {
      console.log(`Valid token used: ${token.substring(0, 8)}...`);
    } else {
      console.log(`Invalid token attempted: ${token.substring(0, 8)}...`);
    }

    return isValid;
  }

  /**
   * Check if the token cache needs refreshing
   */
  private isCacheExpired(): boolean {
    const now = new Date();
    const timeSinceUpdate = now.getTime() - this.lastCacheUpdate.getTime();
    return timeSinceUpdate > this.CACHE_DURATION_MS;
  }

  /**
   * Refresh the valid tokens cache from database
   */
  private async refreshTokenCache(): Promise<void> {
    try {
      console.log('Refreshing API token cache from database...');

      // Query the database for valid API tokens
      // This assumes you have an APITokens entity in your MJ system
      const rv = new RunView();
      const result = await rv.RunView({
        EntityName: 'API Tokens', // Your token entity name
        ExtraFilter: 'IsActive = 1 AND ExpiresAt > GETDATE()',
        OrderBy: 'CreatedAt DESC',
      });

      if (result.Success && result.Results) {
        // Clear and rebuild cache
        this.validTokensCache.clear();

        for (const tokenRecord of result.Results) {
          this.validTokensCache.add(tokenRecord.Token);
        }

        this.lastCacheUpdate = new Date();
        console.log(`Token cache refreshed with ${this.validTokensCache.size} valid tokens`);
      } else {
        console.error('Failed to refresh token cache:', result.ErrorMessage);
      }
    } catch (error) {
      console.error('Error refreshing token cache:', error);
      // Don't clear the cache on error - use stale cache
    }
  }

  /**
   * Override setupMiddleware to add custom logging
   */
  protected setupMiddleware(): void {
    // Call parent setup first
    super.setupMiddleware();

    // Add request logging middleware
    this.app.use((req, res, next) => {
      const start = Date.now();

      // Log response after it's sent
      res.on('finish', () => {
        const duration = Date.now() - start;
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`);
      });

      next();
    });
  }

  /**
   * Override getComponentFilter to add custom filtering logic
   */
  protected getComponentFilter(): string {
    // Only serve published components from approved sources
    return `(SourceRegistryID IS NULL OR SourceRegistryID IN (
      SELECT ID FROM [__mj].[ComponentRegistry] WHERE Status = 'Active'
    )) AND Status = 'Published'`;
  }
}

/**
 * Start the authenticated server
 */
async function startAuthenticatedServer() {
  console.log('Starting Authenticated Component Registry Server...');

  const server = new AuthenticatedRegistryServer();

  try {
    await server.initialize();
    await server.start();

    console.log('✅ Authenticated server started successfully');
    console.log('📝 Authentication: Bearer token required');
    console.log('🔄 Token cache: Refreshes every 5 minutes');
  } catch (error) {
    console.error('❌ Failed to start authenticated server:', error);
    process.exit(1);
  }
}

// Start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startAuthenticatedServer();
}

export { startAuthenticatedServer };
