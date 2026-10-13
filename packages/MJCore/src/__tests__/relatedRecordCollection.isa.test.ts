/**
 * Tests for polymorphic IS-A subtype records in RelatedRecordCollection.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { BaseEntity } from "../generic/baseEntity";
import { RelatedRecordCollection, type RelatedRecordCollectionWire } from "../generic/relatedRecordCollection";
import { EntityInfo } from "../generic/entityInfo";
import { Metadata } from "../generic/metadata";
import { ProviderBase } from "../generic/providerBase";
import type { IEntityDataProvider } from "../generic/interfaces";
import { ALL_ENTITY_DATA, PRODUCT_ENTITY_ID, MEETING_ENTITY_ID, PRODUCT_FIELDS, MEETING_FIELDS } from "./mocks/MockEntityData";

const MOCK_USER = { ID: "u-1", Name: "T", Email: "t@t", UserRoles: [] };

let productEntityInfo: EntityInfo;
let meetingEntityInfo: EntityInfo;

class MockBaseParentEntity extends BaseEntity {
    public readonly Children: RelatedRecordCollection<MockProductLineEntity>;

    constructor(info: EntityInfo, provider: IEntityDataProvider) {
        super(info, provider, null, MOCK_USER);
        this.Children = this.DeclareRelatedRecords<MockProductLineEntity>({
            Name: "Children",
            RelatedEntity: "Products",
            RelatedEntityJoinField: "Name", // Stand-in for parent FK
            Load: "explicit",
        });
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class MockProductLineEntity extends BaseEntity {
    constructor(info: EntityInfo, provider: IEntityDataProvider) {
        super(info, provider, null, MOCK_USER);
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

class MockMeetingLineEntity extends BaseEntity {
    constructor(info: EntityInfo, provider: IEntityDataProvider) {
        super(info, provider, null, MOCK_USER);
        const parent = new MockProductLineEntity(productEntityInfo, provider);
        (this as unknown as { _parentEntity: BaseEntity })._parentEntity = parent;
        (this as unknown as { _parentEntityFieldNames: Set<string> })._parentEntityFieldNames = info.ParentEntityFieldNames;
    }

    public override CheckPermissions(): boolean {
        return true;
    }
}

function makeProvider() {
    const provider = {
        CurrentUser: MOCK_USER,
        get SupportsEntityTransactions() {
            return true;
        },
        get IsInTransaction() {
            return false;
        },
        async GetEntityObject<T extends BaseEntity>(entityName: string): Promise<T> {
            if (entityName === "Meetings") {
                return new MockMeetingLineEntity(
                    meetingEntityInfo,
                    provider as unknown as IEntityDataProvider,
                ) as unknown as T;
            }
            return new MockProductLineEntity(
                productEntityInfo,
                provider as unknown as IEntityDataProvider,
            ) as unknown as T;
        },
        async Save(entity: BaseEntity): Promise<Record<string, unknown>> {
            return entity.GetAll();
        },
        async Delete(): Promise<boolean> {
            return true;
        },
    };
    return provider;
}

describe("RelatedRecordCollection IS-A Polymorphic Subtypes", () => {
    beforeAll(() => {
        const pkField = PRODUCT_FIELDS.find(f => f.Name === "ID")!;
        const entities = ALL_ENTITY_DATA.map(d => {
            if (d.ID === MEETING_ENTITY_ID) {
                return new EntityInfo({
                    ...d,
                    EntityFields: [
                        { ...pkField, ID: "f-meet-id", EntityID: MEETING_ENTITY_ID, Entity: "Meetings" },
                        ...d.EntityFields,
                    ],
                });
            }
            return new EntityInfo(d);
        });

        productEntityInfo = entities.find(e => e.ID === PRODUCT_ENTITY_ID)!;
        meetingEntityInfo = entities.find(e => e.ID === MEETING_ENTITY_ID)!;
        Metadata.Provider = {
            Entities: entities,
            CurrentUser: MOCK_USER,
        } as unknown as ProviderBase;
    });

    afterAll(() => {
        Metadata.Provider = null as unknown as ProviderBase;
    });

    it("serializes polymorphic IS-A entity name into wire item", async () => {
        const provider = makeProvider();
        const parent = new MockBaseParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();

        const standardItem = new MockProductLineEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        standardItem.NewRecord();
        standardItem.Set("Price", 10);
        parent.Children.Add(standardItem);

        const meetingItem = new MockMeetingLineEntity(meetingEntityInfo, provider as unknown as IEntityDataProvider);
        meetingItem.NewRecord();
        meetingItem.Set("Price", 25);
        parent.Children.Add(meetingItem as unknown as MockProductLineEntity);

        const wire = await parent.Children.Serialize();
        expect(wire).not.toBeNull();
        expect(wire!.Items.length).toBe(2);
        expect(wire!.Items[0].EntityName).toBe("Products");
        expect(wire!.Items[1].EntityName).toBe("Meetings");
    });

    it("deserializes polymorphic wire items into their respective entity types", async () => {
        const provider = makeProvider();
        const parent = new MockBaseParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();

        const wirePayload: RelatedRecordCollectionWire = {
            Items: [
                {
                    EntityName: "Products",
                    Fields: { ID: "p-1", Price: 15 },
                    IsNew: true,
                },
                {
                    EntityName: "Meetings",
                    Fields: { ID: "m-1", Price: 40, Location: "Conference Room A" },
                    IsNew: true,
                },
            ],
            Removed: [],
        };

        await parent.Children.Deserialize(wirePayload);

        expect(parent.Children.Count).toBe(2);
        expect(parent.Children.Items[0]).toBeInstanceOf(MockProductLineEntity);
        expect(parent.Children.Items[1]).toBeInstanceOf(MockMeetingLineEntity);
        expect(parent.Children.Items[1].EntityInfo.Name).toBe("Meetings");
    });

    it("carries polymorphic entity name for removals in wire payload", async () => {
        const provider = makeProvider();
        const parent = new MockBaseParentEntity(productEntityInfo, provider as unknown as IEntityDataProvider);
        parent.NewRecord();

        const meetingItem = new MockMeetingLineEntity(meetingEntityInfo, provider as unknown as IEntityDataProvider);
        await meetingItem.LoadFromData({ ID: "m-special-1", Price: 25 }, true);
        parent.Children.Add(meetingItem as unknown as MockProductLineEntity);

        parent.Children.Remove(meetingItem as unknown as MockProductLineEntity);

        const wire = await parent.Children.Serialize();
        expect(wire).not.toBeNull();
        expect(wire!.Removed.length).toBe(1);
        expect(wire!.Removed[0]["__entityName"]).toBe("Meetings");
        expect(wire!.Removed[0]["ID"]).toBe("m-special-1");
    });
});
