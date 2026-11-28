import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { EntityInfo, type TransactionGroupBase } from '@memberjunction/core';
import { MJUserNotificationEntity, UserInfoEngine } from '@memberjunction/core-entities';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { UserNotificationsComponent } from './user-notifications.component';

@Component({ standalone: true, selector: 'mj-empty-state', template: '' })
class EmptyStateStub {
  @Input() Variant: string | undefined;
  @Input() Icon: string | undefined;
  @Input() Title: string | undefined;
  @Input() Message: string | undefined;
}

@Component({ standalone: true, selector: 'mj-markdown', template: '<div class="md-stub">{{ data }}</div>' })
class MarkdownStub {
  @Input() data: string | undefined;
  @Input() enableMermaid: boolean | undefined;
}

function createNotificationEntity(id: string, title: string, message: string): MJUserNotificationEntity {
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
  entity.Unread = false;
  entity.ResourceTypeID = null;
  entity.ResourceRecordID = null;
  entity.ResourceConfiguration = null;
  return entity;
}

function renderNotifications(notifications: MJUserNotificationEntity[]): ComponentFixture<UserNotificationsComponent> {
  vi.spyOn(UserInfoEngine.Instance, 'NotificationTypes', 'get').mockReturnValue([]);
  vi.spyOn(SharedService, 'UserNotifications', 'get').mockReturnValue(notifications);

  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule, EmptyStateStub, MarkdownStub],
    declarations: [UserNotificationsComponent],
    providers: [
      { provide: SharedService, useValue: { InvokeManualResize: vi.fn(), ResourceTypeByID: vi.fn(), CreateSimpleNotification: vi.fn() } },
      { provide: NavigationService, useValue: {} },
      { provide: ApplicationManager, useValue: {} },
    ],
  });

  const fixture = TestBed.createComponent(UserNotificationsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('UserNotificationsComponent (DOM) — expanded plain-text normalization', () => {
  afterEach(() => vi.restoreAllMocks());

  it('renders clean normalized vm.Body when expanding a long (>240 chars) plain-text notification', () => {
    const suffix = 'X'.repeat(240);
    const raw = `Elena&#39;s &quot;Northwind&quot; &amp; Co checked Northwind @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Northwind","ID":"acc-1"} — ${suffix}`;
    const entity = createNotificationEntity('notif-dom-1', 'Long Plain Watch', raw);

    const fixture = renderNotifications([entity]);
    const expandBtn = fixture.nativeElement.querySelector('.card-expand-btn') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    expect(expandBtn?.textContent).toContain('Show more');

    expandBtn?.click();
    fixture.detectChanges();

    const expandedBody = fixture.nativeElement.querySelector('.card-message-full') as HTMLElement | null;
    expect(expandedBody).not.toBeNull();
    const renderedText = expandedBody?.textContent ?? '';
    expect(renderedText).toContain(`Elena's "Northwind" & Co checked Northwind — ${suffix}`);
    expect(renderedText).not.toContain('&#39;');
    expect(renderedText).not.toContain('&quot;');
    expect(renderedText).not.toContain('&amp;');
    expect(renderedText).not.toContain('@{"_mode"');
    expect(renderedText).not.toContain('Northwind Northwind');
  });

  it('cleans raw and HTML-escaped mention tokens in HTML-only notification Body and Preview', () => {
    const htmlMessage =
      '<p>Reviewed <strong>Northwind</strong> @{&quot;_mode&quot;:&quot;mention&quot;,&quot;type&quot;:&quot;record&quot;,&quot;entityName&quot;:&quot;Accounts&quot;,&quot;name&quot;:&quot;Northwind&quot;,&quot;ID&quot;:&quot;acc-1&quot;} ' +
      'with @{&quot;_mode&quot;:&quot;mention&quot;,&quot;type&quot;:&quot;user&quot;,&quot;id&quot;:&quot;u-1&quot;,&quot;name&quot;:&quot;Elena &lt;Admin&gt;&quot;} ' +
      'and flagged @{"_mode":"mention","type":"record","entityName":"Accounts","name":"Contoso","ID":"acc-2"}.</p>';
    const entity = createNotificationEntity('notif-dom-html', 'HTML Routine Watch', htmlMessage);

    const fixture = renderNotifications([entity]);
    const previewEl = fixture.nativeElement.querySelector('.card-message') as HTMLElement | null;
    expect(previewEl?.textContent ?? '').toContain('Reviewed Northwind with @Elena <Admin> and flagged Contoso.');
    expect(previewEl?.textContent ?? '').not.toContain('_mode');

    const expandBtn = fixture.nativeElement.querySelector('.card-expand-btn') as HTMLButtonElement | null;
    expect(expandBtn).not.toBeNull();
    expandBtn?.click();
    fixture.detectChanges();

    const expandedHtml = fixture.nativeElement.querySelector('.card-rich-html') as HTMLElement | null;
    expect(expandedHtml).not.toBeNull();
    expect(expandedHtml?.innerHTML ?? '').toContain('<strong>Northwind</strong>');
    expect(expandedHtml?.innerHTML ?? '').toContain('@Elena &lt;Admin&gt;');
    expect(expandedHtml?.textContent ?? '').toContain('Reviewed Northwind with @Elena <Admin> and flagged Contoso.');
    expect(expandedHtml?.textContent ?? '').not.toContain('_mode');
    expect(expandedHtml?.textContent ?? '').not.toContain('Northwind Northwind');
  });

  it('toggles a read card to unread and back to read when clicking the card Unread/Read button (even with a stale TransactionGroup)', async () => {
    const entity = createNotificationEntity('notif-toggle-1', 'Agent Completed', 'Finished Q4 summary.');
    entity.Unread = false;
    entity.TransactionGroup = { Status: 'Complete' } as unknown as TransactionGroupBase;
    const saveSpy = vi.spyOn(entity, 'Save').mockImplementation(async () => {
      // Simulate GraphQLDataProvider: a stale TransactionGroup would skip saving
      return entity.TransactionGroup === null;
    });

    const fixture = renderNotifications([entity]);
    Object.defineProperty(fixture.componentInstance, 'ProviderToUse', {
      get: () => ({}),
      configurable: true,
    });

    const cardBefore = fixture.nativeElement.querySelector('.notification-card') as HTMLElement;
    expect(cardBefore.classList.contains('unread')).toBe(false);

    const unreadBtn = fixture.nativeElement.querySelector('.card-action-btn') as HTMLButtonElement;
    expect(unreadBtn.textContent).toContain('Unread');
    unreadBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(saveSpy).toHaveBeenCalledTimes(1);
    expect(entity.TransactionGroup).toBeNull();
    expect(entity.Unread).toBe(true);
    expect(cardBefore.classList.contains('unread')).toBe(true);
    const readBtn = fixture.nativeElement.querySelector('.card-action-btn') as HTMLButtonElement;
    expect(readBtn.textContent).toContain('Read');

    // Toggle back to read and verify the Unread filter pill stays rendered at 0 instead of vanishing
    readBtn.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(entity.Unread).toBe(false);
    expect(cardBefore.classList.contains('unread')).toBe(false);
    const statPills = Array.from(fixture.nativeElement.querySelectorAll('.stat-pill')) as HTMLButtonElement[];
    expect(statPills.map(p => p.querySelector('.stat-label')?.textContent?.trim())).toEqual(['All', 'Unread', 'Read']);
  });
});
