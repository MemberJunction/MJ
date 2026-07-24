import { Component, EventEmitter, Input, Output } from '@angular/core';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Subject } from 'rxjs';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { NormalizedPermission } from '@memberjunction/core';
import { NavigationService } from '@memberjunction/ng-shared';
import { capture, query, renderComponentFixture, text } from '@memberjunction/ng-test-utils';
import { SharingCenterDashboardTab } from './sharing-center-agent-context';
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

@Component({ standalone: true, selector: 'mj-user-sharing-center', template: '<span class="embedded-tab">{{ ActiveTab }}</span>' })
class UserSharingCenterStub {
    @Input() Provider: object | null = null;
    @Input() ActiveTab: SharingCenterDashboardTab = 'shared-with-me';
    @Input() ShowTabBar = true;
    @Input() ShowCloseButton = true;
    @Output() ActiveTabChange = new EventEmitter<SharingCenterDashboardTab>();
    @Output() ResourceClicked = new EventEmitter<NormalizedPermission>();
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
        imports: [PageLayoutStub, PageHeaderStub, PageBodyStub, TabNavStub, RefreshButtonStub, UserSharingCenterStub],
        declarations: [SharingCenterDashboardComponent],
        providers: [
            { provide: NavigationService, useValue: navigation },
            { provide: ApplicationManager, useValue: {} },
        ],
    });
    return { fixture, navigation };
}

describe('SharingCenterDashboardComponent (DOM)', () => {
    it('renders the shared page chrome and starts on Inbox', () => {
        const { fixture } = render();
        expect(text(fixture, 'h1')).toBe('Sharing Center');
        expect(text(fixture, 'p')).toContain("See what's shared with you");
        expect(text(fixture, '.embedded-tab')).toBe('shared-with-me');
    });

    it('switches the embedded list and writes the stable tab query parameter', () => {
        const { fixture, navigation } = render();
        (query(fixture, '.tab-switch') as HTMLElement).click();
        fixture.detectChanges();

        expect(fixture.componentInstance.ActiveTab).toBe('shared-by-me');
        expect(text(fixture, '.embedded-tab')).toBe('shared-by-me');
        expect(navigation.UpdateActiveTabQueryParams).toHaveBeenCalledWith({ tab: 'shared-by-me' });
    });

    it('restores a deep-linked tab without writing another query parameter', () => {
        const { fixture, navigation } = render();
        fixture.componentInstance.HandleQueryParamsChanged({ tab: 'shared-by-me' }, 'deeplink');
        fixture.detectChanges();

        expect(text(fixture, '.embedded-tab')).toBe('shared-by-me');
        expect(navigation.UpdateActiveTabQueryParams).not.toHaveBeenCalled();
    });

    it('does not expose a permission-mutation client tool', () => {
        const { navigation } = render();
        const tools = navigation.SetAgentClientTools.mock.calls[0][1] as { Name: string }[];
        expect(tools.map((tool) => tool.Name)).toEqual(['SwitchSharingCenterTab', 'RefreshSharingCenter']);
    });
});
