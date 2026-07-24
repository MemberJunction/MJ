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
import { ConversationEngine, MJConversationEntity } from '@memberjunction/core-entities';
import { PendingAttachment } from '@memberjunction/ng-composer';
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
  /** Front Door composer handoff (auto-sent by chat-area on mount, then consumed). */
  public PendingMessageText: string | null = null;
  public PendingAttachments: PendingAttachment[] = [];
  /** Pins the pending message to ONE conversation (chat-area's anti-bleed contract). */
  public PendingMessageConversationId: string | null = null;

  private get engine(): ConversationEngine {
    return this.Provider
      ? (ConversationEngine.GetProviderInstance(this.Provider, ConversationEngine) as ConversationEngine)
      : ConversationEngine.Instance;
  }
  public SettingsOpen = false;
  public Appearance: ShellAppearance = 'system';
  public RefreshState: 'idle' | 'refreshing' | 'done' = 'idle';

  private readonly cdr = inject(ChangeDetectorRef);

  /** Display options for the Settings mj-dropdowns (primitive string lists). */
  public readonly DensityOptions = ['Comfortable', 'Compact'];
  public readonly AppearanceOptions = ['System', 'Light', 'Dark'];

  public readonly Placeholders: Partial<Record<ShellView, ShellPlaceholder>> = {
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

  /**
   * "New conversation" lands on the FRONT DOOR (Matt, S3 review) — per the shell
   * routing rule, quick chats start from the Front Door's composer; a separate
   * blank new-chat surface would duplicate it. The chat-area empty-state path
   * below (NewConversationFallback) remains for the composer-submit error case.
   */
  public OnNewConversation(): void {
    this.SelectedConversationId = null;
    this.SelectedConversation = null;
    this.IsNewConversation = false;
    this.CurrentView = 'frontdoor';
    this.ViewChanged.emit('frontdoor');
    this.ConversationOpened.emit(null);
    this.cdr.markForCheck();
  }

  private NewConversationFallback(): void {
    this.SelectedConversationId = null;
    this.SelectedConversation = null;
    this.IsNewConversation = true;
    this.CurrentView = 'chat';
    this.ViewChanged.emit('chat');
    this.ConversationOpened.emit(null);
    this.cdr.markForCheck();
  }

  /**
   * Front Door composer → the frame CREATES the conversation (mirroring the
   * chat empty-state's creation flow), then delivers the message through the
   * chat-area pendingMessage contract, pinned to the new conversation so the
   * auto-send can't bleed elsewhere.
   */
  public async OnComposerSubmitted(event: { text: string; attachments: PendingAttachment[] }): Promise<void> {
    try {
      const conversation = await this.engine.CreateConversation(
        'New Conversation', // auto-named after the first message
        this.environmentId,
        this.currentUser
      );
      if (!conversation) throw new Error('CreateConversation returned null');
      this.SelectedConversationId = conversation.ID;
      this.SelectedConversation = conversation;
      this.IsNewConversation = false;
      this.PendingMessageText = event.text;
      this.PendingAttachments = event.attachments;
      this.PendingMessageConversationId = conversation.ID;
      this.CurrentView = 'chat';
      this.ViewChanged.emit('chat');
      this.ConversationOpened.emit(conversation.ID);
    } catch (error) {
      console.error('[ComposedShell] Front Door send failed to create conversation:', error);
      // Fall back to the plain chat empty state; the user retypes rather than
      // the message silently vanishing into a broken state.
      this.NewConversationFallback();
    }
    this.cdr.markForCheck();
  }

  public OnPendingMessageConsumed(): void {
    this.PendingMessageText = null;
    this.PendingAttachments = [];
    this.PendingMessageConversationId = null;
  }

  /**
   * Chat-area empty-state created a conversation. Per its contract, the pending
   * first message ROUND-TRIPS through the host: we set it back as an input,
   * pinned to the new conversation, and chat-area auto-sends it there.
   */
  public OnConversationCreated(event: {
    conversation: MJConversationEntity;
    pendingMessage?: string;
    pendingAttachments?: PendingAttachment[];
  }): void {
    this.SelectedConversationId = event.conversation.ID;
    this.SelectedConversation = event.conversation;
    this.IsNewConversation = false;
    if (event.pendingMessage) {
      this.PendingMessageText = event.pendingMessage;
      this.PendingAttachments = event.pendingAttachments ?? [];
      this.PendingMessageConversationId = event.conversation.ID;
    }
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
