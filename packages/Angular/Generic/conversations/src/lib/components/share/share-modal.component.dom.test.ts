import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import type { UserInfo } from '@memberjunction/core';
import type { MJConversationEntity } from '@memberjunction/core-entities';
import { renderComponentFixture } from '@memberjunction/ng-test-utils';
import { ShareModalComponent } from './share-modal.component';
import { DialogService } from '../../services/dialog.service';
import { ToastService } from '../../services/toast.service';

/**
 * DOM spec for <mj-share-modal>'s folder-access toggle. Whether a conversation inherits its folder's access
 * decides who else sees it, so only its owner may change it; the server refuses anyone else.
 */
@Component({ standalone: false, selector: 'mj-dialog', template: '<ng-content></ng-content>' })
class StubDialogComponent {
  @Input() Title = '';
  @Input() Width = 0;
  @Input() Height = 0;
  @Input() Visible = false;
  @Output() Close = new EventEmitter<void>();
}

@Component({ standalone: false, selector: 'mj-dialog-actions', template: '<ng-content></ng-content>' })
class StubDialogActionsComponent {}

@Component({ standalone: false, selector: 'mj-empty-state', template: '' })
class StubEmptyStateComponent {
  @Input() Icon = '';
  @Input() Title = '';
  @Input() Message = '';
  @Input() Size = '';
}

const render = (currentUserId: string) =>
  renderComponentFixture(ShareModalComponent, {
    imports: [CommonModule, FormsModule],
    declarations: [ShareModalComponent, StubDialogComponent, StubDialogActionsComponent, StubEmptyStateComponent],
    providers: [
      { provide: DialogService, useValue: { alert: vi.fn(), confirm: vi.fn() } },
      { provide: ToastService, useValue: { success: vi.fn(), error: vi.fn() } },
    ],
    inputs: {
      Conversation: { ID: 'c1', Name: 'Budget', UserID: 'owner-1', ProjectID: 'p1', AdditionalData: null } as unknown as MJConversationEntity,
      CurrentUser: { ID: currentUserId } as unknown as UserInfo,
      IsOpen: true,
    },
  });

describe('ShareModalComponent (DOM) — folder access toggle', () => {
  beforeEach(() => {
    vi.spyOn(ShareModalComponent.prototype, 'ngOnInit').mockImplementation(() => {});
  });

  it('shows the folder access toggle to the conversation owner', () => {
    const f = render('owner-1');
    expect(f.nativeElement.querySelector('.folder-inheritance-section')).not.toBeNull();
  });

  it('hides the folder access toggle from anyone else, even with a grant', () => {
    const f = render('colleague-2');
    expect(f.nativeElement.querySelector('.folder-inheritance-section')).toBeNull();
  });
});
