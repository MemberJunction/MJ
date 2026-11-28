import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { MJUserFavoriteEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { FileOpenService } from '@memberjunction/ng-file-storage';
import { SearchService } from '@memberjunction/ng-search';
import { NavigationService, RecentAccessItem, RecentAccessService } from '@memberjunction/ng-shared';
import { CommandPaletteService } from '../command-palette/command-palette.service';
import { OmnibarPaletteComponent } from './omnibar-palette.component';

function makeFavorite(id: string, entity: string, recordId: string): MJUserFavoriteEntity {
  return { ID: id, Entity: entity, RecordID: recordId } as unknown as MJUserFavoriteEntity;
}

describe('OmnibarPaletteComponent (DOM) — empty-state Favorites and Recent groups', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('renders Favorites and Recent groups in the empty-query state and navigates to starred dashboards and views', async () => {
    const favDashboard = makeFavorite('f-1', 'MJ: Dashboards', 'dash-1');
    const favView = makeFavorite('f-2', 'MJ: User Views', 'view-1');
    vi.spyOn(UserInfoEngine.Instance, 'UserFavorites', 'get').mockReturnValue([favDashboard, favView]);

    const openDashboard = vi.fn();
    const openView = vi.fn();
    const openEntityRecord = vi.fn();
    const recentItems$ = new BehaviorSubject<RecentAccessItem[]>([
      {
        id: 'rec-1',
        entityId: 'ent-accounts',
        entityName: 'Accounts',
        recordId: 'acc-1',
        recordName: 'Northwind Traders',
        resourceType: 'record',
        latestAt: new Date(),
        totalCount: 1,
      },
    ]);

    const fakeProvider = {
      CurrentUser: { ID: 'u-1' },
      EntityByName: (name: string) => ({
        Name: name,
        Icon: name === 'Accounts' ? 'fa-building' : 'fa-table',
        PrimaryKeys: [{ Name: 'ID' }],
      }),
      GetEntityRecordNames: vi.fn(async (inputs: Array<{ EntityName: string; CompositeKey: { ToConcatenatedString(): string } }>) =>
        inputs.map(i => ({
          Success: true,
          EntityName: i.EntityName,
          CompositeKey: i.CompositeKey,
          RecordName: i.EntityName === 'MJ: Dashboards' ? 'Executive KPIs' : 'Active Deals View',
        }))
      ),
    };

    TestBed.configureTestingModule({
      imports: [CommonModule, FormsModule],
      declarations: [OmnibarPaletteComponent],
      providers: [
        { provide: NavigationService, useValue: { OpenDashboard: openDashboard, OpenView: openView, OpenEntityRecord: openEntityRecord, OpenArtifact: vi.fn(), OpenSearch: vi.fn(), OpenDynamicView: vi.fn(), SwitchToApp: vi.fn() } },
        { provide: ApplicationManager, useValue: { Applications: new BehaviorSubject([]), GetAllApps: () => [] } },
        {
          provide: SearchService,
          useValue: {
            Provider: fakeProvider,
            LoadRecentSearches: () => Promise.resolve(),
            LoadScopes: () => Promise.resolve([]),
            RecentSearches$: new BehaviorSubject<Array<{ Query: string }>>([]),
            RecordRecentSearch: vi.fn(),
          },
        },
        { provide: CommandPaletteService, useValue: { TrackAppAccess: () => Promise.resolve(), GetRecentApps: () => Promise.resolve([]) } },
        { provide: FileOpenService, useValue: { OpenPreviewFromSearchResult: vi.fn(), OpenFileFromSearchResult: vi.fn() } },
        { provide: RecentAccessService, useValue: { RecentItems: recentItems$ } },
      ],
    });

    const fixture: ComponentFixture<OmnibarPaletteComponent> = TestBed.createComponent(OmnibarPaletteComponent);
    fixture.componentInstance.Open();
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.detectChanges();

    const groupLabels = Array.from(fixture.nativeElement.querySelectorAll('.ob-group-label') as NodeListOf<HTMLElement>)
      .map(el => el.textContent?.trim());
    expect(groupLabels).toEqual(['Favorites', 'Recent']);

    const rowNames = Array.from(fixture.nativeElement.querySelectorAll('.ob-rname') as NodeListOf<HTMLElement>)
      .map(el => el.textContent?.trim());
    expect(rowNames).toContain('Executive KPIs');
    expect(rowNames).toContain('Active Deals View');
    expect(rowNames).toContain('Northwind Traders');

    // Click the starred dashboard favorite
    const rows = fixture.nativeElement.querySelectorAll('.ob-row') as NodeListOf<HTMLElement>;
    rows[0].click();
    expect(openDashboard).toHaveBeenCalledWith('dash-1', 'Executive KPIs');

    // Re-open and click the starred view favorite
    fixture.componentInstance.Open();
    await new Promise(resolve => setTimeout(resolve, 20));
    fixture.detectChanges();
    const reopenedRows = fixture.nativeElement.querySelectorAll('.ob-row') as NodeListOf<HTMLElement>;
    reopenedRows[1].click();
    expect(openView).toHaveBeenCalledWith('view-1', 'Active Deals View');
  });
});
