import { createHash } from 'node:crypto';
import {
  BaseCommunicationPrincipal,
  CommunicationEngineBase,
  PrincipalAttributes,
  PrincipalRecordRef,
  ResolvedEndpoint,
} from '@memberjunction/communication-types';
import { EntityInfo, IMetadataProvider, IRunViewProvider, LogError, Metadata, RunView, UserInfo } from '@memberjunction/core';
import type {
  MJCommunicationEndpointEntity,
  MJCommunicationEndpointPrincipalEntity,
  MJCommunicationPrincipalEntity,
} from '@memberjunction/core-entities';
import { EscapeSQLString, RegisterClass, UUIDMap, UUIDsEqual } from '@memberjunction/global';

const LAST_SEEN_REFRESH_INTERVAL_MS = 86_400_000; // 24 hours

interface PrincipalSlotConfig {
  Slots?: {
    FullName?: string;
    Jurisdiction?: string;
    Timezone?: string;
    PreferredLanguage?: string;
    IsExistingCustomer?: string;
  };
}

interface NormalizedAddress {
  RawValue: string;
  NormalizedValue: string;
  ValueHash: string;
  Domain?: string;
}

/**
 * Returns the map key used for a principal record throughout the V2 pipeline: `<EntityID
 * lower-cased>:<RecordID>`.
 */
export function PrincipalRecordKey(ref: Pick<PrincipalRecordRef, 'EntityID' | 'RecordID'>): string {
  return `${ref.EntityID.toLowerCase()}:${ref.RecordID}`;
}

/** Returns the SHA-256 hex digest of a normalized address: the `ValueHash` of an endpoint. */
export function ComputeEndpointHash(normalizedValue: string): string {
  return createHash('sha256').update(normalizedValue, 'utf8').digest('hex');
}

/**
 * Normalizes a raw address. A value containing `@` (or any value when `channelType` is `'email'`)
 * is lower-cased as an email; anything else is reduced to its digits, keeping a leading `+`.
 * Returns `null` for an empty value.
 *
 * @param raw - The address as entered.
 * @param channelType - The base message type's `Type`, such as `Email` or `SMS`.
 */
export function NormalizeEndpointAddress(raw: string, channelType?: string): NormalizedAddress | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const isEmail = channelType?.toLowerCase() === 'email' || trimmed.includes('@');
  if (isEmail) {
    const normalized = trimmed.toLowerCase();
    const atIndex = normalized.lastIndexOf('@');
    const domain = atIndex > 0 ? normalized.slice(atIndex + 1) : undefined;
    return {
      RawValue: trimmed,
      NormalizedValue: normalized,
      ValueHash: ComputeEndpointHash(normalized),
      Domain: domain,
    };
  }

  // Phone / SMS E.164-style normalization
  const hasPlus = trimmed.startsWith('+');
  const digits = trimmed.replace(/\D/g, '');
  if (!digits) return null;
  const normalized = hasPlus ? `+${digits}` : digits;
  return {
    RawValue: trimmed,
    NormalizedValue: normalized,
    ValueHash: ComputeEndpointHash(normalized),
  };
}

/**
 * Metadata-driven principal adapter using EntityCommunicationMessageTypes,
 * EntityCommunicationFields, and CommunicationPrincipal.Configuration JSON slots.
 */
@RegisterClass(BaseCommunicationPrincipal, 'DefaultCommunicationPrincipal')
export class DefaultCommunicationPrincipal extends BaseCommunicationPrincipal {
  private readonly provider?: IMetadataProvider;
  private readonly runViewProvider?: IRunViewProvider;

  constructor(provider?: IMetadataProvider, runViewProvider?: IRunViewProvider) {
    super();
    this.provider = provider;
    this.runViewProvider = runViewProvider;
  }

  /**
   * Reads each record's address fields (from `RecordData`, else from the database), creates missing
   * `MJ: Communication Endpoints` and `MJ: Communication Endpoint Principals` rows, and returns the
   * endpoints in address-field priority order.
   */
  public async ResolveEndpoints(
    records: PrincipalRecordRef[],
    channelID: string,
    contextUser: UserInfo,
  ): Promise<Map<string, ResolvedEndpoint[]>> {
    const result = new Map<string, ResolvedEndpoint[]>();
    if (records.length === 0) return result;

    const base = CommunicationEngineBase.Instance;
    const channelType = base.BaseMessageTypes.find((t) => UUIDsEqual(t.ID, channelID))?.Type;
    const byEntity = this.groupByEntity(records);
    const extracted = new Map<string, NormalizedAddress[]>();
    const allHashes = new Set<string>();

    for (const [entityID, group] of byEntity) {
      const fields = this.getAddressFieldsForEntity(entityID, channelID);
      if (fields.length === 0) continue;

      const rowMap = await this.ensureRecordData(entityID, group, fields, contextUser);
      for (const ref of group) {
        const key = PrincipalRecordKey(ref);
        const data = ref.RecordData ?? rowMap.get(ref.RecordID) ?? {};
        const addrs = this.extractAddresses(data, fields, channelType);
        if (addrs.length > 0) {
          extracted.set(key, addrs);
          for (const a of addrs) allHashes.add(a.ValueHash);
        }
      }
    }

    if (allHashes.size === 0) return result;

    const endpointsByHash = await this.upsertEndpoints(
      channelID,
      extracted,
      Array.from(allHashes),
      contextUser,
    );
    await this.upsertEndpointPrincipals(records, extracted, endpointsByHash, contextUser);

    for (const ref of records) {
      const key = PrincipalRecordKey(ref);
      const addrs = extracted.get(key) ?? [];
      const resolved: ResolvedEndpoint[] = [];
      for (const a of addrs) {
        const ep = endpointsByHash.get(a.ValueHash);
        if (ep) {
          resolved.push({
            CommunicationEndpointID: ep.ID,
            ChannelID: channelID,
            NormalizedValue: a.NormalizedValue,
            ValueHash: a.ValueHash,
            RawValue: a.RawValue,
            Domain: a.Domain,
            EndpointEntity: ep,
          });
        }
      }
      if (resolved.length > 0) {
        result.set(key, resolved);
      }
    }

    return result;
  }

  /**
   * Reads the jurisdiction from the field named by `Configuration.Slots.Jurisdiction` on the
   * entity's principal row. Returns `null` for every record when no slot is configured.
   */
  public async ResolveJurisdiction(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, string | null>> {
    const result = new Map<string, string | null>();
    if (records.length === 0) return result;

    const byEntity = this.groupByEntity(records);
    for (const [entityID, group] of byEntity) {
      const slots = this.getPrincipalSlots(entityID);
      const path = slots.Jurisdiction;
      const topField = path ? path.split('.')[0] : undefined;
      const rowMap = topField
        ? await this.ensureRecordData(entityID, group, [topField], contextUser)
        : new Map<string, Record<string, unknown>>();

      for (const ref of group) {
        const data = ref.RecordData ?? rowMap.get(ref.RecordID) ?? {};
        const val = path ? this.readPath(data, path) : undefined;
        result.set(PrincipalRecordKey(ref), typeof val === 'string' && val.trim() ? val.trim() : null);
      }
    }

    return result;
  }

  /**
   * Reads `FullName`, `Timezone`, `PreferredLanguage` and `IsExistingCustomer` from the fields
   * named in `Configuration.Slots`, defaulting each slot to a field of the same name.
   */
  public async ResolveAttributes(
    records: PrincipalRecordRef[],
    contextUser: UserInfo,
  ): Promise<Map<string, PrincipalAttributes>> {
    const result = new Map<string, PrincipalAttributes>();
    if (records.length === 0) return result;

    const byEntity = this.groupByEntity(records);
    for (const [entityID, group] of byEntity) {
      const slots = this.getPrincipalSlots(entityID);
      const fields = [
        slots.FullName,
        slots.Timezone,
        slots.PreferredLanguage,
        slots.IsExistingCustomer,
      ]
        .filter((f): f is string => Boolean(f))
        .map((f) => f.split('.')[0]);

      const rowMap =
        fields.length > 0
          ? await this.ensureRecordData(entityID, group, fields, contextUser)
          : new Map<string, Record<string, unknown>>();

      for (const ref of group) {
        const data = ref.RecordData ?? rowMap.get(ref.RecordID) ?? {};
        result.set(PrincipalRecordKey(ref), {
          FullName: this.readStringSlot(data, slots.FullName ?? 'FullName'),
          Timezone: this.readStringSlot(data, slots.Timezone ?? 'Timezone'),
          PreferredLanguage: this.readStringSlot(
            data,
            slots.PreferredLanguage ?? 'PreferredLanguage',
          ),
          IsExistingCustomer: this.readBooleanSlot(
            data,
            slots.IsExistingCustomer ?? 'IsExistingCustomer',
          ),
        });
      }
    }

    return result;
  }

  private getAddressFieldsForEntity(entityID: string, channelID: string): string[] {
    const base = CommunicationEngineBase.Instance;
    const msgTypes = base.Metadata.EntityCommunicationMessageTypes.filter(
      (mt) =>
        mt.IsActive &&
        UUIDsEqual(mt.EntityID, entityID) &&
        UUIDsEqual(mt.BaseMessageTypeID, channelID),
    );
    const msgTypeIds = new Set(msgTypes.map((m) => m.ID.toLowerCase()));
    return base.Metadata.EntityCommunicationFields.filter((f) =>
      msgTypeIds.has(f.EntityCommunicationMessageTypeID.toLowerCase()),
    )
      .sort((a, b) => a.Priority - b.Priority)
      .map((f) => f.FieldName);
  }

  private getPrincipalSlots(entityID: string): NonNullable<PrincipalSlotConfig['Slots']> {
    const principal: MJCommunicationPrincipalEntity | undefined =
      CommunicationEngineBase.Instance.Principals.find(
        (p) => p.Status === 'Active' && UUIDsEqual(p.EntityID, entityID),
      );
    if (!principal?.Configuration) return {};
    try {
      const parsed = JSON.parse(principal.Configuration) as PrincipalSlotConfig;
      return parsed.Slots ?? {};
    } catch {
      return {};
    }
  }

  private groupByEntity(records: PrincipalRecordRef[]): UUIDMap<PrincipalRecordRef[]> {
    const map = new UUIDMap<PrincipalRecordRef[]>();
    for (const ref of records) {
      const list = map.Get(ref.EntityID) ?? [];
      list.push(ref);
      map.Set(ref.EntityID, list);
    }
    return map;
  }

  private getRunView(): RunView {
    return new RunView(this.runViewProvider);
  }

  private async ensureRecordData(
    entityID: string,
    group: PrincipalRecordRef[],
    fields: string[],
    contextUser: UserInfo,
  ): Promise<Map<string, Record<string, unknown>>> {
    const rowMap = new Map<string, Record<string, unknown>>();
    const missingIds = group
      .filter((r) => !r.RecordData)
      .map((r) => r.RecordID);
    if (missingIds.length === 0) return rowMap;

    const md = this.provider ?? Metadata.Provider;
    const entityInfo: EntityInfo | undefined = md.Entities.find((e) => UUIDsEqual(e.ID, entityID));
    if (!entityInfo) return rowMap;

    const pkName = entityInfo.FirstPrimaryKey.Name; // first-pk-ok: single-column principal record PK lookup
    const uniqueFields = Array.from(new Set([pkName, ...fields]));
    const quotedIds = missingIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');

    const rv = this.getRunView();
    const res = await rv.RunView<Record<string, unknown>>(
      {
        EntityName: entityInfo.Name,
        Fields: uniqueFields,
        ExtraFilter: `${pkName} IN (${quotedIds})`,
        ResultType: 'simple',
      },
      contextUser,
    );

    if (res.Success && res.Results) {
      for (const row of res.Results) {
        const pkVal = row[pkName];
        if (typeof pkVal === 'string') {
          rowMap.set(pkVal, row);
        }
      }
    }
    return rowMap;
  }

  private extractAddresses(
    data: Record<string, unknown>,
    fields: string[],
    channelType?: string,
  ): NormalizedAddress[] {
    const out: NormalizedAddress[] = [];
    const seenHashes = new Set<string>();

    for (const field of fields) {
      const val = this.readPath(data, field);
      if (typeof val !== 'string' || !val.trim()) continue;
      const norm = NormalizeEndpointAddress(val, channelType);
      if (norm && !seenHashes.has(norm.ValueHash)) {
        seenHashes.add(norm.ValueHash);
        out.push(norm);
      }
    }
    return out;
  }

  private async upsertEndpoints(
    channelID: string,
    extracted: Map<string, NormalizedAddress[]>,
    hashes: string[],
    contextUser: UserInfo,
  ): Promise<Map<string, MJCommunicationEndpointEntity>> {
    const byHash = new Map<string, MJCommunicationEndpointEntity>();
    const quoted = hashes.map((h) => `'${EscapeSQLString(h)}'`).join(',');
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationEndpointEntity>(
      {
        EntityName: 'MJ: Communication Endpoints',
        ExtraFilter: `BaseMessageTypeID='${EscapeSQLString(channelID)}' AND ValueHash IN (${quoted})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    if (res.Success && res.Results) {
      for (const ep of res.Results) {
        byHash.set(ep.ValueHash, ep);
      }
    }

    const md = this.provider ?? Metadata.Provider;
    const writeUser = CommunicationEngineBase.Instance.ContextUser ?? contextUser;
    for (const addrs of extracted.values()) {
      for (const addr of addrs) {
        if (byHash.has(addr.ValueHash)) continue;
        const entity = await md.GetEntityObject<MJCommunicationEndpointEntity>(
          'MJ: Communication Endpoints',
          writeUser,
        );
        entity.BaseMessageTypeID = channelID;
        entity.NormalizedValue = addr.NormalizedValue;
        entity.ValueHash = addr.ValueHash;
        entity.Domain = addr.Domain ?? null;
        entity.Status = 'Active';
        entity.SoftBounceCount = 0;
        if (await entity.Save()) {
          byHash.set(addr.ValueHash, entity);
        } else {
          LogError(`Failed to save Communication Endpoint: ${entity.LatestResult?.CompleteMessage ?? 'unknown'}`);
        }
      }
    }

    return byHash;
  }

  private async upsertEndpointPrincipals(
    records: PrincipalRecordRef[],
    extracted: Map<string, NormalizedAddress[]>,
    endpointsByHash: Map<string, MJCommunicationEndpointEntity>,
    contextUser: UserInfo,
  ): Promise<void> {
    const endpointIds = Array.from(endpointsByHash.values()).map((e) => e.ID);
    if (endpointIds.length === 0) return;

    const quotedEpIds = endpointIds.map((id) => `'${EscapeSQLString(id)}'`).join(',');
    const rv = this.getRunView();
    const res = await rv.RunView<MJCommunicationEndpointPrincipalEntity>(
      {
        EntityName: 'MJ: Communication Endpoint Principals',
        ExtraFilter: `CommunicationEndpointID IN (${quotedEpIds})`,
        ResultType: 'entity_object',
      },
      contextUser,
    );

    const existingLinks = new Map<string, MJCommunicationEndpointPrincipalEntity>();
    if (res.Success && res.Results) {
      for (const link of res.Results) {
        existingLinks.set(
          `${link.CommunicationEndpointID.toLowerCase()}:${link.EntityID.toLowerCase()}:${link.RecordID}`,
          link,
        );
      }
    }

    const now = new Date();
    const md = this.provider ?? Metadata.Provider;

    for (const ref of records) {
      const addrs = extracted.get(PrincipalRecordKey(ref)) ?? [];
      for (const addr of addrs) {
        const ep = endpointsByHash.get(addr.ValueHash);
        if (!ep) continue;
        const linkKey = `${ep.ID.toLowerCase()}:${ref.EntityID.toLowerCase()}:${ref.RecordID}`;
        const existing = existingLinks.get(linkKey);

        if (existing) {
          if (now.getTime() - existing.LastSeenAt.getTime() >= LAST_SEEN_REFRESH_INTERVAL_MS) {
            existing.LastSeenAt = now;
            if (!(await existing.Save())) {
              LogError(`DefaultCommunicationPrincipal: failed to update LastSeenAt on link ${existing.ID}: ${existing.LatestResult?.CompleteMessage ?? 'unknown error'}`);
            }
          }
        } else {
          const link = await md.GetEntityObject<MJCommunicationEndpointPrincipalEntity>(
            'MJ: Communication Endpoint Principals',
            CommunicationEngineBase.Instance.ContextUser ?? contextUser,
          );
          link.CommunicationEndpointID = ep.ID;
          link.EntityID = ref.EntityID;
          link.RecordID = ref.RecordID;
          link.FirstSeenAt = now;
          link.LastSeenAt = now;
          if (await link.Save()) {
            existingLinks.set(linkKey, link);
          }
        }
      }
    }
  }

  private readPath(data: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = data;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    return current;
  }

  private readStringSlot(data: Record<string, unknown>, path: string): string | undefined {
    const val = this.readPath(data, path);
    return typeof val === 'string' && val.trim() ? val.trim() : undefined;
  }

  private readBooleanSlot(data: Record<string, unknown>, path: string): boolean | undefined {
    const val = this.readPath(data, path);
    return typeof val === 'boolean' ? val : undefined;
  }
}
