# Form chrome policy — accordion vs left-nav, major vs detail

How a generated entity form decides **layout** (accordion vs left rail) and
**which sections are first-class vs tucked away**. Complements
[`form-contributions.md`](form-contributions.md): contributions decide *what*
is on the form; this decides *how the container arranges it*.

Status: **migration written, waiting on review** before apply + CodeGen.

## Locked names

| Layer | Name |
|---|---|
| Entity column | `Configuration` (`NVARCHAR(MAX) NULL`) |
| Entity JSONType | `IEntityConfiguration` → `UI?: IEntityUIConfiguration` → `Form?: IEntityFormConfiguration` |
| EntityRelationship column | `Configuration` (`NVARCHAR(MAX) NULL`) |
| EntityRelationship JSONType | `IEntityRelationshipConfiguration` → `UI?: IEntityRelationshipUIConfiguration` |
| Optional behavior subclass | `BaseFormPolicy` (sits with `BaseFormComponent` / `BaseFormPanel`, not `BaseEntityForm*`) |
| Typed accessors (CodeGen) | `Configuration` (string) + `ConfigurationObject` (parsed interface) |

`NULL` / `{}` / omitted keys = today’s accordion, every `DisplayInForm`
relationship first-class. Nothing is required of any app.

## The pain

A Person or Organization with Common + Tasks + Orders installed renders
**15–25 related-entity accordions** under the field panels. Accordion-as-the-
only-chrome is right for a 6-section form and hostile for a hub record. The
fields are already grouped (`EntityField.GeneratedFormSection` =
`Top` / `Category` / `Details`). The flood is **relationships**.

## What already exists — do not reinvent

| Knob | Where | What it does |
|---|---|---|
| `EntityField.GeneratedFormSection` | field metadata | `Top` / `Category` / `Details` — CodeGen's field-panel grouping |
| `EntityField.Category` | field metadata | names the Category accordion |
| `EntityRelationship.DisplayInForm` | relationship metadata | whether a related grid is a contribution at all |
| `EntityRelationship.Sequence` | relationship metadata | order among related grids |
| `EntityRelationship.DisplayLocation` | relationship metadata | before vs after field tabs (legacy tab-era) |
| `EntityFormConfig` | per *instance* | hide sections, lock accordions open, width — for dialogs/slide-ins |
| Form contributions | ClassFactory | last-wins panels / related claims / field-panel takeover |
| `CancellableFormEvent` | container | BeforeSave / BeforeDelete / BeforeCancel already exist |

There is **no** existing JSONType bag on `MJ: Entities`. On
`EntityRelationship` the JSON-ish columns are already owned:

| Column | Owner | Purpose |
|---|---|---|
| `RelatedRecordCollection` | CodeGen | `IRelatedRecordCollectionConfig` → `DeclareRelatedRecords` |
| `DisplayComponentConfiguration` | CodeGen + display component | knobs when `DisplayComponentID` is set |
| `AdditionalFieldsToInclude` | CodeGen / LLM | join-field name list |

Do not put chrome in any of those.

## Two layers

### 1. Metadata is the default (`Configuration` bags)

```typescript
// Entity.Configuration
interface IEntityConfiguration {
    UI?: IEntityUIConfiguration;
}
interface IEntityUIConfiguration {
    Form?: IEntityFormConfiguration;
}
interface IEntityFormConfiguration {
    Layout?: 'accordion' | 'left-nav' | 'auto'; // omit = auto
    AutoLeftNavAt?: number;                     // omit = 8
}

// EntityRelationship.Configuration
interface IEntityRelationshipConfiguration {
    UI?: IEntityRelationshipUIConfiguration;
}
interface IEntityRelationshipUIConfiguration {
    FormRole?: 'Primary' | 'Detail';            // omit = Primary
}
```

`UI` (not `Form`) is the top nested key on **both** bags so later UI
concerns (list cards, search chrome, group, badge) land beside `Form` /
`FormRole` with no migration.

`FormRole` lives in the relationship bag, not as its own CHECK column, on
day one. We almost never filter relationships in SQL by role —
`EntityInfo` already has the row in memory. Promote to a column later only
if we need `RunView` filters.

Sources of truth for the interfaces (lockstep with `EntityField.JSONTypeDefinition`):

- [`metadata/entities/JSONType-interfaces/IEntityConfiguration.ts`](../metadata/entities/JSONType-interfaces/IEntityConfiguration.ts)
- [`metadata/entities/JSONType-interfaces/IEntityRelationshipConfiguration.ts`](../metadata/entities/JSONType-interfaces/IEntityRelationshipConfiguration.ts)

### 2. `BaseFormPolicy` is the override (behavior)

A ClassFactory subclass, **not** a JSON-only switch and **not** a whole-form
replace. Named `BaseFormPolicy` to sit with `BaseFormComponent` /
`BaseFormPanel`.

```typescript
@RegisterClassEx(BaseFormPolicy, {
    key: 'MJ_BizApps_Common: People',
    metadata: { entity: 'MJ_BizApps_Common: People' },
})
export class PersonFormPolicy extends BaseFormPolicy {
    public ResolveChrome(ctx: FormChromeContext): FormChromeSpec {
        return {
            Layout: ctx.PrimarySectionCount >= 8 ? 'left-nav' : 'accordion',
            Groups: [
                { Key: 'identity', Title: 'Person',  SectionKeys: [/* header + fields */] },
                { Key: 'related',  Title: 'Related', SectionKeys: [/* Primary roles */] },
                { Key: 'more',     Title: 'More',    SectionKeys: [/* Detail roles */] },
            ],
        };
    }
}
```

Orders registers the **same key** at higher `Priority` and rearranges
groups **without** forking the Person form.

The policy **does not own panels**. Contributions still mount content. The
container asks the winning policy how to chrome those contributions. Apps
that never register a policy just get the metadata defaults (or today’s
accordion if those are null).

`ConfigurationObject` is **not** a behavior class. It is the JSONType
accessor CodeGen already emits for every JSONType column (`AgentSettingsObject`,
`UIConfigObject`). The container reads
`entity.ConfigurationObject?.UI?.Form?.Layout`.

### Events — small surface, conversations shape

Reuse `CancellableFormEvent`. Do **not** re-pipe Save/Delete.

| Event | Cancelable | When |
|---|---|---|
| `BeforeLayoutResolve` | yes | policy about to pick accordion vs left-nav |
| `AfterLayoutResolved` | no | notifier |
| `BeforeSectionActivate` | yes | left-nav click / accordion expand (dirty guard) |
| `AfterSectionActivated` | no | notifier |

Virtuals on the base (`OnBeforeSectionActivate`); `@Output()`s on the
container for hosts.

## Apply sequence (this PR)

Hand-written DDL is in
[`migrations/v6/V202608141412__v6.1.x__Entity_And_EntityRelationship_Configuration.sql`](../migrations/v6/V202608141412__v6.1.x__Entity_And_EntityRelationship_Configuration.sql).
**Do not apply until the migration has been reviewed.**

1. **Review this migration** (current gate).
2. Apply it (`mj migrate`) against the private DB for this session.
3. First `mj codegen` — creates the two `EntityField` rows, regenerates
   `spCreate`/`spUpdate`/`vwEntities` / `vwEntityRelationships`. Concat
   that output onto the migration after **≥50 blank lines** and the
   standard CodeGen comment block. Delete the standalone `CodeGen_Run_*.sql`.
4. Author `.entity-field-jsontype-entity-configuration.json` (lookups
   cannot resolve until step 3). `mj sync push` those JSONType bindings.
5. Second `mj codegen` — emits `ConfigurationObject` accessors. Review
   that output together.
6. Wire `EntityInfo` / `EntityRelationshipInfo` to surface the parsed bag.
7. `BaseFormPolicy` + container grouping (“More” first, then left-nav).
8. **Visualization** in `@memberjunction/ng-core-entity-forms` — a
   first-class editor/preview for `Entity.Configuration` and
   `EntityRelationship.Configuration` on the generated Entity /
   Entity Relationship forms (not a raw textarea).
9. Guides + READMEs (`FORMS_ARCHITECTURE_GUIDE.md` § new, `PANELS.md`,
   `packages/Angular/CLAUDE.md`, base-forms README). Changeset is `minor`
   (database).

PostgreSQL counterpart is **not** in this PR — build-engineer work at
release.

## What this is not

- **Not a custom form.** A `PersonFormPolicy` that returns `left-nav` does
  not restate the generated HTML.
- **Not `EntityFormConfig`.** Config is per *open* (dialog vs tab). Policy
  + `Configuration` are per *entity + installed apps*.
- **Not a second contribution system.** Headers, related claims, and
  widgets stay on `BaseFormPanel`.
