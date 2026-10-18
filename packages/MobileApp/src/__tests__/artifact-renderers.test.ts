import { describe, expect, it, beforeAll } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseMobileArtifactRenderer,
    ResolveMobileArtifactRenderer,
} from '@/artifacts/BaseMobileArtifactRenderer';
import { IsDataArtifact } from '@/artifacts/renderers/data-artifact-match';

/**
 * Which component renders an artifact.
 *
 * This app used to answer that with a `classify()` heuristic: sniff the type name, then sniff the
 * content, and produce a `kind` the web has no concept of. It worked for the shapes it knew and had
 * no way to be extended — an artifact type added to MJ metadata could not reach a renderer without
 * someone editing the heuristic. The registry mirrors `ng-conversations`' plugin resolution so the
 * two surfaces cannot answer this question differently.
 */

/** A renderer for a type nothing else claims, so these tests never depend on shipped ones. */
@RegisterClass(BaseMobileArtifactRenderer, 'TestOnlyType')
class TestOnlyRenderer extends BaseMobileArtifactRenderer {
    public static override CanHandle(typeName: string, contentType?: string): boolean {
        return typeName === 'TestOnlyType' || contentType === 'application/vnd.test-only';
    }
    public get Component() {
        return function TestOnlyView() { return null; };
    }
}

/** A higher-priority renderer for the same type — registered later, so it must win. */
@RegisterClass(BaseMobileArtifactRenderer, 'TestOnlyType')
class TestOnlyOverride extends BaseMobileArtifactRenderer {
    public static override CanHandle(typeName: string): boolean {
        return typeName === 'TestOnlyType';
    }
    public get Component() {
        return function TestOnlyOverrideView() { return null; };
    }
}

beforeAll(() => {
    // `@RegisterClass` is a module side effect; referencing the classes keeps them in the bundle.
    void TestOnlyRenderer;
    void TestOnlyOverride;
});

describe('ResolveMobileArtifactRenderer', () => {
    it('resolves a renderer by artifact type name', () => {
        expect(ResolveMobileArtifactRenderer('TestOnlyType')).not.toBeNull();
    });

    it('resolves by content type when the type name is unfamiliar', () => {
        // An artifact written with the right MIME type but an unexpected type name still renders,
        // which is the whole reason CanHandle takes both.
        expect(ResolveMobileArtifactRenderer('Something Else', 'application/vnd.test-only')).not.toBeNull();
    });

    it('returns null when nothing claims the artifact, so the caller can fall back', () => {
        expect(ResolveMobileArtifactRenderer('No Such Artifact Type Exists')).toBeNull();
    });

    it('returns null when given neither a type nor a content type', () => {
        expect(ResolveMobileArtifactRenderer(null, null)).toBeNull();
        expect(ResolveMobileArtifactRenderer(undefined)).toBeNull();
    });

    it('lets a later registration override an earlier one for the same type', () => {
        // This is what allows a host to replace a shipped renderer — the same override rule the web
        // resolver applies, and the reason both walk in ascending priority with a >= comparison.
        const resolved = ResolveMobileArtifactRenderer('TestOnlyType');
        expect(resolved?.name).toBe('TestOnlyOverrideView');
    });
});

describe('the Data renderer\'s match rule', () => {
    it('claims the query builder\'s output by name and by content type', () => {
        expect(IsDataArtifact('Data')).toBe(true);
        expect(IsDataArtifact('Data Snapshot')).toBe(true);
        expect(IsDataArtifact('  data  ')).toBe(true);
        expect(IsDataArtifact('', 'application/vnd.mj.data')).toBe(true);
        expect(IsDataArtifact(null, 'application/vnd.mj.data-snapshot')).toBe(true);
    });

    it('does not claim artifacts belonging to other renderers', () => {
        // Component in particular: executable agent-authored code is a separate problem with its
        // own safety surface, and is deliberately left on the existing path.
        for (const t of ['Image', 'Component', 'Markdown Document', 'HTML', 'PDF', 'JSON', 'CSV']) {
            expect(IsDataArtifact(t), t).toBe(false);
        }
    });

    it('claims nothing when given nothing', () => {
        expect(IsDataArtifact(null)).toBe(false);
        expect(IsDataArtifact(undefined, undefined)).toBe(false);
        expect(IsDataArtifact('   ', '   ')).toBe(false);
    });
});
