// The plugin imports Angular surface components (partial-compiled Angular libs require
// the JIT compiler in this node test environment), so load the compiler FIRST.
import '@angular/compiler';
import { describe, it, expect } from 'vitest';
import { MJGlobal } from '@memberjunction/global';
import { BaseArtifactViewerPluginComponent } from '@memberjunction/ng-artifacts';
import { MJArtifactVersionEntity } from '@memberjunction/core-entities';
import { ParseBoardStateJson, WhiteboardState } from '@memberjunction/ng-whiteboard';
import { WhiteboardArtifactViewerComponent, LoadWhiteboardArtifactViewer } from '../lib/components/realtime/whiteboard/whiteboard-artifact-viewer.component';

/**
 * The whiteboard ARTIFACT VIEWER plugin + read-only snapshot helper — the pure
 * ParseBoardStateJson parse contract (tolerant of malformed payloads), the ClassFactory
 * registration the artifact plugin host resolves by DriverClass, and the plugin's
 * content-driven state (hasDisplayContent / GetCurrentStateSnapshot) using a STRUCTURAL
 * fake artifact version (the real entity requires a metadata provider).
 */

/** Build a persisted board payload with one agent note + one user text item. */
function buildBoardJson(): string {
  const state = new WhiteboardState();
  state.AddItem({ Kind: 'sticky', X: 10, Y: 20, Text: 'agent note' }, 'agent');
  state.AddItem({ Kind: 'text', X: 100, Y: 40, Text: 'user label' }, 'user');
  return state.ToJSON();
}

/** Structural stand-in for the artifact version (plugin only reads Content + Name). */
function fakeVersion(content: string | null, name: string | null = null): MJArtifactVersionEntity {
  return { Content: content, Name: name } as unknown as MJArtifactVersionEntity;
}

describe('ParseBoardStateJson — tolerant parse of persisted board payloads', () => {
  it('round-trips ToJSON output into a rehydrated WhiteboardState', () => {
    const parsed = ParseBoardStateJson(buildBoardJson());
    expect(parsed).toBeInstanceOf(WhiteboardState);
    expect(parsed?.ElementCount).toBe(2);
    expect(parsed?.CountByAuthor('agent')).toBe(1);
    expect(parsed?.CountByAuthor('user')).toBe(1);
  });

  it('returns null for empty / null / whitespace input', () => {
    expect(ParseBoardStateJson(null)).toBeNull();
    expect(ParseBoardStateJson(undefined)).toBeNull();
    expect(ParseBoardStateJson('')).toBeNull();
    expect(ParseBoardStateJson('   ')).toBeNull();
  });

  it('returns null for non-JSON input instead of throwing', () => {
    expect(ParseBoardStateJson('not json at all {')).toBeNull();
  });

  it('returns null for valid JSON of the wrong shape (no items array)', () => {
    expect(ParseBoardStateJson('{"foo": 1}')).toBeNull();
    expect(ParseBoardStateJson('"just a string"')).toBeNull();
  });
});

describe('WhiteboardArtifactViewerComponent — plugin contract', () => {
  it('is resolvable from the ClassFactory by its DriverClass key', () => {
    LoadWhiteboardArtifactViewer();
    const registration = MJGlobal.Instance.ClassFactory.GetRegistration(BaseArtifactViewerPluginComponent, 'WhiteboardArtifactViewerPlugin');
    expect(registration).toBeTruthy();
    expect(registration?.SubClass).toBe(WhiteboardArtifactViewerComponent);

    // the artifact plugin host instantiates with a bare `new` (outside an Angular
    // injection context) to discover the component type — that path must not throw
    const instance = MJGlobal.Instance.ClassFactory.CreateInstance<BaseArtifactViewerPluginComponent>(
      BaseArtifactViewerPluginComponent, 'WhiteboardArtifactViewerPlugin'
    );
    expect(instance).toBeInstanceOf(WhiteboardArtifactViewerComponent);
  });

  it('exposes board-driven display state: content parses → hasDisplayContent true', () => {
    const viewer = new WhiteboardArtifactViewerComponent();
    viewer.artifactVersion = fakeVersion(buildBoardJson(), 'Sprint Board');

    expect(viewer.HasBoard).toBe(true);
    expect(viewer.hasDisplayContent).toBe(true);
    expect(viewer.ContentJson).toBe(viewer.artifactVersion.Content);
    expect(viewer.BoardState?.ElementCount).toBe(2);
  });

  it('malformed / missing content → no board, no display content, null snapshot', () => {
    const viewer = new WhiteboardArtifactViewerComponent();
    viewer.artifactVersion = fakeVersion('{"broken":');

    expect(viewer.HasBoard).toBe(false);
    expect(viewer.hasDisplayContent).toBe(false);
    expect(viewer.GetCurrentStateSnapshot()).toBeNull();
  });

  it('re-parses when the artifact version content changes (memo keyed by content)', () => {
    const viewer = new WhiteboardArtifactViewerComponent();
    viewer.artifactVersion = fakeVersion(buildBoardJson());
    const first = viewer.BoardState;
    expect(first).toBe(viewer.BoardState); // memoized — same instance for same content

    const single = new WhiteboardState();
    single.AddItem({ Kind: 'text', X: 0, Y: 0, Text: 'v2' }, 'user');
    viewer.artifactVersion = fakeVersion(single.ToJSON());
    expect(viewer.BoardState).not.toBe(first);
    expect(viewer.BoardState?.ElementCount).toBe(1);
  });

  it('GetCurrentStateSnapshot reports the board scene: title, summary, element counts', () => {
    const viewer = new WhiteboardArtifactViewerComponent();
    viewer.artifactVersion = fakeVersion(buildBoardJson(), 'Sprint Board');

    const snap = viewer.GetCurrentStateSnapshot();
    expect(snap).not.toBeNull();
    expect(snap?.title).toBe('Sprint Board');
    expect(snap?.interpretation).toContain('2 elements');
    expect(snap?.custom?.['elementCounts']).toMatchObject({ total: 2, user: 1, agent: 1 });
  });

  it('falls back to a generic title when the artifact version has no name', () => {
    const viewer = new WhiteboardArtifactViewerComponent();
    viewer.artifactVersion = fakeVersion(buildBoardJson());
    expect(viewer.GetCurrentStateSnapshot()?.title).toBe('Whiteboard');
  });
});
