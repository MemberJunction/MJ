import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

/**
 * Modifier keys for keyboard shortcuts
 */
export interface KeyModifiers {
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  meta: boolean;
}

/**
 * Represents a keyboard key combination
 */
export interface KeyCombination {
  /** The main key (e.g., "/", "k", "Enter") */
  key: string;
  /** Modifier keys */
  modifiers: KeyModifiers;
}

/**
 * Platform-specific overrides for shortcuts
 */
export interface PlatformOverride {
  mac?: KeyCombination;
  windows?: KeyCombination;
  linux?: KeyCombination;
}

/**
 * Represents a registered keyboard shortcut
 */
export interface KeyboardShortcut {
  /** Unique identifier for the shortcut action */
  id: string;
  /** Human-readable name (e.g., "Open Command Palette") */
  name: string;
  /** Optional description */
  description?: string;
  /** The default keyboard combination */
  combination: KeyCombination;
  /** Platform-specific override (optional) */
  platformOverride?: PlatformOverride;
  /** Whether this can be customized by users */
  customizable: boolean;
  /** The action to execute when shortcut is triggered */
  action: () => void;
}

/**
 * Conflict types
 */
export type ConflictType = 'mj-internal' | 'browser' | 'os';

/**
 * Conflict severity levels
 */
export type ConflictSeverity = 'error' | 'warning';

/**
 * Shortcut conflict information
 */
export interface ShortcutConflict {
  type: ConflictType;
  severity: ConflictSeverity;
  shortcutId?: string;
  shortcutName?: string;
  action?: string;
  message: string;
}

/**
 * Validation result for a key combination
 */
export interface ValidationResult {
  valid: boolean;
  conflicts: ShortcutConflict[];
  warnings: string[];
}

/**
 * Stored configuration format (persisted to UserInfoEngine)
 */
export interface StoredShortcutConfig {
  /** Map of shortcut ID to custom KeyCombination */
  customizations: Record<string, KeyCombination>;
  /** Version for migration purposes */
  version: number;
}

/**
 * Stub implementation of KeyboardShortcutService
 *
 * This is a minimal implementation to support the keyboard shortcuts help UI.
 * Full implementation with registration, customization, and persistence
 * will be added in a future update.
 */
@Injectable({
  providedIn: 'root'
})
export class KeyboardShortcutService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private shortcuts = new Map<string, KeyboardShortcut>();
  private shortcuts$ = new BehaviorSubject<KeyboardShortcut[]>([]);
  private readonly isMac: boolean;

  constructor() {
    this.isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    this.initializeDefaultShortcuts();
  }

  /**
   * Initialize default shortcuts (currently registered in the app)
   */
  private initializeDefaultShortcuts(): void {
    // Register default MJ shortcuts
    this.RegisterShortcut({
      id: 'command-palette',
      name: 'Open Command Palette',
      description: 'Quick access to applications and actions',
      combination: {
        key: '/',
        modifiers: { ctrl: true, alt: false, shift: false, meta: false }
      },
      platformOverride: {
        mac: {
          key: '/',
          modifiers: { ctrl: false, alt: false, shift: false, meta: true }
        }
      },
      customizable: true,
      action: () => {}
    });

    this.RegisterShortcut({
      id: 'keyboard-help',
      name: 'Show Keyboard Shortcuts',
      description: 'Display this help overlay',
      combination: {
        key: '?',
        modifiers: { ctrl: false, alt: false, shift: false, meta: false }
      },
      customizable: true,
      action: () => {}
    });
  }

  /**
   * Get observable stream of all registered shortcuts
   */
  GetShortcuts(): Observable<KeyboardShortcut[]> {
    return this.shortcuts$.asObservable();
  }

  /**
   * Get all shortcuts as array (synchronous)
   */
  GetShortcutsArray(): KeyboardShortcut[] {
    return Array.from(this.shortcuts.values());
  }

  /**
   * Register a keyboard shortcut
   */
  RegisterShortcut(shortcut: KeyboardShortcut): void {
    this.shortcuts.set(shortcut.id, shortcut);
    this.shortcuts$.next(this.GetShortcutsArray());
  }

  /**
   * Unregister a keyboard shortcut
   */
  UnregisterShortcut(id: string): void {
    this.shortcuts.delete(id);
    this.shortcuts$.next(this.GetShortcutsArray());
  }

  /**
   * Handle a keyboard event globally
   */
  HandleKeyboardEvent(event: KeyboardEvent): boolean {
    // Stub implementation - always returns false
    return false;
  }

  /**
   * Set a custom combination for a shortcut (stub)
   */
  async SetCustomShortcut(id: string, combination: KeyCombination): Promise<boolean> {
    // Stub - not yet implemented
    return true;
  }

  /**
   * Reset a shortcut to its default combination (stub)
   */
  async ResetToDefault(id: string): Promise<void> {
    // Stub - not yet implemented
  }

  /**
   * Reset all shortcuts to their default combinations (stub)
   */
  async ResetAll(): Promise<void> {
    // Stub - not yet implemented
  }

  /**
   * Check if a shortcut has been customized (stub)
   */
  IsCustomized(id: string): boolean {
    // Stub - always returns false
    return false;
  }

  /**
   * Validate a key combination (stub)
   */
  ValidateCombination(combination: KeyCombination, excludeId?: string): ValidationResult {
    return {
      valid: true,
      conflicts: [],
      warnings: []
    };
  }

  /**
   * Get the platform-appropriate combination for a shortcut
   */
  GetPlatformCombination(shortcut: KeyboardShortcut): KeyCombination {
    if (!shortcut.platformOverride) {
      return shortcut.combination;
    }

    if (this.isMac && shortcut.platformOverride.mac) {
      return shortcut.platformOverride.mac;
    }

    // For Windows/Linux, use default combination
    return shortcut.combination;
  }

  /**
   * Check if running on Mac platform
   */
  get IsMac(): boolean {
    return this.isMac;
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }
}
