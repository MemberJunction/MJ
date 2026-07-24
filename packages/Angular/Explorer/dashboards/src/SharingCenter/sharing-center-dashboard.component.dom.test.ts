import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { NormalizedPermission } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { SharingCenterTab } from '@memberjunction/ng-resource-permissions';
import { query, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import { SharingCenterDashboardComponent } from './sharing-center-dashboard.component';

@Component({ standalone: true, selector: 'mj-page-layout', template: '<ng-content></ng-content>' })
class PageLayoutStub {}

@Component({ standalone: true, selector: 'mj-page-header', template: '<header><h1>{{ Title }}</h1><p>{{ Subtitle }}</p><ng-content></ng-content></header>' })
class PageHeaderStub {
    @Input() Title = '';
    @Input() Icon = '';
    @Input() Subtitle = '';
}

@Component({ standalone: true, selector: 'mj-page-body', template: '<main><ng-content></ng-content></main>' })
class PageBodyStub {}

@Component({ standalone: true, selector: 'mj-tab-nav', template: '<button class="tab-switch" (click)="TabChange.emit(NextTab)">{{ ActiveKey }}</button>' })
class TabNavStub {
    @Input() Tabs: object[] = [];
    @Input() ActiveKey = '';
    @Input() NextTab = 'shared-by-me';
    @Output() TabChange = new EventEmitter<string>();
}

@Component({ standalone: true, selector: 'mj-refresh-button', template: '<button class="refresh" (click)="Clicked.emit()">Refresh</button>' })
class RefreshButtonStub {
    @Input() Loading = false;
    @Output() Clicked = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-page-search', template: '<button class="search" (click)="ValueChange.emit(NextValue)">{{ Value }}</button>' })
class PageSearchStub {
    @Input() Placeholder = '';
    @Input() Value = '';
    @Input() NextValue = 'sales';
    @Output() ValueChange = new EventEmitter<string>();
}

@Component({ standalone: true, selector: 'mj-filter-popover', template: '<button class="clear-filters" (click)="ClearAllRequested.emit()">Clear</button><ng-content></ng-content>' })
class FilterPopoverStub {
    @Input() Label = '';
    @Input() Icon = '';
    @Input() ActiveCount = 0;
    @Input() ShowClearAll = false;
    @Output() ClearAllRequested = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-alert', template: '<div class="alert"><ng-content></ng-content></div>' })
class AlertStub {
    @Input() Variant = '';
}

@Component({ standalone: true, selector: 'mj-empty-state', template: '<div class="empty-state">{{ Title }}</div>' })
class EmptyStateStub {
    @Input() Size = '';
    @Input() Icon = '';
    @Input() Title = '';
    @Input() Variant = '';
}

@Component({ standalone: true, selector: 'mj-accordion-panel', template: '<ng-content></ng-content>' })
class AccordionPanelStub {
    @Input() Size = '';
    @Input() FlushBody = false;
    @Input() Expanded = false;
    @Output() ExpandedChange = new EventEmitter<boolean>();
}

@Component({ standalone: true, selector: 'mj-user-sharing-center', template: '<span class="embedded-tab">{{ ActiveTab }}|{{ SearchTerm }}|{{ DomainFilter }}</span>' })
class UserSharingCenterStub {
    @Input() Provider: object | null = null;
    @Input() ActiveTab: SharingCenterTab = 'shared-with-me';
    @Input() ShowTabBar = true;
    @Input() ShowCloseButton = true;
    @Input() SearchTerm = '';
    @Input() DomainFilter = '';
    @Output() ActiveTabChange = new EventEmitter<SharingCenterTab>();
    @Output() ResourceClicked = new EventEmitter<NormalizedPermission>();
    @Output() SharesLoaded = new EventEmitter<SharingCenterTab>();
}

function navigationStub() {
    const queryParams = new Subject<{ TabId: string; Params: Record<string, string> }>();
    return {
        QueryParamChanged$: queryParams,
        ObserveTabQueryParams: () => new BehaviorSubject<Record<string, string>>({}),
        UpdateActiveTabQueryParams: vi.fn(),
        UpdateTabQueryParams: vi.fn(),
        SetAgentContext: vi.fn(),
        SetAgentClientTools: vi.fn(),
    };
}

function render() {
    const navigation = navigationStub();
    const fixture = renderComponentFixture(SharingCenterDashboardComponent, {
        imports: [
            CommonModule,
            FormsModule,
            PageLayoutStub,
            PageHeaderStub,
            PageBodyStub,
            TabNavStub,
            RefreshButtonStub,
            PageSearchStub,
            FilterPopoverStub,
            AlertStub,
            EmptyStateStub,
            AccordionPanelStub,
            UserSharingCenterStub,
        ],
        declarations: [SharingCenterDashboardComponent],
        providers: [
            { provide: NavigationService, useValue: navigation },
            { provide: ApplicationManager, useValue: {} },
        ],
    });
    return { fixture, navigation };
}

describe('SharingCenterDashboardComponent (DOM)', () => {
    it('renders the shared page chrome, summary cards, and starts on Inbox', () => {
        const { fixture } = render();
        expect(text(fixture, 'h1')).toBe('Sharing Center');
        expect(text(fixture, 'p')).toContain("See what's shared with you");
        expect(text(fixture, '.embedded-tab')).toBe('shared-with-me||');
        expect(fixture.nativeElement.querySelectorAll('.sharing-center-dashboard__stat')).toHaveLength(4);
    });

    it('switches the embedded list and writes the stable tab query parameter', () => {
        const { fixture, navigation } = render();
        (query(fixture, '.tab-switch') as HTMLElement).click();
        fixture.detectChanges();

        expect(fixture.componentInstance.ActiveTab).toBe('shared-by-me');
        expect(text(fixture, '.embedded-tab')).toBe('shared-by-me||');
        expect(navigation.UpdateActiveTabQueryParams).toHaveBeenCalledWith({ tab: 'shared-by-me' });
    });

    it('switches to My Access without replacing the embedded share component', () => {
        const { fixture, navigation } = render();
        fixture.componentInstance.OnTabChange('my-access');
        fixture.componentInstance.HasLoadedMyAccess = true;
        fixture.detectChanges();

        expect(text(fixture, '#sharing-center-my-access-title')).toBe('My Access');
        expect(query(fixture, '.embedded-tab')).not.toBeNull();
        expect(navigation.UpdateActiveTabQueryParams).toHaveBeenCalledWith({ tab: 'my-access' });
    });

    it('propagates a shared search term to the embedded share list', () => {
        const { fixture } = render();
        (query(fixture, '.search') as HTMLElement).click();
        fixture.detectChanges();

        expect(fixture.componentInstance.SearchTerm).toBe('sales');
        expect(text(fixture, '.embedded-tab')).toBe('shared-with-me|sales|');
    });

    it('restores a deep-linked activity tab without writing another query parameter', () => {
        const { fixture, navigation } = render();
        fixture.componentInstance.HandleQueryParamsChanged({ tab: 'activity' }, 'deeplink');
        fixture.componentInstance.HasLoadedActivity = true;
        fixture.detectChanges();

        expect(text(fixture, '#sharing-center-activity-title')).toBe('Activity');
        expect(navigation.UpdateActiveTabQueryParams).not.toHaveBeenCalled();
    });

    it('exposes only view, filter, and refresh client tools', () => {
        const { navigation } = render();
        const tools = navigation.SetAgentClientTools.mock.calls[0][1] as { Name: string }[];
        expect(tools.map((tool) => tool.Name)).toEqual([
            'SwitchSharingCenterTab',
            'SearchSharingCenter',
            'FilterSharingCenterDomain',
            'RefreshSharingCenter',
        ]);
    });
});
