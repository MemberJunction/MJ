import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ChiefOfStaffPage } from './chief-of-staff-agent-context';
import { BaseChiefOfStaffPage } from './chief-of-staff-page-base';

/**
 * The Chief of Staff application's Overview page: counts, the top pending approvals and the
 * next wake routines, each linking to the page that manages it.
 *
 * Also registered under the driver classes of the former single dashboard, so a tab saved
 * before the split still opens.
 */
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffOverview')
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffDashboard')
@RegisterClass(BaseResourceComponent, 'ChiefOfStaffResource')
@Component({
    standalone: false,
    selector: 'mj-chief-of-staff-overview',
    templateUrl: './chief-of-staff-overview.component.html',
    styleUrls: ['./chief-of-staff-pages.css'],
    changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChiefOfStaffOverviewComponent extends BaseChiefOfStaffPage {
    protected readonly Page: ChiefOfStaffPage = 'overview';
}

export function LoadChiefOfStaffOverview(): void {
    // Intentionally empty: forces inclusion of the @RegisterClass side effect.
}
