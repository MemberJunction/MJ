import { describe, expect, it } from 'vitest';
import { RubricEngine, type RubricRecords } from '../RubricEngine.js';

describe('test run screenshots', () => {
    it('attaches a spread of the saved screenshots when it loads an MJ: Test Runs subject', async () => {
        const seen: { entity: string; filter: string; fields?: string[] }[] = [];
        const records: RubricRecords = {
            async rows(entityName, filter, _orderBy, fields) {
                seen.push({ entity: entityName, filter, fields });
                if (entityName === 'MJ: Test Runs') return [{ ID: 'run-1', InputData: 'q', ActualOutputData: 'a', ResultDetails: '[]' }];
                if (entityName === 'MJ: Test Run Outputs' && fields) {
                    return Array.from({ length: 20 }, (_, i) => ({ ID: `o${i + 1}`, Sequence: i + 1, StepNumber: i + 1, Name: `Step ${i + 1}`, MimeType: 'image/png' }));
                }
                if (entityName === 'MJ: Test Run Outputs') {
                    return [
                        { ID: 'o1', StepNumber: 1, MimeType: 'image/png', InlineData: 'QQ==' },
                        { ID: 'o20', StepNumber: 20, MimeType: 'image/png', InlineData: 'data:image/png;base64,Qg==' },
                        { ID: 'o7', StepNumber: null, Name: 'Final Screenshot', MimeType: 'image/png', InlineData: '' },
                    ];
                }
                return [];
            },
            async createDraft() { throw new Error('not used'); },
        };
        const content = await new RubricEngine(undefined, records).SubjectContent({ subjectEntityName: 'MJ: Test Runs', subjectRecordId: 'run-1' });
        expect(content.images).toEqual([
            { label: 'step 1', mimeType: 'image/png', data: 'QQ==' },
            { label: 'step 20', mimeType: 'image/png', data: 'Qg==' },
        ]);
        const list = seen.find(call => call.entity === 'MJ: Test Run Outputs' && call.fields);
        expect(list?.fields).toEqual(['ID', 'Sequence', 'StepNumber', 'Name', 'MimeType']);
        expect(list?.filter).toContain("MimeType LIKE 'image/%'");
        const read = seen.find(call => call.entity === 'MJ: Test Run Outputs' && !call.fields);
        expect(read?.filter.match(/'o\d+'/g)).toHaveLength(8);
    });

    it('leaves other subjects without images', async () => {
        const records: RubricRecords = {
            async rows(entityName) { return entityName === 'MJ: Widgets' ? [{ ID: 'w', Name: 'Widget' }] : []; },
            async createDraft() { throw new Error('not used'); },
        };
        const content = await new RubricEngine(undefined, records).SubjectContent({ subjectEntityName: 'MJ: Widgets', subjectRecordId: 'w' });
        expect(content.images).toBeUndefined();
    });
});
