# JWT Token Management Future Enhancements

## Overview
This document outlines recommended enhancements to JWT token management in MemberJunction's GraphQLDataProvider. The current implementation handles token expiration reactively (after errors occur). These enhancements would provide proactive token management for improved user experience and system reliability.

## Current State (As of 2025-12-02)

### ✅ Implemented
- **Reactive Token Refresh**: GraphQL queries detect `JWT_EXPIRED` errors and automatically refresh tokens
- **WebSocket Reconnection**: WebSocket subscriptions detect token expiration and reconnect with refreshed tokens
- **Server-Side Log Filtering**: Token expiration logs at WARN level instead of ERROR

### ❌ Not Implemented
- Proactive token refresh (before expiration)
- Retry logic with exponential backoff
- Token expiration monitoring/analytics
- Automatic subscription re-establishment after refresh

---

## Enhancement 1: Proactive Token Refresh

### Problem
Current implementation waits for token to expire before refreshing, which causes:
- One failed request per token expiration
- Temporary WebSocket disconnection
- Brief interruption in real-time updates

### Solution
Monitor token expiration time and refresh 5 minutes before it expires.

### Implementation

**File**: `packages/GraphQLDataProvider/src/graphQLDataProvider.ts`

**Add dependencies**:
```typescript
import { decode as jwtDecode } from 'jsonwebtoken';
```

**Add private property**:
```typescript
private _tokenRefreshTimer: NodeJS.Timeout | null = null;
```

**Add method** (around line 1720, after `RefreshToken()` method):
```typescript
/**
 * Sets up automatic token refresh before expiration
 * @param token The JWT token to monitor
 * @param refreshBufferMs Time before expiration to refresh (default: 5 minutes)
 */
private setupProactiveTokenRefresh(token: string, refreshBufferMs: number = 5 * 60 * 1000): void {
    // Clear any existing timer
    if (this._tokenRefreshTimer) {
        clearTimeout(this._tokenRefreshTimer);
        this._tokenRefreshTimer = null;
    }

    try {
        const payload = jwtDecode(token);
        if (!payload || typeof payload === 'string' || !payload.exp) {
            console.warn('[GraphQLDataProvider] Cannot setup proactive refresh - invalid token payload');
            return;
        }

        const expiresAt = payload.exp * 1000; // Convert to milliseconds
        const now = Date.now();
        const timeUntilExpiry = expiresAt - now;
        const timeUntilRefresh = timeUntilExpiry - refreshBufferMs;

        if (timeUntilRefresh <= 0) {
            // Token already expired or will expire very soon
            console.log('[GraphQLDataProvider] Token expires soon, refreshing immediately');
            this.RefreshToken().catch(err => {
                console.error('[GraphQLDataProvider] Proactive token refresh failed:', err);
            });
            return;
        }

        console.log(`[GraphQLDataProvider] Token will be refreshed in ${Math.round(timeUntilRefresh / 1000 / 60)} minutes`);

        this._tokenRefreshTimer = setTimeout(async () => {
            console.log('[GraphQLDataProvider] Proactively refreshing token before expiration');
            try {
                await this.RefreshToken();
                // Setup next refresh cycle with the new token
                this.setupProactiveTokenRefresh(this._configData.Token, refreshBufferMs);
            } catch (error) {
                console.error('[GraphQLDataProvider] Proactive token refresh failed:', error);
                // Don't setup next refresh - fall back to reactive refresh
            }
        }, timeUntilRefresh);
    } catch (error) {
        console.error('[GraphQLDataProvider] Error setting up proactive token refresh:', error);
    }
}

/**
 * Stops the proactive token refresh timer
 */
private stopProactiveTokenRefresh(): void {
    if (this._tokenRefreshTimer) {
        clearTimeout(this._tokenRefreshTimer);
        this._tokenRefreshTimer = null;
    }
}
```

**Update `RefreshToken()` method** (around line 1701):
```typescript
public async RefreshToken(): Promise<void> {
    if (this._configData.Data.RefreshTokenFunction) {
        const newToken = await this._configData.Data.RefreshTokenFunction();
        if (newToken) {
            this._configData.Token = newToken; // update the token
            this._client = this.CreateNewGraphQLClient(this._configData.URL,
                                                       this._configData.Token,
                                                       this._sessionId,
                                                       this._configData.MJAPIKey);

            // 🆕 Setup proactive refresh for the new token
            this.setupProactiveTokenRefresh(newToken);
        }
        else {
            throw new Error('Refresh token function returned null or undefined token');
        }
    }
    else {
        throw new Error('No refresh token function provided');
    }
}
```

**Update `Config()` method** (around line 1200):
```typescript
public async Config(configData: GraphQLProviderConfigData): Promise<boolean> {
    this._configData = configData;
    this._client = this.CreateNewGraphQLClient(configData.URL,
                                              configData.Token,
                                              this._sessionId,
                                              configData.MJAPIKey);

    // 🆕 Setup proactive token refresh on initial configuration
    if (configData.Token) {
        this.setupProactiveTokenRefresh(configData.Token);
    }

    // ... rest of existing Config() code
}
```

**Add cleanup in `disposeWebSocketResources()` method** (around line 2116):
```typescript
public disposeWebSocketResources(): void {
    // Stop cleanup timer
    if (this._subscriptionCleanupTimer) {
        clearInterval(this._subscriptionCleanupTimer);
        this._subscriptionCleanupTimer = null;
    }

    // 🆕 Stop proactive token refresh
    this.stopProactiveTokenRefresh();

    // Complete all subjects and clear cache
    this.completeAllSubjects();

    // ... rest of existing method
}
```

### Testing
1. Set token expiration to 10 minutes in auth provider
2. Login and verify console log: "Token will be refreshed in 5 minutes"
3. Wait 5 minutes
4. Verify console log: "Proactively refreshing token before expiration"
5. Verify no `JWT_EXPIRED` errors occur

### Benefits
- ✅ Zero failed requests due to token expiration
- ✅ Uninterrupted WebSocket connections
- ✅ Better user experience (no brief disconnections)
- ✅ Reduces server-side token expiration warnings

---

## Enhancement 2: Retry Logic with Exponential Backoff

### Problem
Network failures, temporary server issues, or token refresh failures can cause permanent subscription failures.

### Solution
Add automatic retry with exponential backoff for both GraphQL queries and WebSocket subscriptions.

### Implementation

**Add RxJS operators**:
```typescript
import { retry, retryWhen, delay, tap, scan } from 'rxjs/operators';
```

**Update `subscribe()` method** (around line 1961):
```typescript
public subscribe(subscription: string, variables?: any, maxRetries: number = 3): Observable<any> {
    return new Observable((observer) => {
        const client = this.getOrCreateWSClient();
        this._activeSubscriptionCount++;

        const unsubscribe = client.subscribe(
            { query: subscription, variables },
            {
                next: (data) => {
                    observer.next(data.data);
                },
                error: async (error: unknown) => {
                    // Check if error is JWT_EXPIRED
                    const errorObj = error as { extensions?: { code?: string }, message?: string };
                    const isTokenExpired =
                        errorObj?.extensions?.code === 'JWT_EXPIRED' ||
                        errorObj?.message?.includes('token has expired') ||
                        errorObj?.message?.includes('JWT_EXPIRED');

                    if (isTokenExpired) {
                        console.log('[GraphQLDataProvider] WebSocket JWT token expired, refreshing and reconnecting...');
                        try {
                            await this.RefreshToken();
                            this.disposeWSClient();
                            observer.complete(); // Trigger retry
                        } catch (refreshError) {
                            console.error('[GraphQLDataProvider] Failed to refresh token for WebSocket:', refreshError);
                            observer.error(refreshError);
                        }
                    } else {
                        observer.error(error);
                    }
                },
                complete: () => {
                    observer.complete();
                },
            }
        );

        return () => {
            this._activeSubscriptionCount--;
            unsubscribe();
        };
    }).pipe(
        // 🆕 Add retry logic with exponential backoff
        retryWhen(errors =>
            errors.pipe(
                scan((retryCount, error) => {
                    // Don't retry on authentication errors (except JWT_EXPIRED which is handled above)
                    const errorObj = error as { extensions?: { code?: string }, message?: string };
                    if (errorObj?.extensions?.code === 'UNAUTHENTICATED') {
                        throw error; // Stop retrying
                    }

                    if (retryCount >= maxRetries) {
                        console.error(`[GraphQLDataProvider] Max retries (${maxRetries}) exceeded for subscription`);
                        throw error; // Stop retrying
                    }

                    return retryCount + 1;
                }, 0),
                tap(retryCount => {
                    const delayMs = Math.min(1000 * Math.pow(2, retryCount), 30000); // Max 30 seconds
                    console.log(`[GraphQLDataProvider] Retrying subscription (attempt ${retryCount + 1}/${maxRetries}) in ${delayMs}ms`);
                }),
                delay(1000) // Initial delay, will be increased by exponential backoff
            )
        )
    );
}
```

**Add retry wrapper for GraphQL queries** (around line 1670):
```typescript
public async ExecuteGQLWithRetry(
    query: string,
    variables: any,
    maxRetries: number = 3,
    refreshTokenIfNeeded: boolean = true
): Promise<any> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await this.ExecuteGQL(query, variables, refreshTokenIfNeeded);
        } catch (error: any) {
            lastError = error;

            // Don't retry on authentication errors
            if (error?.response?.errors?.[0]?.extensions?.code === 'UNAUTHENTICATED') {
                throw error;
            }

            if (attempt < maxRetries) {
                const delayMs = Math.min(1000 * Math.pow(2, attempt), 30000);
                console.log(`[GraphQLDataProvider] Retrying query (attempt ${attempt + 1}/${maxRetries}) in ${delayMs}ms`);
                await new Promise(resolve => setTimeout(resolve, delayMs));
            }
        }
    }

    console.error(`[GraphQLDataProvider] Max retries (${maxRetries}) exceeded for query`);
    throw lastError;
}
```

### Usage Example
```typescript
// In components - wrap subscriptions with retry
this.graphQLProvider.subscribe(SUBSCRIPTION_QUERY, { id: '123' }, 5)
    .pipe(
        catchError(error => {
            console.error('Subscription failed after retries:', error);
            return EMPTY; // Or return fallback observable
        })
    )
    .subscribe(data => {
        // Handle data
    });

// For queries - use retry wrapper
const result = await this.graphQLProvider.ExecuteGQLWithRetry(QUERY, variables, 3);
```

### Benefits
- ✅ Resilient to temporary network issues
- ✅ Automatic recovery from transient failures
- ✅ Exponential backoff prevents overwhelming the server
- ✅ Configurable retry limits

---

## Enhancement 3: Token Expiration Analytics

### Problem
No visibility into token refresh patterns, failure rates, or optimal token lifetime.

### Solution
Add telemetry and analytics for token operations.

### Implementation

**Add analytics interface**:
```typescript
interface TokenRefreshMetrics {
    totalRefreshes: number;
    successfulRefreshes: number;
    failedRefreshes: number;
    proactiveRefreshes: number;
    reactiveRefreshes: number;
    averageTimeToRefresh: number;
    lastRefreshTimestamp: number;
    tokenExpirations: number;
}
```

**Add metrics tracking**:
```typescript
private _tokenMetrics: TokenRefreshMetrics = {
    totalRefreshes: 0,
    successfulRefreshes: 0,
    failedRefreshes: 0,
    proactiveRefreshes: 0,
    reactiveRefreshes: 0,
    averageTimeToRefresh: 0,
    lastRefreshTimestamp: 0,
    tokenExpirations: 0,
};

public getTokenMetrics(): Readonly<TokenRefreshMetrics> {
    return { ...this._tokenMetrics };
}

private recordTokenRefresh(isProactive: boolean, success: boolean, durationMs: number): void {
    this._tokenMetrics.totalRefreshes++;
    if (success) {
        this._tokenMetrics.successfulRefreshes++;
    } else {
        this._tokenMetrics.failedRefreshes++;
    }
    if (isProactive) {
        this._tokenMetrics.proactiveRefreshes++;
    } else {
        this._tokenMetrics.reactiveRefreshes++;
    }

    // Update average time to refresh
    const totalDuration = this._tokenMetrics.averageTimeToRefresh * (this._tokenMetrics.totalRefreshes - 1) + durationMs;
    this._tokenMetrics.averageTimeToRefresh = totalDuration / this._tokenMetrics.totalRefreshes;
    this._tokenMetrics.lastRefreshTimestamp = Date.now();
}

private recordTokenExpiration(): void {
    this._tokenMetrics.tokenExpirations++;
}
```

**Update refresh methods to record metrics**:
```typescript
public async RefreshToken(): Promise<void> {
    const startTime = Date.now();
    try {
        // ... existing refresh logic
        const duration = Date.now() - startTime;
        this.recordTokenRefresh(false, true, duration);
    } catch (error) {
        const duration = Date.now() - startTime;
        this.recordTokenRefresh(false, false, duration);
        throw error;
    }
}
```

**Add periodic metrics logging**:
```typescript
private startMetricsReporting(intervalMs: number = 60000): void {
    setInterval(() => {
        const metrics = this.getTokenMetrics();
        if (metrics.totalRefreshes > 0) {
            console.log('[GraphQLDataProvider] Token Metrics:', {
                'Total Refreshes': metrics.totalRefreshes,
                'Success Rate': `${(metrics.successfulRefreshes / metrics.totalRefreshes * 100).toFixed(1)}%`,
                'Proactive/Reactive': `${metrics.proactiveRefreshes}/${metrics.reactiveRefreshes}`,
                'Token Expirations': metrics.tokenExpirations,
                'Avg Refresh Time': `${metrics.averageTimeToRefresh.toFixed(0)}ms`,
            });
        }
    }, intervalMs);
}
```

### Benefits
- ✅ Visibility into token refresh patterns
- ✅ Identify optimal token lifetime
- ✅ Track refresh success rates
- ✅ Detect refresh performance issues

---

## Enhancement 4: Automatic Subscription Re-establishment

### Problem
When WebSocket disconnects due to token expiration, components must manually re-subscribe.

### Solution
Add automatic re-subscription logic that persists subscription state across disconnections.

### Implementation

**Add subscription registry**:
```typescript
interface SubscriptionState {
    query: string;
    variables: any;
    observer: any;
    lastActivity: number;
}

private _subscriptionRegistry = new Map<string, SubscriptionState>();
```

**Update subscription methods to track state**:
```typescript
public subscribeWithAutoReconnect(
    subscriptionId: string,
    subscription: string,
    variables?: any
): Observable<any> {
    return new Observable((observer) => {
        // Register subscription
        this._subscriptionRegistry.set(subscriptionId, {
            query: subscription,
            variables,
            observer,
            lastActivity: Date.now(),
        });

        // Delegate to existing subscribe method
        const innerSubscription = this.subscribe(subscription, variables).subscribe({
            next: (data) => {
                this._subscriptionRegistry.get(subscriptionId)!.lastActivity = Date.now();
                observer.next(data);
            },
            error: (error) => observer.error(error),
            complete: () => {
                // On completion, check if we should auto-reconnect
                const state = this._subscriptionRegistry.get(subscriptionId);
                if (state && Date.now() - state.lastActivity < 30000) {
                    console.log(`[GraphQLDataProvider] Auto-reconnecting subscription: ${subscriptionId}`);
                    // Re-subscribe after brief delay
                    setTimeout(() => {
                        this.subscribeWithAutoReconnect(subscriptionId, subscription, variables);
                    }, 1000);
                } else {
                    observer.complete();
                }
            },
        });

        // Return cleanup function
        return () => {
            this._subscriptionRegistry.delete(subscriptionId);
            innerSubscription.unsubscribe();
        };
    });
}
```

### Benefits
- ✅ Seamless reconnection after token refresh
- ✅ No component code changes needed
- ✅ Maintains subscription state across disconnections

---

## Enhancement 5: Token Lifetime Configuration

### Problem
Token lifetime is controlled by auth provider (Auth0/Azure AD/Okta) - not centrally configured.

### Solution
Document recommended token lifetime settings per auth provider.

### Recommended Settings

#### Auth0
```
Auth0 Dashboard → Applications → Your Application → Settings:
- ID Token Expiration: 28800 seconds (8 hours)
- Access Token Expiration: 28800 seconds (8 hours)
- Refresh Token Expiration: 2592000 seconds (30 days)
- Refresh Token Rotation: Enabled
- Refresh Token Reuse Interval: 0 seconds
```

#### Azure AD / Entra ID
```
Azure Portal → App Registrations → Token Configuration:
- Access Token Lifetime: 480 minutes (8 hours)
- Refresh Token Max Lifetime: 90 days
- Refresh Token Inactivity: 90 days
- Multi-Factor Refresh Token Max Lifetime: 90 days
```

#### Okta
```
Okta Admin Console → Security → API → Authorization Servers:
- Access Token Lifetime: 8 hours
- Refresh Token Lifetime: 90 days
- Refresh Token Rotation: Enabled
- Grace Period: 30 seconds
```

### Considerations
- **Shorter tokens (1-2 hours)**: Better security, more frequent refresh
- **Longer tokens (8-12 hours)**: Better UX, less refresh overhead
- **Recommended**: 8 hours for production (balances security and UX)

---

## Implementation Priority

### High Priority (Implement Soon)
1. **Proactive Token Refresh** - Biggest UX improvement, prevents all failed requests
2. **Retry Logic** - Improves reliability for intermittent network issues

### Medium Priority (Nice to Have)
3. **Token Expiration Analytics** - Helps optimize token lifetime
4. **Automatic Subscription Re-establishment** - Better UX for long-running sessions

### Low Priority (Future Consideration)
5. **Token Lifetime Configuration** - Review auth provider settings

---

## Estimated Effort

| Enhancement | Effort | Risk | Impact |
|-------------|--------|------|--------|
| Proactive Token Refresh | 4 hours | Low | High |
| Retry Logic | 6 hours | Medium | High |
| Token Analytics | 3 hours | Low | Medium |
| Auto Re-subscription | 4 hours | Medium | Medium |
| Token Lifetime Config | 1 hour | Low | Low |

**Total**: ~18 hours for full implementation

---

## Testing Checklist

When implementing these enhancements, test:

- [ ] Proactive refresh triggers 5 minutes before expiration
- [ ] No `JWT_EXPIRED` errors occur during normal operation
- [ ] WebSocket subscriptions remain active across token refresh
- [ ] Retry logic backs off exponentially
- [ ] Max retry limit is respected
- [ ] Metrics are logged correctly
- [ ] Cleanup methods stop all timers
- [ ] Multiple concurrent subscriptions work correctly
- [ ] Token refresh during active GraphQL query works
- [ ] Token refresh during active WebSocket subscription works
- [ ] Browser tab sleep/wake handles token correctly
- [ ] Multiple browser tabs handle token refresh independently

---

## Migration Notes

### Breaking Changes
None - all enhancements are backward compatible.

### Configuration Changes
- New optional parameter: `maxRetries` on subscription methods
- New optional parameter: `refreshBufferMs` for proactive refresh timing
- New method: `getTokenMetrics()` for analytics

### Rollback Plan
If issues occur:
1. Disable proactive refresh by commenting out `setupProactiveTokenRefresh()` calls
2. Remove retry logic by reverting to original `subscribe()` implementation
3. All existing reactive refresh logic remains functional

---

## Questions?

Contact: Jordan Fanapour
Date Created: 2025-12-02
Last Updated: 2025-12-02
