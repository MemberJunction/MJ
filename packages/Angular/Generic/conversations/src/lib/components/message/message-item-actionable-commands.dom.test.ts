import { describe, it, expect } from 'vitest';
import type { ActionableCommand } from '@memberjunction/ai-core-plus';
import type { MJArtifactEntity, MJArtifactVersionEntity, MJConversationDetailEntity } from '@memberjunction/core-entities';
import {
  FilterRedundantArtifactCommands,
  MessageItemComponent,
  type MessageArtifactRef,
  type MessagePendingArtifactRef,
} from './message-item.component';

function makeArtifactRef(artifactId: string, versionId: string, name: string): MessageArtifactRef {
  return {
    artifact: { ID: artifactId, Name: name } as Partial<MJArtifactEntity> as MJArtifactEntity,
    version: { ID: versionId, ArtifactID: artifactId, Name: `${name} v1`, VersionNumber: 1 } as Partial<MJArtifactVersionEntity> as MJArtifactVersionEntity,
  };
}

const ARTIFACT_ID = '11111111-1111-4111-8111-111111111111';
const VERSION_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_DASHBOARD_ID = '33333333-3333-4333-8333-333333333333';
const OTHER_QUERY_ID = '44444444-4444-4444-8444-444444444444';

describe('FilterRedundantArtifactCommands & MessageItemComponent.ActionableCommands', () => {
  it('suppresses open:resource commands targeting attached Artifact or File resources', () => {
    const commands: ActionableCommand[] = [
      { type: 'open:resource', label: 'Open Document', resourceType: 'Artifact', resourceId: ARTIFACT_ID.toUpperCase() },
      { type: 'open:resource', label: 'Open File', resourceType: 'File', resourceId: VERSION_ID },
      { type: 'open:resource', label: 'Open Untitled', resourceType: 'Artifact', resourceId: 'My Project Plan' },
      { type: 'open:resource', label: 'Open Empty', resourceType: 'Artifact', resourceId: '' },
      { type: 'open:resource', label: 'Open Sales Query', resourceType: 'Query', resourceId: OTHER_QUERY_ID },
    ];
    const result = FilterRedundantArtifactCommands(commands, [makeArtifactRef(ARTIFACT_ID, VERSION_ID, 'My Project Plan')]);
    expect(result).toEqual([
      { type: 'open:resource', label: 'Open Sales Query', resourceType: 'Query', resourceId: OTHER_QUERY_ID },
    ]);
  });

  it('suppresses Report/Dashboard placeholder or matching artifact links while preserving real Dashboard UUID links and distinct names', () => {
    const commands: ActionableCommand[] = [
      { type: 'open:resource', label: 'Open Placeholder', resourceType: 'Report', resourceId: '' },
      { type: 'open:resource', label: 'Open Matching Name', resourceType: 'Report', resourceId: 'Architecture Doc' },
      { type: 'open:resource', label: 'Open Q4 Report', resourceType: 'Report', resourceId: 'Q4 Financial Report' },
      { type: 'open:resource', label: 'Open Spec', resourceType: 'Dashboard', resourceId: ARTIFACT_ID },
      { type: 'open:resource', label: 'Open Revenue Dashboard', resourceType: 'Dashboard', resourceId: OTHER_DASHBOARD_ID },
      { type: 'open:resource', label: 'Open Named Dashboard', resourceType: 'Dashboard', resourceId: 'Executive Sales Dashboard' },
      { type: 'open:url', label: 'Docs', url: 'https://example.com' },
    ];
    const result = FilterRedundantArtifactCommands(commands, [makeArtifactRef(ARTIFACT_ID, VERSION_ID, 'Architecture Doc')]);
    expect(result).toEqual([
      { type: 'open:resource', label: 'Open Q4 Report', resourceType: 'Report', resourceId: 'Q4 Financial Report' },
      { type: 'open:resource', label: 'Open Revenue Dashboard', resourceType: 'Dashboard', resourceId: OTHER_DASHBOARD_ID },
      { type: 'open:resource', label: 'Open Named Dashboard', resourceType: 'Dashboard', resourceId: 'Executive Sales Dashboard' },
      { type: 'open:url', label: 'Docs', url: 'https://example.com' },
    ]);
  });

  it('suppresses redundant commands while artifacts are still in PendingArtifacts state', () => {
    const pending: MessagePendingArtifactRef[] = [
      { artifactId: ARTIFACT_ID, artifactName: 'Q4 Summary', visibility: 'Always' },
    ];
    const commands: ActionableCommand[] = [
      { type: 'open:resource', label: 'Open Document', resourceType: 'Artifact', resourceId: ARTIFACT_ID },
      { type: 'open:resource', label: 'View Record', resourceType: 'Record', entityName: 'Accounts', resourceId: OTHER_DASHBOARD_ID },
    ];
    const result = FilterRedundantArtifactCommands(commands, [], pending);
    expect(result).toEqual([
      { type: 'open:resource', label: 'View Record', resourceType: 'Record', entityName: 'Accounts', resourceId: OTHER_DASHBOARD_ID },
    ]);
  });

  it('keeps Artifact/File commands when the message has no attached artifact cards', () => {
    const commands: ActionableCommand[] = [
      { type: 'open:resource', label: 'Open Document', resourceType: 'Artifact', resourceId: ARTIFACT_ID },
    ];
    expect(FilterRedundantArtifactCommands(commands, [], [])).toEqual(commands);
  });

  it('memoizes MessageItemComponent.ActionableCommands and invalidates when DisplayArtifacts load later', () => {
    const item = Object.create(MessageItemComponent.prototype) as MessageItemComponent;
    item.message = {
      ID: 'msg-1',
      ActionableCommands: JSON.stringify([
        { type: 'open:resource', label: 'Open Document', resourceType: 'Artifact', resourceId: ARTIFACT_ID },
        { type: 'open:url', label: 'Reference', url: 'https://example.com' },
      ]),
    } as Partial<MJConversationDetailEntity> as MJConversationDetailEntity;
    item.artifacts = [];
    item.PendingArtifacts = [];

    const beforeFirst = item.ActionableCommands;
    const beforeSecond = item.ActionableCommands;
    expect(beforeFirst).toBe(beforeSecond);
    expect(beforeFirst).toHaveLength(2);

    // Simulate async artifact arrival
    item.artifacts = [makeArtifactRef(ARTIFACT_ID, VERSION_ID, 'Markdown Document')];
    const afterFirst = item.ActionableCommands;
    const afterSecond = item.ActionableCommands;
    expect(afterFirst).toBe(afterSecond);
    expect(afterFirst).toEqual([{ type: 'open:url', label: 'Reference', url: 'https://example.com' }]);
  });
});
