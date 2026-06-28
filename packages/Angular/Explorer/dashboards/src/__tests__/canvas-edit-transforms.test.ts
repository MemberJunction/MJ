import { describe, it, expect, beforeEach } from 'vitest';
import type {
    FormCanvasElement,
    FormCanvasModel,
    FormCanvasSection,
} from '../ComponentStudio/services/form-canvas-model';
import {
    addFieldToCanvas,
    addSectionToCanvas,
    buildCanvasEditClientTools,
    collectFieldNames,
    findElement,
    findSection,
    normalizeSpan,
    removeElementFromCanvas,
    removeSectionFromCanvas,
    reorderSectionElements,
    updateElementInCanvas,
    updateSectionInCanvas,
    type CanvasEditHost,
} from '../ComponentStudio/services/canvas-edit-transforms';

// ── Fixtures ───────────────────────────────────────────────────────────────

function field(id: string, fieldName: string, extra: Partial<FormCanvasElement> = {}): FormCanvasElement {
    return { id, type: 'field', fieldName, span: 1, ...extra };
}

function section(id: string, title: string, elements: FormCanvasElement[]): FormCanvasSection {
    return { id, title, collapsible: false, columns: 2, elements };
}

function canvas(): FormCanvasModel {
    return {
        entityName: 'MJ: Users',
        title: 'User Form',
        sections: [
            section('s1', 'Identity', [field('e1', 'Name'), field('e2', 'Email')]),
            section('s2', 'Details', [field('e3', 'Notes')]),
        ],
    };
}

// ── Lookup helpers ───────────────────────────────────────────────────────────

describe('findElement / findSection / collectFieldNames', () => {
    it('finds an element across sections', () => {
        expect(findElement(canvas(), 'e3')?.fieldName).toBe('Notes');
    });
    it('returns null for an absent element', () => {
        expect(findElement(canvas(), 'nope')).toBeNull();
    });
    it('finds a section by id', () => {
        expect(findSection(canvas(), 's2')?.title).toBe('Details');
    });
    it('collects distinct field names in display order', () => {
        expect(collectFieldNames(canvas())).toEqual(['Name', 'Email', 'Notes']);
    });
    it('de-dupes repeated field names and skips non-field elements', () => {
        const c: FormCanvasModel = {
            entityName: 'E', sections: [
                section('s', 'S', [
                    field('a', 'Name'),
                    { id: 'b', type: 'static-text', text: 'hi' },
                    field('c', 'Name'),
                    field('d', 'Email'),
                ]),
            ],
        };
        expect(collectFieldNames(c)).toEqual(['Name', 'Email']);
    });
});

// ── Immutability invariant ───────────────────────────────────────────────────

describe('immutability', () => {
    it('updateElementInCanvas does not mutate the input', () => {
        const before = canvas();
        const snapshot = JSON.parse(JSON.stringify(before));
        const after = updateElementInCanvas(before, 'e1', { label: 'Full Name' });
        expect(before).toEqual(snapshot);
        expect(after).not.toBe(before);
        expect(findElement(after, 'e1')?.label).toBe('Full Name');
    });
    it('reuses untouched section references', () => {
        const before = canvas();
        const after = updateElementInCanvas(before, 'e1', { label: 'X' });
        // s2 wasn't touched → same reference
        expect(after.sections[1]).toBe(before.sections[1]);
        // s1 was touched → new reference
        expect(after.sections[0]).not.toBe(before.sections[0]);
    });
    it('preserves the element id even if a patch tries to change it', () => {
        const after = updateElementInCanvas(canvas(), 'e1', { id: 'hacked' } as Partial<FormCanvasElement>);
        expect(findElement(after, 'e1')).not.toBeNull();
        expect(findElement(after, 'hacked')).toBeNull();
    });
});

// ── Element transforms ───────────────────────────────────────────────────────

describe('updateElementInCanvas', () => {
    it('applies a shallow patch', () => {
        const after = updateElementInCanvas(canvas(), 'e2', { required: true, span: 2 });
        const el = findElement(after, 'e2')!;
        expect(el.required).toBe(true);
        expect(el.span).toBe(2);
        expect(el.fieldName).toBe('Email');
    });
    it('is a no-op (same ref) when the element is absent', () => {
        const before = canvas();
        expect(updateElementInCanvas(before, 'ghost', { span: 2 })).toBe(before);
    });
});

describe('removeElementFromCanvas', () => {
    it('removes the target element only', () => {
        const after = removeElementFromCanvas(canvas(), 'e1');
        expect(findElement(after, 'e1')).toBeNull();
        expect(findElement(after, 'e2')).not.toBeNull();
        expect(after.sections[0].elements).toHaveLength(1);
    });
    it('is a no-op when the element is absent', () => {
        const before = canvas();
        expect(removeElementFromCanvas(before, 'ghost')).toBe(before);
    });
});

describe('addFieldToCanvas', () => {
    it('appends a new field element to the target section', () => {
        const after = addFieldToCanvas(canvas(), 's1', 'Phone', 'newE');
        const s1 = findSection(after, 's1')!;
        expect(s1.elements.map(e => e.id)).toEqual(['e1', 'e2', 'newE']);
        const added = findElement(after, 'newE')!;
        expect(added).toEqual({ id: 'newE', type: 'field', fieldName: 'Phone', span: 1 });
    });
    it('is a no-op when the section is absent', () => {
        const before = canvas();
        expect(addFieldToCanvas(before, 'ghost', 'Phone', 'newE')).toBe(before);
    });
});

// ── Section transforms ───────────────────────────────────────────────────────

describe('updateSectionInCanvas', () => {
    it('patches title/collapsible/columns but keeps id + elements', () => {
        const after = updateSectionInCanvas(canvas(), 's2', { title: 'More', collapsible: true });
        const s2 = findSection(after, 's2')!;
        expect(s2.title).toBe('More');
        expect(s2.collapsible).toBe(true);
        expect(s2.id).toBe('s2');
        expect(s2.elements.map(e => e.id)).toEqual(['e3']);
    });
    it('is a no-op when the section is absent', () => {
        const before = canvas();
        expect(updateSectionInCanvas(before, 'ghost', { title: 'X' })).toBe(before);
    });
});

describe('removeSectionFromCanvas', () => {
    it('removes the target section', () => {
        const after = removeSectionFromCanvas(canvas(), 's1');
        expect(after.sections.map(s => s.id)).toEqual(['s2']);
    });
    it('is a no-op when the section is absent', () => {
        const before = canvas();
        expect(removeSectionFromCanvas(before, 'ghost')).toBe(before);
    });
});

describe('addSectionToCanvas', () => {
    it('appends when index is omitted', () => {
        const after = addSectionToCanvas(canvas(), 'newS', 'Extra');
        expect(after.sections.map(s => s.id)).toEqual(['s1', 's2', 'newS']);
        expect(findSection(after, 'newS')!.title).toBe('Extra');
        expect(findSection(after, 'newS')!.elements).toEqual([]);
    });
    it('inserts at the given index', () => {
        const after = addSectionToCanvas(canvas(), 'newS', 'First', 0);
        expect(after.sections.map(s => s.id)).toEqual(['newS', 's1', 's2']);
    });
    it('clamps an out-of-range index to append', () => {
        const after = addSectionToCanvas(canvas(), 'newS', 'End', 99);
        expect(after.sections.map(s => s.id)).toEqual(['s1', 's2', 'newS']);
    });
    it('clamps a negative index to append', () => {
        const after = addSectionToCanvas(canvas(), 'newS', 'End', -5);
        expect(after.sections.map(s => s.id)).toEqual(['s1', 's2', 'newS']);
    });
    it('defaults the title when omitted', () => {
        const after = addSectionToCanvas(canvas(), 'newS');
        expect(findSection(after, 'newS')!.title).toBe('Untitled Section');
    });
});

describe('reorderSectionElements', () => {
    it('reorders to the requested permutation', () => {
        const after = reorderSectionElements(canvas(), 's1', ['e2', 'e1']);
        expect(findSection(after, 's1')!.elements.map(e => e.id)).toEqual(['e2', 'e1']);
    });
    it('refuses (same ref) when ids are not a permutation — missing id', () => {
        const before = canvas();
        expect(reorderSectionElements(before, 's1', ['e1'])).toBe(before);
    });
    it('refuses when ids contain a stranger', () => {
        const before = canvas();
        expect(reorderSectionElements(before, 's1', ['e1', 'eX'])).toBe(before);
    });
    it('refuses on duplicate ids', () => {
        const before = canvas();
        expect(reorderSectionElements(before, 's1', ['e1', 'e1'])).toBe(before);
    });
    it('is a no-op when the section is absent', () => {
        const before = canvas();
        expect(reorderSectionElements(before, 'ghost', [])).toBe(before);
    });
});

describe('normalizeSpan', () => {
    it('maps 1 (and below) to half-width', () => {
        expect(normalizeSpan(1)).toBe(1);
        expect(normalizeSpan(0)).toBe(1);
        expect(normalizeSpan(-3)).toBe(1);
    });
    it('maps 2+ to full-width', () => {
        expect(normalizeSpan(2)).toBe(2);
        expect(normalizeSpan(12)).toBe(2);
    });
});

// ── Client-tool factory ──────────────────────────────────────────────────────

describe('buildCanvasEditClientTools', () => {
    let current: FormCanvasModel | null;
    let elementSeq: number;
    let sectionSeq: number;
    const paneCalls: string[] = [];

    const host: CanvasEditHost = {
        GetCanvas: () => current,
        ApplyCanvas: (next) => { current = next; },
        NewElementId: () => `gen-e${++elementSeq}`,
        NewSectionId: () => `gen-s${++sectionSeq}`,
        PreviewForm: (recordId?: string) => { paneCalls.push(`preview:${recordId ?? ''}`); },
        ViewFormCode: () => { paneCalls.push('code'); },
        ViewFormLayout: () => { paneCalls.push('layout'); },
    };

    const tool = (name: string) => buildCanvasEditClientTools(host).find(t => t.Name === name)!;

    beforeEach(() => {
        current = canvas();
        elementSeq = 0;
        sectionSeq = 0;
        paneCalls.length = 0;
    });

    it('exposes the full granular suite plus the pane tools', () => {
        const names = buildCanvasEditClientTools(host).map(t => t.Name).sort();
        expect(names).toEqual([
            'AddField', 'AddSection', 'PreviewForm', 'RemoveField', 'RemoveSection',
            'ReorderFields', 'SetFieldLabel', 'SetFieldSpan', 'SetSectionTitle',
            'ToggleFieldRequired', 'ViewFormCode', 'ViewFormLayout',
        ]);
    });

    it('omits pane tools when the host does not provide them', () => {
        const minimalHost: CanvasEditHost = {
            GetCanvas: () => canvas(),
            ApplyCanvas: () => {},
            NewElementId: () => 'x',
            NewSectionId: () => 'y',
        };
        const names = buildCanvasEditClientTools(minimalHost).map(t => t.Name);
        expect(names).not.toContain('PreviewForm');
        expect(names).not.toContain('ViewFormCode');
        expect(names).not.toContain('ViewFormLayout');
    });

    it('🔒 SAFETY: never exposes Save/Publish/Delete-form tools', () => {
        const names = buildCanvasEditClientTools(host).map(t => t.Name.toLowerCase());
        for (const banned of ['save', 'publish', 'persist', 'deleteform', 'activate']) {
            expect(names.some(n => n.includes(banned))).toBe(false);
        }
    });

    it('AddField appends a field and returns the new element id', async () => {
        const res = await tool('AddField').Handler({ fieldName: 'Phone', sectionId: 's2' });
        expect(res.Success).toBe(true);
        expect(findSection(current!, 's2')!.elements.map(e => e.fieldName)).toEqual(['Notes', 'Phone']);
    });

    it('AddField defaults to the first section', async () => {
        await tool('AddField').Handler({ fieldName: 'Phone' });
        expect(findSection(current!, 's1')!.elements).toHaveLength(3);
    });

    it('AddField fails clearly for an unknown section', async () => {
        const res = await tool('AddField').Handler({ fieldName: 'Phone', sectionId: 'ghost' });
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/ghost/);
    });

    it('RemoveField removes the element', async () => {
        const res = await tool('RemoveField').Handler({ elementId: 'e1' });
        expect(res.Success).toBe(true);
        expect(findElement(current!, 'e1')).toBeNull();
    });

    it('RemoveField fails for an unknown element', async () => {
        const res = await tool('RemoveField').Handler({ elementId: 'ghost' });
        expect(res.Success).toBe(false);
    });

    it('SetFieldLabel sets and clears the override', async () => {
        await tool('SetFieldLabel').Handler({ elementId: 'e1', label: 'Full Name' });
        expect(findElement(current!, 'e1')!.label).toBe('Full Name');
        await tool('SetFieldLabel').Handler({ elementId: 'e1', label: '' });
        expect(findElement(current!, 'e1')!.label).toBeUndefined();
    });

    it('ToggleFieldRequired flips when no explicit value', async () => {
        await tool('ToggleFieldRequired').Handler({ elementId: 'e1' });
        expect(findElement(current!, 'e1')!.required).toBe(true);
        await tool('ToggleFieldRequired').Handler({ elementId: 'e1' });
        expect(findElement(current!, 'e1')!.required).toBe(false);
    });

    it('ToggleFieldRequired honours an explicit boolean', async () => {
        await tool('ToggleFieldRequired').Handler({ elementId: 'e2', required: true });
        expect(findElement(current!, 'e2')!.required).toBe(true);
    });

    it('SetFieldSpan normalizes a loose span request', async () => {
        const res = await tool('SetFieldSpan').Handler({ elementId: 'e1', span: 12 });
        expect(res.Success).toBe(true);
        expect(findElement(current!, 'e1')!.span).toBe(2);
    });

    it('SetFieldSpan accepts a numeric string', async () => {
        await tool('SetFieldSpan').Handler({ elementId: 'e1', span: '1' });
        expect(findElement(current!, 'e1')!.span).toBe(1);
    });

    it('ReorderFields reorders and rejects a bad permutation', async () => {
        const ok = await tool('ReorderFields').Handler({ sectionId: 's1', fieldIds: ['e2', 'e1'] });
        expect(ok.Success).toBe(true);
        expect(findSection(current!, 's1')!.elements.map(e => e.id)).toEqual(['e2', 'e1']);

        const bad = await tool('ReorderFields').Handler({ sectionId: 's1', fieldIds: ['e2'] });
        expect(bad.Success).toBe(false);
    });

    it('AddSection appends a titled section', async () => {
        const res = await tool('AddSection').Handler({ title: 'Audit' });
        expect(res.Success).toBe(true);
        expect(current!.sections.map(s => s.title)).toContain('Audit');
        expect(current!.sections).toHaveLength(3);
    });

    it('RemoveSection removes by id', async () => {
        const res = await tool('RemoveSection').Handler({ sectionId: 's2' });
        expect(res.Success).toBe(true);
        expect(current!.sections.map(s => s.id)).toEqual(['s1']);
    });

    it('SetSectionTitle renames a section', async () => {
        await tool('SetSectionTitle').Handler({ sectionId: 's1', title: 'Core' });
        expect(findSection(current!, 's1')!.title).toBe('Core');
    });

    it('pane tools call through to the host and report success', async () => {
        expect((await tool('PreviewForm').Handler({ recordId: 'rec-7' })).Success).toBe(true);
        expect((await tool('ViewFormCode').Handler({})).Success).toBe(true);
        expect((await tool('ViewFormLayout').Handler({})).Success).toBe(true);
        expect(paneCalls).toEqual(['preview:rec-7', 'code', 'layout']);
    });

    it('every transform tool fails gracefully when no form is loaded', async () => {
        current = null;
        for (const name of ['AddField', 'RemoveField', 'SetFieldLabel', 'ToggleFieldRequired',
            'SetFieldSpan', 'ReorderFields', 'AddSection', 'RemoveSection', 'SetSectionTitle']) {
            const res = await tool(name).Handler({ elementId: 'e1', sectionId: 's1', fieldName: 'X', span: 1, title: 'T', fieldIds: [] });
            expect(res.Success, `${name} should fail with no canvas`).toBe(false);
        }
    });
});
