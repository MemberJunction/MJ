/**
 * @fileoverview Generic, router-free Excel add-in sign-in & consent panel (`<mj-office-connect-panel>`).
 *
 * Lives in `@memberjunction/ng-export-service` (`packages/Angular/Generic/export-service`, `"mjUILayer": "widgets"`)
 * so ANY Angular application built on MemberJunction's Generic layer — MJ Explorer or a custom Angular host —
 * can serve the standalone `/office/connect` endpoint without depending on `@memberjunction/ng-explorer-core`,
 * `@angular/router`, or a specific authentication library.
 *
 * Host apps pass `[QueryParams]` (`pk` and `state` from the URL) and handle `(SignInRequested)` by invoking
 * their authentication provider's login flow.
 */
import {
    ChangeDetectorRef,
    Component,
    EventEmitter,
    Input,
    OnChanges,
    OnDestroy,
    OnInit,
    Output,
    SimpleChanges,
    inject,
} from '@angular/core';
import { LogError } from '@memberjunction/core';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { SharedGenericModule } from '@memberjunction/ng-shared-generic';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import {
    BuildOfficeHandoffUrl,
    DisplayNameForUser,
    EXCEL_HANDOFF_VERSION,
    ExcelAddinCreateConnectionOperation,
    ExcelAddinCreateConnectionOutput,
    ExcelAddinGetStatusOperation,
    ExcelAddinStatusOutput,
    ExcelConnectionPayload,
    OfficeConnectQueryParams,
    OfficeConnectRequest,
    OfficeConnectUser,
    OfficeHandoffOutcome,
    ReadOfficeConnectRequest,
    SealConnectionPayload,
} from '@memberjunction/excel-addin';

/** Stage in the `/office/connect` consent & key-handoff lifecycle. */
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

interface AuthenticatedProviderView {
    ConfigData?: {
        Token?: string;
        URL?: string;
    };
    CurrentUser?: OfficeConnectUser | null;
}

/** How long to wait for the session before giving up and asking the person to sign in. */
const MAX_WAIT_TIME_MS = 30000;
/** How long to wait before offering a sign-in button beside the wait spinner. */
const SIGN_IN_OFFER_MS = 4000;
const POLL_INTERVAL_MS = 500;

@Component({
    standalone: true,
    selector: 'mj-office-connect-panel',
    imports: [SharedGenericModule, MJButtonDirective],
    templateUrl: './office-connect-panel.component.html',
    styleUrls: ['./office-connect-panel.component.css'],
})
export class OfficeConnectPanelComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
    private cdr = inject(ChangeDetectorRef);

    /**
     * Query parameters from the `/office/connect` URL (`pk` and `state`).
     * If omitted (`null`), falls back to reading `window.location.search` in browser environments.
     */
    @Input() QueryParams: OfficeConnectQueryParams | null = null;

    /**
     * Optional explicit GraphQL endpoint URL to embed in the sealed connection payload.
     * Defaults to the active `GraphQLDataProvider`'s `ConfigData.URL`.
     */
    @Input() GraphQLUrl: string | null = null;

    /** Emitted when the user clicks **Sign in** so the host application can trigger its auth login. */
    @Output() SignInRequested = new EventEmitter<void>();

    /**
     * Emitted with the destination `ConnectedPageUrl#...` when observed; otherwise the panel navigates
     * via `window.location.replace(url)`.
     */
    @Output() NavigateToUrl = new EventEmitter<string>();

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
    private initialized = false;
    private started = false;

    ngOnInit(): void {
        this.initialized = true;
        this.evaluateRequestAndStart();
    }

    ngOnChanges(changes: SimpleChanges): void {
        if (this.initialized && 'QueryParams' in changes && !this.started) {
            this.evaluateRequestAndStart();
        }
    }

    ngOnDestroy(): void {
        this.stopPolling();
    }

    /** Asks the host application to start its sign-in flow. */
    public OnSignIn(): void {
        this.SignInRequested.emit();
    }

    /** Allows the host application to surface a sign-in startup failure inside the panel. */
    public ShowSignInError(message: string): void {
        this.showError(message);
    }

    /** Mints the connection key, seals it to the pane's public key, and returns to the add-in page. */
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
            const detail = e instanceof Error ? e.message : String(e);
            LogError(`Excel connect failed: ${detail}`);
            this.showError(`Excel couldn't be connected: ${detail}`);
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

    /**
     * Leaves the page for the add-in's `connected.html`. Emits {@link NavigateToUrl} if observed by a
     * parent component or test; otherwise calls `window.location.replace(url)`. Protected so subclasses
     * in tests can also override directly.
     */
    protected LeaveFor(url: string): void {
        if (this.NavigateToUrl.observed) {
            this.NavigateToUrl.emit(url);
            return;
        }
        window.location.replace(url);
    }

    private evaluateRequestAndStart(): void {
        this.stopPolling();
        const params = this.QueryParams ?? this.readWindowQueryParams();
        this.request = ReadOfficeConnectRequest(params);
        if (!this.request) {
            this.setStage('bad-request');
            return;
        }
        this.Stage = 'waiting';
        this.StatusMessage = 'Restoring your session...';
        this.waitForSession();
    }

    private readWindowQueryParams(): OfficeConnectQueryParams | null {
        if (typeof window === 'undefined' || !window.location?.search) {
            return null;
        }
        const search = new URLSearchParams(window.location.search);
        return {
            pk: search.get('pk'),
            state: search.get('state'),
        };
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

    /** The GraphQL provider has a token, endpoint, and hydrated CurrentUser once the session is restored. */
    private isProviderReady(): boolean {
        try {
            const provider = this.ProviderToUse as AuthenticatedProviderView;
            const url = this.resolveGraphQLUrl(provider);
            return Boolean(provider?.ConfigData?.Token && url && provider?.CurrentUser);
        } catch {
            return false;
        }
    }

    private resolveGraphQLUrl(provider: AuthenticatedProviderView): string {
        return (this.GraphQLUrl?.trim() || provider?.ConfigData?.URL || '').trim();
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
            const detail = e instanceof Error ? e.message : String(e);
            LogError(`Excel add-in status check failed: ${detail}`);
            this.showError(`MemberJunction could not say whether Excel is turned on: ${detail}`);
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

    private async handOff(
        connection: ExcelAddinCreateConnectionOutput,
        request: OfficeConnectRequest,
        status: ExcelAddinStatusOutput,
    ): Promise<void> {
        const provider = this.ProviderToUse as AuthenticatedProviderView;
        const payload: ExcelConnectionPayload = {
            Version: EXCEL_HANDOFF_VERSION,
            State: request.State,
            APIKey: connection.APIKey,
            GraphQLUrl: this.resolveGraphQLUrl(provider),
            UserName: this.UserName,
            UserEmail: this.UserEmail,
            ExpiresAt: connection.ExpiresAt || null,
        };
        const sealed = await SealConnectionPayload(request.PublicKey, payload);
        const outcome: OfficeHandoffOutcome = { Sealed: sealed };
        const url = BuildOfficeHandoffUrl(status.ConnectedPageUrl, outcome);
        if (!url) {
            this.showError(
                'This MemberJunction server reports an add-in address that isn\'t a web address. Ask an administrator to check the Excel add-in settings.',
            );
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
}
