import { ComponentFixture, TestBed } from '@angular/core/testing';
import { BehaviorSubject } from 'rxjs';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EntityInfo } from '@memberjunction/core';
import { MJUserNotificationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { NotificationPopoverComponent } from './notification-popover.component';

function createNotification(
  id: string,
  title: string,
  message: string,
  unread: boolean,
  resourceConfig: Record<string, string> | null = null
): MJUserNotificationEntity {
  const info = new EntityInfo({
    Name: 'MJ: User Notifications',
    Status: 'Active',
    Fields: [
      { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true, Status: 'Active' },
      { Name: 'Title', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'Message', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'Unread', Type: 'bit', IsPrimaryKey: false, Status: 'Active', AllowUpdateAPI: true },
      { Name: 'NotificationTypeID', Type: 'uniqueidentifier', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceTypeID', Type: 'uniqueidentifier', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceRecordID', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: 'ResourceConfiguration', Type: 'nvarchar', IsPrimaryKey: false, Status: 'Active' },
      { Name: '__mj_CreatedAt', Type: 'datetimeoffset', IsPrimaryKey: false, Status: 'Active' },
    ],
  });
  const entity = new MJUserNotificationEntity(info);
  entity.ID = id;
  entity.Title = title;
  entity.Message = message;
  entity.Unread = unread;
  entity.ResourceTypeID = null;
  entity.ResourceRecordID = null;
  entity.ResourceConfiguration = resourceConfig ? JSON.stringify(resourceConfig) : null;
  vi.spyOn(entity, 'Save').mockResolvedValue(true);
  return entity;
}

function setupPopover(initialNotifications: MJUserNotificationEntity[]) {
  const notifications$ = new BehaviorSubject<MJUserNotificationEntity[]>(initialNotifications);
  vi.spyOn(MJNotificationService, 'Notifications$', 'get').mockReturnValue(notifications$);
  vi.spyOn(UserInfoEngine.Instance, 'NotificationTypes', 'get').mockReturnValue([]);

  const openNavItemByName = vi.fn();
  TestBed.configureTestingModule({
    imports: [NotificationPopoverComponent],
    providers: [
      { provide: SharedService, useValue: { ResourceTypeByID: vi.fn(), CreateSimpleNotification: vi.fn() } },
      { provide: NavigationService, useValue: { OpenNavItemByName: openNavItemByName } },
      {
        provide: ApplicationManager,
        useValue: {
          GetAppByName: (name: string) => (name === 'Chat' ? { ID: 'chat-app' } : null),
        },
      },
    ],
  });

  const fixture: ComponentFixture<NotificationPopoverComponent> = TestBed.createComponent(NotificationPopoverComponent);
  fixture.componentRef.setInput('IsOpen', true);
  fixture.detectChanges();
  return { fixture, notifications$, openNavItemByName };
}

describe('NotificationPopoverComponent (DOM)', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
    vi.restoreAllMocks();
  });

  it('strips HTML/Markdown cleanly in previews and defaults to the Unread tab when unread notifications exist', () => {
    const htmlNotif = createNotification(
      'n-1',
      'Morning Digest',
      '<!DOCTYPE html><html><body><h2>Summary</h2> <p>4 deals moved forward.</p></body></html>',
      true,
      { type: 'conversation', conversationId: 'conv-1' }
    );
    const readNotif = createNotification('n-2', 'Older Note', 'Already read message.', false);

    const { fixture } = setupPopover([htmlNotif, readNotif]);

    const rows = fixture.nativeElement.querySelectorAll('.notif-row');
    expect(rows.length).toBe(1);
    const preview = rows[0].querySelector('.notif-row-preview')?.textContent ?? '';
    expect(preview).toContain('Summary 4 deals moved forward.');
    expect(preview).not.toContain('<!DOCTYPE');
    expect(preview).not.toContain('<h2>');

    // Switching to "All" reveals read items too
    const allTab = fixture.nativeElement.querySelectorAll('.pop-tab')[1] as HTMLButtonElement;
    allTab.click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.notif-row').length).toBe(2);
  });

  it('marks read, navigates, and emits CloseRequested when clicking a clickable notification', () => {
    const convNotif = createNotification(
      'n-1',
      'Sage finished',
      '**Forecast ready** for Q4.',
      true,
      { type: 'conversation', conversationId: 'conv-42' }
    );
    const { fixture, openNavItemByName } = setupPopover([convNotif]);
    const closeSpy = vi.fn();
    fixture.componentInstance.CloseRequested.subscribe(closeSpy);

    const row = fixture.nativeElement.querySelector('.notif-row') as HTMLElement;
    row.click();
    fixture.detectChanges();

    expect(convNotif.Unread).toBe(false);
    expect(openNavItemByName).toHaveBeenCalledWith(
      'Conversations',
      { conversationId: 'conv-42' },
      'chat-app',
      { queryParams: { conversationId: 'conv-42' } }
    );
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  it('toggles read/unread in-place without closing the popover when clicking the quick-read button', () => {
    const notif = createNotification('n-1', 'Alert', 'Check status', true);
    const { fixture } = setupPopover([notif]);
    const closeSpy = vi.fn();
    fixture.componentInstance.CloseRequested.subscribe(closeSpy);

    const quickBtn = fixture.nativeElement.querySelector('.notif-row-quick-read') as HTMLButtonElement;
    quickBtn.click();
    fixture.detectChanges();

    expect(notif.Unread).toBe(false);
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('emits PreferencesRequested and ViewAllRequested from header gear and footer link', () => {
    const { fixture } = setupPopover([]);
    const prefSpy = vi.fn();
    const viewAllSpy = vi.fn();
    fixture.componentInstance.PreferencesRequested.subscribe(prefSpy);
    fixture.componentInstance.ViewAllRequested.subscribe(viewAllSpy);

    (fixture.nativeElement.querySelector('.pop-icon-btn') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.pop-footer-link') as HTMLButtonElement).click();

    expect(prefSpy).toHaveBeenCalledTimes(1);
    expect(viewAllSpy).toHaveBeenCalledTimes(1);
  });
});
