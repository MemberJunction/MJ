import { Observable, Subject } from 'rxjs';
import { UUIDsEqual } from '@memberjunction/global';
import {
  DEFAULT_ARTIFACT_WORKSPACE_CONFIG,
  type ArtifactWorkspaceOpenPayload,
  type ArtifactWorkspaceRecord,
} from './artifact-workspace-types';

export type ArtifactWorkspaceChange =
  | { Kind: 'added'; InstanceID: string }
  | { Kind: 'updated'; InstanceID: string }
  | { Kind: 'removed'; InstanceID: string }
  | { Kind: 'active'; InstanceID: string | null }
  | { Kind: 'refresh'; ArtifactID: string; VersionNumber: number };

/**
 * In-memory workspace tab engine with LRU eviction for the `ArtifactWorkspace`
 * realtime channel. Mirrors `ComponentInstanceEngine` without component-spec assumptions.
 */
export class ArtifactWorkspaceEngine {
  private readonly records = new Map<string, ArtifactWorkspaceRecord>();
  private readonly changedSubject = new Subject<ArtifactWorkspaceChange>();
  private readonly refreshTriggerSubject = new Subject<{ artifactId: string; versionNumber: number }>();
  private activeId: string | null = null;
  private instanceSeq = 0;

  public constructor(private maxInstances: number = DEFAULT_ARTIFACT_WORKSPACE_CONFIG.MaxInstances) {}

  public readonly Changed$: Observable<ArtifactWorkspaceChange> = this.changedSubject.asObservable();
  public readonly RefreshTrigger$: Subject<{ artifactId: string; versionNumber: number }> =
    this.refreshTriggerSubject;

  public get Instances(): readonly ArtifactWorkspaceRecord[] {
    return [...this.records.values()];
  }

  public get ActiveID(): string | null {
    return this.activeId;
  }

  public SetMaxInstances(maxInstances: number): void {
    if (Number.isFinite(maxInstances) && maxInstances >= 1) {
      this.maxInstances = Math.min(Math.floor(maxInstances), 12);
    }
  }

  public Get(instanceId: string): ArtifactWorkspaceRecord | undefined {
    return this.records.get(instanceId);
  }

  public FindByArtifact(artifactId: string): ArtifactWorkspaceRecord | undefined {
    for (const record of this.records.values()) {
      if (UUIDsEqual(record.ArtifactID, artifactId)) {
        return record;
      }
    }
    return undefined;
  }

  public AddOrFocus(payload: ArtifactWorkspaceOpenPayload): ArtifactWorkspaceRecord {
    const existing = this.FindByArtifact(payload.ArtifactID);
    if (existing) {
      let updated = false;
      if (payload.Name && payload.Name !== existing.Name) {
        existing.Name = payload.Name;
        updated = true;
      }
      if (payload.ArtifactVersionID && payload.ArtifactVersionID !== existing.ArtifactVersionID) {
        existing.ArtifactVersionID = payload.ArtifactVersionID;
        updated = true;
      }
      if (
        typeof payload.VersionNumber === 'number' &&
        payload.VersionNumber > 0 &&
        payload.VersionNumber !== existing.VersionNumber
      ) {
        existing.VersionNumber = payload.VersionNumber;
        updated = true;
      }
      if (payload.ArtifactTypeName && !existing.ArtifactTypeName) {
        existing.ArtifactTypeName = payload.ArtifactTypeName;
      }
      if (payload.DriverClass && !existing.DriverClass) {
        existing.DriverClass = payload.DriverClass;
      }
      if (typeof payload.CanEdit === 'boolean' && payload.CanEdit !== existing.CanEdit) {
        existing.CanEdit = payload.CanEdit;
        updated = true;
      }
      existing.LastUpdatedAt = Date.now();
      this.SetActive(existing.InstanceID);
      if (updated) {
        this.changedSubject.next({ Kind: 'updated', InstanceID: existing.InstanceID });
        this.TriggerRefresh(existing.ArtifactID, existing.VersionNumber ?? 1);
      }
      return existing;
    }

    if (this.records.size >= this.maxInstances) {
      this.evictLeastRecentlyUsed();
    }

    this.instanceSeq += 1;
    const instanceId = `w${this.instanceSeq}`;
    const record: ArtifactWorkspaceRecord = {
      InstanceID: instanceId,
      ArtifactID: payload.ArtifactID,
      ArtifactVersionID: payload.ArtifactVersionID,
      VersionNumber: payload.VersionNumber,
      Name: payload.Name || 'Untitled Artifact',
      ArtifactTypeName: payload.ArtifactTypeName,
      DriverClass: payload.DriverClass,
      CanEdit: payload.CanEdit,
      LastUpdatedAt: Date.now(),
    };
    this.records.set(instanceId, record);
    this.activeId = instanceId;
    this.changedSubject.next({ Kind: 'added', InstanceID: instanceId });
    return record;
  }

  public SwapVersion(
    instanceId: string,
    versionId: string,
    versionNumber?: number,
    name?: string,
  ): ArtifactWorkspaceRecord | undefined {
    const record = this.records.get(instanceId);
    if (!record) {
      return undefined;
    }
    record.ArtifactVersionID = versionId;
    if (typeof versionNumber === 'number' && versionNumber > 0) {
      record.VersionNumber = versionNumber;
    }
    if (name) {
      record.Name = name;
    }
    record.LastUpdatedAt = Date.now();
    this.changedSubject.next({ Kind: 'updated', InstanceID: instanceId });
    this.TriggerRefresh(record.ArtifactID, record.VersionNumber ?? 1);
    return record;
  }

  /**
   * Updates metadata/permissions on an already-open tab (e.g. after session state re-hydration)
   * without triggering a full version reload unless version fields changed.
   */
  public UpdateRecordMetadata(
    instanceId: string,
    patch: Partial<
      Pick<
        ArtifactWorkspaceRecord,
        'ArtifactVersionID' | 'VersionNumber' | 'Name' | 'ArtifactTypeName' | 'DriverClass' | 'CanEdit'
      >
    >,
  ): ArtifactWorkspaceRecord | undefined {
    const record = this.records.get(instanceId);
    if (!record) {
      return undefined;
    }
    let changed = false;
    if (patch.ArtifactVersionID !== undefined && patch.ArtifactVersionID !== record.ArtifactVersionID) {
      record.ArtifactVersionID = patch.ArtifactVersionID;
      changed = true;
    }
    if (typeof patch.VersionNumber === 'number' && patch.VersionNumber > 0 && patch.VersionNumber !== record.VersionNumber) {
      record.VersionNumber = patch.VersionNumber;
      changed = true;
    }
    if (patch.Name && patch.Name !== record.Name) {
      record.Name = patch.Name;
      changed = true;
    }
    if (patch.ArtifactTypeName && patch.ArtifactTypeName !== record.ArtifactTypeName) {
      record.ArtifactTypeName = patch.ArtifactTypeName;
      changed = true;
    }
    if (patch.DriverClass && patch.DriverClass !== record.DriverClass) {
      record.DriverClass = patch.DriverClass;
      changed = true;
    }
    if (typeof patch.CanEdit === 'boolean' && patch.CanEdit !== record.CanEdit) {
      record.CanEdit = patch.CanEdit;
      changed = true;
    }
    if (changed) {
      this.changedSubject.next({ Kind: 'updated', InstanceID: instanceId });
    }
    return record;
  }

  public TriggerRefresh(artifactId: string, versionNumber?: number): void {
    const record = this.FindByArtifact(artifactId);
    const effectiveVersion = versionNumber ?? record?.VersionNumber ?? 1;
    this.refreshTriggerSubject.next({
      artifactId,
      versionNumber: effectiveVersion,
    });
    this.changedSubject.next({
      Kind: 'refresh',
      ArtifactID: artifactId,
      VersionNumber: effectiveVersion,
    });
  }

  public SetActive(instanceId: string | null): void {
    if (instanceId !== null && !this.records.has(instanceId)) {
      return;
    }
    if (instanceId) {
      const rec = this.records.get(instanceId);
      if (rec) {
        rec.LastUpdatedAt = Date.now();
      }
    }
    if (this.activeId !== instanceId) {
      this.activeId = instanceId;
      this.changedSubject.next({ Kind: 'active', InstanceID: instanceId });
    }
  }

  public Remove(instanceId: string): boolean {
    if (!this.records.delete(instanceId)) {
      return false;
    }
    this.changedSubject.next({ Kind: 'removed', InstanceID: instanceId });
    if (this.activeId === instanceId) {
      const remaining = [...this.records.values()];
      this.activeId = remaining.length > 0 ? remaining[remaining.length - 1].InstanceID : null;
      this.changedSubject.next({ Kind: 'active', InstanceID: this.activeId });
    }
    return true;
  }

  public Dispose(): void {
    this.records.clear();
    this.activeId = null;
    this.changedSubject.complete();
    this.refreshTriggerSubject.complete();
  }

  private evictLeastRecentlyUsed(): void {
    let oldest: ArtifactWorkspaceRecord | null = null;
    for (const rec of this.records.values()) {
      if (rec.InstanceID === this.activeId && this.records.size > 1) {
        continue;
      }
      if (!oldest || rec.LastUpdatedAt < oldest.LastUpdatedAt) {
        oldest = rec;
      }
    }
    if (oldest) {
      this.Remove(oldest.InstanceID);
    }
  }
}
