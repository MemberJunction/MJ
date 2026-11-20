/**
 * Transaction variables sent by a network caller.
 *
 * A 'Use' variable sets its field at Submit(), after each item's Save() checks have run, so the
 * resolver accepts only the shape that links a new record to the record that refers to it: the
 * 'Define' side reads the primary key of an item the group creates, and each 'Use' side writes a
 * foreign key of a different item that relates to the entity of the 'Define' item. Any other shape
 * is refused before any item is saved.
 */
import 'reflect-metadata';
import { describe, it, expect, vi } from 'vitest';
import { BaseEntityResult, EntityInfo, UserInfo } from '@memberjunction/core';

vi.mock('@memberjunction/core', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@memberjunction/core')>();
    return { ...actual, LogError: () => undefined };
});

import {
    TransactionResolver,
    TransactionInputType,
    TransactionOperationType,
    TransactionVariableInputType,
    TransactionVariableType,
} from '../resolvers/TransactionGroupResolver.js';
import type { AppContext } from '../types.js';
import { BuildUser } from './fieldSecurityFixtures.js';

const PROJECTS_ID = 'entity-projects';
const TASKS_ID = 'entity-tasks';
const USERS_ID = 'entity-users';

type FieldInit = Record<string, unknown>;

function entityInit(id: string, name: string, fields: FieldInit[]): EntityInfo {
    return new EntityInfo({
        ID: id,
        Name: name,
        SchemaName: 'dbo',
        BaseTable: name,
        BaseView: `vw${name}`,
        IncludeInAPI: true,
        AllowCreateAPI: true,
        AllowUpdateAPI: true,
        AllowDeleteAPI: true,
        EnableFieldLevelSecurity: false,
        Fields: fields.map((f, i) => ({ ID: `${id}-f${i}`, EntityID: id, Entity: name, Sequence: i + 1, Type: 'nvarchar', ...f })),
    });
}

/** `Projects`: a primary key and a text field. */
function ProjectsEntity(): EntityInfo {
    return entityInit(PROJECTS_ID, 'Projects', [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'Name' },
    ]);
}

/** `Tasks`: a key to `Projects`, a key to `Users`, a key to itself and a text field. */
function TasksEntity(): EntityInfo {
    return entityInit(TASKS_ID, 'Tasks', [
        { Name: 'ID', Type: 'uniqueidentifier', IsPrimaryKey: true },
        { Name: 'ProjectID', Type: 'uniqueidentifier', RelatedEntityID: PROJECTS_ID, RelatedEntity: 'Projects', RelatedEntityFieldName: 'ID' },
        { Name: 'AssigneeID', Type: 'uniqueidentifier', RelatedEntityID: USERS_ID, RelatedEntity: 'Users', RelatedEntityFieldName: 'ID' },
        { Name: 'ParentTaskID', Type: 'uniqueidentifier', RelatedEntityID: TASKS_ID, RelatedEntity: 'Tasks', RelatedEntityFieldName: 'ID' },
        { Name: 'Notes' },
    ]);
}

class FakeTransactionGroup {
    public Variables: unknown[] = [];
    public AddTransaction(): void { /* enrolment is not under test here */ }
    public AddVariable(variable: unknown): void { this.Variables.push(variable); }
    public async Submit(): Promise<boolean> { return true; }
}

/** The part of `BaseEntity` the resolver touches, with a real `EntityInfo`. */
class FakeEntity {
    public TransactionGroup: FakeTransactionGroup | null = null;
    public LatestResult: BaseEntityResult | null = null;
    public SaveCalls = 0;
    private values: Record<string, unknown> = {};

    constructor(public readonly EntityInfo: EntityInfo) {}

    public get PrimaryKeys() { return this.EntityInfo.PrimaryKeys; }
    public SetMany(values: Record<string, unknown>): void { this.values = { ...this.values, ...values }; }
    public async InnerLoad(): Promise<boolean> { return true; }
    public async GetDataObject(): Promise<Record<string, unknown>> { return { ...this.values }; }
    public async GetDataObjectJSON(): Promise<string> { return JSON.stringify(this.values); }
    public async Save(): Promise<boolean> { return this.write(); }
    public async Delete(): Promise<boolean> { return this.write(); }
    private write(): boolean {
        this.SaveCalls++;
        const result = new BaseEntityResult();
        result.Success = true;
        this.LatestResult = result;
        return true;
    }
}

function buildContext(entities: FakeEntity[], user: UserInfo): AppContext {
    let next = 0;
    const provider = {
        CreateTransactionGroup: async () => new FakeTransactionGroup(),
        GetEntityObject: async () => entities[next++],
    };
    return {
        providers: [{ type: 'Read-Write', provider }],
        userPayload: { userRecord: user, email: user.Email },
    } as unknown as AppContext;
}

interface ItemSpec {
    Entity: FakeEntity;
    Operation: TransactionOperationType;
    Values: Record<string, unknown>;
}

function groupOf(items: ItemSpec[], variables: TransactionVariableInputType[]): TransactionInputType {
    return {
        Items: items.map((i) => ({ EntityName: i.Entity.EntityInfo.Name, EntityObjectJSON: JSON.stringify(i.Values), OperationType: i.Operation })),
        Variables: variables,
    };
}

const define = (itemIndex: number, fieldName: string): TransactionVariableInputType =>
    ({ Name: 'v', ItemIndex: itemIndex, FieldName: fieldName, Type: TransactionVariableType.Define });
const use = (itemIndex: number, fieldName: string): TransactionVariableInputType =>
    ({ Name: 'v', ItemIndex: itemIndex, FieldName: fieldName, Type: TransactionVariableType.Use });

const newProject = (): ItemSpec => ({ Entity: new FakeEntity(ProjectsEntity()), Operation: TransactionOperationType.Create, Values: { Name: 'p' } });
const newTask = (): ItemSpec => ({ Entity: new FakeEntity(TasksEntity()), Operation: TransactionOperationType.Create, Values: { Notes: 't' } });

async function expectRefused(items: ItemSpec[], variables: TransactionVariableInputType[]): Promise<void> {
    const run = new TransactionResolver().ExecuteTransactionGroup(groupOf(items, variables), buildContext(items.map((i) => i.Entity), BuildUser([])));
    await expect(run).rejects.toThrow(/transaction variable "v"/i);
    for (const item of items) {
        expect(item.Entity.SaveCalls).toBe(0);
    }
}

describe('ExecuteTransactionGroup: transaction variables from a network caller', () => {
    it('refuses a Use on a field that is not a foreign key', async () => {
        await expectRefused([newProject(), newTask()], [define(0, 'ID'), use(1, 'Notes')]);
    });

    it('refuses a Define on a field that is not the primary key', async () => {
        await expectRefused([newProject(), newTask()], [define(0, 'Name'), use(1, 'ProjectID')]);
    });

    it('refuses a Define on the primary key of an item the group does not create', async () => {
        const existing: ItemSpec = { Entity: new FakeEntity(ProjectsEntity()), Operation: TransactionOperationType.Update, Values: { ID: 'p-1', Name: 'p' } };
        await expectRefused([existing, newTask()], [define(0, 'ID'), use(1, 'ProjectID')]);
    });

    it('refuses a Use on a foreign key that relates to a different entity than the Define item', async () => {
        await expectRefused([newProject(), newTask()], [define(0, 'ID'), use(1, 'AssigneeID')]);
    });

    it('refuses a Use on the same item as its Define', async () => {
        await expectRefused([newTask()], [define(0, 'ID'), use(0, 'ParentTaskID')]);
    });

    it('refuses a Use that has no Define', async () => {
        await expectRefused([newProject(), newTask()], [use(1, 'ProjectID')]);
    });
});
