import { describe, expect, it } from 'vitest';
import type { EntityInfo, EntityUserPermissionInfo, UserInfo } from '@memberjunction/core';
import { CanManageArchiveSeedJob } from '../archiveSeed/ArchiveSeedAccess.js';

const OWNER_ID = 'A1B2C3D4-0000-4000-8000-000000000001';
const OTHER = { ID: 'b1b2c3d4-0000-4000-8000-000000000002' } as UserInfo;

function CompanyIntegrations(canUpdate: boolean): EntityInfo {
  const permissions = { CanRead: true, CanUpdate: canUpdate } as EntityUserPermissionInfo;
  const partial: Partial<EntityInfo> = { GetUserPermisions: () => permissions };
  return partial as EntityInfo;
}

describe('CanManageArchiveSeedJob', () => {
  it('allows the owner, comparing IDs case-insensitively', () => {
    const owner = { ID: OWNER_ID.toLowerCase() } as UserInfo;
    expect(CanManageArchiveSeedJob(OWNER_ID, owner, CompanyIntegrations(false))).toBe(true);
  });

  it('allows another user who can update company integrations', () => {
    expect(CanManageArchiveSeedJob(OWNER_ID, OTHER, CompanyIntegrations(true))).toBe(true);
  });

  it('refuses another user who can only read company integrations', () => {
    expect(CanManageArchiveSeedJob(OWNER_ID, OTHER, CompanyIntegrations(false))).toBe(false);
  });

  it('refuses another user when the entity metadata is missing', () => {
    expect(CanManageArchiveSeedJob(OWNER_ID, OTHER, undefined)).toBe(false);
  });
});
