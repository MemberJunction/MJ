import { describe, it, expect, vi, afterEach } from 'vitest';
import { ComponentFixture } from '@angular/core/testing';
import { RemoteOpResult } from '@memberjunction/core';
import { RenderComponentFixture, Query, QueryAll, Click } from '@memberjunction/ng-test-utils';
import {
    EncodeBase64Url,
    ExcelAddinCreateConnectionOperation,
    ExcelAddinCreateConnectionOutput,
    ExcelAddinGetStatusOperation,
    ExcelAddinStatusOutput,
    ExcelConnectionPayload,
    OfficeConnectQueryParams,
} from '@memberjunction/excel-addin';
import { OfficeConnectPanelComponent } from './office-connect-panel.component';

const sealed: ExcelConnectionPayload[] = [];
vi.mock('@memberjunction/excel-addin', async importOriginal => {
    const actual = await importOriginal<typeof import('@memberjunction/excel-addin')>();
    return {
        ...actual,
        SealConnectionPayload: vi.fn(async (_key: string, payload: ExcelConnectionPayload) => {
            sealed.push(payload);
            return 'SEALED_value-1';
        }),
    };
});

const PUBLIC_KEY = EncodeBase64Url(new TextEncoder().encode(JSON.stringify({ kty: 'RSA', n: 'sXch', e: 'AQAB' })));
const STATE = 'c3RhdGUtMTIz';
const CONNECTED = 'https://mj.example.org/api/office/excel/connected.html';
const GRAPHQL_URL = 'https://mj.example.org/graphql';

const status = (overrides: Partial<ExcelAddinStatusOutput> = {}): ExcelAddinStatusOutput => ({
    Enabled: true,
    ServerName: 'Acme MJ',
    ConnectedPageUrl: CONNECTED,
    ManifestUrl: '',
    KeyLifetimeDays: 90,
    ...overrides,
});

const statusResult = (output: ExcelAddinStatusOutput): RemoteOpResult<ExcelAddinStatusOutput> => ({
    Success: true,
    Output: output,
});

const connection: ExcelAddinCreateConnectionOutput = {
    APIKey: 'mj_sk_test',
    APIKeyID: 'K1',
    ExpiresAt: '2027-01-28T00:00:00.000Z',
    Label: 'Excel',
};

const provider = {
    ConfigData: { Token: 'token', URL: GRAPHQL_URL },
    CurrentUser: { FirstName: 'Ada', LastName: 'Lovelace', Name: 'ada', Email: 'ada@example.org' },
};

async function render(
    queryParams: OfficeConnectQueryParams,
    statusOutput: ExcelAddinStatusOutput = status(),
): Promise<{ fixture: ComponentFixture<OfficeConnectPanelComponent>; navigated: string[]; signInCount: () => number }> {
    vi.spyOn(ExcelAddinGetStatusOperation.prototype, 'Execute').mockResolvedValue(statusResult(statusOutput));
    const navigated: string[] = [];
    let signIns = 0;
    const f = RenderComponentFixture(OfficeConnectPanelComponent, {
        imports: [OfficeConnectPanelComponent],
        inputs: { Provider: provider, QueryParams: queryParams },
    });
    f.componentInstance.NavigateToUrl.subscribe((url: string) => navigated.push(url));
    f.componentInstance.SignInRequested.subscribe(() => {
        signIns += 1;
    });
    await settle(f);
    return { fixture: f, navigated, signInCount: () => signIns };
}

async function settle(f: ComponentFixture<OfficeConnectPanelComponent>): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    f.detectChanges();
}

const buttonLabels = (f: ComponentFixture<OfficeConnectPanelComponent>): Array<string | undefined> =>
    QueryAll(f, '.button-group button').map(b => b.textContent?.trim());

describe('OfficeConnectPanelComponent (Generic DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        sealed.length = 0;
    });

    it('refuses a link without a valid RSA public key before querying the server', async () => {
        const { fixture: f } = await render({ pk: 'not a key', state: STATE });
        expect(f.componentInstance.Stage).toBe('bad-request');
        expect(ExcelAddinGetStatusOperation.prototype.Execute).not.toHaveBeenCalled();
    });

    it('reports when Excel is not enabled on the server', async () => {
        const { fixture: f } = await render(
            { pk: PUBLIC_KEY, state: STATE },
            status({ Enabled: false, ConnectedPageUrl: '' }),
        );
        expect(f.componentInstance.Stage).toBe('not-enabled');
        expect(Query(f, 'h2')?.textContent).toContain('Excel isn\'t turned on');
        expect(f.nativeElement.textContent).toContain('administrator');
    });

    it('renders the signed-in user and consent terms with Connect Excel left of Cancel', async () => {
        const { fixture: f } = await render({ pk: PUBLIC_KEY, state: STATE });
        expect(f.componentInstance.Stage).toBe('consent');
        expect(Query(f, '.office-connect-user-name')?.textContent).toContain('Ada Lovelace');
        expect(Query(f, '.office-connect-user-email')?.textContent).toContain('ada@example.org');
        expect(Query(f, '.office-connect-terms')?.textContent).toContain('90 days');
        expect(buttonLabels(f)).toEqual(['Connect Excel', 'Cancel']);
    });

    it('seals the minted key to the pane public key and emits NavigateToUrl with the fragment', async () => {
        const { fixture: f, navigated } = await render({ pk: PUBLIC_KEY, state: STATE });
        vi.spyOn(ExcelAddinCreateConnectionOperation.prototype, 'Execute').mockResolvedValue({
            Success: true,
            Output: connection,
        });
        await f.componentInstance.OnConnect();
        expect(sealed).toEqual([
            {
                Version: 1,
                State: STATE,
                APIKey: 'mj_sk_test',
                GraphQLUrl: GRAPHQL_URL,
                UserName: 'Ada Lovelace',
                UserEmail: 'ada@example.org',
                ExpiresAt: connection.ExpiresAt,
            },
        ]);
        expect(navigated).toEqual([`${CONNECTED}#h=SEALED_value-1`]);
    });

    it('displays the server error message and stays put when key creation fails', async () => {
        const { fixture: f, navigated } = await render({ pk: PUBLIC_KEY, state: STATE });
        vi.spyOn(ExcelAddinCreateConnectionOperation.prototype, 'Execute').mockResolvedValue({
            Success: false,
            ErrorMessage: 'Not allowed to create API keys.',
        });
        await f.componentInstance.OnConnect();
        f.detectChanges();
        expect(f.componentInstance.Stage).toBe('error');
        expect(Query(f, '.error-message')?.textContent).toContain('Not allowed to create API keys.');
        expect(navigated).toEqual([]);
    });

    it('notifies the add-in when the user cancels', async () => {
        const { fixture: f, navigated } = await render({ pk: PUBLIC_KEY, state: STATE });
        Click(f, '.button-group button:last-child');
        expect(navigated).toEqual([`${CONNECTED}#cancelled=1`]);
    });

    it('emits SignInRequested when OnSignIn is invoked and supports ShowSignInError from host app', async () => {
        const { fixture: f, signInCount } = await render({ pk: 'not a key', state: STATE });
        f.componentInstance.OnSignIn();
        expect(signInCount()).toBe(1);
        f.componentInstance.ShowSignInError('Sign-in popup blocked');
        f.detectChanges();
        expect(f.componentInstance.Stage).toBe('error');
        expect(Query(f, '.error-message')?.textContent).toContain('Sign-in popup blocked');
    });

    it('waits until CurrentUser is hydrated on the provider before showing consent', async () => {
        vi.useFakeTimers();
        try {
            vi.spyOn(ExcelAddinGetStatusOperation.prototype, 'Execute').mockResolvedValue(statusResult(status()));
            const delayedProvider: {
                ConfigData: { Token: string; URL: string };
                CurrentUser: typeof provider.CurrentUser | undefined;
            } = {
                ConfigData: { Token: 'token', URL: GRAPHQL_URL },
                CurrentUser: undefined,
            };
            const f = RenderComponentFixture(OfficeConnectPanelComponent, {
                imports: [OfficeConnectPanelComponent],
                inputs: { Provider: delayedProvider, QueryParams: { pk: PUBLIC_KEY, state: STATE } },
            });
            f.detectChanges();
            expect(f.componentInstance.Stage).toBe('waiting');
            expect(ExcelAddinGetStatusOperation.prototype.Execute).not.toHaveBeenCalled();

            delayedProvider.CurrentUser = provider.CurrentUser;
            await vi.advanceTimersByTimeAsync(500);
            f.detectChanges();
            expect(f.componentInstance.Stage).toBe('consent');
            expect(Query(f, '.office-connect-user-email')?.textContent).toContain('ada@example.org');
        } finally {
            vi.useRealTimers();
        }
    });
});
