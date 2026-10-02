import { Injectable } from '@angular/core';
import { Title } from '@angular/platform-browser';

/**
 * Service for managing browser tab titles.
 * Provides a hierarchical naming scheme: "App Name - Resource/Page Name"
 * Useful for bookmarks and browser history.
 */
@Injectable({
  providedIn: 'root'
})
export class TitleService {
  private baseTitle: string = 'MemberJunction';
  private currentAppName: string | null = null;
  private currentResourceName: string | null = null;

  constructor(private titleService: Title) {}

  /**
   * Set the base application title (e.g., "MemberJunction" or "Skip")
   */
  SetBaseTitle(title: string): void {
    this.baseTitle = title;
    this.updateTitle();
  }

  /** @deprecated Use {@link SetBaseTitle}. */
  setBaseTitle(title: string): void {
    return this.SetBaseTitle(title);
  }

  /**
   * Get the current base title
   */
  GetBaseTitle(): string {
    return this.baseTitle;
  }

  /** @deprecated Use {@link GetBaseTitle}. */
  getBaseTitle(): string {
    return this.GetBaseTitle();
  }

  /**
   * Set the current app name (e.g., "Sales", "Marketing")
   * Pass null to clear the app context
   */
  SetAppName(appName: string | null): void {
    this.currentAppName = appName;
    this.updateTitle();
  }

  /** @deprecated Use {@link SetAppName}. */
  setAppName(appName: string | null): void {
    return this.SetAppName(appName);
  }

  /**
   * Get the current app name
   */
  GetAppName(): string | null {
    return this.currentAppName;
  }

  /** @deprecated Use {@link GetAppName}. */
  getAppName(): string | null {
    return this.GetAppName();
  }

  /**
   * Set the current resource/page name (e.g., "Accounts", "Contact: John Doe")
   * Pass null to show only the app name
   */
  SetResourceName(resourceName: string | null): void {
    this.currentResourceName = resourceName;
    this.updateTitle();
  }

  /** @deprecated Use {@link SetResourceName}. */
  setResourceName(resourceName: string | null): void {
    return this.SetResourceName(resourceName);
  }

  /**
   * Get the current resource name
   */
  GetResourceName(): string | null {
    return this.currentResourceName;
  }

  /** @deprecated Use {@link GetResourceName}. */
  getResourceName(): string | null {
    return this.GetResourceName();
  }

  /**
   * Set both app and resource in one call
   */
  SetContext(appName: string | null, resourceName: string | null): void {
    this.currentAppName = appName;
    this.currentResourceName = resourceName;
    this.updateTitle();
  }

  /** @deprecated Use {@link SetContext}. */
  setContext(appName: string | null, resourceName: string | null): void {
    return this.SetContext(appName, resourceName);
  }

  /**
   * Reset to just the base title
   */
  Reset(): void {
    this.currentAppName = null;
    this.currentResourceName = null;
    this.updateTitle();
  }

  /** @deprecated Use {@link Reset}. */
  reset(): void {
    return this.Reset();
  }

  /**
   * Get the full current title
   */
  GetFullTitle(): string {
    return this.buildTitle();
  }

  /** @deprecated Use {@link GetFullTitle}. */
  getFullTitle(): string {
    return this.GetFullTitle();
  }

  /**
   * Build the title string based on current context
   * Format: "BaseTitle - AppName - ResourceName" (with optional parts)
   */
  private buildTitle(): string {
    const parts: string[] = [];

    // Resource name first for better visibility in browser tabs (most specific first)
    if (this.currentResourceName) {
      parts.push(this.currentResourceName);
    }

    // App name next
    if (this.currentAppName) {
      parts.push(this.currentAppName);
    }

    // Base title last (least specific)
    parts.push(this.baseTitle);

    return parts.join(' - ');
  }

  /**
   * Update the browser tab title
   */
  private updateTitle(): void {
    const title = this.buildTitle();
    this.titleService.setTitle(title);
  }
}
