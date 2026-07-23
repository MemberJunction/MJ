/**
 * @fileoverview mj-composed-shell — the composed shell frame (SLICE-S1).
 *
 * The skeleton every later surface plugs into: two-path sidebar (mj-shell-sidebar)
 * + main outlet + Settings slide-in (D-S8) + toast host. Owns the shell's INTERNAL
 * navigation state (`ShellView`) — Generic packages are Router-free, so the host
 * syncs URLs from `ViewChanged` / `ConversationOpened` events.
 *
 * S1 scope: the frame, sidebar, Settings, and the `chat` view (full reuse of the
 * existing mj-conversation-chat-area — zero changes to it). Front Door (S3) and
 * the W-surfaces (S2/S4) render honest placeholder panes. Per the shell routing
 * rule (SHELL-DECISIONS), app open lands on Front Door — placeholder and all —
 * so later slices change CONTENT, never navigation behavior.
 *
 * NgModule-declared (standalone: false) deliberately: the frame mounts
 * mj-conversation-chat-area and mj-toast, which are ConversationsModule
 * declarations — a standalone frame importing the module that exports it would
 * be circular. Follows the package's chat-area precedent.
 *
 * Appearance note (S1): the Appearance select applies `data-theme` directly for
 * live preview and is session-only; reconciling with Explorer's own theme
 * persistence is a cutover (S8) task, on record in SLICE-S1.
 */

import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  Output,
  inject,
} from '@angular/core';
import { UserInfo } from '@memberjunction/core';
import { MJConversationEntity } from '@memberjunction/core-entities';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { BaseAngularComponent } from '@memberjunction/ng-base-types';
import { MentionAutocompleteService } from '../../services/mention-autocomplete.service';
import { ShellPreferences, ShellSidebarDensity } from '../../utils/shell-preferences';
import { ShellAppearance, ShellView } from './shell-types';

/** Placeholder copy for surfaces whose content arrives in later slices. */
interface ShellPlaceholder {
  Icon: string;
  Title: string;
  Detail: string;
}

@Component({
  selector: 'mj-composed-shell',
  standalone: false,
  templateUrl: './composed-shell.component.html',
  styleUrls: ['./composed-shell.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ComposedShellComponent extends BaseAngularComponent {
  @Input() environmentId!: string;
  @Input() currentUser!: UserInfo;
  /** Optional initial conversation (host deep link). */
  @Input()
  public set initialConversationId(value: string | null) {
    if (value && value !== this.SelectedConversationId) {
      this.SelectedConversationId = value;
      this.SelectedConversation = null; // chat-area loads by id
      this.CurrentView = 'chat';
      this.cdr.markForCheck();
    }
  }

  /** Emitted whenever the shell's top-level view changes (host syncs URL). */
  @Output() ViewChanged = new EventEmitter<ShellView>();
  /** Emitted when a conversation is opened/closed (host syncs URL). */
  @Output() ConversationOpened = new EventEmitter<string | null>();

  public CurrentView: ShellView = 'frontdoor';
  public SelectedConversationId: string | null = null;
  public SelectedConversation: MJConversationEntity | null = null;
  public IsNewConversation = false;
  public SettingsOpen = false;
  public Appearance: ShellAppearance = 'system';
  public RefreshState: 'idle' | 'refreshing' | 'done' = 'idle';

  private readonly cdr = inject(ChangeDetectorRef);

  public readonly Placeholders: Partial<Record<ShellView, ShellPlaceholder>> = {
    frontdoor: {
      Icon: 'fa-door-open',
      Title: 'Front Door',
      Detail: 'Your landing surface — needs-you, continue, and ran-overnight arrive with slice S3. Pick a conversation from the sidebar, or start a new one.',
    },
    chats: {
      Icon: 'fa-comments',
      Title: 'Chats',
      Detail: 'The full conversation workspace — grouping, filtering, and management arrive with slice S2.',
    },
    projects: {
      Icon: 'fa-folder',
      Title: 'Projects',
      Detail: 'Project cards and the Project Room arrive with slice S4.',
    },
    collections: {
      Icon: 'fa-layer-group',
      Title: 'Collections',
      Detail: 'The curated artifact library arrives with slice S5.',
    },
    routines: {
      Icon: 'fa-clock-rotate-left',
      Title: 'Routines',
      Detail: 'Your standing orders arrive with slice S6.',
    },
  };

  constructor() {
    super();
    ShellPreferences.Warm();
  }

  // ── Preferences (read synchronously from the UserInfoEngine cache) ──
  public get ShowProjects(): boolean {
    return ShellPreferences.ShowProjects;
  }
  public get Density(): ShellSidebarDensity {
    return ShellPreferences.SidebarDensity;
  }

  /** Resolved default agent name for the Settings read-only row. */
  public get DefaultAgentName(): string | null {
    try {
      const agents = AIEngineBase.Instance.Agents;
      return agents?.find((a) => a.Name?.trim().toLowerCase() === 'sage')?.Name ?? agents?.[0]?.Name ?? null;
    } catch {
      return null;
    }
  }

  public get ActivePlaceholder(): ShellPlaceholder | null {
    return this.CurrentView === 'chat' ? null : this.Placeholders[this.CurrentView] ?? null;
  }

  // ── Navigation ──
  public OnViewSelected(view: ShellView): void {
    this.CurrentView = view;
    this.ViewChanged.emit(view);
    this.cdr.markForCheck();
  }

  public OnConversationSelected(conversation: MJConversationEntity): void {
    this.SelectedConversationId = conversation.ID;
    this.SelectedConversation = conversation;
    this.IsNewConversation = false;
    this.CurrentView = 'chat';
    this.ViewChanged.emit('chat');
    this.ConversationOpened.emit(conversation.ID);
    this.cdr.markForCheck();
  }

  public OnNewConversation(): void {
    this.SelectedConversationId = null;
    this.SelectedConversation = null;
    this.IsNewConversation = true;
    this.CurrentView = 'chat';
    this.ViewChanged.emit('chat');
    this.ConversationOpened.emit(null);
    this.cdr.markForCheck();
  }

  public OnConversationCreated(event: { conversation: MJConversationEntity }): void {
    this.SelectedConversationId = event.conversation.ID;
    this.SelectedConversation = event.conversation;
    this.IsNewConversation = false;
    this.ConversationOpened.emit(event.conversation.ID);
    this.cdr.markForCheck();
  }

  // ── Settings ──
  public OnSettingsToggled(): void {
    this.SettingsOpen = !this.SettingsOpen;
    this.cdr.markForCheck();
  }

  /** Select normalizers for the inline Settings content (display labels → typed values). */
  public OnDensitySelected(value: string): void {
    this.OnDensityChanged(value === 'Compact' ? 'compact' : 'comfortable');
  }

  public OnAppearanceSelected(value: string): void {
    const normalized = value.toLowerCase();
    this.OnAppearanceChanged(
      normalized === 'light' || normalized === 'dark' ? (normalized as ShellAppearance) : 'system'
    );
  }

  /** Panel stays OPEN on flip (mockup correction #7) — only state changes. */
  public OnShowProjectsChanged(value: boolean): void {
    ShellPreferences.SetShowProjects(value);
    // F0x: hiding projects while the Projects surface is open falls back to chats.
    if (!value && this.CurrentView === 'projects') {
      this.OnViewSelected('chats');
    }
    this.cdr.markForCheck();
  }

  public OnDensityChanged(value: ShellSidebarDensity): void {
    ShellPreferences.SetSidebarDensity(value);
    this.cdr.markForCheck();
  }

  public OnAppearanceChanged(value: ShellAppearance): void {
    this.Appearance = value;
    const root = document.documentElement;
    if (value === 'system') {
      delete root.dataset['theme'];
    } else {
      root.dataset['theme'] = value;
    }
    this.cdr.markForCheck();
  }

  public async OnRefreshAgentCache(): Promise<void> {
    if (this.RefreshState === 'refreshing') return;
    this.RefreshState = 'refreshing';
    this.cdr.markForCheck();
    try {
      await AIEngineBase.Instance.Config(true);
      await MentionAutocompleteService.Instance.refresh(this.currentUser);
      this.RefreshState = 'done';
      setTimeout(() => {
        this.RefreshState = 'idle';
        this.cdr.markForCheck();
      }, 2500);
    } catch (error) {
      console.error('[ComposedShell] Agent cache refresh failed:', error);
      this.RefreshState = 'idle';
    }
    this.cdr.markForCheck();
  }
}
