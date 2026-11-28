import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { IMetadataProvider } from '@memberjunction/core';
import { MJUserNotificationEntity, MJUserNotificationTypeEntity } from '@memberjunction/core-entities';
import { ApplicationManager } from '@memberjunction/ng-base-application';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import { NavigationService, SharedService } from '@memberjunction/ng-shared';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { ClassifyNotificationMessage } from '../../../user-notifications/user-notifications.component';
import {
  FormatRelativeNotificationTime,
  GetNotificationTypeDisplay,
  GetSortedNotificationTypes,
  IsNotificationClickable,
  MarkNotificationAsRead,
  NavigateToNotificationTarget,
} from '../../../user-notifications/notification-action.helpers';

export type NotificationPopoverTab = 'unread' | 'all';

export interface NotificationPopoverVM {
  Notification: MJUserNotificationEntity;
  Preview: string;
  RelativeTime: string;
  TypeIcon: string;
  TypeColor: string;
  TypeName: string;
  Clickable: boolean;
}

/** Maximum rows rendered inside the anchored header popover so the dropdown stays scannable; full history lives in the Notifications tab. */
const MAX_POPOVER_ITEMS = 20;

/**
 * Anchored header dropdown popover for quick notification triage — lets users glance at
 * unread alerts, mark items read in-place, jump straight to notification preferences, or
 * open the full Notifications tab without losing their current workspace context.
 */
@Component({
  standalone: true,
  selector: 'mj-notification-popover',
  imports: [CommonModule],
  templateUrl: './notification-popover.component.html',
  styleUrls: ['./notification-popover.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NotificationPopoverComponent extends BaseAngularComponent implements OnInit, OnChanges, OnDestroy {
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly sharedService = inject(SharedService);
  private readonly navigationService = inject(NavigationService);
  private readonly appManager = inject(ApplicationManager);
  private readonly destroy$ = new Subject<void>();

  @Input() IsOpen = false;

  @Output() CloseRequested = new EventEmitter<void>();
  @Output() ViewAllRequested = new EventEmitter<void>();
  @Output() PreferencesRequested = new EventEmitter<void>();

  public ActiveTab: NotificationPopoverTab = 'unread';
  public AllNotifications: MJUserNotificationEntity[] = [];
  public UnreadCount = 0;
  public VisibleItems: NotificationPopoverVM[] = [];
  public FilteredTotalCount = 0;
  public MarkingAllRead = false;

  private initialized = false;
  private userPickedTab = false;
  private notificationTypes: MJUserNotificationTypeEntity[] = [];
  private readonly previewCache = new Map<string, { rawMessage: string; preview: string }>();

  ngOnInit(): void {
    this.initialized = true;
    this.notificationTypes = GetSortedNotificationTypes();
    MJNotificationService.Notifications$
      .pipe(takeUntil(this.destroy$))
      .subscribe(notifications => {
        this.AllNotifications = notifications ?? [];
        this.UnreadCount = this.AllNotifications.filter(n => n.Unread).length;
        if (!this.userPickedTab) {
          this.ActiveTab = this.UnreadCount > 0 ? 'unread' : 'all';
        }
        this.notificationTypes = GetSortedNotificationTypes();
        this.rebuildVisibleItems();
        this.cdr.markForCheck();
      });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['IsOpen'] && this.IsOpen && this.initialized) {
      // Opening with unread items defaults to Unread; opening when caught up shows All.
      this.userPickedTab = false;
      this.ActiveTab = this.UnreadCount > 0 ? 'unread' : 'all';
      this.notificationTypes = GetSortedNotificationTypes();
      this.rebuildVisibleItems();
      this.cdr.markForCheck();
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  public SelectTab(tab: NotificationPopoverTab): void {
    this.userPickedTab = true;
    if (this.ActiveTab === tab) {
      return;
    }
    this.ActiveTab = tab;
    this.rebuildVisibleItems();
    this.cdr.markForCheck();
  }

  public OnNotificationClick(vm: NotificationPopoverVM): void {
    const notification = vm.Notification;
    if (vm.Clickable) {
      void this.markSingleRead(notification, true);
      NavigateToNotificationTarget(notification, {
        SharedService: this.sharedService,
        NavigationService: this.navigationService,
        AppManager: this.appManager,
        Provider: this.resolveProvider(),
      });
      this.CloseRequested.emit();
      return;
    }

    if (notification.Unread) {
      void this.markSingleRead(notification, true);
    }
    this.ViewAllRequested.emit();
    this.CloseRequested.emit();
  }

  public OnToggleReadClick(vm: NotificationPopoverVM, event: Event): void {
    event.stopPropagation();
    void this.markSingleRead(vm.Notification, vm.Notification.Unread);
  }

  public async OnMarkAllReadClick(): Promise<void> {
    if (this.MarkingAllRead || this.UnreadCount === 0) {
      return;
    }
    this.MarkingAllRead = true;
    this.cdr.markForCheck();
    const unread = this.AllNotifications.filter(n => n.Unread);
    const previousUnread = new Map<MJUserNotificationEntity, boolean>(unread.map(n => [n, n.Unread]));
    try {
      const provider = this.ProviderToUse;
      const transGroup = await provider.CreateTransactionGroup();
      await Promise.all(unread.map(n => MarkNotificationAsRead(n, true, transGroup, provider)));
      const ok = await transGroup.Submit();
      if (!ok) {
        for (const [notification, prev] of previousUnread) {
          notification.Unread = prev;
        }
        this.sharedService.CreateSimpleNotification('Unable to mark all notifications as read', 'error', 5000);
      } else {
        await MJNotificationService.RefreshUserNotifications();
      }
    } finally {
      for (const notification of unread) {
        notification.TransactionGroup = null;
      }
      MJNotificationService.UpdateNotificationObservables();
      this.UnreadCount = this.AllNotifications.filter(n => n.Unread).length;
      this.rebuildVisibleItems();
      this.MarkingAllRead = false;
      this.cdr.markForCheck();
    }
  }

  public OnPreferencesClick(): void {
    this.PreferencesRequested.emit();
  }

  public OnViewAllClick(): void {
    this.ViewAllRequested.emit();
  }

  public OnPopoverKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.CloseRequested.emit();
    }
  }

  private async markSingleRead(notification: MJUserNotificationEntity, bRead: boolean): Promise<void> {
    const saved = await MarkNotificationAsRead(notification, bRead, null, this.resolveProvider());
    if (!saved) {
      this.sharedService.CreateSimpleNotification(
        bRead ? 'Unable to mark notification as read' : 'Unable to mark notification as unread',
        'error',
        5000
      );
    }
    this.UnreadCount = this.AllNotifications.filter(n => n.Unread).length;
    this.rebuildVisibleItems();
    this.cdr.markForCheck();
  }

  private resolveProvider(): IMetadataProvider | undefined {
    try {
      return this.ProviderToUse;
    } catch {
      return undefined;
    }
  }

  private rebuildVisibleItems(): void {
    const filtered = this.ActiveTab === 'unread'
      ? this.AllNotifications.filter(n => n.Unread)
      : this.AllNotifications;

    this.FilteredTotalCount = filtered.length;
    const slice = filtered.slice(0, MAX_POPOVER_ITEMS);

    this.VisibleItems = slice.map(notification => {
      const typeDisplay = GetNotificationTypeDisplay(notification.NotificationTypeID, this.notificationTypes);
      return {
        Notification: notification,
        Preview: this.getCleanPreview(notification),
        RelativeTime: FormatRelativeNotificationTime(notification.__mj_CreatedAt),
        TypeIcon: typeDisplay.Icon,
        TypeColor: typeDisplay.Color,
        TypeName: typeDisplay.Name,
        Clickable: IsNotificationClickable(notification, this.sharedService),
      };
    });
  }

  private getCleanPreview(notification: MJUserNotificationEntity): string {
    const raw = notification.Message ?? '';
    const cached = this.previewCache.get(notification.ID);
    if (cached && cached.rawMessage === raw) {
      return cached.preview;
    }
    const preview = ClassifyNotificationMessage(raw).Preview;
    this.previewCache.set(notification.ID, { rawMessage: raw, preview });
    return preview;
  }
}
