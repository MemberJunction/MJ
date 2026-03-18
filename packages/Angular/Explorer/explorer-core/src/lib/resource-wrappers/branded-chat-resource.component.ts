import { Component, ViewEncapsulation, inject } from '@angular/core';
import { RegisterClass } from '@memberjunction/global';
import { BaseResourceComponent } from '@memberjunction/ng-shared';
import { ResourceData } from '@memberjunction/core-entities';
import { AgentRoutingConfig, BrandingLabels } from '@memberjunction/ng-conversations';
import { AIEngineBase } from '@memberjunction/ai-engine-base';
import { ThemeService } from '@memberjunction/ng-shared-generic';
import { BaseChatResource, CHAT_RESOURCE_TEMPLATE, CHAT_RESOURCE_STYLES } from './base-chat-resource';

/**
 * Configuration for a BrandedChatResource instance.
 * Supplied via the Application nav-item Configuration JSON.
 */
interface BrandedChatConfig {
  themeId?: string;
  darkThemeId?: string;
  availableAgentNames?: string[];
  defaultAgentName?: string;
  welcomeTitle?: string;
  welcomeSubtitle?: string;
  welcomeIcon?: string;
  suggestedPrompts?: Array<{ icon: string; title: string; prompt: string }>;
  suggestedPromptCount?: number;
  inputPlaceholder?: string;
  tabLabelOverrides?: Record<string, string>;
  artifactLabel?: string;
  saveToCollectionLabel?: string;
  collectionLabel?: string;
  collectionsLabel?: string;
}

/**
 * Branded Chat Resource — wraps the standard chat with branding orchestration.
 *
 * Extends BaseChatResource (all sidebar, URL, conversation logic) and adds:
 * - Temporary theme application/restoration (via ThemeService)
 * - Agent routing configuration resolution (from config agent names)
 * - Branding labels for customizing UI terminology
 *
 * Used by branded applications (e.g. Skip) that want a custom-branded chat
 * experience within the MemberJunction shell.
 */
@RegisterClass(BaseResourceComponent, 'BrandedChatResource')
@Component({
  standalone: false,
  selector: 'mj-branded-chat-resource',
  template: CHAT_RESOURCE_TEMPLATE,
  styles: [CHAT_RESOURCE_STYLES],
  encapsulation: ViewEncapsulation.None
})
export class BrandedChatResource extends BaseChatResource {
  private themeService = inject(ThemeService);

  protected get SidebarSettingKey(): string {
    return 'BrandedChat.SidebarState';
  }

  async GetResourceDisplayName(data: ResourceData): Promise<string> {
    if (data.Configuration?.conversationId) {
      return `Conversation: ${(data.Configuration.conversationId as string).substring(0, 8)}...`;
    }
    return 'Chat';
  }

  async GetResourceIconClass(_data: ResourceData): Promise<string> {
    return 'fa-solid fa-bolt';
  }

  // ============================================
  // LIFECYCLE — branding hooks around base init
  // ============================================

  override async ngOnInit() {
    // Resolve branding config BEFORE base init renders children
    this.resolveConfig();

    // Apply branded theme (async, non-blocking)
    const config = this.Data?.Configuration as BrandedChatConfig | undefined;
    if (config) {
      this.applyBrandedTheme(config);
    }

    // Base handles everything else: sidebar, engines, URL, subscriptions
    await super.ngOnInit();
  }

  override ngOnDestroy() {
    // Restore the user's persisted theme when leaving the branded app
    this.themeService.RestorePersistedTheme();
    super.ngOnDestroy();
  }

  // ============================================
  // BRANDING CONFIG RESOLUTION
  // ============================================

  private resolveConfig(): void {
    const config = this.Data?.Configuration as BrandedChatConfig | undefined;
    if (!config) return;

    this.resolveAgentRouting(config);
    this.resolveBrandingLabels(config);
  }

  private resolveAgentRouting(config: BrandedChatConfig): void {
    const allAgents = AIEngineBase.Instance.Agents;

    let availableAgents: { ID: string; Name: string }[] | undefined;
    if (config.availableAgentNames?.length) {
      availableAgents = allAgents
        .filter(a => a.Name != null && config.availableAgentNames!.some(name =>
          a.Name!.toLowerCase() === name.toLowerCase()
        ))
        .map(a => ({ ID: a.ID, Name: a.Name! }));
    }

    let defaultAgent: { ID: string; Name: string } | undefined;
    if (config.defaultAgentName) {
      const found = allAgents.find(a =>
        a.Name != null && a.Name.toLowerCase() === config.defaultAgentName!.toLowerCase()
      );
      if (found && found.Name != null) {
        defaultAgent = { ID: found.ID, Name: found.Name };
      }
    }

    if (availableAgents?.length || defaultAgent) {
      this.AgentRouting = { AvailableAgents: availableAgents, DefaultAgent: defaultAgent };
    }
  }

  private resolveBrandingLabels(config: BrandedChatConfig): void {
    this.BrandingLabels = {
      WelcomeTitle: config.welcomeTitle,
      WelcomeSubtitle: config.welcomeSubtitle,
      WelcomeIcon: config.welcomeIcon,
      SuggestedPrompts: config.suggestedPrompts,
      SuggestedPromptCount: config.suggestedPromptCount,
      InputPlaceholder: config.inputPlaceholder,
      TabLabelOverrides: config.tabLabelOverrides,
      ArtifactLabel: config.artifactLabel,
      SaveToCollectionLabel: config.saveToCollectionLabel,
      CollectionLabel: config.collectionLabel,
      CollectionsLabel: config.collectionsLabel,
    };
  }

  // ============================================
  // THEME APPLICATION
  // ============================================

  private ensureThemeRegistered(id: string, baseTheme: 'light' | 'dark'): void {
    if (this.themeService.GetThemeDefinition(id)) return;

    this.themeService.RegisterTheme({
      Id: id,
      Name: id,
      BaseTheme: baseTheme,
      CssUrl: `/assets/themes/${id}.css`,
      IsBuiltIn: false,
      Hidden: true
    });
  }

  private async applyBrandedTheme(config: BrandedChatConfig): Promise<void> {
    const themeId = config.themeId;
    const darkThemeId = config.darkThemeId;
    if (!themeId && !darkThemeId) return;

    if (themeId) {
      this.ensureThemeRegistered(themeId, 'light');
    }
    if (darkThemeId) {
      this.ensureThemeRegistered(darkThemeId, 'dark');
    }

    if (themeId) {
      await this.themeService.ApplyThemeTemporary(themeId, darkThemeId);
    }
  }
}

/**
 * Tree-shaking prevention function.
 * Must be called from a module or public-api to ensure the @RegisterClass decorator is retained.
 */
export function LoadBrandedChatResource() {}
