import { describe, it, expect } from 'vitest';
import { UiPaths, KeywordsForPaths, ScoreTests, TestSummary } from '../lib/related.mjs';

const FORM_TAB = 'packages/Angular/Explorer/dashboards/src/ComponentStudio/components/form-builder/form-builder-tab.component.ts';

function testFile(name, tags, goal, description = '') {
    return {
        fields: {
            Name: name,
            Description: description,
            Tags: tags,
            InputDefinition: JSON.stringify({ goal, startUrl: 'http://localhost:4200' }),
        },
    };
}

describe('UiPaths', () => {
    it('keeps Angular source and application metadata, and drops tests, docs and server code', () => {
        const paths = [
            FORM_TAB,
            'packages/Angular/Explorer/dashboards/src/ComponentStudio/components/form-builder/form-builder-tab.component.dom.test.ts',
            'packages/Angular/Generic/ui/src/lib/thing.spec.ts',
            'packages/Angular/Generic/ui/README.md',
            'packages/MJServer/src/resolvers/x.ts',
            'metadata/applications/.chat-application.json',
        ];
        expect(UiPaths(paths)).toEqual([FORM_TAB, 'metadata/applications/.chat-application.json']);
    });

    it('drops CodeGen output such as generated forms and class registrations', () => {
        const paths = [
            'packages/Angular/Bootstrap/src/generated/mj-class-registrations.ts',
            'packages/Angular/Explorer/core-entity-forms/src/lib/generated/Entities/MJComment/mjcomment.form.component.html',
        ];
        expect(UiPaths(paths)).toEqual([]);
    });
});

describe('KeywordsForPaths', () => {
    it('turns folder and file names into area words and kebab tags, without generic words', () => {
        const words = KeywordsForPaths([FORM_TAB]);
        expect(words).toEqual(expect.arrayContaining(['component-studio', 'form-builder', 'form', 'builder', 'studio']));
        for (const generic of ['packages', 'angular', 'explorer', 'dashboards', 'src', 'components', 'component', 'tab', 'ts']) {
            expect(words).not.toContain(generic);
        }
    });

    it('reads the app name from an application metadata file', () => {
        expect(KeywordsForPaths(['metadata/applications/.knowledge-hub-application.json'])).toEqual(
            expect.arrayContaining(['knowledge-hub', 'knowledge', 'hub']),
        );
    });
});

describe('ScoreTests', () => {
    const tests = [
        TestSummary('a.json', testFile('T149 - Form Builder New Form Entity Picker', 'P2,regression,component-studio', 'In Form Studio click New')),
        TestSummary('b.json', testFile('T001 - Login Smoke', 'P0,regression,smoke', 'Log in and see the home page')),
        TestSummary('c.json', testFile('T150 - Component Studio Preview', 'P2,regression,component-studio', 'Open a component preview')),
    ];

    it('ranks tests by tag, name and goal matches and leaves out tests with no match', () => {
        const ranked = ScoreTests(tests, ['component-studio', 'form', 'builder']);
        expect(ranked.map(r => r.test.name)).toEqual([
            'T149 - Form Builder New Form Entity Picker',
            'T150 - Component Studio Preview',
        ]);
        expect(ranked[0].matched).toEqual(['builder', 'component-studio', 'form']);
    });

    it('matches whole words only', () => {
        const ranked = ScoreTests(tests, ['log']);
        expect(ranked.map(r => r.test.name)).toEqual(['T001 - Login Smoke']);
        expect(ScoreTests(tests, ['ogi'])).toEqual([]);
    });
});

describe('TestSummary', () => {
    it('reads name, tags, priority, goal and start URL from a test file', () => {
        const summary = TestSummary('x/.T149-a.json', testFile('T149 - A', 'P2,regression,component-studio', 'Do it'));
        expect(summary).toEqual({
            path: 'x/.T149-a.json',
            name: 'T149 - A',
            priority: 'P2',
            tags: ['component-studio'],
            goal: 'Do it',
            description: '',
            startUrl: 'http://localhost:4200',
        });
    });
});
