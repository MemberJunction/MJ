/**
 * RecordAppInstallation stores where the app was installed from, so upgrade and remove can find
 * the same source again. A local app stores its `file:` locator, not the manifest's repository.
 */
import { describe, it, expect, vi } from 'vitest';
import type { IMetadataProvider, UserInfo } from '@memberjunction/core';
import type { MJAppManifest } from '../manifest/manifest-schema.js';

vi.mock('@memberjunction/core', () => {
    /** No installed apps, so the record is a new install. */
    class EmptyRunView {
        static FromMetadataProvider(): EmptyRunView {
            return new EmptyRunView();
        }
        async RunView() {
            return { Success: true, Results: [] };
        }
    }
    return { Metadata: class {}, RunView: EmptyRunView, CompositeKey: { FromID: (id: string) => id } };
});

import { RecordAppInstallation } from '../install/history-recorder.js';

/** The fields RecordAppInstallation writes, plus the calls it makes on a new record. */
interface RecordedApp {
    ID: string;
    RepositoryURL?: string;
    Subpath?: string | null;
    NewRecord: () => void;
    Save: () => Promise<boolean>;
}

const MANIFEST = {
    name: 'analytics',
    displayName: 'Analytics',
    version: '1.0.0',
    publisher: { name: 'Acme' },
    repository: 'https://github.com/acme/platform',
    mjVersionRange: '>=5.0.0 <6.0.0',
} as MJAppManifest;

describe('RecordAppInstallation', () => {
    it('stores the source locator as RepositoryURL when one is given', async () => {
        const entity: RecordedApp = { ID: 'id-analytics', NewRecord: vi.fn(), Save: vi.fn(async () => true) };
        const provider = { GetEntityObject: vi.fn(async () => entity) } as unknown as IMetadataProvider;

        await RecordAppInstallation({ ID: 'user-1' } as UserInfo, MANIFEST, undefined, undefined, 'Installing', provider, undefined, 'file:openapps/analytics');

        expect(entity.RepositoryURL).toBe('file:openapps/analytics');
        expect(entity.Subpath).toBeNull();
    });
});
