import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { IMetadataProvider, UserInfo } from '@memberjunction/core';
import { UserInfoEngine } from '@memberjunction/core-entities';
import { UUIDsEqual } from '@memberjunction/global';
import type { ArtifactVersionSavedEvent } from '../components/artifact-viewer-panel.component';

/** User setting key storing the slideover maximize preference in `UserInfoEngine`. */
export const ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY = 'MJ.Artifacts.Slideover.Maximized';

/** Request payload accepted by {@link MJArtifactSlideoverService.Open}. */
export interface ArtifactSlideoverOpenRequest {
  ArtifactID: string;
  VersionNumber?: number;
  CurrentUser?: UserInfo;
  EnvironmentId?: string;
  CanEdit?: boolean;
  CanShare?: boolean;
  Title?: string;
  Provider?: IMetadataProvider | null;
  OnVersionSaved?: (event: ArtifactVersionSavedEvent) => void;
}

/** Navigation payload passed to {@link MJArtifactSlideoverService.NavigateToLink}. */
export interface ArtifactSlideoverNavigateLinkPayload {
  Type: 'artifact' | 'conversation' | 'collection' | 'record';
  ArtifactID?: string;
  VersionNumber?: number;
  EntityName?: string;
  RecordID?: string;
  ID?: string;
  Title?: string;
  CanEdit?: boolean;
  CanShare?: boolean;
}

/** Immutable snapshot of slideover visibility, maximize state, and navigation stack. */
export interface ArtifactSlideoverState {
  IsOpen: boolean;
  IsMaximized: boolean;
  CurrentRequest: ArtifactSlideoverOpenRequest | null;
  HistoryStack: ReadonlyArray<ArtifactSlideoverOpenRequest>;
  ExternalNavigationEvent: ArtifactSlideoverNavigateLinkPayload | null;
}

const INITIAL_SLIDEOVER_STATE: ArtifactSlideoverState = {
  IsOpen: false,
  IsMaximized: false,
  CurrentRequest: null,
  HistoryStack: [],
  ExternalNavigationEvent: null,
};

/**
 * Root Angular singleton service coordinating `<mj-artifact-slideover>` open/close state,
 * maximize persistence via `UserInfoEngine.Instance` (never browser web storage), and
 * `NavigateToLink` artifact-to-artifact navigation chaining with back-stack history.
 */
@Injectable({ providedIn: 'root' })
export class MJArtifactSlideoverService {
  private readonly stateSubject = new BehaviorSubject<ArtifactSlideoverState>(INITIAL_SLIDEOVER_STATE);
  private readonly externalNavigationSubject = new Subject<ArtifactSlideoverNavigateLinkPayload>();
  private readonly versionSavedSubject = new Subject<ArtifactVersionSavedEvent>();
  private hasHydratedMaximizePreference = false;

  /** Reactive stream of slideover state snapshots. */
  public readonly State$: Observable<ArtifactSlideoverState> = this.stateSubject.asObservable();

  /** Emits when `NavigateToLink` targets a non-artifact record, conversation, or collection. */
  public readonly ExternalNavigation$: Observable<ArtifactSlideoverNavigateLinkPayload> =
    this.externalNavigationSubject.asObservable();

  /** Emits whenever the active slideover artifact saves a new version. */
  public readonly VersionSaved$: Observable<ArtifactVersionSavedEvent> = this.versionSavedSubject.asObservable();

  /** Current immutable slideover state snapshot. */
  public get CurrentState(): ArtifactSlideoverState {
    return this.stateSubject.value;
  }

  /** Whether the slideover drawer is currently open. */
  public get IsOpen(): boolean {
    return this.stateSubject.value.IsOpen;
  }

  /** Whether the slideover drawer is currently expanded to maximized width. */
  public get IsMaximized(): boolean {
    return this.stateSubject.value.IsMaximized;
  }

  /** Active open request when open, or `null` when closed. */
  public get CurrentRequest(): ArtifactSlideoverOpenRequest | null {
    return this.stateSubject.value.CurrentRequest;
  }

  /** Whether there is at least one previous artifact in the chained navigation stack. */
  public get CanGoBack(): boolean {
    return this.stateSubject.value.HistoryStack.length > 0;
  }

  /** Number of entries currently stored in the navigation back-stack. */
  public get HistoryCount(): number {
    return this.stateSubject.value.HistoryStack.length;
  }

  /**
   * Opens the slideover for a specific artifact, resetting the navigation history stack
   * and hydrating the persisted maximize preference from `UserInfoEngine.Instance`.
   */
  public Open(request: ArtifactSlideoverOpenRequest): void {
    const artifactId = (request?.ArtifactID ?? '').trim();
    if (!artifactId) {
      return;
    }

    const maximized = this.resolveInitialMaximizedState();
    const normalized: ArtifactSlideoverOpenRequest = {
      ...request,
      ArtifactID: artifactId,
    };

    this.stateSubject.next({
      IsOpen: true,
      IsMaximized: maximized,
      CurrentRequest: normalized,
      HistoryStack: [],
      ExternalNavigationEvent: null,
    });
  }

  /** Closes the slideover and clears active request and chained history. */
  public Close(): void {
    const current = this.stateSubject.value;
    if (!current.IsOpen && current.CurrentRequest === null && current.HistoryStack.length === 0) {
      return;
    }
    this.stateSubject.next({
      IsOpen: false,
      IsMaximized: current.IsMaximized,
      CurrentRequest: null,
      HistoryStack: [],
      ExternalNavigationEvent: null,
    });
  }

  /** Toggles maximized width and persists the preference via `UserInfoEngine.Instance`. */
  public ToggleMaximize(): void {
    this.SetMaximized(!this.stateSubject.value.IsMaximized);
  }

  /** Explicitly sets maximized width and persists the preference via `UserInfoEngine.Instance`. */
  public SetMaximized(maximized: boolean): void {
    const next = Boolean(maximized);
    this.hasHydratedMaximizePreference = true;
    const current = this.stateSubject.value;
    if (current.IsMaximized !== next) {
      this.stateSubject.next({
        ...current,
        IsMaximized: next,
      });
    }
    this.persistMaximizedPreference(next);
  }

  /**
   * Handles a link activation emitted from inside the active artifact viewer.
   *
   * - If the target resolves to an artifact (`Type === 'artifact'` or `ArtifactID` is populated),
   *   pushes the current artifact onto `HistoryStack` and chains into the target artifact.
   *   Returns `true`.
   * - Otherwise emits the link on {@link ExternalNavigation$} so the host surface can route it.
   *   Returns `false`.
   */
  public NavigateToLink(link: ArtifactSlideoverNavigateLinkPayload): boolean {
    const targetArtifactId = this.extractTargetArtifactId(link);
    if (!targetArtifactId) {
      this.stateSubject.next({
        ...this.stateSubject.value,
        ExternalNavigationEvent: link,
      });
      this.externalNavigationSubject.next(link);
      return false;
    }

    const current = this.stateSubject.value;
    const nextHistory = this.buildNextHistoryStack(current, targetArtifactId, link.VersionNumber);
    const baseRequest = current.CurrentRequest;

    const chainedRequest: ArtifactSlideoverOpenRequest = {
      ArtifactID: targetArtifactId,
      VersionNumber: link.VersionNumber,
      CurrentUser: baseRequest?.CurrentUser,
      EnvironmentId: baseRequest?.EnvironmentId,
      Provider: baseRequest?.Provider,
      CanEdit: link.CanEdit ?? false,
      CanShare: link.CanShare ?? false,
      Title: link.Title,
    };

    this.stateSubject.next({
      IsOpen: true,
      IsMaximized: current.IsMaximized,
      CurrentRequest: chainedRequest,
      HistoryStack: nextHistory,
      ExternalNavigationEvent: null,
    });
    return true;
  }

  /** Navigates back to the previous artifact in the chained history stack. Returns `false` if empty. */
  public GoBack(): boolean {
    const current = this.stateSubject.value;
    if (current.HistoryStack.length === 0) {
      return false;
    }

    const previous = current.HistoryStack[current.HistoryStack.length - 1];
    const remaining = current.HistoryStack.slice(0, current.HistoryStack.length - 1);
    this.stateSubject.next({
      ...current,
      IsOpen: true,
      CurrentRequest: previous,
      HistoryStack: remaining,
      ExternalNavigationEvent: null,
    });
    return true;
  }

  /** Forwards a persisted version-saved event to the active request callback and {@link VersionSaved$}. */
  public NotifyVersionSaved(event: ArtifactVersionSavedEvent): void {
    const callback = this.stateSubject.value.CurrentRequest?.OnVersionSaved;
    if (callback) {
      callback(event);
    }
    this.versionSavedSubject.next(event);
  }

  private extractTargetArtifactId(link: ArtifactSlideoverNavigateLinkPayload | null | undefined): string {
    if (!link) {
      return '';
    }
    if (link.ArtifactID?.trim()) {
      return link.ArtifactID.trim();
    }
    if (link.Type === 'artifact' && link.ID?.trim()) {
      return link.ID.trim();
    }
    if (
      link.Type === 'record' &&
      link.EntityName?.trim().toLowerCase() === 'mj: artifacts' &&
      link.RecordID?.trim()
    ) {
      return link.RecordID.trim();
    }
    return '';
  }

  private buildNextHistoryStack(
    current: ArtifactSlideoverState,
    targetArtifactId: string,
    targetVersionNumber: number | undefined,
  ): ArtifactSlideoverOpenRequest[] {
    if (!current.IsOpen || !current.CurrentRequest) {
      return [...current.HistoryStack];
    }
    const isSameArtifact =
      UUIDsEqual(current.CurrentRequest.ArtifactID, targetArtifactId) &&
      current.CurrentRequest.VersionNumber === targetVersionNumber;
    if (isSameArtifact) {
      return [...current.HistoryStack];
    }
    return [...current.HistoryStack, current.CurrentRequest];
  }

  private resolveInitialMaximizedState(): boolean {
    if (this.hasHydratedMaximizePreference) {
      return this.stateSubject.value.IsMaximized;
    }
    this.hasHydratedMaximizePreference = true;
    try {
      const saved = UserInfoEngine.Instance?.GetSetting(ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY);
      if (saved === 'true') {
        return true;
      }
      if (saved === 'false') {
        return false;
      }
    } catch {
      // UserInfoEngine may not be initialized in isolated test or pre-boot contexts.
    }
    return this.stateSubject.value.IsMaximized;
  }

  private persistMaximizedPreference(maximized: boolean): void {
    try {
      UserInfoEngine.Instance?.SetSettingDebounced(
        ARTIFACT_SLIDEOVER_MAXIMIZED_SETTING_KEY,
        String(maximized),
      );
    } catch {
      // Best-effort preference persistence when UserInfoEngine is not yet configured.
    }
  }
}
