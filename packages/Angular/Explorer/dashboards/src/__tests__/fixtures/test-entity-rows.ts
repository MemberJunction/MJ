/**
 * Typed entity doubles for the dashboards' tests: a real generated entity class over a minimal in-memory `EntityInfo`,
 * loaded from the fields a test names (typed by the class: `Partial<T>`), so a double is the generated type itself and no `as unknown as` cast is needed.
 * Lives under `src/__tests__/` (excluded from the package build); it is a helper, not a test file.
 */
import { EntityInfo, type BaseEntity } from '@memberjunction/core';

/** The constructor of a generated entity class (its `EntityInfo` first). */
type EntityClass<T extends BaseEntity> = new (entity: EntityInfo) => T;

/** Builds typed entity rows and minimal `EntityInfo`s for tests. */
export class TestEntityRows {
  /**
   * An instance of `entityClass` holding `data`, over an `EntityInfo` named `entityName` whose fields are exactly the
   * keys of `data` (`ID` the primary key). Every field the test names reads back through the class's typed getters.
   */
  public static async Of<T extends BaseEntity>(entityClass: EntityClass<T>, entityName: string, data: Partial<T>): Promise<T> {
    const row = new entityClass(TestEntityRows.Entity(entityName, Object.keys(data)));
    await row.LoadFromData(data);
    return row;
  }

  /** Several rows of one entity class, in order. */
  public static async Many<T extends BaseEntity>(entityClass: EntityClass<T>, entityName: string, rows: ReadonlyArray<Partial<T>>): Promise<T[]> {
    return Promise.all(rows.map((data) => TestEntityRows.Of(entityClass, entityName, data)));
  }

  /**
   * A minimal `EntityInfo`: `name`, an optional `id`, and `fields` (the `keys` among them are the primary key, in
   * order; every field is updatable). Its `PrimaryKeys`, `FirstPrimaryKey` and field lookups derive as in production.
   */
  public static Entity(name: string, fields: readonly string[], keys: readonly string[] = ['ID'], id = `E-${name}`): EntityInfo {
    return new EntityInfo({
      ID: id,
      Name: name,
      EntityFields: fields.map((f, i) => ({ Name: f, Sequence: i + 1, IsPrimaryKey: keys.includes(f), AllowUpdateAPI: !keys.includes(f) })),
    });
  }
}
