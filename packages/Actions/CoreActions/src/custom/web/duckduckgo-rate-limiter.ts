import { Observable, Subject, from, of, throwError, timer, EMPTY } from 'rxjs';
import { concatMap, delay, retry, catchError, tap, timeout, mergeMap } from 'rxjs/operators';

export interface RateLimitConfig {
    maxConcurrent: number;
    queueTimeout: number;
    retryDelay: number;
    maxRetries: number;
    resetQueueAfterMs: number;
}

export interface SearchRequest {
    url: string;
    options: RequestInit;
    disableQueueing?: boolean;
}

export interface SearchResponse {
    response: Response;
    text: string;
}

/**
 * Adaptive rate limiter for DuckDuckGo searches
 * - Starts with immediate execution (no queue)
 * - Activates queue on rate limit errors (202, 403, 429)
 * - Automatically deactivates queue after success period
 */
export class DuckDuckGoRateLimiter {
    private requestQueue$ = new Subject<{
        request: SearchRequest;
        resolver: (value: SearchResponse) => void;
        rejecter: (error: any) => void;
    }>();
    
    private isQueueActive = false;
    private lastRateLimitTime = 0;
    private resetQueueTimer?: NodeJS.Timeout;
    private activeRequests = 0;
    
    private readonly config: RateLimitConfig = {
        maxConcurrent: 1, // When queue is active, serialize requests
        queueTimeout: 30000, // 30 seconds timeout for queued requests
        retryDelay: 2000, // 2 seconds between retries
        maxRetries: 4,
        resetQueueAfterMs: 10000 // Reset queue after 10 seconds of success
    };
    
    private readonly rateLimitStatusCodes = [202, 403, 429];
    
    constructor(config?: Partial<RateLimitConfig>) {
        this.config = { ...this.config, ...config };
        this.setupQueueProcessor();
    }
    
    /**
     * Process requests through the queue when active
     */
    private setupQueueProcessor(): void {
        this.requestQueue$.pipe(
            mergeMap(({ request, resolver, rejecter }) => {
                // If queue is not active and request allows immediate execution, process immediately
                if (!this.isQueueActive && !request.disableQueueing) {
                    return this.executeRequest(request).pipe(
                        tap({
                            next: (result) => resolver(result),
                            error: (error) => rejecter(error)
                        }),
                        catchError(() => EMPTY) // Prevent stream termination
                    );
                }
                
                // Otherwise process through queue
                return from([{ request, resolver, rejecter }]).pipe(
                    concatMap(({ request, resolver, rejecter }) => 
                        this.executeRequest(request).pipe(
                            tap({
                                next: (result) => resolver(result),
                                error: (error) => rejecter(error)
                            }),
                            catchError(() => EMPTY) // Prevent stream termination
                        )
                    )
                );
            }, this.config.maxConcurrent)
        ).subscribe();
    }
    
    /**
     * Execute a search request with retry logic
     */
    private executeRequest(request: SearchRequest): Observable<SearchResponse> {
        return from(fetch(request.url, request.options)).pipe(
            timeout(this.config.queueTimeout),
            mergeMap(async (response) => {
                const text = await response.text();
                
                // Check for rate limit status codes
                if (this.rateLimitStatusCodes.includes(response.status)) {
                    this.activateQueue();
                    throw new Error(`Rate limited: ${response.status}`);
                }
                
                // Success - consider deactivating queue
                if (response.ok) {
                    this.scheduleQueueReset();
                }
                
                return { response, text };
            }),
            retry({
                count: this.config.maxRetries,
                delay: (error, retryCount) => {
                    // Exponential backoff for rate limit errors
                    const delayMs = this.isQueueActive 
                        ? this.config.retryDelay * Math.pow(2, retryCount - 1)
                        : 0;
                    return timer(delayMs);
                }
            }),
            catchError((error) => {
                // If it's a rate limit error and queueing is disabled, fail immediately
                if (request.disableQueueing && this.isQueueActive) {
                    return throwError(() => new Error('Rate limited and queueing is disabled'));
                }
                return throwError(() => error);
            })
        );
    }
    
    /**
     * Activate the request queue due to rate limiting
     */
    private activateQueue(): void {
        if (!this.isQueueActive) {
            console.log('[DuckDuckGoRateLimiter] Activating queue due to rate limit');
            this.isQueueActive = true;
            this.lastRateLimitTime = Date.now();
        }
        
        // Cancel any pending queue reset
        if (this.resetQueueTimer) {
            clearTimeout(this.resetQueueTimer);
            this.resetQueueTimer = undefined;
        }
    }
    
    /**
     * Schedule queue deactivation after successful requests
     */
    private scheduleQueueReset(): void {
        if (!this.isQueueActive) return;
        
        // Clear existing timer
        if (this.resetQueueTimer) {
            clearTimeout(this.resetQueueTimer);
        }
        
        // Schedule queue reset
        this.resetQueueTimer = setTimeout(() => {
            if (Date.now() - this.lastRateLimitTime >= this.config.resetQueueAfterMs) {
                console.log('[DuckDuckGoRateLimiter] Deactivating queue - no rate limits detected');
                this.isQueueActive = false;
                this.resetQueueTimer = undefined;
            }
        }, this.config.resetQueueAfterMs);
    }
    
    /**
     * Execute a search request through the rate limiter
     */
    async search(request: SearchRequest): Promise<SearchResponse> {
        return new Promise((resolve, reject) => {
            // If queueing is disabled and queue is active, fail immediately
            if (request.disableQueueing && this.isQueueActive) {
                reject(new Error('Rate limiting active and queueing is disabled'));
                return;
            }
            
            // Process through the queue
            this.requestQueue$.next({
                request,
                resolver: resolve,
                rejecter: reject
            });
        });
    }
    
    /**
     * Get current queue status
     */
    getStatus(): { isQueueActive: boolean; activeRequests: number } {
        return {
            isQueueActive: this.isQueueActive,
            activeRequests: this.activeRequests
        };
    }
    
    /**
     * Force queue activation (for testing)
     */
    forceActivateQueue(): void {
        this.activateQueue();
    }
    
    /**
     * Force queue deactivation (for testing)
     */
    forceDeactivateQueue(): void {
        this.isQueueActive = false;
        if (this.resetQueueTimer) {
            clearTimeout(this.resetQueueTimer);
            this.resetQueueTimer = undefined;
        }
    }
}

// Singleton instance
let rateLimiterInstance: DuckDuckGoRateLimiter | null = null;

/**
 * Get the singleton rate limiter instance
 */
export function getDuckDuckGoRateLimiter(config?: Partial<RateLimitConfig>): DuckDuckGoRateLimiter {
    if (!rateLimiterInstance) {
        rateLimiterInstance = new DuckDuckGoRateLimiter(config);
    }
    return rateLimiterInstance;
}