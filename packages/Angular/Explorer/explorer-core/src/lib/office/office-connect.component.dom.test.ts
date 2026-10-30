import { describe, it, expect, vi, afterEach } from 'vitest';
import { Component } from '@angular/core';
import { ComponentFixture } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RemoteOpResult } from '@memberjunction/core';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { OfficeConnectPanelComponent } from '@memberjunction/ng-export-service';
import { RenderComponentFixture, Query } from '@memberjunction/ng-test-utils';
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

/** Records where the Explorer wrapper would have navigated instead of leaving the test runner. */
@Component({
    standalone: false,
    selector: 'mj-test-office-connect',
    template: `
        <mj-office-connect-panel
            [Provider]="Provider"
            [QueryParams]="QueryParams"
            (SignInRequested)="OnSignIn()"
            (NavigateToUrl)="OnNavigateToUrl($event)">
        </mj-office-connect-panel>
    `,
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

const login = vi.fn(() => of(undefined));

async function render(
    queryParams: Record<string, string>,
    statusOutput: ExcelAddinStatusOutput = status(),
): Promise<ComponentFixture<TestOfficeConnectComponent>> {
    vi.spyOn(ExcelAddinGetStatusOperation.prototype, 'Execute').mockResolvedValue(statusResult(statusOutput));
    const f = RenderComponentFixture(TestOfficeConnectComponent, {
        declarations: [TestOfficeConnectComponent],
        imports: [OfficeConnectPanelComponent],
        providers: [
            { provide: ActivatedRoute, useValue: { snapshot: { queryParams } } },
            { provide: Router, useValue: { url: `/office/connect?pk=${PUBLIC_KEY}&state=${STATE}` } },
            { provide: MJAuthBase, useValue: { login } },
        ],
        inputs: { Provider: provider },
    });
    for (let i = 0; i < 5; i++) {
        await new Promise(resolve => setTimeout(resolve, 0));
    }
    f.detectChanges();
    return f;
}

describe('OfficeConnectComponent (Explorer route wrapper)', () => {
    afterEach(() => {
        vi.restoreAllMocks();
        sealed.length = 0;
        login.mockReset();
        login.mockImplementation(() => of(undefined));
    });

    it('passes ActivatedRoute queryParams into <mj-office-connect-panel> and completes handoff navigation', async () => {
        const f = await render({ pk: PUBLIC_KEY, state: STATE });
        expect(Query(f, '.office-connect-user-name')?.textContent).toContain('Ada Lovelace');
        vi.spyOn(ExcelAddinCreateConnectionOperation.prototype, 'Execute').mockResolvedValue({
            Success: true,
            Output: connection,
        });
        await f.componentInstance.Panel?.OnConnect();
        expect(f.componentInstance.Left).toEqual([`${CONNECTED}#h=SEALED_value-1`]);
    });

    it('delegates SignInRequested from the generic panel to MJAuthBase.login with the current router URL', async () => {
        const f = await render({ pk: 'not a key', state: STATE });
        f.componentInstance.Panel?.OnSignIn();
        const target = `/office/connect?pk=${PUBLIC_KEY}&state=${STATE}`;
        expect(login).toHaveBeenCalledWith({ appState: { target }, targetUrl: target });
    });

    it('surfaces MJAuthBase.login startup failures into the generic panel', async () => {
        login.mockImplementationOnce(() => throwError(() => new Error('Popup blocked')));
        const f = await render({ pk: 'not a key', state: STATE });
        f.componentInstance.OnSignIn();
        f.detectChanges();
        expect(Query(f, '.error-message')?.textContent).toContain("Sign-in didn't start: Popup blocked");
    });
});
