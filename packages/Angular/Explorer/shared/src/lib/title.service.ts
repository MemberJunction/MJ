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
  setBaseTitle(title: string): void {
    this.baseTitle = title;
    this.updateTitle();
  }

  /**
   * Get the current base title
   */
  getBaseTitle(): string {
    return this.baseTitle;
  }

  /**
   * Set the current app name (e.g., "Sales", "Marketing")
   * Pass null to clear the app context
   */
  setAppName(appName: string | null): void {
    this.currentAppName = appName;
    this.updateTitle();
  }

  /**
   * Get the current app name
   */
  getAppName(): string | null {
    return this.currentAppName;
  }

  /**
   * Set the current resource/page name (e.g., "Accounts", "Contact: John Doe")
   * Pass null to show only the app name
   */
  setResourceName(resourceName: string | null): void {
    this.currentResourceName = resourceName;
    this.updateTitle();
  }

  /**
   * Get the current resource name
   */
  getResourceName(): string | null {
    return this.currentResourceName;
  }

  /**
   * Set both app and resource in one call
   */
  setContext(appName: string | null, resourceName: string | null): void {
    this.currentAppName = appName;
    this.currentResourceName = resourceName;
    this.updateTitle();
  }

  /**
   * Reset to just the base title
   */
  reset(): void {
    this.currentAppName = null;
    this.currentResourceName = null;
    this.updateTitle();
  }

  /**
   * Get the full current title
   */
  getFullTitle(): string {
    return this.buildTitle();
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
