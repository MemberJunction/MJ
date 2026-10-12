import { describe, it, expect, vi } from 'vitest';
import { EntitySaveOptions } from '@memberjunction/core';

vi.mock('@memberjunction/global', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/global')>();
    return {
        ...actual,
        RegisterClass: () => (target: unknown) => target,
    };
});

const vectorIndexSuperSave = vi.fn().mockResolvedValue(true);
const duplicateRunSuperSave = vi.fn().mockResolvedValue(true);
const componentSuperSave = vi.fn().mockResolvedValue(true);

vi.mock('@memberjunction/core-entities', async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>();

    class StubVectorIndexEntity {
        public IsSaved = true;
        public Name = 'Test Vector Index';
        public async Save(options?: EntitySaveOptions): Promise<boolean> {
            return vectorIndexSuperSave(options);
        }
    }

    class StubDuplicateRunEntity {
        public ID = 'run-1';
        public EndedAt = new Date(); // Avoid triggering async detection pass
        public async Save(options?: EntitySaveOptions): Promise<boolean> {
            return duplicateRunSuperSave(options);
        }
    }

    class StubComponentEntityExtended {
        public async GenerateEmbeddingsByFieldName(): Promise<void> {}
        public async Save(options?: EntitySaveOptions): Promise<boolean> {
            return componentSuperSave(options);
        }
    }

    return {
        ...actual,
        MJVectorIndexEntity: StubVectorIndexEntity,
        MJDuplicateRunEntity: StubDuplicateRunEntity,
        MJComponentEntityExtended: StubComponentEntityExtended,
    };
});

import { MJVectorIndexEntityServer } from '../custom/MJVectorIndexEntityServer.server';
import { MJDuplicateRunEntityServer } from '../custom/MJDuplicateRunEntityServer.server';
import { MJComponentEntityServer } from '../custom/MJComponentEntityServer.server';

describe('SaveHooks options forwarding to super.Save(options)', () => {
    const sampleOptions: EntitySaveOptions = {
        SkipEntityActions: true,
        SkipEntityAIActions: true,
    };

    it('MJVectorIndexEntityServer forwards options to super.Save', async () => {
        const viEntity = new MJVectorIndexEntityServer();
        vectorIndexSuperSave.mockClear();

        await viEntity.Save(sampleOptions);

        expect(vectorIndexSuperSave).toHaveBeenCalledTimes(1);
        expect(vectorIndexSuperSave).toHaveBeenCalledWith(sampleOptions);
    });

    it('MJDuplicateRunEntityServer forwards options to super.Save', async () => {
        const dupeEntity = new MJDuplicateRunEntityServer();
        duplicateRunSuperSave.mockClear();

        await dupeEntity.Save(sampleOptions);

        expect(duplicateRunSuperSave).toHaveBeenCalledTimes(1);
        expect(duplicateRunSuperSave).toHaveBeenCalledWith(sampleOptions);
    });

    it('MJComponentEntityServer forwards options to super.Save', async () => {
        const compEntity = new MJComponentEntityServer();
        componentSuperSave.mockClear();

        await compEntity.Save(sampleOptions);

        expect(componentSuperSave).toHaveBeenCalledTimes(1);
        expect(componentSuperSave).toHaveBeenCalledWith(sampleOptions);
    });
});
