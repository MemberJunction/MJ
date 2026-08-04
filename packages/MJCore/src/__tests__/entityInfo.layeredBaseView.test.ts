/**
 * EntityInfo — which view CodeGen writes, and when an entity is "layered".
 *
 * `GeneratedBaseViewName` exists so an entity can have BOTH a generated base view and a custom one
 * over it. Before it, `BaseViewGenerated = 0` was all-or-nothing: to add one computed column an
 * application inherited the entire generated view — every related-entity display join, the geo join,
 * the recursive root-ID apply — and had to hand-maintain it forever. A foreign key added later then
 * silently never appeared, because nothing regenerated the join.
 *
 * The resolution lives in ONE place because several call sites independently decide where to write
 * the view, what to name the emitted file, and which object to refresh. Any two of them disagreeing
 * produces a view that exists under a name nothing reads — which is why these are asserted rather
 * than assumed.
 */
import { describe, expect, it } from 'vitest';
import { EntityInfo } from '../generic/entityInfo';

/** An EntityInfo with just the fields the view-name resolution reads. */
function entity(over: Record<string, unknown> = {}): EntityInfo {
    return new EntityInfo({
        Name: 'Order Headers',
        BaseTable: 'OrderHeader',
        BaseView: 'vwOrderHeaders',
        BaseViewGenerated: true,
        SchemaName: 'orders',
        ...over,
    });
}

describe('the view CodeGen writes', () => {
    it('is the entity BaseView in the ordinary case', () => {
        expect(entity().GeneratedViewName).toBe('vwOrderHeaders');
    });

    it('is the inner view once one is named', () => {
        const e = entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' });
        expect(e.GeneratedViewName).toBe('vwOrderHeadersGenerated');
        // BaseView is untouched — it stays the entity's public surface, which is what field
        // discovery, permissions and the CRUD procedures target.
        expect(e.BaseView).toBe('vwOrderHeaders');
    });

    it('falls back to the conventional name when no BaseView is set', () => {
        const e = entity({ BaseView: null });
        expect(e.GeneratedViewName).toBe(`vw${e.CodeName}`);
    });

    it('ignores whitespace-only names rather than generating into a blank object', () => {
        expect(entity({ GeneratedBaseViewName: '   ' }).GeneratedViewName).toBe('vwOrderHeaders');
    });

    it('trims a padded name', () => {
        expect(entity({ GeneratedBaseViewName: '  vwInner  ' }).GeneratedViewName).toBe('vwInner');
    });

    it('is BaseView when the inner name differs only by case', () => {
        // The two getters must agree. `HasLayeredBaseView` compares case-insensitively, because SQL
        // Server object names are case-insensitive — so `VWORDERHEADERS` is NOT a second view. If
        // this getter answered the differently-cased string anyway, CodeGen would write there while
        // every layering-gated path believed no second view existed: on SQL Server that silently
        // overwrites BaseView, and on a case-sensitive dialect it creates an orphan nothing reads.
        const e = entity({ GeneratedBaseViewName: 'VWORDERHEADERS' });
        expect(e.HasLayeredBaseView).toBe(false);
        expect(e.GeneratedViewName).toBe('vwOrderHeaders');
    });

    it('never disagrees with HasLayeredBaseView about which view is written', () => {
        // The invariant the whole design rests on, asserted directly rather than inferred from the
        // cases above: not layered => CodeGen writes BaseView; layered => it writes the inner name.
        const candidates: (string | null | undefined)[] =
            [undefined, null, '', '   ', 'vwOrderHeaders', 'VWORDERHEADERS', '  vwOrderHeaders  ', 'vwInner', '  vwInner  '];
        for (const name of candidates) {
            const e = entity({ GeneratedBaseViewName: name });
            const expected = e.HasLayeredBaseView ? (name ?? '').trim() : 'vwOrderHeaders';
            expect(e.GeneratedViewName, `GeneratedBaseViewName = ${JSON.stringify(name)}`).toBe(expected);
        }
    });
});

describe('whether an entity is layered', () => {
    it('is not layered by default — every pre-existing entity behaves exactly as before', () => {
        // The whole point of the column being additive: NULL reproduces today's semantics, so no
        // existing install changes behaviour or needs re-verifying.
        expect(entity().HasLayeredBaseView).toBe(false);
        expect(entity({ BaseViewGenerated: false }).HasLayeredBaseView).toBe(false);
    });

    it('is layered when an inner view is named', () => {
        expect(entity({ BaseViewGenerated: false, GeneratedBaseViewName: 'vwOrderHeadersGenerated' }).HasLayeredBaseView).toBe(true);
    });

    it('is NOT layered when the inner name equals BaseView', () => {
        // A view cannot select from itself. The database refuses this too (a CHECK constraint), but
        // an equal name reaching CodeGen would make it write BaseView and then treat that same
        // object as an inner view — so the guard is here as well as there.
        expect(entity({ GeneratedBaseViewName: 'vwOrderHeaders' }).HasLayeredBaseView).toBe(false);
    });

    it('compares the names case-insensitively', () => {
        // SQL Server object names are case-insensitive under the usual collations, so `VWORDERHEADERS`
        // and `vwOrderHeaders` are the same object even though the strings differ.
        expect(entity({ GeneratedBaseViewName: 'VWORDERHEADERS' }).HasLayeredBaseView).toBe(false);
    });

    it('stays layered independently of BaseViewGenerated', () => {
        // The expected configuration is BaseViewGenerated = 0 (the app owns BaseView) plus an inner
        // name. Both flags set is contradictory but must not be read as "not layered", or CodeGen
        // would overwrite the application's view.
        expect(entity({ BaseViewGenerated: true, GeneratedBaseViewName: 'vwInner' }).HasLayeredBaseView).toBe(true);
    });
});
