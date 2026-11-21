/**
 * @fileoverview Explorer's `office/connect` route wrapper around `<mj-office-connect-panel>`.
 *
 * The full consent UI, session readiness polling, `ExcelAddin.*` operations, and RSA-OAEP handoff live
 * in `@memberjunction/ng-export-service`'s generic `<mj-office-connect-panel>` component (and
 * `@memberjunction/excel-addin`'s pure `office-connect` helpers) so non-Explorer Angular apps can serve
 * `/office/connect` identically. This thin Explorer route wrapper connects `ActivatedRoute`, `Router`,
 * and `MJAuthBase`.
 *
 * Like the OAuth callback and claim redemption pages, this route is a deliberate exception to the
 * NavigationService-only rule: it is registered directly in the routing module without `AuthGuard`.
 *
 * @module Office
 */
import { Component, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MJAuthBase } from '@memberjunction/ng-auth-services';
import { OfficeConnectPanelComponent } from '@memberjunction/ng-export-service';
import { BuildOfficeSignInOptions, OfficeConnectQueryParams } from '@memberjunction/excel-addin';

@Component({
    standalone: false,
    selector: 'mj-office-connect',
    template: `
        <mj-office-connect-panel
            [Provider]="Provider"
            [QueryParams]="QueryParams"
            (SignInRequested)="OnSignIn()"
            (NavigateToUrl)="OnNavigateToUrl($event)">
        </mj-office-connect-panel>
    `,
})
export class OfficeConnectComponent extends BaseAngularComponent {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private authBase = inject(MJAuthBase);

    @ViewChild(OfficeConnectPanelComponent)
    public Panel?: OfficeConnectPanelComponent;

    public get QueryParams(): OfficeConnectQueryParams {
        return this.route.snapshot.queryParams;
    }

    /** Starts Explorer's configured auth provider sign-in, asking it to return to this route. */
    public OnSignIn(): void {
        this.authBase.login(BuildOfficeSignInOptions(this.router.url)).subscribe({
            error: (e: Error) => {
                const detail = e instanceof Error ? e.message : String(e);
                this.Panel?.ShowSignInError(`Sign-in didn't start: ${detail}`);
            },
        });
    }

    public OnNavigateToUrl(url: string): void {
        this.LeaveFor(url);
    }

    /** Leaves the page. Protected so tests can observe navigation without performing it. */
    protected LeaveFor(url: string): void {
        window.location.replace(url);
    }
}
