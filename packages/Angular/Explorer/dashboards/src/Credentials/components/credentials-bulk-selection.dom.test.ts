/**
 * Pins which credentials the Credentials list's bulk actions touch. Each selected ID used to be looked
 * up by scanning every loaded credential; the credentials are now indexed once. These specs hold the
 * bulk toggle to the same rows: selected IDs matched in any case, selection order kept, an ID that is
 * no longer loaded skipped, and credentials already in the target state left alone.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { MJNotificationService } from '@memberjunction/ng-notifications';
import type { MJCredentialEntity } from '@memberjunction/core-entities';
import { CredentialsListResourceComponent } from './credentials-list-resource.component';

const SMTP = 'aaaaaaaa-0000-0000-0000-000000000001';
const S3 = 'bbbbbbbb-0000-0000-0000-000000000002';
const SLACK = 'cccccccc-0000-0000-0000-000000000003';

describe('CredentialsListResourceComponent.BulkToggleActive', () => {
    afterEach(() => vi.restoreAllMocks());

    it('activates the selected inactive credentials, matching IDs in any case', async () => {
        const saved: string[] = [];
        const credential = (ID: string, Name: string, IsActive: boolean) =>
            ({ ID, Name, IsActive, TransactionGroup: null as unknown, Save: vi.fn(async () => { saved.push(Name); return true; }) });
        const notify = vi.fn();
        vi.spyOn(MJNotificationService, 'Instance', 'get').mockReturnValue({ CreateSimpleNotification: notify } as unknown as MJNotificationService);

        const c = Object.create(CredentialsListResourceComponent.prototype) as CredentialsListResourceComponent;
        Object.defineProperty(c, 'UserCanUpdate', { get: () => true });
        Object.assign(c, {
            Credentials: [credential(SMTP, 'SMTP', false), credential(S3.toUpperCase(), 'S3', false), credential(SLACK, 'Slack', true)] as unknown as MJCredentialEntity[],
            SelectedCredentials: new Set([S3, 'dddddddd-0000-0000-0000-000000000004', SLACK.toUpperCase(), SMTP.toUpperCase()]),
            _metadata: { CreateTransactionGroup: async () => ({ Submit: async () => true }) },
            ClearSelection: vi.fn(),
            applyFilters: vi.fn(),
        });

        await c.BulkToggleActive(true);

        expect(saved).toEqual(['S3', 'SMTP']);
        expect(c.Credentials.map(x => x.IsActive)).toEqual([true, true, true]);
        expect(notify).toHaveBeenCalledWith('2 credential(s) activated', 'success', 3000);
    });
});
