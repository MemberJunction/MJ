// type-graphql decorators on ListOperationsResolver require reflect-metadata first.
import 'reflect-metadata';

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
    BaseEntity,
    CompositeKey,
    DatabaseProviderBase,
    EntityInfo,
    EntitySaveOptions,
    IEntityDataProvider,
    IMetadataProvider,
    IRunViewProvider,
    Metadata,
    RunView,
    RunViewParams,
    RunViewResult,
    UserInfo,
    WellKnownUserSource,
} from '@memberjunction/core';
import sql from 'mssql';
import {
    ArtifactPermissionEngine,
    CONVERSATIONS_RESOURCE_TYPE_ID,
    ConsumeEntityShareNotificationDispatched,
    CreateShareNotification,
    DashboardEngine,
    MJArtifactPermissionEntity,
    MJCollectionPermissionEntity,
    MJConversationEntity,
    MJDashboardPermissionEntityExtended,
    MJListEntity,
    MJResourcePermissionEntity,
    MJResourceTypeEntity,
    MJTemplateContentEntity,
    MJTemplateEntityExtended,
    MJUserEntity,
    MJUserNotificationEntity,
    MJUserNotificationTypeEntity,
    RegisterShareNotificationHandler,
    ResourcePermissionEngine,
    ResourceTypeEngine,
    UserInfoEngine,
} from '@memberjunction/core-entities';
import {
    MJArtifactPermissionEntityServer,
    MJCollectionPermissionEntityServer,
    MJResourcePermissionEntityServer,
} from '@memberjunction/core-entities-server';
import {
    CreateResourceSharedHandler,
    NotificationEngine,
    type ScopedNotificationConfigRow,
} from '@memberjunction/notifications';
import { TemplateEngineServer } from '@memberjunction/templates';
import { CommunicationEngine, ProcessedMessageServer } from '@memberjunction/communication-engine';
import { UserCache } from '@memberjunction/generic-database-provider';
import { UUIDsEqual } from '@memberjunction/global';
import { ListOperationsResolver } from '../resolvers/ListOperationsResolver.js';
import type { AppContext } from '../types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

const OWNER_ID = '11111111-1111-4111-8111-111111111111';
const RECIPIENT_ID = '22222222-2222-4222-8222-222222222222';
const OUTSIDER_ID = '33333333-3333-4333-8333-333333333333';
const SYSTEM_USER_ID = '00000000-0000-4000-8000-000000000001';

const ARTIFACT_ID = 'aaaaaaaa-0000-4000-8000-000000000001';
const CONV_TOP_ID = 'bbbbbbbb-0000-4000-8000-000000000001';
const CONV_SIDE_ID = 'bbbbbbbb-0000-4000-8000-000000000002';
const COLLECTION_ID = 'cccccccc-0000-4000-8000-000000000001';
const DASHBOARD_ID = 'dddddddd-0000-4000-8000-000000000001';
const LIST_ID = 'eeeeeeee-0000-4000-8000-000000000001';

const RT_ARTIFACTS_ID = '6BA617C4-0CBA-4C79-B037-456DF4B03D3D';
const RT_DASHBOARDS_ID = 'D8AFCCEC-6A37-EF11-86D4-000D3A4E707E';
const RT_LISTS_ID = 'E64D433E-F36B-1410-8560-0041FA62858A';
const RT_RECORDS_ID = 'DAAFCCEC-6A37-EF11-86D4-000D3A4E707E';

const RESOURCE_SHARED_TYPE_ID = '818FF354-9067-4FF5-AEB3-D49EADD4E067';
const RESOURCE_SHARED_EMAIL_TEMPLATE_ID = '0B429D1B-7029-4F0C-90F9-56049235BF9D';

interface RecordedNotification {
    ID: string;
    UserID: string;
    NotificationTypeID: string;
    Title: string;
    Message: string;
    Unread: boolean;
    ResourceTypeID: string | null;
    ResourceRecordID: string | null;
    ResourceConfiguration: string | null;
}

type NotificationEmailContextData = Record<string, string | number | boolean | null | undefined | object>;

interface RecordedEmailDispatch {
    ProviderName: string;
    Channel: string;
    To: string;
    From: string;
    Subject: string;
    ContextData: NotificationEmailContextData;
    RenderedHTML: string;
    PlainBody: string;
}

interface MetadataNotificationTypeFile {
    fields: {
        Name: string;
        Description: string;
        DefaultInApp: boolean;
        DefaultEmail: boolean;
        DefaultSMS: boolean;
        AllowUserPreference: boolean;
        EmailTemplateID: string | null;
        SMSTemplateID: string | null;
        Icon: string;
        Color: string;
    };
    primaryKey: { ID: string };
}

interface MetadataTemplateFile {
    fields: {
        Name: string;
        Description: string;
        IsActive: boolean;
    };
    relatedEntities: {
        'MJ: Template Contents': Array<{
            fields: {
                TypeID: string;
                TemplateText: string;
                Priority: number;
                IsActive: boolean;
            };
        }>;
    };
    primaryKey: { ID: string };
}

interface MetadataScopedConfigEntry {
    primaryKey: { ID: string };
    fields: {
        NotificationTypeID: string;
        SecondaryScopes?: { origin?: string };
        InApp: 'Allow' | 'Deny' | null;
        Email: 'Allow' | 'Deny' | null;
        SMS: 'Allow' | 'Deny' | null;
        IsLocked: boolean;
        Status: string;
    };
}

function makeUserInfo(id: string, name: string, email: string, type = 'User'): UserInfo {
    return new UserInfo(undefined, {
        ID: id,
        Name: name,
        Email: email,
        Type: type,
        IsActive: true,
        UserRoles: [],
    });
}

function buildEntityInfo(name: string, fieldNames: string[]): EntityInfo {
    return new EntityInfo({
        ID: `ent-${name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        Name: name,
        SchemaName: '__mj',
        BaseTable: name.replace(/^MJ:\s*/, '').replace(/\s+/g, ''),
        BaseView: `vw${name.replace(/^MJ:\s*/, '').replace(/\s+/g, '')}`,
        Status: 'Active',
        EntityFields: fieldNames.map((fName) => ({
            Name: fName,
            IsPrimaryKey: fName === 'ID',
            AllowUpdateAPI: fName !== 'ID',
            Type: fName === 'ID' || fName.endsWith('ID') ? 'uniqueidentifier' : fName.startsWith('Can') || fName === 'Unread' ? 'bit' : 'nvarchar',
            Status: 'Active',
        })),
        EntityPermissions: [],
    });
}

function readResourceSharedTemplateHtml(): string {
    const htmlPath = path.join(REPO_ROOT, 'metadata/templates/templates/resource-shared-email.html');
    return fs.readFileSync(htmlPath, 'utf8');
}

function createResourceTypeEntity(id: string, name: string, entityName: string | null): MJResourceTypeEntity {
    const info = buildEntityInfo('MJ: Resource Types', ['ID', 'Name', 'DisplayName', 'EntityID', 'Entity']);
    const rt = new MJResourceTypeEntity(info);
    rt.ID = id;
    rt.Name = name;
    rt.DisplayName = name;
    Object.defineProperty(rt, 'Entity', { get: () => entityName, configurable: true });
    return rt;
}

describe('Epic 4a Slice 3 (AC-4): Unified CreateShareNotification & Email Delivery Across All 5 Shareable Resource Types', () => {
    const ownerUser = makeUserInfo(OWNER_ID, 'Alice Owner', 'alice@example.com');
    const recipientUser = makeUserInfo(RECIPIENT_ID, 'Bob Recipient', 'bob@example.com');
    const outsiderUser = makeUserInfo(OUTSIDER_ID, 'Charlie Outsider', 'charlie@example.com');
    const systemUser = makeUserInfo(SYSTEM_USER_ID, 'System', 'system@example.com', 'Owner');

    let notifications: RecordedNotification[];
    let sentEmails: RecordedEmailDispatch[];
    let provider: IMetadataProvider & IRunViewProvider & IEntityDataProvider;
    let resourceTypes: MJResourceTypeEntity[];
    let templateHtml: string;

    const entityInfos = new Map<string, EntityInfo>([
        ['MJ: Artifacts', buildEntityInfo('MJ: Artifacts', ['ID', 'Name', 'UserID'])],
        ['MJ: Artifact Permissions', buildEntityInfo('MJ: Artifact Permissions', ['ID', 'ArtifactID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Artifact'])],
        ['MJ: Conversations', buildEntityInfo('MJ: Conversations', ['ID', 'Name', 'UserID', 'ParentID', 'RootParentID', 'ProjectID', 'AdditionalData', 'AnchorType', 'LinkedEntityID', 'LinkedRecordID'])],
        ['MJ: Collections', buildEntityInfo('MJ: Collections', ['ID', 'Name', 'OwnerID', 'ParentID'])],
        ['MJ: Collection Permissions', buildEntityInfo('MJ: Collection Permissions', ['ID', 'CollectionID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Collection'])],
        ['MJ: Dashboards', buildEntityInfo('MJ: Dashboards', ['ID', 'Name', 'UserID'])],
        ['MJ: Dashboard Permissions', buildEntityInfo('MJ: Dashboard Permissions', ['ID', 'DashboardID', 'UserID', 'CanRead', 'CanEdit', 'CanDelete', 'CanShare', 'SharedByUserID', 'Dashboard'])],
        ['MJ: Lists', buildEntityInfo('MJ: Lists', ['ID', 'Name', 'UserID'])],
        ['MJ: Resource Permissions', buildEntityInfo('MJ: Resource Permissions', ['ID', 'ResourceTypeID', 'ResourceRecordID', 'ResourceType', 'Type', 'UserID', 'RoleID', 'PermissionLevel', 'Status', 'SharedByUserID'])],
        ['MJ: Resource Types', buildEntityInfo('MJ: Resource Types', ['ID', 'Name', 'DisplayName', 'EntityID', 'Entity'])],
        ['MJ: Users', buildEntityInfo('MJ: Users', ['ID', 'Name', 'Email', 'Type', 'IsActive'])],
        ['MJ: User Notifications', buildEntityInfo('MJ: User Notifications', ['ID', 'UserID', 'NotificationTypeID', 'Title', 'Message', 'Unread', 'ResourceTypeID', 'ResourceRecordID', 'ResourceConfiguration'])],
        ['MJ: User Notification Types', buildEntityInfo('MJ: User Notification Types', ['ID', 'Name', 'DefaultInApp', 'DefaultEmail', 'DefaultSMS', 'AllowUserPreference', 'EmailTemplateID', 'SMSTemplateID'])],
        ['MJ: Templates', buildEntityInfo('MJ: Templates', ['ID', 'Name', 'IsActive'])],
        ['MJ: Template Contents', buildEntityInfo('MJ: Template Contents', ['ID', 'TemplateID', 'TypeID', 'Type', 'TemplateText', 'Priority', 'IsActive'])],
        ['MJ: Audit Logs', buildEntityInfo('MJ: Audit Logs', ['ID', 'UserID', 'AuditLogTypeID', 'Status', 'Description', 'Details', 'EntityID', 'RecordID'])],
    ]);

    beforeEach(async () => {
        vi.restoreAllMocks();
        delete process.env.APP_BASE_URL;
        process.env.MJ_MAGIC_LINK_EXPLORER_URL = 'https://explorer.example.com';

        notifications = [];
        sentEmails = [];
        templateHtml = readResourceSharedTemplateHtml();

        resourceTypes = [
            createResourceTypeEntity(RT_ARTIFACTS_ID, 'Artifacts', 'MJ: Artifacts'),
            createResourceTypeEntity(CONVERSATIONS_RESOURCE_TYPE_ID, 'Conversations', 'MJ: Conversations'),
            createResourceTypeEntity(RT_DASHBOARDS_ID, 'Dashboards', 'MJ: Dashboards'),
            createResourceTypeEntity(RT_LISTS_ID, 'Lists', 'MJ: Lists'),
            createResourceTypeEntity(RT_RECORDS_ID, 'Records', null),
        ];

        const typeMetaJson = JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, 'metadata/notifications/.resource-shared-type.json'), 'utf8')
        ) as MetadataNotificationTypeFile;
        const notifTypeEntity = new MJUserNotificationTypeEntity(entityInfos.get('MJ: User Notification Types')!);
        notifTypeEntity.ID = typeMetaJson.primaryKey.ID;
        notifTypeEntity.Name = typeMetaJson.fields.Name;
        notifTypeEntity.DefaultInApp = typeMetaJson.fields.DefaultInApp;
        notifTypeEntity.DefaultEmail = typeMetaJson.fields.DefaultEmail;
        notifTypeEntity.DefaultSMS = typeMetaJson.fields.DefaultSMS;
        notifTypeEntity.AllowUserPreference = typeMetaJson.fields.AllowUserPreference;
        notifTypeEntity.EmailTemplateID = RESOURCE_SHARED_EMAIL_TEMPLATE_ID;
        notifTypeEntity.SMSTemplateID = null;

        const templateContent = new MJTemplateContentEntity(entityInfos.get('MJ: Template Contents')!);
        templateContent.ID = '886B5026-F96C-4DFB-9076-A308EC9D3FFC';
        templateContent.TemplateID = RESOURCE_SHARED_EMAIL_TEMPLATE_ID;
        templateContent.TemplateText = templateHtml;
        templateContent.Priority = 100;
        templateContent.IsActive = true;
        Object.defineProperty(templateContent, 'Type', { get: () => 'HTML', configurable: true });

        const emailTemplate = new MJTemplateEntityExtended(entityInfos.get('MJ: Templates')!);
        emailTemplate.ID = RESOURCE_SHARED_EMAIL_TEMPLATE_ID;
        emailTemplate.Name = 'Resource Shared - Email';
        emailTemplate.IsActive = true;
        Object.defineProperty(emailTemplate, 'Params', { get: () => [], configurable: true });
        vi.spyOn(emailTemplate, 'GetHighestPriorityContent').mockReturnValue(templateContent);

        const scopedConfigsJson = JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, 'metadata/scoped-notification-configs/.scoped-notification-configs.json'), 'utf8')
        ) as MetadataScopedConfigEntry[];
        const scopedRows: ScopedNotificationConfigRow[] = scopedConfigsJson.map((entry) => ({
            ID: entry.primaryKey.ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            PrimaryScopeEntityID: null,
            PrimaryScopeRecordID: null,
            SecondaryScopes: entry.fields.SecondaryScopes ? JSON.stringify(entry.fields.SecondaryScopes) : null,
            InApp: entry.fields.InApp,
            Email: entry.fields.Email,
            SMS: entry.fields.SMS,
            IsLocked: entry.fields.IsLocked,
            Priority: 0,
            Status: entry.fields.Status,
        }));

        vi.spyOn(UserCache.Instance, 'GetSystemUser').mockReturnValue(systemUser);
        Object.defineProperty(UserCache.Instance, 'Users', {
            get: () => [ownerUser, recipientUser, outsiderUser, systemUser],
            configurable: true,
        });
        vi.spyOn(WellKnownUserSource.Instance, 'GetSystemUser').mockResolvedValue(systemUser);
        vi.spyOn(WellKnownUserSource.Instance, 'IsSystemUser').mockImplementation(
            (u) => Boolean(u && UUIDsEqual(u.ID, SYSTEM_USER_ID))
        );

        vi.spyOn(UserInfoEngine.Instance, 'Config').mockResolvedValue(undefined);
        Object.defineProperty(UserInfoEngine.Instance, 'NotificationTypes', {
            get: () => [notifTypeEntity],
            configurable: true,
        });
        vi.spyOn(UserInfoEngine.Instance, 'GetUserPreferenceForType').mockReturnValue(null);

        vi.spyOn(NotificationEngine.Instance, 'Config').mockResolvedValue(undefined);
        Object.defineProperty(NotificationEngine.Instance, '_loaded', { value: true, writable: true, configurable: true });
        Object.defineProperty(NotificationEngine.Instance, '_scopedConfigs', { value: scopedRows, writable: true, configurable: true });
        vi.spyOn(NotificationEngine.Instance, 'ResolveRecipientRoleIds').mockResolvedValue([]);

        vi.spyOn(TemplateEngineServer.Instance, 'Config').mockResolvedValue(undefined);
        TemplateEngineServer.Instance.SetupNunjucks();
        Object.defineProperty(TemplateEngineServer.Instance, 'Templates', {
            get: () => [emailTemplate],
            configurable: true,
        });

        vi.spyOn(CommunicationEngine.Instance, 'Config').mockResolvedValue(undefined);
        Object.defineProperty(CommunicationEngine.Instance, 'Providers', {
            get: () => [{ Name: 'SendGrid' }],
            configurable: true,
        });
        vi.spyOn(CommunicationEngine.Instance, 'SendSingleMessage').mockImplementation(async (providerName, channel, msg) => {
            const processed = new ProcessedMessageServer(msg);
            const processResult = await processed.Process(false, ownerUser);
            expect(processResult.Success).toBe(true);
            sentEmails.push({
                ProviderName: providerName,
                Channel: channel,
                To: typeof msg.To === 'string' ? msg.To : '',
                From: typeof msg.From === 'string' ? msg.From : '',
                Subject: processed.ProcessedSubject,
                ContextData: (msg.ContextData ?? {}) as NotificationEmailContextData,
                RenderedHTML: processed.ProcessedHTMLBody,
                PlainBody: processed.ProcessedBody,
            });
            return { Success: true, Message: processed, Error: '' };
        });

        const fakeResourcePermEngine = Object.create(ResourcePermissionEngine.prototype) as ResourcePermissionEngine;
        Object.defineProperties(fakeResourcePermEngine, {
            Config: { value: vi.fn().mockResolvedValue(undefined), configurable: true },
            ResourceTypes: { get: () => resourceTypes, configurable: true },
            Permissions: { get: () => [], configurable: true },
            ResourceTypeIdByName: {
                value: (name: string) => resourceTypes.find((rt) => rt.Name.toLowerCase() === name.trim().toLowerCase())?.ID ?? null,
                configurable: true,
            },
            GetUserAvailableResources: { value: () => [], configurable: true },
            GetResourceTypeInfoFields: {
                value: (rtId: string) => {
                    if (UUIDsEqual(rtId, CONVERSATIONS_RESOURCE_TYPE_ID)) {
                        return { PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' };
                    }
                    if (UUIDsEqual(rtId, RT_LISTS_ID)) {
                        return { PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' };
                    }
                    if (UUIDsEqual(rtId, RT_DASHBOARDS_ID)) {
                        return { PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' };
                    }
                    return { PrimaryKeyFieldName: 'ID', NameFieldName: 'Name', OwnerIDFieldName: 'UserID' };
                },
                configurable: true,
            },
        });
        vi.spyOn(ResourcePermissionEngine, 'GetProviderInstance').mockReturnValue(fakeResourcePermEngine);
        vi.spyOn(ResourcePermissionEngine.Instance, 'Config').mockResolvedValue(undefined);
        Object.defineProperty(ResourcePermissionEngine.Instance, 'ResourceTypes', {
            get: () => resourceTypes,
            configurable: true,
        });
        vi.spyOn(ResourcePermissionEngine.Instance, 'ResourceTypeIdByName').mockImplementation(
            (name: string | null | undefined) =>
                name ? resourceTypes.find((rt) => rt.Name.toLowerCase() === name.trim().toLowerCase())?.ID ?? null : null
        );

        vi.spyOn(ResourceTypeEngine.Instance, 'Config').mockResolvedValue(undefined);
        vi.spyOn(ResourceTypeEngine.Instance, 'ByName').mockImplementation(
            (name: string) => resourceTypes.find((rt) => rt.Name.toLowerCase() === name.trim().toLowerCase())
        );

        Object.defineProperty(DashboardEngine.Instance, 'Dashboards', { get: () => [], configurable: true });
        Object.defineProperty(DashboardEngine.Instance, 'DashboardPermissions', { get: () => [], configurable: true });

        let notifCounter = 0;

        const runViewImpl = async <T>(params: RunViewParams): Promise<RunViewResult<T>> => {
            const filter = params.ExtraFilter ?? '';
            switch (params.EntityName) {
                case 'MJ: Artifacts':
                    return {
                        Success: true,
                        Results: [{ ID: ARTIFACT_ID, Name: 'Q4 Strategic Roadmap', UserID: OWNER_ID, DelegateEntityID: null, DelegateRecordID: null }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                case 'MJ: Conversations': {
                    if (filter.includes(CONV_SIDE_ID)) {
                        return {
                            Success: true,
                            Results: [{
                                ID: CONV_SIDE_ID,
                                Name: 'Coaching — Nov 21',
                                UserID: OWNER_ID,
                                ParentID: CONV_TOP_ID,
                            }] as T[],
                            RowCount: 1,
                            TotalRowCount: 1,
                            ExecutionTime: 1,
                            ErrorMessage: '',
                        };
                    }
                    return {
                        Success: true,
                        Results: [{
                            ID: CONV_TOP_ID,
                            Name: 'Chief of Staff Weekly',
                            UserID: OWNER_ID,
                            ParentID: null,
                        }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                }
                case 'MJ: Collections':
                    return {
                        Success: true,
                        Results: [{ ID: COLLECTION_ID, Name: 'Executive Briefings Collection', OwnerID: OWNER_ID, ParentID: null }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                case 'MJ: Dashboards':
                    return {
                        Success: true,
                        Results: [{ ID: DASHBOARD_ID, Name: 'Revenue Operations KPI', UserID: OWNER_ID }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                case 'MJ: Lists':
                    return {
                        Success: true,
                        Results: [{ ID: LIST_ID, Name: 'Priority Enterprise Accounts', UserID: OWNER_ID }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                case 'MJ: Audit Log Types':
                    return {
                        Success: true,
                        Results: [{ ID: 'audit-type-list-shared', Name: 'List Shared' }] as T[],
                        RowCount: 1,
                        TotalRowCount: 1,
                        ExecutionTime: 1,
                        ErrorMessage: '',
                    };
                default:
                    return { Success: true, Results: [], RowCount: 0, TotalRowCount: 0, ExecutionTime: 1, ErrorMessage: '' };
            }
        };

        const getEntityObjectImpl = async <T extends BaseEntity>(entityName: string, contextUser?: UserInfo): Promise<T> => {
            const info = entityInfos.get(entityName);
            if (!info) {
                throw new Error(`Unexpected entity requested: ${entityName}`);
            }

            if (entityName === 'MJ: Users') {
                const userEnt = new MJUserEntity(info, provider);
                if (contextUser) await userEnt.Config(contextUser);
                vi.spyOn(userEnt, 'Load').mockImplementation(async (id: string) => {
                    const match = [ownerUser, recipientUser, outsiderUser, systemUser].find((u) => UUIDsEqual(u.ID, id));
                    if (!match) return false;
                    userEnt.ID = match.ID;
                    userEnt.Name = match.Name;
                    userEnt.Email = match.Email;
                    userEnt.Type = (match.Type as MJUserEntity['Type']) ?? 'User';
                    return true;
                });
                return userEnt as T;
            }

            if (entityName === 'MJ: User Notifications') {
                const notifEnt = new MJUserNotificationEntity(info, provider);
                if (contextUser) await notifEnt.Config(contextUser);
                notifEnt.ID = `notif-${++notifCounter}`;
                vi.spyOn(notifEnt, 'Save').mockImplementation(async () => {
                    notifications.push({
                        ID: notifEnt.ID,
                        UserID: notifEnt.UserID,
                        NotificationTypeID: notifEnt.NotificationTypeID,
                        Title: notifEnt.Title ?? '',
                        Message: notifEnt.Message ?? '',
                        Unread: notifEnt.Unread,
                        ResourceTypeID: notifEnt.ResourceTypeID,
                        ResourceRecordID: notifEnt.ResourceRecordID,
                        ResourceConfiguration: notifEnt.ResourceConfiguration,
                    });
                    return true;
                });
                return notifEnt as T;
            }

            if (entityName === 'MJ: Conversations') {
                const convEnt = new MJConversationEntity(info, provider);
                if (contextUser) await convEnt.Config(contextUser);
                vi.spyOn(convEnt, 'InnerLoad').mockImplementation(async (ck: CompositeKey) => {
                    const targetId = String(ck.KeyValuePairs[0]?.Value ?? '');
                    if (UUIDsEqual(targetId, CONV_SIDE_ID)) {
                        convEnt.ID = CONV_SIDE_ID;
                        convEnt.Name = 'Coaching — Nov 21';
                        convEnt.UserID = OWNER_ID;
                        convEnt.ParentID = CONV_TOP_ID;
                        return true;
                    }
                    if (UUIDsEqual(targetId, CONV_TOP_ID)) {
                        convEnt.ID = CONV_TOP_ID;
                        convEnt.Name = 'Chief of Staff Weekly';
                        convEnt.UserID = OWNER_ID;
                        convEnt.ParentID = null;
                        return true;
                    }
                    return false;
                });
                return convEnt as T;
            }

            if (entityName === 'MJ: Lists') {
                const listEnt = new MJListEntity(info, provider);
                if (contextUser) await listEnt.Config(contextUser);
                vi.spyOn(listEnt, 'InnerLoad').mockImplementation(async (ck: CompositeKey) => {
                    const targetId = String(ck.KeyValuePairs[0]?.Value ?? '');
                    if (UUIDsEqual(targetId, LIST_ID)) {
                        listEnt.ID = LIST_ID;
                        listEnt.Name = 'Priority Enterprise Accounts';
                        listEnt.UserID = OWNER_ID;
                        return true;
                    }
                    return false;
                });
                return listEnt as T;
            }

            if (entityName === 'MJ: Resource Permissions') {
                const permEnt = new MJResourcePermissionEntityServer(info, provider);
                if (contextUser) await permEnt.Config(contextUser);
                permEnt.ID = 'perm-list-1';
                return permEnt as T;
            }

            const generic = new BaseEntity(info, provider);
            if (contextUser) await generic.Config(contextUser);
            return generic as T;
        };

        const mockProviderBase: Partial<IMetadataProvider & IRunViewProvider & IEntityDataProvider> = {
            ProviderType: 'Database',
            EntityByName: (name: string) => entityInfos.get(name),
            EntityByID: (id: string) => Array.from(entityInfos.values()).find((e) => UUIDsEqual(e.ID, id)),
            RunView: runViewImpl as IRunViewProvider['RunView'],
            RunViews: (async <T>(paramsList: RunViewParams[]): Promise<RunViewResult<T>[]> => {
                const out: RunViewResult<T>[] = [];
                for (const p of paramsList) {
                    out.push(await runViewImpl<T>(p));
                }
                return out;
            }) as IRunViewProvider['RunViews'],
            GetEntityObject: getEntityObjectImpl as IMetadataProvider['GetEntityObject'],
        };
        const typedProvider = Object.assign(
            Object.create(DatabaseProviderBase.prototype) as DatabaseProviderBase,
            mockProviderBase
        );
        Object.defineProperty(typedProvider, 'Entities', {
            get: () => Array.from(entityInfos.values()),
            configurable: true,
        });
        provider = typedProvider;
        Metadata.Provider = provider;
        RunView.Provider = provider;

        vi.spyOn(BaseEntity.prototype, 'Save').mockImplementation(async function (this: BaseEntity, _options?: EntitySaveOptions) {
            if (!this.ID) {
                const idField = this.GetFieldByName('ID');
                if (idField) idField.Value = '99999999-0000-4000-8000-000000000001';
            }
            return true;
        });
        vi.spyOn(BaseEntity.prototype, 'Delete').mockResolvedValue(true);
        vi.spyOn(BaseEntity.prototype, 'CheckPermissions').mockReturnValue(true);

        // Bind the real NotificationEngine-backed share notification handler
        RegisterShareNotificationHandler(CreateResourceSharedHandler());
    });

    afterEach(() => {
        RegisterShareNotificationHandler(null);
        delete process.env.MJ_MAGIC_LINK_EXPLORER_URL;
        vi.restoreAllMocks();
    });

    it('validates Resource Shared notification type metadata, email template binding, and HTML rendering', async () => {
        const typeMeta = JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, 'metadata/notifications/.resource-shared-type.json'), 'utf8')
        ) as MetadataNotificationTypeFile;
        const templateMeta = JSON.parse(
            fs.readFileSync(path.join(REPO_ROOT, 'metadata/templates/.resource-shared-email-template.json'), 'utf8')
        ) as MetadataTemplateFile;

        expect(typeMeta.fields.Name).toBe('Resource Shared');
        expect(typeMeta.fields.DefaultInApp).toBe(true);
        expect(typeMeta.fields.DefaultEmail).toBe(true);
        expect(typeMeta.fields.AllowUserPreference).toBe(true);
        expect(typeMeta.fields.EmailTemplateID).toBe('@lookup:MJ: Templates.Name=Resource Shared - Email');

        expect(templateMeta.fields.Name).toBe('Resource Shared - Email');
        expect(templateMeta.fields.IsActive).toBe(true);
        const htmlContentEntry = templateMeta.relatedEntities['MJ: Template Contents'][0];
        expect(htmlContentEntry.fields.TypeID).toBe('@lookup:MJ: Template Content Types.Name=HTML');
        expect(htmlContentEntry.fields.TemplateText).toBe('@file:templates/resource-shared-email.html');
        expect(htmlContentEntry.fields.IsActive).toBe(true);

        expect(templateHtml).toContain('{{ grantorName }}');
        expect(templateHtml).toContain('{{ resourceTypeLabel }}');
        expect(templateHtml).toContain('{{ resourceName }}');
        expect(templateHtml).toContain('{{ actionsSummary }}');
        expect(templateHtml).toContain('{{ resourceUrl }}');
    });

    it('(a) Artifacts share raises Resource Shared in-app notification + rendered email payload with deep-link metadata', async () => {
        const perm = new MJArtifactPermissionEntityServer(entityInfos.get('MJ: Artifact Permissions')!, provider);
        await perm.Config(ownerUser);
        perm.NewRecord();
        perm.ID = 'perm-art-1';
        perm.ArtifactID = ARTIFACT_ID;
        perm.UserID = RECIPIENT_ID;
        perm.SharedByUserID = OWNER_ID;
        perm.CanRead = true;
        perm.CanEdit = true;
        perm.CanDelete = false;
        perm.CanShare = false;

        expect(await perm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));

        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceTypeID: RT_ARTIFACTS_ID,
            ResourceRecordID: ARTIFACT_ID,
            Unread: true,
        });
        expect(notifications[0].Title).toContain('Alice Owner shared Artifact');
        expect(notifications[0].Message).toContain('Q4 Strategic Roadmap');
        expect(JSON.parse(notifications[0].ResourceConfiguration!)).toMatchObject({
            type: 'artifact',
            artifactId: ARTIFACT_ID,
            PermissionID: 'perm-art-1',
            PermissionLevel: 'Edit',
        });

        expect(sentEmails[0].To).toBe('bob@example.com');
        expect(sentEmails[0].RenderedHTML).toContain('Alice Owner');
        expect(sentEmails[0].RenderedHTML).toContain('Q4 Strategic Roadmap');
        expect(sentEmails[0].RenderedHTML).toContain('Artifact');
        expect(sentEmails[0].RenderedHTML).toContain(`https://explorer.example.com/resource/artifact/${ARTIFACT_ID}`);
    });

    it('(b) Conversations share (top-level and ParentID side thread) raises Resource Shared notification + email without leaking ParentID metadata', async () => {
        // 1. Top-level conversation share
        const topPerm = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await topPerm.Config(ownerUser);
        topPerm.NewRecord();
        topPerm.ID = 'perm-conv-top-1';
        topPerm.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        topPerm.ResourceRecordID = CONV_TOP_ID;
        topPerm.Type = 'User';
        topPerm.UserID = RECIPIENT_ID;
        topPerm.PermissionLevel = 'View';
        topPerm.Status = 'Approved';
        topPerm.SharedByUserID = OWNER_ID;

        expect(await topPerm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));

        expect(notifications[0]).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_TOP_ID,
        });
        expect(notifications[0].Title).toContain('Alice Owner shared Conversation');
        expect(notifications[0].Message).toContain('Chief of Staff Weekly');
        expect(notifications[0].Message).toContain('View access');
        expect(JSON.parse(notifications[0].ResourceConfiguration!)).toMatchObject({
            type: 'conversation',
            conversationId: CONV_TOP_ID,
            PermissionLevel: 'View',
        });

        // 2. Private ParentID side conversation share — must NOT leak ParentID or parent thread name
        const sidePerm = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await sidePerm.Config(ownerUser);
        sidePerm.NewRecord();
        sidePerm.ID = 'perm-conv-side-1';
        sidePerm.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        sidePerm.ResourceRecordID = CONV_SIDE_ID;
        sidePerm.Type = 'User';
        sidePerm.UserID = RECIPIENT_ID;
        sidePerm.PermissionLevel = 'Edit';
        sidePerm.Status = 'Approved';
        sidePerm.SharedByUserID = OWNER_ID;

        expect(await sidePerm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(2));

        const sideNotif = notifications[1];
        const sideEmail = sentEmails[1];
        expect(sideNotif).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceTypeID: CONVERSATIONS_RESOURCE_TYPE_ID,
            ResourceRecordID: CONV_SIDE_ID,
        });
        expect(sideNotif.Message).toContain('Coaching — Nov 21');
        expect(sideNotif.Message).toContain('Edit access');
        expect(sideNotif.Message).not.toContain('Chief of Staff Weekly');
        expect(sideNotif.Message).not.toContain(CONV_TOP_ID);
        expect(sideNotif.ResourceConfiguration).not.toContain(CONV_TOP_ID);
        expect(sideNotif.ResourceConfiguration).not.toContain('ParentID');
        expect(JSON.parse(sideNotif.ResourceConfiguration!)).toMatchObject({
            type: 'conversation',
            conversationId: CONV_SIDE_ID,
            PermissionLevel: 'Edit',
        });

        expect(sideEmail.RenderedHTML).toContain('Coaching — Nov 21');
        expect(sideEmail.RenderedHTML).toContain('Edit access');
        expect(sideEmail.RenderedHTML).toContain(`https://explorer.example.com/app/chat/conversations?conversationId=${CONV_SIDE_ID}`);
        expect(sideEmail.RenderedHTML).not.toContain('Chief of Staff Weekly');
        expect(sideEmail.RenderedHTML).not.toContain(CONV_TOP_ID);
    });

    it('(c) Collections share resolves collection name when virtual field is unset and emits Resource Shared notification + email', async () => {
        const perm = new MJCollectionPermissionEntityServer(entityInfos.get('MJ: Collection Permissions')!, provider);
        await perm.Config(ownerUser);
        perm.NewRecord();
        perm.ID = 'perm-coll-1';
        perm.CollectionID = COLLECTION_ID;
        perm.UserID = RECIPIENT_ID;
        perm.SharedByUserID = OWNER_ID;
        perm.CanRead = true;
        perm.CanEdit = true;
        perm.CanDelete = false;
        perm.CanShare = false;

        expect(await perm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));

        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceRecordID: COLLECTION_ID,
        });
        expect(notifications[0].Title).toContain('Alice Owner shared Collection');
        expect(notifications[0].Message).toContain('Executive Briefings Collection');
        expect(JSON.parse(notifications[0].ResourceConfiguration!)).toMatchObject({
            type: 'collection',
            collectionId: COLLECTION_ID,
            PermissionID: 'perm-coll-1',
            PermissionLevel: 'Edit',
        });

        expect(sentEmails[0].RenderedHTML).toContain('Executive Briefings Collection');
        expect(sentEmails[0].RenderedHTML).toContain(`https://explorer.example.com/resource/record/MJ%3A%20Collections/${COLLECTION_ID}`);
    });

    it('(d) Dashboards share resolves dashboard name & owner via RunView fallback and emits Resource Shared notification + email', async () => {
        const perm = new MJDashboardPermissionEntityExtended(entityInfos.get('MJ: Dashboard Permissions')!, provider);
        await perm.Config(ownerUser);
        perm.NewRecord();
        perm.ID = 'perm-dash-1';
        perm.DashboardID = DASHBOARD_ID;
        perm.UserID = RECIPIENT_ID;
        perm.SharedByUserID = OWNER_ID;
        perm.CanRead = true;
        perm.CanEdit = false;
        perm.CanDelete = false;
        perm.CanShare = false;

        expect(await perm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));

        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceTypeID: RT_DASHBOARDS_ID,
            ResourceRecordID: DASHBOARD_ID,
        });
        expect(notifications[0].Title).toContain('Alice Owner shared Dashboard');
        expect(notifications[0].Message).toContain('Revenue Operations KPI');
        expect(JSON.parse(notifications[0].ResourceConfiguration!)).toMatchObject({
            type: 'dashboard',
            dashboardId: DASHBOARD_ID,
            PermissionID: 'perm-dash-1',
            PermissionLevel: 'View',
        });

        expect(sentEmails[0].RenderedHTML).toContain('Revenue Operations KPI');
        expect(sentEmails[0].RenderedHTML).toContain(`https://explorer.example.com/resource/dashboard/${DASHBOARD_ID}`);
    });

    it('(e) Lists share via ListOperationsResolver.ShareList raises EXACTLY ONE Resource Shared notification + email (no duplicates)', async () => {
        const resolver = new ListOperationsResolver();
        const dummyPool = new sql.ConnectionPool({ server: 'localhost', database: 'test', user: 'u', password: 'p' });
        const ctx: AppContext = {
            dataSource: dummyPool,
            dataSources: [],
            userPayload: {
                email: ownerUser.Email,
                userRecord: ownerUser,
                sessionId: 'sess-1',
            },
            providers: [
                {
                    provider: provider as DatabaseProviderBase,
                    type: 'Read-Write',
                },
            ],
        };

        const result = await resolver.ShareList(
            {
                ListID: LIST_ID,
                Target: { Kind: 'user', UserID: RECIPIENT_ID },
                PermissionLevel: 'Edit',
            },
            ctx
        );

        expect(result.Success).toBe(true);
        expect(result.ResultCode).toBe('SUCCESS');
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));

        // Exactly 1 notification and 1 email (no duplicate between MJResourcePermissionEntityExtended and ListSharing)
        expect(notifications).toHaveLength(1);
        expect(notifications[0]).toMatchObject({
            UserID: RECIPIENT_ID,
            NotificationTypeID: RESOURCE_SHARED_TYPE_ID,
            ResourceTypeID: RT_LISTS_ID,
            ResourceRecordID: LIST_ID,
        });
        expect(notifications[0].Title).toContain('Alice Owner shared List');
        expect(notifications[0].Message).toContain('Priority Enterprise Accounts');
        expect(notifications[0].Message).toContain('Edit access');
        expect(JSON.parse(notifications[0].ResourceConfiguration!)).toMatchObject({
            type: 'list',
            listId: LIST_ID,
            PermissionLevel: 'Edit',
        });

        expect(sentEmails[0].RenderedHTML).toContain('Priority Enterprise Accounts');
        expect(sentEmails[0].RenderedHTML).toContain('Edit access');
        expect(sentEmails[0].RenderedHTML).toContain(`https://explorer.example.com/resource/record/MJ%3A%20Lists/${LIST_ID}`);
    });

    it('re-activating a Revoked List/Resource share to Approved raises a notification, while Revoking does NOT', async () => {
        const perm = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await perm.LoadFromData({
            ID: 'perm-list-regrant',
            ResourceTypeID: RT_LISTS_ID,
            ResourceRecordID: LIST_ID,
            Type: 'User',
            UserID: RECIPIENT_ID,
            PermissionLevel: 'View',
            Status: 'Approved',
            SharedByUserID: OWNER_ID,
        });
        await perm.Config(ownerUser);
        perm.Status = 'Revoked';

        // 1. Transition Approved -> Revoked must NOT notify
        expect(await perm.Save()).toBe(true);
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);

        // 2. Transition Revoked -> Approved (freshly loaded from DB) must notify once
        const reactivatedPerm = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await reactivatedPerm.LoadFromData({
            ID: 'perm-list-regrant',
            ResourceTypeID: RT_LISTS_ID,
            ResourceRecordID: LIST_ID,
            Type: 'User',
            UserID: RECIPIENT_ID,
            PermissionLevel: 'View',
            Status: 'Revoked',
            SharedByUserID: OWNER_ID,
        });
        await reactivatedPerm.Config(ownerUser);
        reactivatedPerm.Status = 'Approved';
        expect(reactivatedPerm.IsSaved).toBe(true);
        expect(reactivatedPerm.GetFieldByName('Status')?.OldValue).toBe('Revoked');
        expect(reactivatedPerm.GetFieldByName('Status')?.Dirty).toBe(true);
        expect(await reactivatedPerm.Save()).toBe(true);
        await vi.waitFor(() => expect(sentEmails).toHaveLength(1));
        expect(notifications).toHaveLength(1);
        expect(notifications[0].Message).toContain('Priority Enterprise Accounts');
        expect(ConsumeEntityShareNotificationDispatched(reactivatedPerm)).toBe(true);
    });

    it('does NOT raise notification or email when share is denied (non-owner reshare), deleted/revoked, self-shared, or System-origin', async () => {
        // 1. Non-owner conversation reshare attempt -> DENIED, 0 notifications, 0 emails
        const deniedConvShare = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await deniedConvShare.Config(outsiderUser);
        deniedConvShare.NewRecord();
        deniedConvShare.ID = 'perm-denied-conv';
        deniedConvShare.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        deniedConvShare.ResourceRecordID = CONV_TOP_ID;
        deniedConvShare.Type = 'User';
        deniedConvShare.UserID = RECIPIENT_ID;
        deniedConvShare.PermissionLevel = 'View';
        deniedConvShare.Status = 'Approved';
        deniedConvShare.SharedByUserID = OUTSIDER_ID;

        expect(await deniedConvShare.Save()).toBe(false);
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);

        // 2. Non-owner artifact share attempt -> DENIED, 0 notifications, 0 emails
        const deniedArtShare = new MJArtifactPermissionEntityServer(entityInfos.get('MJ: Artifact Permissions')!, provider);
        await deniedArtShare.Config(outsiderUser);
        deniedArtShare.NewRecord();
        deniedArtShare.ID = 'perm-denied-art';
        deniedArtShare.ArtifactID = ARTIFACT_ID;
        deniedArtShare.UserID = RECIPIENT_ID;
        deniedArtShare.SharedByUserID = OUTSIDER_ID;
        deniedArtShare.CanRead = true;

        expect(await deniedArtShare.Save()).toBe(false);
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);

        // 3. Delete / revoke -> 0 notifications, 0 emails
        const revokePerm = new MJResourcePermissionEntityServer(entityInfos.get('MJ: Resource Permissions')!, provider);
        await revokePerm.Config(ownerUser);
        revokePerm.ID = 'perm-revoke-del';
        revokePerm.ResourceTypeID = CONVERSATIONS_RESOURCE_TYPE_ID;
        revokePerm.ResourceRecordID = CONV_TOP_ID;
        revokePerm.SharedByUserID = OWNER_ID;
        expect(await revokePerm.Delete()).toBe(true);
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);

        // 4. Self-share -> 0 notifications, 0 emails
        await CreateShareNotification({
            Provider: provider,
            ContextUser: ownerUser,
            GrantorUserID: OWNER_ID,
            GranteeUserID: OWNER_ID,
            ResourceTypeLabel: 'Conversation',
            ResourceTypeName: 'Conversations',
            ResourceName: 'Self Thread',
            ResourceRecordID: CONV_TOP_ID,
        });
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);

        // 5. System-origin grant suppressed by metadata/scoped-notification-configs -> 0 notifications, 0 emails
        await CreateShareNotification({
            Provider: provider,
            ContextUser: systemUser,
            GrantorUserID: SYSTEM_USER_ID,
            GranteeUserID: RECIPIENT_ID,
            ResourceTypeLabel: 'List',
            ResourceTypeName: 'Lists',
            ResourceName: 'System Seeded List',
            ResourceRecordID: LIST_ID,
        });
        expect(notifications).toHaveLength(0);
        expect(sentEmails).toHaveLength(0);
    });
});
