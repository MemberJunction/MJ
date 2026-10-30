/**
 * @fileoverview Explorer's `office/connect` page: the Excel add-in's sign-in window.
 *
 * The add-in pane opens this page in an Office dialog with its one-time public key (`pk`) and a
 * random `state`. The page waits for the person's Explorer session, explains what Excel will be
 * able to do, and on approval mints a connection key (`ExcelAddin.CreateConnection`), seals it to
 * the pane's public key, and leaves for the add-in page the host itself reports
 * (`ConnectedPageUrl`), carrying the sealed key in the URL fragment. The page never navigates to
 * anything taken from its own URL.
 *
 * Like the OAuth callback and claim redemption pages, this is a deliberate exception to the
 * NavigationService-only rule: it is registered directly in the routing module, has no AuthGuard,
 * and reads its own query params.
 *
 * @module Office
 */
import { ChangeDetectorRef, Component, OnDestroy, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { LogError } from '@memberjunction/core';
import { GraphQLDataProvider } from '@memberjunction/graphql-dataprovider';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import {
    EXCEL_HANDOFF_VERSION,
    ExcelAddinCreateConnectionOperation,
    ExcelAddinCreateConnectionOutput,
    ExcelAddinGetStatusOperation,
    ExcelAddinStatusOutput,
    ExcelConnectionPayload,
    SealConnectionPayload,
} from '@memberjunction/excel-addin';
import {
    BuildOfficeHandoffUrl,
    BuildOfficeSignInOptions,
    DisplayNameForUser,
    OfficeConnectRequest,
    OfficeHandoffOutcome,
    ReadOfficeConnectRequest,
} from './office-connect.logic';

/** Where the page is in the flow. */
export type OfficeConnectStage =
    | 'waiting'
    | 'sign-in'
    | 'bad-request'
    | 'not-enabled'
    | 'consent'
    | 'connecting'
    | 'leaving'
    | 'cancelled'
    | 'error';

/** How long to wait for the session before giving up and asking the person to sign in. */
const MAX_WAIT_TIME_MS = 30000;
/** How long to wait before offering a sign-in button beside the wait spinner. */
const SIGN_IN_OFFER_MS = 4000;
const POLL_INTERVAL_MS = 500;

@Component({
    standalone: false,
    selector: 'mj-office-connect',
    templateUrl: './office-connect.component.html',
    styleUrls: ['./office-connect.component.css'],
})
export class OfficeConnectComponent extends BaseAngularComponent implements OnInit, OnDestroy {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private cdr = inject(ChangeDetectorRef);
    private authBase = inject(MJAuthBase);

    public Stage: OfficeConnectStage = 'waiting';
    public StatusMessage = 'Restoring your session...';
    public ErrorMessage = '';
    /** True once the wait has run long enough that the person may simply not be signed in. */
    public CanSignIn = false;
    public UserName = '';
    public UserEmail = '';
    public ServerName = '';
    public KeyLifetimeDays = 0;

    private request: OfficeConnectRequest | null = null;
    private status: ExcelAddinStatusOutput | null = null;
    private pollTimer: ReturnType<typeof setInterval> | null = null;
    private started = false;

    async ngOnInit(): Promise<void> {
        this.request = ReadOfficeConnectRequest(this.route.snapshot.queryParams);
        if (!this.request) {
            this.setStage('bad-request');
            return;
        }
        this.waitForSession();
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    /** Starts the provider's sign-in, asking it to come back to this page. */
    public OnSignIn(): void {
        this.authBase.login(BuildOfficeSignInOptions(this.router.url)).subscribe({
            error: (e: unknown) => this.showError(`Sign-in didn't start: ${this.describe(e)}`),
        });
    }

    /** Mints the connection key, seals it to the pane's key, and returns to the add-in page. */
    public async OnConnect(): Promise<void> {
        if (this.Stage !== 'consent' || !this.request || !this.status) {
            return;
        }
        this.setStage('connecting', 'Connecting Excel...');
        try {
            const connection = await this.createConnection();
            if (connection) {
                await this.handOff(connection, this.request, this.status);
            }
        } catch (e) {
            LogError(`Excel connect failed: ${this.describe(e)}`);
            this.showError(`Excel couldn't be connected: ${this.describe(e)}`);
        }
    }

    /** Tells the add-in the person declined, or says the window can be closed. */
    public OnCancel(): void {
        const url = this.status?.Enabled ? BuildOfficeHandoffUrl(this.status.ConnectedPageUrl, 'cancelled') : null;
        if (url) {
            this.leave(url);
        } else {
            this.setStage('cancelled');
        }
    }

    /** Leaves the page. Protected so tests can observe the navigation without performing it. */
    protected LeaveFor(url: string): void {
        window.location.replace(url);
    }

    private waitForSession(): void {
        if (this.isProviderReady()) {
            void this.loadStatus();
            return;
        }
        const startedAt = Date.now();
        this.pollTimer = setInterval(() => this.checkSession(startedAt), POLL_INTERVAL_MS);
    }

    private checkSession(startedAt: number): void {
        const elapsed = Date.now() - startedAt;
        if (this.isProviderReady()) {
            this.stopPolling();
            void this.loadStatus();
        } else if (elapsed >= MAX_WAIT_TIME_MS) {
            this.stopPolling();
            this.setStage('sign-in');
        } else if (elapsed >= SIGN_IN_OFFER_MS && !this.CanSignIn) {
            this.CanSignIn = true;
            this.cdr.detectChanges();
        }
    }

    private stopPolling(): void {
        if (this.pollTimer) {
            clearInterval(this.pollTimer);
            this.pollTimer = null;
        }
    }

    /** The GraphQL provider has a token and endpoint once the session is restored. */
    private isProviderReady(): boolean {
        try {
            const config = (this.ProviderToUse as GraphQLDataProvider)?.ConfigData;
            return Boolean(config?.Token && config?.URL);
        } catch {
            return false;
        }
    }

    /** Reads the add-in status fresh (not the grids' cached answer) and shows the consent card. */
    private async loadStatus(): Promise<void> {
        if (this.started) {
            return;
        }
        this.started = true;
        this.setStage('waiting', 'Checking Excel is turned on...');
        try {
            const result = await new ExcelAddinGetStatusOperation().Execute({}, { provider: this.ProviderToUse });
            if (!result.Success || !result.Output) {
                this.showError(result.ErrorMessage || 'MemberJunction could not say whether Excel is turned on.');
                return;
            }
            this.applyStatus(result.Output);
        } catch (e) {
            LogError(`Excel add-in status check failed: ${this.describe(e)}`);
            this.showError(`MemberJunction could not say whether Excel is turned on: ${this.describe(e)}`);
        }
    }

    private applyStatus(status: ExcelAddinStatusOutput): void {
        this.status = status;
        this.ServerName = status.ServerName;
        this.KeyLifetimeDays = status.KeyLifetimeDays;
        if (!status.Enabled) {
            this.setStage('not-enabled');
            return;
        }
        const user = this.ProviderToUse.CurrentUser;
        this.UserName = DisplayNameForUser(user);
        this.UserEmail = user?.Email ?? '';
        this.setStage('consent');
    }

    private async createConnection(): Promise<ExcelAddinCreateConnectionOutput | null> {
        const result = await new ExcelAddinCreateConnectionOperation().Execute({}, { provider: this.ProviderToUse });
        if (!result.Success || !result.Output) {
            this.showError(result.ErrorMessage || 'Excel couldn\'t be connected.');
            return null;
        }
        return result.Output;
    }

    private async handOff(connection: ExcelAddinCreateConnectionOutput, request: OfficeConnectRequest, status: ExcelAddinStatusOutput): Promise<void> {
        const payload: ExcelConnectionPayload = {
            Version: EXCEL_HANDOFF_VERSION,
            State: request.State,
            APIKey: connection.APIKey,
            GraphQLUrl: (this.ProviderToUse as GraphQLDataProvider).ConfigData.URL,
            UserName: this.UserName,
            UserEmail: this.UserEmail,
            ExpiresAt: connection.ExpiresAt || null,
        };
        const sealed = await SealConnectionPayload(request.PublicKey, payload);
        const outcome: OfficeHandoffOutcome = { Sealed: sealed };
        const url = BuildOfficeHandoffUrl(status.ConnectedPageUrl, outcome);
        if (!url) {
            this.showError('This MemberJunction server reports an add-in address that isn\'t a web address. Ask an administrator to check the Excel add-in settings.');
            return;
        }
        this.leave(url);
    }

    private leave(url: string): void {
        this.setStage('leaving', 'Returning to Excel...');
        this.LeaveFor(url);
    }

    private setStage(stage: OfficeConnectStage, statusMessage?: string): void {
        this.Stage = stage;
        if (statusMessage) {
            this.StatusMessage = statusMessage;
        }
        this.cdr.detectChanges();
    }

    private showError(message: string): void {
        this.ErrorMessage = message;
        this.setStage('error');
    }

    private describe(e: unknown): string {
        return e instanceof Error ? e.message : String(e);
    }
}
