import { describe, it, expect, vi } from 'vitest';
import { CompositeKey, DatabaseProviderBase, EntityInfo, type EntityTransactionScope, IMetadataProvider, type IRunViewProvider, UserInfo } from '@memberjunction/core';
import type { MJRecordProcessEntity } from '@memberjunction/core-entities';
import { ArraySource, type IRecordProcessor, type ProcessRunResult, type RecordProcessorContext, type RecordRef, type RecordResult } from '@memberjunction/record-set-processor-base';
import {
    DataFeatureSpec, FeatureValueCacheService, FeatureValueSaveError, type FeaturePipelinePinData, type FeatureValueRecordRef, type FeatureValueSource,
    type LatestFeatureValueParams, type RecordFeatureValuesOutcome, type RecordFeatureValuesParams, type RecordHumanValueParams, type TypedFeatureValue,
} from '@memberjunction/feature-pipelines';
import { ApplyOutputMapping, OutputMappingWriter, type HumanValueGuard, type HumanValueGuardSource, type HumanValueQuestion } from '../writeBack';
import { InferProcessor } from '../processors/InferProcessor';
import { WriteBackProcessor } from '../processors/WriteBackProcessor';
import { RecordSetProcessor } from '../RecordSetProcessor';
import { NoOpTracker } from '../trackers/NoOpTracker';
import { FunctionRecordProcessor } from '../processors/FunctionRecordProcessor';
import { RecordProcessExecutor } from '../RecordProcessExecutor';

const USER = {} as UserInfo;
const record: RecordRef = { EntityID: 'ENT-P', RecordID: 'person-1', Record: {} };

/** The People entity as metadata declares it: ID is the key; the other fields are text unless a test says otherwise. */
const PEOPLE = new EntityInfo({
    ID: 'ENT-P', Name: 'People',
    Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'SeniorityLevelID', Type: 'nvarchar' }, { Name: 'Nickname', Type: 'nvarchar' },
        { Name: 'Score', Type: 'decimal', Scale: 2 }, { Name: 'ReviewedAt', Type: 'datetimeoffset' }, { Name: 'IsActive', Type: 'bit' }],
});

/** A parent-record double whose saves are captured. */
function parentRow(current: Record<string, unknown>, saves: Array<Record<string, unknown>>) {
    return {
        Values: { ...current },
        LatestResult: null,
        PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'person-1'),
        Get(f: string) { return this.Values[f]; },
        Set(f: string, v: unknown) { this.Values[f] = v; },
        NewRecord() { return true; },
        async InnerLoad() { return true; },
        async Save() { saves.push({ ...this.Values }); return true; },
    };
}

function parentProvider(current: Record<string, unknown>) {
    const saves: Array<Record<string, unknown>> = [];
    const parent = parentRow(current, saves);
    // Test double: only the IMetadataProvider members write-back calls, narrowed to the full interface.
    const members: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = {
        EntityByID: () => PEOPLE,
        GetEntityObject: vi.fn().mockResolvedValue(parent),
    };
    const provider = members as IMetadataProvider;
    return { provider, parent, saves };
}

/** A guard double answering every question the same way; it records what it was asked, recorded and retired. */
function guardDouble(human: boolean, hadHumanValue = true) {
    const Recorded: unknown[] = [];
    const Retired: string[] = [];
    const Questions: HumanValueQuestion[] = [];
    const guard: HumanValueGuard = {
        IsHumanOwned: vi.fn().mockImplementation(async (q: HumanValueQuestion) => { Questions.push(q); return human; }),
        RecordPreserved: vi.fn().mockImplementation(async (_f: string, v: unknown) => { Recorded.push(v); }),
        RetireHumanValue: vi.fn().mockImplementation(async (f: string) => { Retired.push(f); return hadHumanValue; }),
    };
    return { guard, Recorded, Retired, Questions };
}

describe('human-entered values', () => {
    const mapping = { fields: { SeniorityLevelID: '$.SeniorityLevel' } };

    it('leaves a human value in place and records it on the unit provider', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const g = guardDouble(true);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider, humanGuard: g.guard });
        expect(saves).toHaveLength(0);
        expect(out.preservedHumanFields).toEqual(['SeniorityLevelID']);
        expect(g.Recorded).toEqual(['board-id']);
        expect(g.guard.RecordPreserved).toHaveBeenCalledWith('SeniorityLevelID', 'board-id', provider);
        expect(g.Questions[0].Provider).toBe(provider);
    });

    it('overwrites it only when the run says so, and retires its Human value', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const g = guardDouble(true);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider, humanGuard: g.guard, overwriteHumanValues: true });
        expect(saves[0].SeniorityLevelID).toBe('manager-id');
        expect(g.Retired).toEqual(['SeniorityLevelID']);
        expect(out.retiredHumanFields).toEqual(['SeniorityLevelID']);
        expect(g.guard.IsHumanOwned).not.toHaveBeenCalled();
    });

    it('an overwrite run retires the Human value of a mapped field it did not have to change', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'manager-id' });
        const g = guardDouble(true);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider, humanGuard: g.guard, overwriteHumanValues: true });
        expect(saves).toHaveLength(0);
        expect(out.retiredHumanFields).toEqual(['SeniorityLevelID']);
        expect(out.changed).toBe(true);
    });

    it('a run that keeps human values retires nothing; nor does an overwrite with no Human value to retire', async () => {
        const kept = guardDouble(true);
        await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider: parentProvider({ SeniorityLevelID: 'board-id' }).provider, humanGuard: kept.guard });
        expect(kept.guard.RetireHumanValue).not.toHaveBeenCalled();
        const none = guardDouble(true, false);
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER,
            provider: parentProvider({ SeniorityLevelID: 'manager-id' }).provider, humanGuard: none.guard, overwriteHumanValues: true });
        expect(out.retiredHumanFields).toBeUndefined();
        expect(out.changed).toBe(false);
    });

    it('does not consult the guard when the field is empty or already equal', async () => {
        const { provider } = parentProvider({ SeniorityLevelID: null });
        const g = guardDouble(true);
        await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider, humanGuard: g.guard });
        expect(g.guard.IsHumanOwned).not.toHaveBeenCalled();
        const same = parentProvider({ SeniorityLevelID: 'manager-id' });
        await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider: same.provider, humanGuard: g.guard });
        expect(g.guard.IsHumanOwned).not.toHaveBeenCalled();
    });

    it('writes a value the guard says the pipeline owns', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'director-id' });
        const out = await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'manager-id' }, record, contextUser: USER, provider, humanGuard: guardDouble(false).guard });
        expect(saves[0].SeniorityLevelID).toBe('manager-id');
        expect(out.preservedHumanFields).toBeUndefined();
    });
});

describe('ownership compares by the field\'s type', () => {
    const field = (name: string) => PEOPLE.Fields.find((f) => f.Name === name);

    it('decimals at the column scale, dates by instant, bits by truth; text ignoring case and trailing spaces only', () => {
        expect(OutputMappingWriter.OwnedValuesEqual(field('Score'), 0.12, 0.123456)).toBe(true);
        expect(OutputMappingWriter.OwnedValuesEqual(field('Score'), 0.12, 0.126)).toBe(false);
        expect(OutputMappingWriter.OwnedValuesEqual(field('ReviewedAt'), new Date('2026-10-13T10:00:00Z'), '2026-10-13T12:00:00+02:00')).toBe(true);
        expect(OutputMappingWriter.OwnedValuesEqual(field('IsActive'), 1, true)).toBe(true);
        expect(OutputMappingWriter.OwnedValuesEqual(field('Nickname'), 'Bob ', 'BOB')).toBe(true);
        expect(OutputMappingWriter.OwnedValuesEqual(field('Nickname'), ' Bob', 'Bob')).toBe(false);
        expect(OutputMappingWriter.OwnedValuesEqual(field('Nickname'), 'Bob', null)).toBe(false);
        expect(OutputMappingWriter.OwnedValuesEqual(field('ID'), 'AAAAAAAA-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001')).toBe(true);
    });
});

/** A pipeline spec whose outputs write the People fields the tests use. */
const SPEC: DataFeatureSpec = {
    Name: 'JT', Description: 'jt', PromptID: 'prompt-1', Context: { Fields: ['CurrentJobTitle'] }, Caching: { Cacheable: false },
    Outputs: [
        { Name: 'SeniorityLevel', Ref: '$.SeniorityLevel', Target: { Mode: 'field', EntityFieldName: 'SeniorityLevelID', LookupMatchField: 'Name' } },
        { Name: 'Score', Ref: '$.Score', Target: { Mode: 'field', EntityFieldName: 'Score' } },
        { Name: 'ReviewedAt', Ref: '$.ReviewedAt', Target: { Mode: 'field', EntityFieldName: 'ReviewedAt' } },
        { Name: 'IsActive', Ref: '$.IsActive', Target: { Mode: 'field', EntityFieldName: 'IsActive' } },
    ],
};
const CTX: RecordProcessorContext = { contextUser: USER, provider: {} as IMetadataProvider, recordProcessID: 'rp-1', entityID: 'ENT-P', processRunID: 'run-9' };
const EMPTY: TypedFeatureValue = { ValueText: null, ValueNumeric: null, ValueBoolean: null, ValueDate: null, ValueJSON: null };
const fv = (v: string): TypedFeatureValue => ({ ...EMPTY, ValueText: v });

/** Exposes the per-record capture InferProcessor keeps when it upserts a record's Feature Values. */
class CapturedInfer extends InferProcessor {
    constructor() { super('prompt-1', undefined, SPEC, null); }
    public Capture(recordID: string, previous: Record<string, TypedFeatureValue | null>): void { this.KeepPreviousValues(recordID, previous); }
}

describe('InferProcessor.CreateHumanValueGuard', () => {
    const resolve = async (v: unknown): Promise<unknown> => (v === 'Director' ? 'director-id' : v === 'Manager' ? 'manager-id' : null);
    const textEquals = (a: unknown, b: unknown): boolean => OutputMappingWriter.OwnedValuesEqual(undefined, a, b);
    const unit = {} as IMetadataProvider;
    const ask = (g: HumanValueGuard, FieldName: string, CurrentValue: unknown) => g.IsHumanOwned({ FieldName, CurrentValue, Resolve: resolve, Equals: textEquals, Provider: unit });
    const guardOf = (): HumanValueGuard => {
        const g = new InferProcessor('prompt-1', undefined, SPEC, null).CreateHumanValueGuard(record, CTX);
        if (!g) throw new Error('expected a guard for a pipeline with a recordProcessID and entityID');
        return g;
    };

    it('records nothing on a dry run', async () => {
        const rec = vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue();
        const g = new InferProcessor('prompt-1', undefined, SPEC, null).CreateHumanValueGuard(record, { ...CTX, DryRun: true });
        await g?.RecordPreserved('SeniorityLevelID', 'board-id', unit);
        expect(rec).not.toHaveBeenCalled();
    });

    it('retires nothing on a dry run', async () => {
        const retire = vi.spyOn(FeatureValueCacheService.Instance, 'RetireHumanValue').mockResolvedValue(1);
        const g = new InferProcessor('prompt-1', undefined, SPEC, null).CreateHumanValueGuard(record, { ...CTX, DryRun: true });
        expect(await g?.RetireHumanValue('SeniorityLevelID', unit)).toBe(false);
        expect(retire).not.toHaveBeenCalled();
    });

    it('treats a value that differs from what the pipeline last wrote as human', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockImplementation(async (p: LatestFeatureValueParams) => (p.Source === 'Human' ? null : fv('Director')));
        expect(await ask(guardOf(), 'SeniorityLevelID', 'board-id')).toBe(true);
        expect(await ask(guardOf(), 'SeniorityLevelID', 'DIRECTOR-ID')).toBe(false);
    });

    it('treats a value the pipeline never wrote as human, and one with a Human row as human', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        expect(await ask(guardOf(), 'SeniorityLevelID', 'board-id')).toBe(true);
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockImplementation(async (p: LatestFeatureValueParams) => (p.Source === 'Human' ? fv('board-id') : fv('Director')));
        expect(await ask(guardOf(), 'SeniorityLevelID', 'director-id')).toBe(true);
    });

    it('reads on the unit provider and excludes the current run from "what the pipeline last wrote"', async () => {
        const latest = vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        await ask(guardOf(), 'SeniorityLevelID', 'board-id');
        const pipeline = latest.mock.calls.find((c) => c[0].Source === 'Pipeline')?.[0];
        expect(pipeline?.ExcludeProcessRunID).toBe('run-9');
        expect(latest.mock.calls.every((c) => c[0].Provider === unit)).toBe(true);
    });

    it('records the preserved value as a Human Feature Value, and retires it, on the given provider', async () => {
        const rec = vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue();
        await guardOf().RecordPreserved('SeniorityLevelID', 'board-id', unit);
        expect(rec.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'rp-1', EntityID: 'ENT-P', RecordID: 'person-1', FeatureName: 'SeniorityLevel', Value: 'board-id', ProcessRunID: 'run-9' });
        expect(rec.mock.calls[0][0].Provider).toBe(unit);
        const retire = vi.spyOn(FeatureValueCacheService.Instance, 'RetireHumanValue').mockResolvedValue(1);
        expect(await guardOf().RetireHumanValue('SeniorityLevelID', unit)).toBe(true);
        expect(retire.mock.calls[0][0]).toMatchObject({ RecordProcessID: 'rp-1', RecordID: 'person-1', FeatureName: 'SeniorityLevel' });
        retire.mockResolvedValue(0);
        expect(await guardOf().RetireHumanValue('SeniorityLevelID', unit)).toBe(false);
    });

    it('answers "not human" for a field no output of the spec writes', async () => {
        const latest = vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        expect(await ask(guardOf(), 'Nickname', 'Bob')).toBe(false);
        expect(latest).not.toHaveBeenCalled();
    });

    it('prefers the value this run\'s Feature Value write replaced: the in-place upsert left no earlier row to read', async () => {
        // The table's latest Pipeline row (not from this run) says Manager; the row this run rewrote held Director.
        const latest = vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockImplementation(async (p: LatestFeatureValueParams) => (p.Source === 'Human' ? null : fv('Manager')));
        const proc = new CapturedInfer();
        const g = proc.CreateHumanValueGuard(record, CTX);
        if (!g) throw new Error('expected a guard');
        proc.Capture('person-1', { SeniorityLevel: fv('Director') }); // captured after the guard was created: read when asked
        expect(await ask(g, 'SeniorityLevelID', 'director-id')).toBe(false);
        expect(latest.mock.calls.some((c) => c[0].Source === 'Pipeline')).toBe(false);
        const never = new CapturedInfer();
        never.Capture('person-1', { SeniorityLevel: null });
        const g2 = never.CreateHumanValueGuard(record, CTX);
        if (!g2) throw new Error('expected a guard');
        expect(await ask(g2, 'SeniorityLevelID', 'director-id')).toBe(true);
    });

    it('creates no guard when the run names no pipeline', () => {
        const proc = new InferProcessor('prompt-1', undefined, SPEC, null);
        expect(proc.CreateHumanValueGuard(record, { ...CTX, recordProcessID: undefined })).toBeUndefined();
        expect(proc.CreateHumanValueGuard(record, { ...CTX, entityID: undefined })).toBeUndefined();
        expect(new InferProcessor('prompt-1', undefined, undefined, null).CreateHumanValueGuard(record, CTX)).toBeUndefined();
    });
});

describe('the pipeline guard through write-back, by field type', () => {
    /** Runs one write-back of `field` with the real pipeline guard; this run's capture says the pipeline last wrote `last`. */
    async function writeBack(field: 'Score' | 'ReviewedAt' | 'IsActive' | 'SeniorityLevelID', current: unknown, last: TypedFeatureValue | null, proposed: unknown) {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(null);
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue();
        const proc = new CapturedInfer();
        const output = SPEC.Outputs.find((o) => o.Target.Mode === 'field' && o.Target.EntityFieldName === field);
        if (!output) throw new Error(`no output writes ${field}`);
        proc.Capture('person-1', { [output.Name]: last });
        const { provider, saves } = parentProvider({ [field]: current });
        const out = await ApplyOutputMapping({ outputMapping: { fields: { [field]: '$.v' } }, result: { v: proposed }, record, contextUser: USER, provider, humanGuard: proc.CreateHumanValueGuard(record, CTX) });
        return { out, saves };
    }

    it('a decimal the database rounded to its scale is the pipeline\'s own value', async () => {
        const { out, saves } = await writeBack('Score', 0.12, { ...EMPTY, ValueNumeric: 0.123456 }, 0.5);
        expect(out.preservedHumanFields).toBeUndefined();
        expect(saves[0].Score).toBe(0.5);
    });

    it('a date stored as the same instant, and a bit stored as 1, are the pipeline\'s own values', async () => {
        const date = await writeBack('ReviewedAt', '2026-10-13T12:00:00+02:00', { ...EMPTY, ValueDate: new Date('2026-10-13T10:00:00Z') }, new Date('2026-10-14T00:00:00Z'));
        expect(date.out.preservedHumanFields).toBeUndefined();
        const bit = await writeBack('IsActive', 1, { ...EMPTY, ValueBoolean: true }, false);
        expect(bit.out.preservedHumanFields).toBeUndefined();
        expect(bit.saves[0].IsActive).toBe(false);
    });

    it('a value when the pipeline last wrote null is a person\'s', async () => {
        const { out, saves } = await writeBack('Score', 0.12, EMPTY, 0.5);
        expect(out.preservedHumanFields).toEqual(['Score']);
        expect(saves).toHaveLength(0);
    });
});

describe('a withheld (below-confidence-floor) field through the pipeline guard', () => {
    /** One write-back of SeniorityLevelID whose answer was withheld; this run's capture says the pipeline last wrote `last`. */
    async function withheldWrite(current: unknown, last: TypedFeatureValue | null, humanRow: TypedFeatureValue | null = null, overwriteHumanValues = false) {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockImplementation(async (p: LatestFeatureValueParams) => (p.Source === 'Human' ? humanRow : null));
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockResolvedValue();
        const retire = vi.spyOn(FeatureValueCacheService.Instance, 'RetireHumanValue').mockResolvedValue(1);
        const proc = new CapturedInfer();
        proc.Capture('person-1', { SeniorityLevel: last });
        const { provider, saves } = parentProvider({ SeniorityLevelID: current });
        const out = await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'ignored-by-the-floor' },
            record, contextUser: USER, provider, humanGuard: proc.CreateHumanValueGuard(record, CTX), withheld: { Fields: ['SeniorityLevelID'], ChildEntities: [] },
            overwriteHumanValues });
        return { out, saves, retire };
    }

    it('keeps a person\'s value and its Human row even on a run that overwrites human values: an abstention is no answer', async () => {
        const edited = await withheldWrite('board-id', fv('director-id'), null, true);
        expect(edited.saves).toHaveLength(0);
        expect(edited.out.preservedHumanFields).toEqual(['SeniorityLevelID']);
        const human = await withheldWrite('director-id', fv('director-id'), fv('director-id'), true);
        expect(human.saves).toHaveLength(0);
        expect(human.retire).not.toHaveBeenCalled();
        expect(human.out.retiredHumanFields).toBeUndefined();
    });

    it('still clears a value the pipeline wrote on a run that overwrites human values', async () => {
        const { saves, retire } = await withheldWrite('director-id', fv('director-id'), null, true);
        expect(saves).toEqual([expect.objectContaining({ SeniorityLevelID: null })]);
        expect(retire).not.toHaveBeenCalled();
    });

    it('a real answer on a run that overwrites human values still replaces a person\'s value and retires its Human row', async () => {
        vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockResolvedValue(fv('board-id'));
        const retire = vi.spyOn(FeatureValueCacheService.Instance, 'RetireHumanValue').mockResolvedValue(1);
        const proc = new CapturedInfer();
        proc.Capture('person-1', { SeniorityLevel: fv('director-id') });
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const out = await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'manager-id' },
            record, contextUser: USER, provider, humanGuard: proc.CreateHumanValueGuard(record, CTX), overwriteHumanValues: true });
        expect(saves[0].SeniorityLevelID).toBe('manager-id');
        expect(retire).toHaveBeenCalledTimes(1);
        expect(out.retiredHumanFields).toEqual(['SeniorityLevelID']);
    });

    it('keeps a value nothing can confirm the pipeline wrote (no guard)', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'director-id' });
        await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'x' }, record, contextUser: USER, provider,
            withheld: { Fields: ['SeniorityLevelID'], ChildEntities: [] } });
        expect(saves).toHaveLength(0);
    });

    it('leaves a withheld field whose column does not allow null, says why, and does not fail the write', async () => {
        const strict = new EntityInfo({ ID: 'ENT-P', Name: 'People', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
            { Name: 'SeniorityLevelID', Type: 'nvarchar', AllowsNull: false }, { Name: 'Nickname', Type: 'nvarchar' }] });
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'director-id', Nickname: 'old' });
        const members: Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> = { EntityByID: () => strict, GetEntityObject: provider.GetEntityObject };
        const out = await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel', Nickname: '$.nick' } }, result: { SeniorityLevel: 'x', nick: 'new' },
            record, contextUser: USER, provider: members as IMetadataProvider, withheld: { Fields: ['SeniorityLevelID'], ChildEntities: [] } });
        expect(saves).toEqual([expect.objectContaining({ SeniorityLevelID: 'director-id', Nickname: 'new' })]);
        expect(out.withheldKeptFields).toEqual(['SeniorityLevelID']);
        const dry = await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'x' },
            record, contextUser: USER, provider: members as IMetadataProvider, dryRun: true, withheld: { Fields: ['SeniorityLevelID'], ChildEntities: [] } });
        expect(dry.previewFields).toEqual({});
        expect(dry.withheldKeptFields).toEqual(['SeniorityLevelID']);
    });

    it('clears a value the pipeline itself wrote', async () => {
        const { out, saves } = await withheldWrite('director-id', fv('director-id'));
        expect(saves).toEqual([expect.objectContaining({ SeniorityLevelID: null })]);
        expect(out.withheldFields).toEqual(['SeniorityLevelID']);
        expect(out.preservedHumanFields).toBeUndefined();
    });

    it('keeps a value a person entered: one that differs from what the pipeline last wrote, or one with a Human row', async () => {
        const edited = await withheldWrite('board-id', fv('director-id'));
        expect(edited.saves).toHaveLength(0);
        expect(edited.out.preservedHumanFields).toEqual(['SeniorityLevelID']);
        const human = await withheldWrite('director-id', fv('director-id'), fv('director-id'));
        expect(human.saves).toHaveLength(0);
        expect(human.out.preservedHumanFields).toEqual(['SeniorityLevelID']);
    });

    it('changes nothing on an empty field (a second run after the clear)', async () => {
        const { out, saves } = await withheldWrite(null, EMPTY);
        expect(saves).toHaveLength(0);
        expect(out.changed).toBe(false);
        expect(out.withheldFields).toEqual(['SeniorityLevelID']);
    });

    it('a dry run resolves the withheld field to null, and with no guard decides no change, as the real write keeps the value', async () => {
        const { provider } = parentProvider({ SeniorityLevelID: 'director-id' });
        const out = await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'x' }, record, contextUser: USER,
            provider, dryRun: true, withheld: { Fields: ['SeniorityLevelID'], ChildEntities: [] } });
        expect(out.previewFields).toEqual({ SeniorityLevelID: null });
        expect(out.previewFieldChanges).toEqual([]);
        expect(out.withheldFields).toEqual(['SeniorityLevelID']);
    });
});

describe('WriteBackProcessor human values', () => {
    /** An inner processor that answers Manager and can create a guard that calls every current value human. */
    class GuardedProcessor implements IRecordProcessor, HumanValueGuardSource {
        public readonly Recorded: unknown[] = [];
        public async ProcessRecord(): Promise<RecordResult> {
            return { Status: 'Succeeded', ResultPayload: { SeniorityLevel: 'manager-id' } };
        }
        public async ProcessBatch(records: RecordRef[]): Promise<Map<string, RecordResult>> {
            return new Map(records.map((r) => [r.RecordID, { Status: 'Succeeded', ResultPayload: { SeniorityLevel: 'manager-id' } }]));
        }
        public CreateHumanValueGuard(): HumanValueGuard {
            return {
                IsHumanOwned: async () => true,
                RecordPreserved: async (_f: string, v: unknown) => { this.Recorded.push(v); },
                RetireHumanValue: async () => true,
            };
        }
    }
    const mapping = { fields: { SeniorityLevelID: '$.SeniorityLevel' } };
    const contextOf = (provider: IMetadataProvider, overwrite?: boolean): RecordProcessorContext =>
        ({ contextUser: USER, provider, recordProcessID: 'rp-1', entityID: 'ENT-P', processRunID: 'run-9', overwriteHumanValues: overwrite });

    it('keeps a human value, counts it, and leaves the outcome alone (ProcessRecord)', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const inner = new GuardedProcessor();
        const out = await new WriteBackProcessor(inner, mapping).ProcessRecord(record, contextOf(provider));
        expect(saves).toHaveLength(0);
        expect(inner.Recorded).toEqual(['board-id']);
        expect(out.HumanValuesPreserved).toBe(1);
        expect(out.Outcome).toBeUndefined();
    });

    it('overwrites when the run context says so, and reports the record Upserted (ProcessBatch)', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const out = await new WriteBackProcessor(new GuardedProcessor(), mapping).ProcessBatch([record], contextOf(provider, true));
        expect(saves[0].SeniorityLevelID).toBe('manager-id');
        expect(out.get('person-1')?.HumanValuesPreserved).toBe(0);
        expect(out.get('person-1')?.Outcome).toBe('Upserted');
    });

    it('applies the guard on the batch path too', async () => {
        const { provider, saves } = parentProvider({ SeniorityLevelID: 'board-id' });
        const out = await new WriteBackProcessor(new GuardedProcessor(), mapping).ProcessBatch([record], contextOf(provider));
        expect(saves).toHaveLength(0);
        expect(out.get('person-1')?.HumanValuesPreserved).toBe(1);
    });
});

describe('the guard resolves "what the pipeline last wrote" read-only with the mapping\'s lookup', () => {
    /** People with SeniorityLevelID a foreign key to Seniority Levels; `found` is the lookup's row key (null = a miss). */
    function lookupProvider(relatedInMetadata: boolean, found: string | null = '22222222-2222-2222-2222-222222222222') {
        const people = new EntityInfo({
            ID: 'ENT-P', Name: 'People',
            Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', RelatedEntity: 'Seniority Levels' }],
        });
        const levels = new EntityInfo({ ID: 'ENT-S', Name: 'Seniority Levels', Fields: [{ Name: 'LevelKey', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'Name', Type: 'nvarchar' }] });
        const saves: Array<Record<string, unknown>> = [];
        const parent = parentRow({ SeniorityLevelID: '11111111-1111-1111-1111-111111111111' }, saves);
        const created: string[] = [];
        const runView = vi.fn().mockResolvedValue({ Success: true, Results: found ? [{ LevelKey: found }] : [] });
        // Test double: the IMetadataProvider members write-back calls plus RunView, narrowed to the full interface.
        const members: Pick<IMetadataProvider, 'EntityByID' | 'EntityByName' | 'GetEntityObject'> & Pick<IRunViewProvider, 'RunView'> = {
            EntityByID: () => people,
            EntityByName: (n: string) => (n === 'Seniority Levels' && relatedInMetadata ? levels : undefined),
            GetEntityObject: vi.fn().mockImplementation(async (name: string) => {
                if (name !== 'Seniority Levels') return parent;
                created.push(name);
                return parentRow({}, []);
            }),
            RunView: runView,
        };
        const provider: IMetadataProvider = members as IMetadataProvider & IRunViewProvider;
        return { provider, saves, runView, created };
    }
    const resolvingGuard = (resolved: unknown[]): HumanValueGuard => ({
        IsHumanOwned: async (q) => { resolved.push(await q.Resolve('Director')); return false; },
        RecordPreserved: async () => undefined,
        RetireHumanValue: async () => false,
    });

    it('hands the guard a resolver that maps a match string to the related key', async () => {
        const { provider } = lookupProvider(true);
        const resolvedByGuard: unknown[] = [];
        await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: '33333333-3333-3333-3333-333333333333' },
            record, contextUser: USER, provider, humanGuard: resolvingGuard(resolvedByGuard) });
        expect(resolvedByGuard).toEqual(['22222222-2222-2222-2222-222222222222']);
    });

    it('a miss resolves to null under onLookupMiss create (nothing created) and fail (nothing thrown)', async () => {
        for (const onLookupMiss of ['create', 'fail'] as const) {
            const { provider, created } = lookupProvider(true, null);
            const resolvedByGuard: unknown[] = [];
            const out = await ApplyOutputMapping({
                outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' }, fieldLookups: { SeniorityLevelID: { onLookupMiss } } },
                result: { SeniorityLevel: '33333333-3333-3333-3333-333333333333' }, record, contextUser: USER, provider, humanGuard: resolvingGuard(resolvedByGuard),
            });
            expect(resolvedByGuard).toEqual([null]);
            expect(created).toEqual([]);
            expect(out.updatedRecord).toBe(true);
        }
    });

    it('fails the write when the related row found has no usable key', async () => {
        const { provider, runView } = lookupProvider(true);
        runView.mockResolvedValue({ Success: true, Results: [{ LevelKey: null }] });
        await expect(ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'Director' }, record, contextUser: USER, provider }))
            .rejects.toThrow(/found a row without a 'LevelKey' key/);
    });

    it('reads the related key from the column metadata names, and refuses a related entity metadata does not know', async () => {
        const known = lookupProvider(true);
        await ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'Director' }, record, contextUser: USER, provider: known.provider });
        expect(known.saves[0].SeniorityLevelID).toBe('22222222-2222-2222-2222-222222222222');
        expect(known.runView.mock.calls[0][0].Fields).toEqual(['LevelKey']);
        const unknownEntity = lookupProvider(false);
        await expect(ApplyOutputMapping({ outputMapping: { fields: { SeniorityLevelID: '$.SeniorityLevel' } }, result: { SeniorityLevel: 'Director' }, record, contextUser: USER, provider: unknownEntity.provider }))
            .rejects.toThrow(/related entity 'Seniority Levels' is not in metadata/);
        expect(unknownEntity.runView).not.toHaveBeenCalled();
    });
});

describe('the run-wide lookup cache inside a caller\'s transaction', () => {
    /** A caller provider that holds an open transaction: write-back joins it (it is a DatabaseProviderBase with depth 1). */
    class JoinedProvider implements Pick<IMetadataProvider, 'EntityByID' | 'EntityByName' | 'GetEntityObject'>, Pick<IRunViewProvider, 'RunView'> {
        public get TransactionDepth(): number { return 1; }
        public get SupportsEntityTransactions(): boolean { return true; }
        /** Joins the caller's open transaction as a savepoint (nested scope). */
        public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
            return { IsNested: true, Commit: async () => undefined, Rollback: async () => undefined };
        }
        public Lookups = 0;
        public EntityByID = (): EntityInfo => new EntityInfo({
            ID: 'ENT-P', Name: 'People',
            Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }, { Name: 'SeniorityLevelID', Type: 'uniqueidentifier', RelatedEntity: 'Seniority Levels' }],
        });
        public EntityByName = (): EntityInfo => new EntityInfo({ ID: 'ENT-S', Name: 'Seniority Levels', Fields: [{ Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true }] });
        public GetEntityObject: IMetadataProvider['GetEntityObject'] = vi.fn().mockImplementation(async () => parentRow({ ID: 'new-level' }, []));
        public RunView: IRunViewProvider['RunView'] = vi.fn().mockImplementation(async () => { this.Lookups++; return { Success: true, Results: [] }; });
    }
    // Write-back joins a caller's transaction only on a DatabaseProviderBase (an `instanceof` check); the double puts the
    // abstract base's prototype under it rather than implementing the base's many abstract members, which write-back never calls.
    Object.setPrototypeOf(JoinedProvider.prototype, DatabaseProviderBase.prototype);

    it('neither caches a created lookup row nor serves one from the cache while the caller holds a transaction', async () => {
        const joined = new JoinedProvider();
        const provider = joined as Pick<IMetadataProvider, 'EntityByID' | 'EntityByName' | 'GetEntityObject'> as IMetadataProvider;
        const cache = new Map<string, string | number>([['Seniority Levels|Name|Director', 'stale-cached-id']]);
        const mapping = { fields: { SeniorityLevelID: '$.SeniorityLevel' }, fieldLookups: { SeniorityLevelID: { onLookupMiss: 'create' as const } } };
        await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'Director' }, record, contextUser: USER, provider, lookupCache: cache });
        expect(joined.Lookups).toBe(1); // the cached key was not served
        await ApplyOutputMapping({ outputMapping: mapping, result: { SeniorityLevel: 'Principal' }, record, contextUser: USER, provider, lookupCache: cache });
        expect(cache.has('Seniority Levels|Name|Principal')).toBe(false);
    });
});

/* ------------------------------------------------------------------------------------------------------------------
 * Feature Values commit with the write-back. An in-memory store stands in for the database: each provider instance has
 * its own transaction (writes apply on commit, vanish on rollback), and a write to a record's Feature Values holds that
 * record's lock until the writing transaction ends — as SQL Server's row locks make a concurrent read of those rows wait.
 * ------------------------------------------------------------------------------------------------------------------ */

interface StoredFeatureValue { RecordID: string; FeatureName: string; Source: FeatureValueSource; Value: string | null; Run: string | null }

class MemoryStore {
    public FeatureValues: StoredFeatureValue[] = [];
    public People = new Map<string, unknown>();
    private locks = new Map<string, { Owner: MemoryProvider; Released: Promise<void> }>();

    /** Waits for another transaction's lock on the record, then takes it for `owner` until its transaction ends. */
    public async Lock(recordID: string, owner: MemoryProvider): Promise<void> {
        for (let held = this.locks.get(recordID); held && held.Owner !== owner; held = this.locks.get(recordID)) {
            await held.Released;
        }
        if (this.locks.has(recordID)) {
            return;
        }
        let release: () => void = () => undefined;
        const Released = new Promise<void>((r) => { release = r; });
        this.locks.set(recordID, { Owner: owner, Released });
        owner.OnEnd(() => { this.locks.delete(recordID); release(); });
    }

    public Latest(recordID: string, featureName: string, source: FeatureValueSource): StoredFeatureValue | undefined {
        return [...this.FeatureValues].reverse().find((r) => r.RecordID === recordID && r.FeatureName === featureName && r.Source === source);
    }
}

/** A provider instance with its own transaction over a {@link MemoryStore}. */
class MemoryProvider implements Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> {
    private depth = 0;
    private staged: Array<() => void> = [];
    private onEnd: Array<() => void> = [];
    constructor(public readonly Store: MemoryStore, public readonly FailNextPersonSave: { Value: boolean }) {}

    public get TransactionDepth(): number { return this.depth; }
    public get SupportsEntityTransactions(): boolean { return true; }
    public async BeginEntityTransaction(): Promise<EntityTransactionScope> {
        this.depth++;
        return {
            IsNested: false,
            Commit: async () => { this.depth--; this.staged.forEach((w) => w()); this.end(); },
            Rollback: async () => { this.depth--; this.end(); },
        };
    }
    public async CreateIndependentInstance(): Promise<MemoryProvider> { return new MemoryProvider(this.Store, this.FailNextPersonSave); }
    public async ReleaseIndependentInstance(): Promise<void> { /* nothing pooled */ }
    public OnEnd(f: () => void): void { this.onEnd.push(f); }
    /** Runs a write now, or on commit when this instance holds a transaction. */
    public Write(w: () => void): void {
        if (this.depth > 0) this.staged.push(w); else w();
    }
    public EntityByID = (): EntityInfo => PEOPLE;
    public GetEntityObject: IMetadataProvider['GetEntityObject'] = vi.fn().mockImplementation(async () => {
        const self = this;
        return {
            Values: {} as Record<string, unknown>, LatestResult: { CompleteMessage: 'person save failed' }, PrimaryKey: CompositeKey.FromKeyValuePair('ID', 'person-1'),
            Get(f: string) { return f === 'SeniorityLevelID' ? self.Store.People.get('person-1') : this.Values[f]; },
            Set(f: string, v: unknown) { this.Values[f] = v; },
            async InnerLoad() { return true; },
            async Save() {
                await Promise.resolve();
                if (self.FailNextPersonSave.Value) { self.FailNextPersonSave.Value = false; return false; }
                const v = this.Values.SeniorityLevelID;
                self.Write(() => self.Store.People.set('person-1', v));
                return true;
            },
        };
    });

    private end(): void {
        this.staged = [];
        const ends = this.onEnd;
        this.onEnd = [];
        ends.forEach((f) => f());
    }
}
Object.setPrototypeOf(MemoryProvider.prototype, DatabaseProviderBase.prototype);

/** Backs the Feature Value service with the store, through the provider each call is given (as the real service does). */
function backServiceWith(store: MemoryStore): void {
    const unitOf = (p: IMetadataProvider): MemoryProvider => {
        if (!(p instanceof MemoryProvider)) throw new Error('expected a MemoryProvider');
        return p;
    };
    vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockImplementation(async (p: RecordFeatureValuesParams): Promise<RecordFeatureValuesOutcome> => {
        const tx = unitOf(p.Provider);
        if (tx.TransactionDepth > 0) await store.Lock(p.RecordID, tx);
        await Promise.resolve();
        const outcome: RecordFeatureValuesOutcome = { Upserted: 0, Unchanged: 0, Previous: {} };
        for (const out of p.Outputs) {
            const latest = store.Latest(p.RecordID, out.FeatureName, 'Pipeline');
            outcome.Previous[out.FeatureName] = latest ? fv(latest.Value || '') : null;
            const value = typeof out.Value === 'string' ? out.Value : null;
            tx.Write(() => store.FeatureValues.push({ RecordID: p.RecordID, FeatureName: out.FeatureName, Source: 'Pipeline', Value: value, Run: p.ProcessRunID || null }));
            outcome.Upserted++;
        }
        return outcome;
    });
    vi.spyOn(FeatureValueCacheService.Instance, 'GetLatestValue').mockImplementation(async (p: LatestFeatureValueParams) => {
        const latest = store.Latest(p.RecordID, p.FeatureName, p.Source);
        return latest && latest.Run !== p.ExcludeProcessRunID ? fv(latest.Value || '') : null;
    });
    vi.spyOn(FeatureValueCacheService.Instance, 'RecordHumanValue').mockImplementation(async (p: RecordHumanValueParams) => {
        unitOf(p.Provider).Write(() => store.FeatureValues.push({ RecordID: p.RecordID, FeatureName: p.FeatureName, Source: 'Human', Value: String(p.Value), Run: null }));
    });
    vi.spyOn(FeatureValueCacheService.Instance, 'RetireHumanValue').mockImplementation(async (p: FeatureValueRecordRef) => {
        const n = store.FeatureValues.filter((r) => r.RecordID === p.RecordID && r.FeatureName === p.FeatureName && r.Source === 'Human').length;
        unitOf(p.Provider).Write(() => { store.FeatureValues = store.FeatureValues.filter((r) => !(r.RecordID === p.RecordID && r.FeatureName === p.FeatureName && r.Source === 'Human')); });
        return n;
    });
}

const PIN: FeaturePipelinePinData = { PromptID: 'prompt-1', PromptVersionHash: 'pv', AIModelID: null, ParametersHash: 'ph', SpecHash: 'sh' };

/** An Infer pipeline that answers a fixed seniority without a prompt, through InferProcessor's own Feature Value path. */
class ScriptedInfer extends InferProcessor {
    constructor(public Answer: string) { super('prompt-1', undefined, SPEC, null); }
    public override async ProcessRecord(rec: RecordRef, context: RecordProcessorContext): Promise<RecordResult> {
        await Promise.resolve();
        const payload = { SeniorityLevel: this.Answer };
        return this.WithFeatureValues({ Status: 'Succeeded', ResultPayload: payload }, { Record: rec, Context: context, Payload: payload, InputHash: 'in', Pin: PIN });
    }
}

describe('Feature Values commit with the write-back', () => {
    const mapping = { fields: { SeniorityLevelID: '$.SeniorityLevel' } };
    function setup(personValue: string, lastPipelineValue: string) {
        const store = new MemoryStore();
        store.People.set('person-1', personValue);
        store.FeatureValues.push({ RecordID: 'person-1', FeatureName: 'SeniorityLevel', Source: 'Pipeline', Value: lastPipelineValue, Run: 'run-0' });
        backServiceWith(store);
        const fail = { Value: false };
        const caller = new MemoryProvider(store, fail);
        const provider = caller as Pick<IMetadataProvider, 'EntityByID' | 'GetEntityObject'> as IMetadataProvider;
        const contextOf = (run: string): RecordProcessorContext => ({ contextUser: USER, provider, recordProcessID: 'rp-1', entityID: 'ENT-P', processRunID: run });
        return { store, fail, contextOf };
    }

    it('a failed write-back leaves the previous Feature Value, so the next run does not call the pipeline\'s value human', async () => {
        const { store, fail, contextOf } = setup('level-x', 'level-x');
        fail.Value = true;
        // The failed write-back logs its error; capture it rather than print it, and check it was logged
        const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const first = await new WriteBackProcessor(new ScriptedInfer('level-y'), mapping).ProcessRecord(record, contextOf('run-1'));
        expect(logged.mock.calls.some((c) => String(c[0]).includes('write-back failed'))).toBe(true);
        logged.mockRestore();
        expect(first.Status).toBe('Failed');
        expect(store.FeatureValues.filter((r) => r.Value === 'level-y')).toEqual([]); // rolled back with the write-back
        const second = await new WriteBackProcessor(new ScriptedInfer('level-y'), mapping).ProcessRecord(record, contextOf('run-2'));
        expect(second.Status).toBe('Succeeded');
        expect(second.HumanValuesPreserved).toBe(0);
        expect(store.People.get('person-1')).toBe('level-y');
        expect(store.FeatureValues.some((r) => r.Source === 'Human')).toBe(false);
        // The successful write-back committed the pipeline's Feature Value with it.
        expect(store.FeatureValues.filter((r) => r.Source === 'Pipeline' && r.Value === 'level-y').map((r) => r.Run)).toEqual(['run-2']);
    });

    it('two concurrent runs on one record: the second waits for the first, and neither calls the pipeline\'s value human', async () => {
        const { store, contextOf } = setup('level-x', 'level-x');
        const [a, b] = await Promise.all([
            new WriteBackProcessor(new ScriptedInfer('level-y'), mapping).ProcessRecord(record, contextOf('run-a')),
            new WriteBackProcessor(new ScriptedInfer('level-y'), mapping).ProcessRecord(record, contextOf('run-b')),
        ]);
        expect([a.Status, b.Status]).toEqual(['Succeeded', 'Succeeded']);
        expect([a.HumanValuesPreserved, b.HumanValuesPreserved]).toEqual([0, 0]);
        expect(store.People.get('person-1')).toBe('level-y');
        expect(store.FeatureValues.some((r) => r.Source === 'Human')).toBe(false);
    });

    it('a dry run writes no Feature Value, and a record that failed before write-back leaves none queued', async () => {
        const { store, contextOf } = setup('level-x', 'level-x');
        const before = store.FeatureValues.length;
        const dry = await new WriteBackProcessor(new ScriptedInfer('level-y'), mapping, true).ProcessRecord(record, contextOf('run-d'));
        expect(dry.Status).toBe('Succeeded');
        expect(store.FeatureValues.length).toBe(before);
        const infer = new ScriptedInfer('level-y');
        await new WriteBackProcessor(infer, mapping, true).ProcessRecord(record, contextOf('run-d2'));
        expect(await infer.WriteDeferredFeatureValues('person-1', {} as IMetadataProvider)).toBeNull(); // nothing left queued
    });

    it('a second pass over the same record in one run compares with the value the first pass committed', async () => {
        const { store, contextOf } = setup('level-x', 'level-x');
        const infer = new ScriptedInfer('level-y');
        const writeBack = new WriteBackProcessor(infer, mapping);
        await writeBack.ProcessRecord(record, contextOf('run-p'));
        infer.Answer = 'level-z';
        const second = await writeBack.ProcessRecord(record, contextOf('run-p'));
        expect(second.HumanValuesPreserved).toBe(0);
        expect(store.People.get('person-1')).toBe('level-z');
        expect(store.FeatureValues.some((r) => r.Source === 'Human')).toBe(false);
    });

    it('a failed in-unit Feature Value write keeps the typed save error as its cause', async () => {
        const { contextOf } = setup('level-x', 'level-x');
        const saveError = new FeatureValueSaveError('SeniorityLevel', 'person-1', 'UQ violation');
        vi.spyOn(FeatureValueCacheService.Instance, 'RecordFeatureValues').mockRejectedValue(saveError);
        const infer = new ScriptedInfer('level-y');
        infer.DeferFeatureValuesToWriteBack();
        await infer.ProcessRecord(record, contextOf('run-e'));
        const failure = await infer.WriteDeferredFeatureValues('person-1', {} as IMetadataProvider).catch((e: Error) => e);
        expect(failure).toBeInstanceOf(Error);
        expect(failure instanceof Error ? failure.cause : undefined).toBe(saveError);
        expect(failure instanceof Error ? failure.message : '').toContain("Feature Value write failed for record 'person-1'");
    });

    it('a pipeline without write-back saves its Feature Values itself, as before', async () => {
        const { store, contextOf } = setup('level-x', 'level-x');
        const result = await new ScriptedInfer('level-y').ProcessRecord(record, contextOf('run-n'));
        expect(result.Outcome).toBe('Upserted');
        expect(store.FeatureValues.some((r) => r.Value === 'level-y' && r.Run === 'run-n')).toBe(true);
    });

    it('the record\'s outcome reports the Feature Values written inside the unit', async () => {
        const { contextOf } = setup('level-y', 'level-y');
        const out = await new WriteBackProcessor(new ScriptedInfer('level-y'), mapping).ProcessRecord(record, contextOf('run-o'));
        expect(out.Outcome).toBe('Upserted'); // the store counts every write as an upsert
    });
});

describe('the overwrite switch reaches every record', () => {
    it('RecordSetProcessor hands overwriteHumanValues to each record\'s context', async () => {
        const seen: Array<boolean | undefined> = [];
        await RecordSetProcessor.Instance.Process({
            source: new ArraySource([{ EntityID: 'ENT-P', RecordID: 'person-1' }], 'ENT-P'),
            processor: new FunctionRecordProcessor((_r, ctx) => { seen.push(ctx.overwriteHumanValues); return { Status: 'Succeeded' }; }),
            tracker: new NoOpTracker(), contextUser: USER, provider: {} as IMetadataProvider, overwriteHumanValues: true,
        });
        expect(seen).toEqual([true]);
    });

    it('RecordProcessExecutor passes the run option and its provider to the engine', async () => {
        const done: ProcessRunResult = { Status: 'Completed', Total: 1, Processed: 1, Success: 1, Error: 0, Skipped: 0 };
        const process = vi.spyOn(RecordSetProcessor.Instance, 'Process').mockResolvedValue(done);
        const def: Pick<MJRecordProcessEntity, 'ID' | 'Name' | 'EntityID' | 'WorkType' | 'ActionID' | 'InputMapping' | 'OutputMapping' | 'SkipUnchanged'
            | 'WatermarkStrategy' | 'BatchSize' | 'MaxConcurrency' | 'ScopeType'> = {
            ID: 'rp-1', Name: 'JT', EntityID: 'ENT-P', WorkType: 'Action', ActionID: 'action-1', InputMapping: null, OutputMapping: null,
            SkipUnchanged: false, WatermarkStrategy: null, BatchSize: null, MaxConcurrency: null, ScopeType: 'SingleRecord',
        };
        const provider = {} as IMetadataProvider;
        await new RecordProcessExecutor().Run(def as MJRecordProcessEntity, { contextUser: USER, provider, singleRecordID: 'person-1', overwriteHumanValues: true });
        expect(process.mock.calls[0][0].overwriteHumanValues).toBe(true);
        expect(process.mock.calls[0][0].provider).toBe(provider);
    });
});
