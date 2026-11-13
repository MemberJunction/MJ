/**
 * User Management is read-only for a non-Owner (issue #4281), and a failed bulk status change
 * restores each user's own prior status (issue #4289).
 *
 * The server's `MJ: Users` guard refuses a non-Owner's create, delete, and write to any row but
 * their own. The screen must not offer those controls to a non-Owner, must say why, and must keep
 * the list on screen when a row action fails (a toast, not the page-level error that replaces it).
 *
 * The template tests render the real component with inert stubs for the page chrome and child
 * widgets, and stub `initDashboard`/`loadData` so nothing loads from a server; the rows are set
 * directly. The rollback tests exercise the methods through the prototype, like the sibling
 * `user-management-toggle-status.dom.test.ts`.
 */
import { describe, it, expect, vi } from 'vitest';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { createFakeProvider, query, queryAll, StubEmptyStateComponent, StubLoadingComponent } from '@memberjunction/ng-test-utils';
import { MJButtonDirective } from '@memberjunction/ng-ui-components';
import type { BaseEntityResult } from '@memberjunction/core';
import type { MJUserEntity } from '@memberjunction/core-entities';
import { UserManagementComponent } from './user-management.component';
import { CanChangeUser, IsOwnerType, OWNER_ONLY_NOTE } from './owner-gate';

/** Inert stand-ins for the chrome and child widgets; each mirrors the inputs/outputs the template binds. */
@Component({ standalone: true, selector: 'mj-page-header-interior', template: '<ng-content></ng-content>' })
class PageHeaderInteriorStub {}

@Component({ standalone: true, selector: 'mj-page-body-interior', template: '<ng-content></ng-content>' })
class PageBodyInteriorStub {}

@Component({ standalone: true, selector: 'mj-stat-badge', template: '' })
class StatBadgeStub {
  @Input() Count = 0;
  @Input() Total = 0;
}

@Component({ standalone: true, selector: 'mj-page-search', template: '' })
class PageSearchStub {
  @Input() Value = '';
  @Output() ValueChange = new EventEmitter<string>();
}

@Component({ standalone: true, selector: 'mj-filter-popover', template: '<ng-content></ng-content>' })
class FilterPopoverStub {
  @Input() ActiveCount = 0;
  @Input() ShowClearAll = false;
  @Output() ClearAllRequested = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-filter-panel', template: '' })
class FilterPanelStub {
  @Input() Fields: readonly unknown[] = [];
  @Input() Values: Record<string, unknown> = {};
  @Output() ValuesChange = new EventEmitter<Record<string, unknown>>();
  @Output() Reset = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-refresh-button', template: '' })
class RefreshButtonStub {
  @Input() Loading = false;
  @Output() Clicked = new EventEmitter<void>();
}

@Component({ standalone: true, selector: 'mj-user-dialog', template: '' })
class UserDialogStub {
  @Input() data: unknown = null;
  @Input() visible = false;
  @Output() result = new EventEmitter<unknown>();
}

const CHILD_STUBS = [
  MJButtonDirective,
  StubLoadingComponent,
  StubEmptyStateComponent,
  PageHeaderInteriorStub,
  PageBodyInteriorStub,
  StatBadgeStub,
  PageSearchStub,
  FilterPopoverStub,
  FilterPanelStub,
  RefreshButtonStub,
  UserDialogStub,
];

const SELF_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const OTHER_ID = 'aaaaaaaa-0000-0000-0000-000000000002';

function makeRow(ID: string, Name: string, IsActive = true): MJUserEntity {
  return { ID, Name, Email: `${Name.toLowerCase()}@example.test`, FirstName: Name, LastName: 'Sample', Type: 'User', IsActive } as unknown as MJUserEntity;
}

/** The lifecycle hooks the template tests replace so nothing loads from a server. */
interface DashboardHooks {
  initDashboard(): void;
  loadData(): void;
  notifyActionFailure(message: string): void;
}

function render(callerType: string): ComponentFixture<UserManagementComponent> {
  TestBed.configureTestingModule({
    imports: [CommonModule, FormsModule, ...CHILD_STUBS],
    declarations: [UserManagementComponent],
  });
  const fixture = TestBed.createComponent(UserManagementComponent);
  const hooks = fixture.componentInstance as unknown as DashboardHooks;
  hooks.initDashboard = () => undefined;
  hooks.loadData = () => undefined;
  hooks.notifyActionFailure = vi.fn();
  fixture.componentRef.setInput('Provider', createFakeProvider({ currentUser: { ID: SELF_ID, Type: callerType } }));
  const c = fixture.componentInstance;
  c.Users = [makeRow(SELF_ID, 'Self'), makeRow(OTHER_ID, 'Other')];
  c.FilteredUsers = [...c.Users];
  fixture.detectChanges(false);
  return fixture;
}

const buttonByLabel = (f: ComponentFixture<unknown>, label: string) =>
  query(f, `button[aria-label="${label}"]`) as HTMLButtonElement | null;

describe('owner-gate helpers', () => {
  it('treats a space-padded, any-case Owner type as Owner', () => {
    expect(IsOwnerType('Owner')).toBe(true);
    expect(IsOwnerType('owner   ')).toBe(true);
    expect(IsOwnerType('User')).toBe(false);
    expect(IsOwnerType(null)).toBe(false);
  });

  it('lets a non-Owner change only their own row, and an Owner any row', () => {
    expect(CanChangeUser({ ID: SELF_ID, Type: 'User' }, SELF_ID.toUpperCase())).toBe(true);
    expect(CanChangeUser({ ID: SELF_ID, Type: 'User' }, OTHER_ID)).toBe(false);
    expect(CanChangeUser({ ID: SELF_ID, Type: 'Owner' }, OTHER_ID)).toBe(true);
    expect(CanChangeUser(null, SELF_ID)).toBe(false);
  });
});

describe('UserManagementComponent — Owner gate (DOM)', () => {
  it('a non-Owner sees the note and no create, status or delete control', () => {
    const f = render('User');
    expect(query(f, '.owner-only-note')?.textContent).toContain(OWNER_ONLY_NOTE);
    expect(buttonByLabel(f, 'Add new user')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Deactivate Other')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Deactivate Self')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Delete Other')?.disabled).toBe(true);
  });

  it('a non-Owner can edit their own row and only view another user', () => {
    const f = render('User');
    expect(buttonByLabel(f, 'Edit Self')?.disabled).toBe(false);
    expect(buttonByLabel(f, 'Edit Other')).toBeNull();
    expect(buttonByLabel(f, 'View Other')?.disabled).toBe(false);
  });

  it('a non-Owner cannot run bulk enable, disable or delete, but can still assign a role they hold', () => {
    const f = render('User');
    f.componentInstance.SelectedUserIds.add(OTHER_ID);
    f.componentRef.changeDetectorRef.markForCheck();
    f.detectChanges(false);
    expect(buttonByLabel(f, 'Enable selected users')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Disable selected users')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Delete selected users')?.disabled).toBe(true);
    expect(buttonByLabel(f, 'Assign role to selected users')?.disabled).toBe(false);
  });

  it('an Owner keeps every control and sees no note', () => {
    const f = render('Owner ');
    expect(query(f, '.owner-only-note')).toBeNull();
    expect(buttonByLabel(f, 'Add new user')?.disabled).toBe(false);
    expect(buttonByLabel(f, 'Edit Other')?.disabled).toBe(false);
    expect(buttonByLabel(f, 'Deactivate Other')?.disabled).toBe(false);
    expect(buttonByLabel(f, 'Delete Other')?.disabled).toBe(false);
  });

  it('a refused status change shows a toast and leaves the list on screen', async () => {
    const f = render('Owner');
    const other = f.componentInstance.Users[1] as MJUserEntity & { Save: () => Promise<boolean>; LatestResult: BaseEntityResult };
    other.Save = vi.fn().mockResolvedValue(false);
    other.LatestResult = { Message: 'You may only modify your own user record.' } as BaseEntityResult;

    await f.componentInstance.ToggleUserStatus(other);
    f.detectChanges(false);

    const hooks = f.componentInstance as unknown as DashboardHooks;
    expect(hooks.notifyActionFailure).toHaveBeenCalledWith('You may only modify your own user record.');
    expect(f.componentInstance.error).toBeNull();
    expect(query(f, '.error-container')).toBeNull();
    expect(queryAll(f, '.users-list .user-card')).toHaveLength(2);
    expect(other.IsActive).toBe(true);
  });
});

/** The parts of the component the bulk rollback tests drive. */
interface BulkHost {
  ExecuteBulkAction(): Promise<void>;
  BulkActionType: 'enable' | 'disable' | 'delete' | null;
  SelectedUserIds: Set<string>;
  Users: Array<{ ID: string; IsActive: boolean; TransactionGroup: unknown; Save: () => Promise<boolean> }>;
  isLoading: boolean;
  error: string | null;
  ShowBulkActionConfirm: boolean;
  Provider: unknown;
  LoadInitialData(): Promise<void>;
  ClearSelection(): void;
  notifyActionFailure(message: string): void;
}

function makeBulkHost(submitReturns: boolean): BulkHost {
  const c = Object.create(UserManagementComponent.prototype) as BulkHost & Record<string, unknown>;
  c['ngZone'] = { run: (fn: () => void) => fn() };
  c['cdr'] = { markForCheck: () => undefined };
  const tg = { Submit: vi.fn().mockResolvedValue(submitReturns) };
  c.Provider = { CreateTransactionGroup: vi.fn().mockResolvedValue(tg) };
  c.Users = [
    { ID: 'u-active', IsActive: true, TransactionGroup: null, Save: vi.fn().mockResolvedValue(true) },
    { ID: 'u-inactive', IsActive: false, TransactionGroup: null, Save: vi.fn().mockResolvedValue(true) },
  ];
  c.SelectedUserIds = new Set(['u-active', 'u-inactive']);
  c.BulkActionType = 'enable';
  c.ShowBulkActionConfirm = true;
  c.error = null;
  // Stub the reload so the rows keep the values the rollback left on them.
  c.LoadInitialData = vi.fn().mockResolvedValue(undefined);
  c.ClearSelection = vi.fn();
  c.notifyActionFailure = vi.fn();
  return c;
}

describe('UserManagementComponent — failed bulk status change', () => {
  it('restores each user to their own prior status, so an already-active user stays active', async () => {
    const c = makeBulkHost(false);
    await c.ExecuteBulkAction();
    expect(c.Users.find((u) => u.ID === 'u-active')?.IsActive).toBe(true);
    expect(c.Users.find((u) => u.ID === 'u-inactive')?.IsActive).toBe(false);
  });

  it('reloads from the server, closes the confirm dialog and reports by toast', async () => {
    const c = makeBulkHost(false);
    await c.ExecuteBulkAction();
    expect(c.LoadInitialData).toHaveBeenCalledOnce();
    expect(c.ShowBulkActionConfirm).toBe(false);
    expect(c.notifyActionFailure).toHaveBeenCalledWith('Failed to update users — all changes have been rolled back');
    expect(c.error).toBeNull();
  });

  it('leaves the target status on every user when the submit succeeds', async () => {
    const c = makeBulkHost(true);
    await c.ExecuteBulkAction();
    expect(c.Users.every((u) => u.IsActive)).toBe(true);
    expect(c.notifyActionFailure).not.toHaveBeenCalled();
  });
});
