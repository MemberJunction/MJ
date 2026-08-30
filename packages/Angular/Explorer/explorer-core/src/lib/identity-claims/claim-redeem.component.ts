/**
 * @fileoverview Identity Claim Redemption Page
 *
 * Landing page for the links in identity-claim emails
 * (`${PORTAL_BASE_URL}/claims/redeem?id=<claimId>&token=<rawToken>`). When a recipient
 * clicks through, this component:
 * 1. Waits for the user's session to be restored (same posture as the OAuth callback —
 *    no AuthGuard; the component handles the not-yet-authenticated case itself)
 * 2. Extracts the claim id and optional verification token from the query params
 * 3. Calls the `RedeemIdentityClaim` GraphQL mutation, which runs the server engine's full
 *    gate (email match subject to verification rules, or timing-safe token match, atomic CAS)
 * 4. Shows the outcome and offers navigation back into the app
 *
 * Like the OAuth callback, this is a deliberate exception to the NavigationService-only rule:
 * it is registered directly in the routing module and reads its own query params.
 *
 * @module IdentityClaims
 */

import { Component, OnDestroy, OnInit, ChangeDetectorRef } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';

interface RedeemIdentityClaimResponse {
    RedeemIdentityClaim?: {
        Success: boolean;
        ErrorMessage?: string;
        ClaimID?: string;
        Data?: string;
    };
}

/** Maximum time to wait for session restoration (30 seconds) */
const MAX_WAIT_TIME_MS = 30000;
/** Polling interval for checking provider readiness (500ms) */
const POLL_INTERVAL_MS = 500;

const REDEEM_MUTATION = `
    mutation RedeemIdentityClaim($ClaimID: String!, $Token: String) {
        RedeemIdentityClaim(ClaimID: $ClaimID, Token: $Token) {
            Success
            ErrorMessage
            ClaimID
            Data
        }
    }
`;

@Component({
    standalone: false,
    selector: 'mj-claim-redeem',
    templateUrl: './claim-redeem.component.html',
    styleUrls: ['./claim-redeem.component.css']
})
export class ClaimRedeemComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    /** Loading state while restoring the session / redeeming */
    public IsLoading = true;

    /** Terminal error state */
    public HasError = false;

    /** Error message to display */
    public ErrorMessage = '';

    /** True when the wait for authentication timed out (user likely not signed in) */
    public NeedsSignIn = false;

    /** Status message shown during processing */
    public StatusMessage = 'Restoring session...';

    /** Timer for polling provider readiness */
    private pollTimer: ReturnType<typeof setInterval> | null = null;

    /** Flag to prevent double processing */
    private isProcessing = false;

    constructor(
        private route: ActivatedRoute,
        private router: Router,
        private cdr: ChangeDetectorRef
    ) {
        super();
    }

    async ngOnInit(): Promise<void> {
        await this.waitForProviderAndRedeem();
    }

    ngOnDestroy(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /**
     * Waits for the GraphQL provider to be initialized (indicating auth is complete),
     * then redeems the claim from the query params.
     */
    private async waitForProviderAndRedeem(): Promise<void> {
        const startTime = Date.now();

        if (this.isProviderReady()) {
            await this.safeRedeem();
            return;
        }

        this.StatusMessage = 'Waiting for sign-in...';
        this.cdr.detectChanges();

        return new Promise<void>((resolve) => {
            this.pollTimer = setInterval(async () => {
                const elapsed = Date.now() - startTime;

                if (this.isProviderReady()) {
                    if (this.pollTimer) {
                        clearInterval(this.pollTimer);
                        this.pollTimer = null;
                    }
                    await this.safeRedeem();
                    resolve();
                    return;
                }

                if (elapsed >= MAX_WAIT_TIME_MS) {
                    if (this.pollTimer) {
                        clearInterval(this.pollTimer);
                        this.pollTimer = null;
                    }
                    this.NeedsSignIn = true;
                    this.showError('Please sign in first, then open the link from your email again — the claim will attach to your signed-in account.');
                    resolve();
                    return;
                }

                const secondsRemaining = Math.ceil((MAX_WAIT_TIME_MS - elapsed) / 1000);
                this.StatusMessage = `Waiting for sign-in... (${secondsRemaining}s)`;
                this.cdr.detectChanges();
            }, POLL_INTERVAL_MS);
        });
    }

    /** Checks if the GraphQL provider is initialized with a valid token */
    private isProviderReady(): boolean {
        try {
            const provider = this.ProviderToUse as GraphQLDataProvider;
            if (!provider) {
                return false;
            }
            const configData = provider.ConfigData;
            return Boolean(configData && configData.Token && configData.URL);
        } catch {
            return false;
        }
    }

    /** Redeems exactly once, converting any throw into the error state */
    private async safeRedeem(): Promise<void> {
        if (this.isProcessing) {
            return;
        }
        this.isProcessing = true;

        try {
            await this.redeemClaim();
        } catch (error) {
            console.error('[Claim Redeem] Error redeeming claim:', error);
            this.showError(error instanceof Error ? error.message : String(error));
        }
    }

    /** Reads the query params and calls the redemption mutation */
    private async redeemClaim(): Promise<void> {
        const params = this.route.snapshot.queryParams;
        const claimId = params['id'] as string | undefined;
        const token = params['token'] as string | undefined;

        if (!claimId) {
            this.showError('This link is missing its claim id. Please use the exact link from your email.');
            return;
        }

        this.StatusMessage = 'Redeeming your claim...';
        this.cdr.detectChanges();

        const provider = this.ProviderToUse as GraphQLDataProvider;
        const result = (await provider.ExecuteGQL(REDEEM_MUTATION, {
            ClaimID: claimId,
            Token: token ?? null
        })) as RedeemIdentityClaimResponse;

        const outcome = result?.RedeemIdentityClaim;
        if (outcome?.Success) {
            this.IsLoading = false;
            this.StatusMessage = 'Your claim has been redeemed and attached to your account.';
            this.cdr.detectChanges();
        } else {
            this.showError(outcome?.ErrorMessage || 'The claim could not be redeemed.');
        }
    }

    /** Shows the terminal error state */
    private showError(message: string): void {
        this.IsLoading = false;
        this.HasError = true;
        this.ErrorMessage = message;
        this.cdr.detectChanges();
    }

    /** Navigates into the app shell (which handles sign-in when needed) */
    public onGoToApp(): void {
        this.router.navigateByUrl('/');
    }

    /** Retries redemption from scratch (fresh component state) */
    public onRetry(): void {
        this.IsLoading = true;
        this.HasError = false;
        this.NeedsSignIn = false;
        this.ErrorMessage = '';
        this.isProcessing = false;
        void this.waitForProviderAndRedeem();
    }
}
