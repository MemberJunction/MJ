import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { RemoteOpResult } from '@memberjunction/core';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import { RenderComponentFixture, Query, QueryAll, Click, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import {
    EncodeBase64Url,
    ExcelAddinCreateConnectionOperation,
    ExcelAddinCreateConnectionOutput,
    ExcelAddinGetStatusOperation,
    ExcelAddinStatusOutput,
    ExcelConnectionPayload,
} from '@memberjunction/excel-addin';
import { OfficeConnectComponent } from './office-connect.component';

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

/** Records where the page would have navigated instead of navigating. */
@Component({
    standalone: false,
    selector: 'mj-test-office-connect',
    templateUrl: './office-connect.component.html',
})
class TestOfficeConnectComponent extends OfficeConnectComponent {
    public Left: string[] = [];
    protected override LeaveFor(url: string): void {
        this.Left.push(url);
    }
}

const PUBLIC_KEY = EncodeBase64Url(new TextEncoder().encode(JSON.stringify({ kty: 'RSA', n: 'sXch', e: 'AQAB' })));
const STATE = 'c3RhdGUtMTIz';
const CONNECTED = 'https://mj.example.org/api/office/excel/connected.html';
const GRAPHQL_URL = 'https://mj.example.org/graphql';

const status = (overrides: Partial<ExcelAddinStatusOutput> = {}): ExcelAddinStatusOutput => ({
    Enabled: true, ServerName: 'Acme MJ', ConnectedPageUrl: CONNECTED, ManifestUrl: '', KeyLifetimeDays: 90, ...overrides,
});

const statusResult = (output: ExcelAddinStatusOutput): RemoteOpResult<ExcelAddinStatusOutput> => ({ Success: true, Output: output });

const connection: ExcelAddinCreateConnectionOutput = { APIKey: 'mj_sk_test', APIKeyID: 'K1', ExpiresAt: '2027-01-28T00:00:00.000Z', Label: 'Excel' };

const provider = {
    ConfigData: { Token: 'token', URL: GRAPHQL_URL },
    CurrentUser: { FirstName: 'Ada', LastName: 'Lovelace', Name: 'ada', Email: 'ada@example.org' },
};

const login = vi.fn(() => of(undefined));

async function render(queryParams: Record<string, string>, statusOutput: ExcelAddinStatusOutput = status()): Promise<ComponentFixture<TestOfficeConnectComponent>> {
    vi.spyOn(ExcelAddinGetStatusOperation.prototype, 'Execute').mockResolvedValue(statusResult(statusOutput));
    const f = RenderComponentFixture(TestOfficeConnectComponent, {
        declarations: [TestOfficeConnectComponent],
        imports: [StubLoadingComponent, MJButtonDirective],
        providers: [
            { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
            { provide: Router, useValue: { url: `/office/connect?pk=${PUBLIC_KEY}&state=${STATE}` } },
            { provide: MJAuthBase, useValue: { login } },
        ],
        inputs: { Provider: provider },
    });
    await settle(f);
    return f;
}

async function settle(f: ComponentFixture<TestOfficeConnectComponent>): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    f.detectChanges();
}

const buttonLabels = (f: ComponentFixture<TestOfficeConnectComponent>) =>
    QueryAll(f, '.button-group button').map(b => b.textContent?.trim());

describe('OfficeConnectComponent (DOM)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        sealed.length = 0;
        login.mockClear();
    });

    it('refuses a link without a valid key, before asking the server anything', async () => {
        const f = await render({ pk: 'not a key', state: STATE });
        expect(f.componentInstance.Stage).toBe('bad-request');
        expect(ExcelAddinGetStatusOperation.prototype.Execute).not.toHaveBeenCalled();
    });

    it('says Excel is not turned on when the host has not configured it', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE }, status({ Enabled: false, ConnectedPageUrl: '' }));
        expect(f.componentInstance.Stage).toBe('not-enabled');
        expect(Query(f, 'h2')?.textContent).toContain('Excel isn\'t turned on');
        expect(f.nativeElement.textContent).toContain('administrator');
    });

    it('shows who is connecting and what Excel may do, Connect left of Cancel', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE });
        expect(f.componentInstance.Stage).toBe('consent');
        expect(Query(f, '.office-connect-user-name')?.textContent).toContain('Ada Lovelace');
        expect(Query(f, '.office-connect-user-email')?.textContent).toContain('ada@example.org');
        expect(Query(f, '.office-connect-terms')?.textContent).toContain('90 days');
        expect(buttonLabels(f)).toEqual(['Connect Excel', 'Cancel']);
    });

    it('seals the new key to the pane and returns to the host page with it in the fragment', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE });
        vi.spyOn(ExcelAddinCreateConnectionOperation.prototype, 'Execute')
            .mockResolvedValue({ Success: true, Output: connection });
        await f.componentInstance.OnConnect();
        expect(sealed).toEqual([{
            Version: 1, State: STATE, APIKey: 'mj_sk_test', GraphQLUrl: GRAPHQL_URL,
            UserName: 'Ada Lovelace', UserEmail: 'ada@example.org', ExpiresAt: connection.ExpiresAt,
        }]);
        expect(f.componentInstance.Left).toEqual([`${CONNECTED}#h=SEALED_value-1`]);
    });

    it('shows the server\'s reason and stays put when the key cannot be created', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE });
        vi.spyOn(ExcelAddinCreateConnectionOperation.prototype, 'Execute')
            .mockResolvedValue({ Success: false, ErrorMessage: 'Not allowed to create API keys.' });
        await f.componentInstance.OnConnect();
        f.detectChanges();
        expect(f.componentInstance.Stage).toBe('error');
        expect(Query(f, '.error-message')?.textContent).toContain('Not allowed to create API keys.');
        expect(f.componentInstance.Left).toEqual([]);
    });

    it('tells the add-in the person cancelled', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE });
        Click(f, '.button-group button:last-child');
        expect(f.componentInstance.Left).toEqual([`${CONNECTED}#cancelled=1`]);
    });

    it('asks the auth provider to come back to this page after sign-in', async () => {
        const f = await render({ pk: 'not a key', state: STATE });
        f.componentInstance.OnSignIn();
        const target = `/office/connect?pk=${PUBLIC_KEY}&state=${STATE}`;
        expect(login).toHaveBeenCalledWith({ appState: { target }, targetUrl: target });
    });
});
