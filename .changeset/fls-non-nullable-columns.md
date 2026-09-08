---
"@memberjunction/core": minor
"@memberjunction/server": minor
"@memberjunction/codegen-lib": minor
"@memberjunction/graphql-dataprovider": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/generic-database-provider": minor
"@memberjunction/ng-entity-viewer": minor
---

Field-Level Security: NOT NULL columns can now be restricted.

The guide previously said not to restrict a NOT NULL column, because the generated GraphQL object
types marked those fields non-nullable and an FLS-omitted value then failed response serialization.
That constraint is gone, and with it the largest gap in what the feature could actually protect —
roughly 2,150 of 4,650 restrictable fields were off-limits, including the ~400 foreign-key display
columns that inherit non-nullability from the key they display ("hide which client this contract
belongs to" is a common ask, and it did not work).

The underlying error was one wrong inference. A column's NOT NULL constraint and a GraphQL `!` say
different things — "no ROW stores an empty value here" versus "every RESPONSE, to every caller,
carries a value here" — and the second does not follow from the first. They coincided only while
every caller saw every column of every row they could read, which is exactly what field security
ends. Generated output types are now non-nullable only where FLS is structurally incapable of
stripping a field: primary keys and `__mj_` system columns. **Input types are unchanged** — they
carry the write contract, which the database constraint does still govern.

Symptoms this removes, all of which required a denied NOT NULL column: single-record loads nulling
the entire record, typed list queries nulling the entire query, and — the worst — a mutation whose
write landed in the database while its response failed to serialize, so the client reported a
failed save for an edit that had actually succeeded.

**`ReadableFields___`** is added to every generated object type. Deleting a denied key server-side
is not sufficient on its own: GraphQL emits every field the client *selected*, so a denied field
that was asked for arrives as an explicit `null` indistinguishable from a genuine one. The client
cannot settle that from its own metadata — that copy is stale in the window after a permission
change, and may be filtered away entirely once metadata tiering lands. The server now states it
in-band for the request that actually ran. It lists **readable** fields rather than denied ones
deliberately: naming denied fields would hand back precisely what metadata filtering exists to
withhold.

Also in this release:

- **Read-only fields no longer receive write permissions.** A joined display column or computed
  field cannot be written through the API by anyone, so Update and Create verbs on one decide
  nothing. Reconciliation was authoring `Allow` on both across ~1,000 such fields per qualifying
  role — rows that read as granted permissions and were inert. They are now `No Access`, the
  save-time guard refuses a rule that sets them, and the system-user access guard no longer reads
  their absence as lost access. Read is untouched.

- **Two paths that returned a record's NAME without checking field security are closed.** The
  `GetEntityRecordName` query took no user context at all, so a caller denied read on an entity's
  name field could still obtain it — and the foreign-key control in forms falls through to that
  query *precisely when* the joined display column is denied, so the fallback that exists to handle
  a denial was the thing that defeated it. Separately, `BaseEntity.GetRecordName()` read through
  `Get()`, which throws for a denied field, and it runs automatically after every load and save —
  so denying an entity's name field made every record on it fail to open. Both now degrade to the
  primary key.

- **A write refusal on a field you can read now names the missing permission** rather than using
  the ambiguous "does not exist on entity … or you do not have access to it". That wording exists
  to stop a caller probing which columns a deployment treats as sensitive, which is a question
  about fields they cannot *read*; when they can see the field and its value, it only tells them a
  field they are looking at might not exist. Read denials keep the ambiguous wording.

- **The view-configuration panel no longer offers denied fields as columns.**
