import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TourAnchorsCheck } from '../checks/tour-anchors.js';

let repo: string;

beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'mj-tour-anchors-'));
});

afterEach(() => {
    rmSync(repo, { recursive: true, force: true });
});

function writeTour(filename: string, content: unknown): void {
    const dir = join(repo, 'metadata', 'tours');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, filename), JSON.stringify(content, null, 2), 'utf8');
}

function writeTemplate(relPath: string, content: string): void {
    const full = join(repo, relPath);
    mkdirSync(join(full, '..'), { recursive: true });
    writeFileSync(full, content, 'utf8');
}

function writeGeneratedEntity(entityName: string, fieldNames: string[]): void {
    const dir = join(repo, 'packages', 'MJCoreEntities', 'src', 'generated', 'schemas');
    mkdirSync(dir, { recursive: true });
    const fieldsBody = fieldNames
        .map(
            (name) =>
                `    ${name}: z.string().describe(\`\n      SQL Data Type: nvarchar(100)\n    \`),`
        )
        .join('\n');
    const source = [
        `/**`,
        ` * zod schema definition for the entity ${entityName}`,
        ` */`,
        `export const ${entityName.replace(/[^A-Za-z0-9]/g, '')}Schema = z.object({`,
        fieldsBody,
        `});`,
    ].join('\n');
    writeFileSync(join(dir, 'test_entities.ts'), source, 'utf8');
}

const runCheck = (options: Record<string, unknown> = {}) =>
    TourAnchorsCheck.Run({
        RepoRoot: repo,
        Roots: ['metadata', 'packages'],
        Options: { ...TourAnchorsCheck.DefaultOptions, ...options },
    });

describe('TourAnchorsCheck', () => {
    it('succeeds gracefully with 0 violations when metadata/tours does not exist (ignoring packages/Tours)', async () => {
        const pkgToursDir = join(repo, 'packages', 'Tours', 'Runtime');
        mkdirSync(pkgToursDir, { recursive: true });
        writeFileSync(join(pkgToursDir, 'package.json'), JSON.stringify({ name: '@memberjunction/tours-runtime' }));

        const result = await runCheck();
        expect(result.Violations).toEqual([]);
        expect(result.Notes?.[0]).toContain('0 tour metadata file(s) scanned');
    });

    it('passes valid tours using repo template anchors ([mjTourAnchor] and data-mj-tour-anchor) and Signal checks', async () => {
        writeTemplate(
            'packages/Angular/Explorer/shell.html',
            `<button data-mj-tour-anchor="core.shell.omnibar">Search</button>\n<div [mjTourAnchor]="'core.shell.nav'"></div>`,
        );
        writeTour('welcome.json', {
            fields: { TourKey: 'core.welcome', Name: 'Welcome' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'step-omnibar',
                            StepTypeID: '@lookup:MJ: Tour Step Types.Name=Spotlight',
                            Anchor: { Strategy: 'Registered', Key: 'core.shell.omnibar' },
                            Completion: { Type: 'NextButton' },
                        },
                    },
                    {
                        fields: {
                            StepKey: 'step-nav',
                            StepType: 'Action',
                            Anchor: { Strategy: 'Registered', Key: 'core.shell.nav' },
                            Completion: {
                                Type: 'All',
                                Checks: [{ Type: 'Signal', Signal: 'core.nav.opened' }],
                            },
                        },
                    },
                ],
                'MJ: Tour Triggers': [
                    { fields: { TriggerType: 'FirstVisit' } },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.', 'admin.', 'builder.'] });
        expect(result.Violations).toEqual([]);
    });

    it('flags a missing Registered anchor not declared in templates or core manifest', async () => {
        writeTemplate('packages/App/button.html', `<button data-mj-tour-anchor="core.existing">Go</button>`);
        writeTour('broken.json', {
            fields: { TourKey: 'core.broken' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'missing-target',
                            StepType: 'Spotlight',
                            Anchor: { Strategy: 'Registered', Key: 'core.does-not-exist' },
                        },
                    },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.'] });
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Message).toContain('core.does-not-exist');
    });

    it('passes when a Registered anchor is declared in the core anchor manifest', async () => {
        const manifestDir = join(repo, 'packages', 'Angular', 'Generic', 'tours', 'src');
        mkdirSync(manifestDir, { recursive: true });
        writeFileSync(
            join(manifestDir, 'core-anchor-manifest.json'),
            JSON.stringify({ Anchors: ['core.shell.app-switcher', 'core.shell.user-menu'] }),
        );
        writeTour('manifest.json', {
            fields: { TourKey: 'core.welcome' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'switcher',
                            StepType: 'Spotlight',
                            Anchor: { Strategy: 'Registered', Key: 'core.shell.app-switcher' },
                        },
                    },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.'] });
        expect(result.Violations).toEqual([]);
    });

    it('permits {{Context.Record.EntityName}} template variables in semantic FormField / FormSection anchors and validates literal entities', async () => {
        writeGeneratedEntity('Users', ['ID', 'Name', 'Email']);
        writeTour('contextual.json', {
            fields: { TourKey: 'core.records' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'contextual-field',
                            StepType: 'Spotlight',
                            Anchor: {
                                Strategy: 'FormField',
                                Entity: '{{Context.Record.EntityName}}',
                                Field: '{{Context.Form.PrimaryField}}',
                            },
                        },
                    },
                    {
                        fields: {
                            StepKey: 'literal-user-email',
                            StepType: 'Action',
                            Anchor: {
                                Strategy: 'FormField',
                                Entity: 'Users',
                                Field: 'Email',
                            },
                        },
                    },
                    {
                        fields: {
                            StepKey: 'literal-section',
                            StepType: 'Spotlight',
                            Anchor: {
                                Strategy: 'FormSection',
                                Entity: 'Users',
                                Section: 'details',
                            },
                        },
                    },
                ],
            },
        });

        const validResult = await runCheck({ allowedPrefixes: ['core.'] });
        expect(validResult.Violations).toEqual([]);

        writeTour('bad-entity.json', {
            fields: { TourKey: 'core.bad-entity' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'bad-entity-step',
                            StepType: 'Spotlight',
                            Anchor: { Strategy: 'FormField', Entity: 'NonExistentEntity', Field: 'Name' },
                        },
                    },
                ],
            },
        });

        const invalidResult = await runCheck({ allowedPrefixes: ['core.'] });
        expect(invalidResult.Violations).toHaveLength(1);
        expect(invalidResult.Violations[0].Message).toContain('NonExistentEntity');
    });

    it('flags disallowed prefixes on TourKey, Registered anchor keys, and Signal keys', async () => {
        writeTemplate('packages/Sales/deal.html', `<button data-mj-tour-anchor="sales.deal.save">Save</button>`);
        writeTour('disallowed-prefix.json', {
            fields: { TourKey: 'sales.first-deal' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 's1',
                            StepType: 'Action',
                            Anchor: { Strategy: 'Registered', Key: 'sales.deal.save' },
                            Completion: { Type: 'Signal', Signal: 'sales.deal.saved' },
                        },
                    },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.', 'admin.', 'builder.'] });
        expect(result.Violations).toHaveLength(3);
        expect(result.Violations.map((v) => v.Message).join('\n')).toContain('sales.first-deal');
        expect(result.Violations.map((v) => v.Message).join('\n')).toContain('sales.deal.save');
        expect(result.Violations.map((v) => v.Message).join('\n')).toContain('sales.deal.saved');
    });

    it('flags unknown step types, anchor strategies, and completion check types, while recognizing @RegisterClass extensions', async () => {
        writeTemplate(
            'packages/Custom/step.ts',
            `@RegisterClass(BaseTourStepType, 'Custom: Widget')\nexport class CustomWidgetStep {}`,
        );
        writeTour('unknown-types.json', {
            fields: { TourKey: 'core.types-check' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'custom-ok',
                            StepType: 'Custom: Widget',
                            Anchor: { Strategy: 'Omnibar' },
                            Completion: { Type: 'NextButton' },
                        },
                    },
                    {
                        fields: {
                            StepKey: 'unknown-all',
                            StepType: 'NonExistentStep',
                            Anchor: { Strategy: 'UnknownStrategy' },
                            Completion: { Type: 'UnknownCompletion' },
                        },
                    },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.'] });
        expect(result.Violations).toHaveLength(3);
        const combined = result.Violations.map((v) => v.Message).join('\n');
        expect(combined).toContain('NonExistentStep');
        expect(combined).toContain('UnknownStrategy');
        expect(combined).toContain('UnknownCompletion');
    });

    it('flags CSS Selector fallback unless excused via tour-anchors-allow-selector in step Configuration', async () => {
        writeTour('selector-flag.json', {
            fields: { TourKey: 'core.selector-test' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 'unexcused',
                            StepType: 'Spotlight',
                            Anchor: { Strategy: 'Selector', Selector: '.legacy-btn' },
                        },
                    },
                    {
                        fields: {
                            StepKey: 'excused',
                            StepType: 'Spotlight',
                            Anchor: { Strategy: 'Selector', Selector: '.third-party-widget' },
                            Configuration: {
                                Notes: 'tour-anchors-allow-selector: third-party control without data attr',
                            },
                        },
                    },
                ],
            },
        });

        const result = await runCheck({ allowedPrefixes: ['core.'] });
        expect(result.Violations).toHaveLength(1);
        expect(result.Violations[0].Severity).toBe('warn');
        expect(result.Violations[0].Message).toContain('unexcused');
    });

    it('handles trailing slashes in Roots and skips tsconfig.*.json files inside metadata/tours', async () => {
        writeTour('tsconfig.tour.json', { compilerOptions: { strict: true } });
        writeTemplate('packages/App/el.html', `<div data-mj-tour-anchor="core.ok"></div>`);
        writeTour('valid.json', {
            fields: { TourKey: 'core.ok-tour' },
            relatedEntities: {
                'MJ: Tour Steps': [
                    {
                        fields: {
                            StepKey: 's1',
                            StepTypeID: '@lookup:MJ: Tour Step Types.Name=Spotlight',
                            Anchor: { Strategy: 'Registered', Key: 'core.ok' },
                        },
                    },
                ],
            },
        });

        const result = await TourAnchorsCheck.Run({
            RepoRoot: repo,
            Roots: ['metadata///', 'packages///'],
            Options: { ...TourAnchorsCheck.DefaultOptions, allowedPrefixes: ['core.'] },
        });
        expect(result.Violations).toEqual([]);
        expect(result.Notes?.[0]).toContain('1 tour metadata file(s) scanned');
    });
});
