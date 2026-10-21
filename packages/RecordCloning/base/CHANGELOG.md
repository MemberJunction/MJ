# @memberjunction/record-cloning-base

## 6.2.0-edge.4

### Minor Changes

- 0e5a4cd: Template users: an account set up to be copied, with its pinned apps, views, settings, dashboards and Skip conversations, so a new user starts with all of it.
  - **`User.IsTemplate`** (migration). The User form shows it under Account Settings. A copy is never a template itself.
  - **The `template` preset on `MJ: Users`** copies a template user whole: views, settings, dashboards with their categories and links, conversations with their messages, and the artifacts and versions in them. Dashboard layouts, pinned items and artifact references point at the copies. The planner refuses the preset for any user not flagged `IsTemplate` (`TEMPLATE_SOURCE_REQUIRED`), so one person's private work is never copied to another. Only a template-mode preset may open a Locked edge or copy an entity marked `CloneableFromTemplate` (conversations and their messages); request overrides still cannot.
  - **First sign-in.** `userHandling.newUserTemplate: { email, preset }` in `mj.config.cjs` makes MJAPI create each new user as a copy of that template. Any problem falls back to a plain user, so sign-in never breaks.
  - **`mj user clone`** creates a user as a copy of another: `--from`, `--email`, `--first`, `--last`, `--preset` (default `template`), `--inactive`, `--dry-run`.
  - **Open Apps can ship a template user.** `templateUser: { email, description?, preset?, newUsers?: offer | always | never }` in `mj-app.json`. After install, the installer gets their own copy, from `MJ_INSTALL_USER_EMAIL` / `_FIRST_NAME` / `_LAST_NAME` or prompts. The template can also be set for later sign-ins (`MJ_INSTALL_TEMPLATE_FOR_NEW_USERS`). The step only warns on failure; it never fails the install.
  - **Explorer** shows a red banner while a template user is signed in, because everything changed there reaches every later copy.

  Fixes found on the way:
  - **CurrentUser** now returns `IsTemplate`, `FirstLast` and the `Employee*` fields. It returned null for every `UserInfo` field missing from its hand-written list. The list is now `SessionUserFields`, with a test that it covers every field the client requests.
  - **Artifact version saves inside a transaction.** `MJArtifactVersionEntityServer` read attributes through the global provider. On a server's per-request provider, inside a clone's transaction, each read waited about 30 s on the transaction's own locks. A 23-version copy took 11 minutes instead of seconds. It now reads through the entity's provider.
  - **Copies keep their rows' order.** The dependency walker reads children oldest first (`__mj_CreatedAt`). A row whose remapped column points only at its own ancestors, such as a copied user's messages naming the new user, now saves within the graph save instead of after it. Copied conversations kept their messages, but showed each answer above its question.
  - **User copies keep dashboard and view names.** The entities' `(copy)` rename applies only where a name could collide. A user copy owns its rows, so the rename only mislabelled them.
  - Record cloning: `Child.JoinField` preset keys, case-insensitive key lookup in JSON remap, Golden Layout and top-level-array JSON remap paths, and a descendant's `JsonRemap` merged with the entity's own.
  - A conversation message can be created during a clone save (`CloneContext`) by a user who doesn't own the conversation yet. Updates and deletes are still checked.

### Patch Changes

- Updated dependencies [49f26d9]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [0a7c255]
- Updated dependencies [d86bcbc]
- Updated dependencies [25f7b82]
- Updated dependencies [90829e3]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
  - @memberjunction/core@6.2.0-edge.4
  - @memberjunction/global@6.2.0-edge.4
  - @memberjunction/record-graph@6.2.0-edge.4

## 6.2.0-edge.3

### Patch Changes

- Updated dependencies [dfe40a4]
- Updated dependencies [0f04590]
- Updated dependencies [41c2c08]
- Updated dependencies [66fd011]
- Updated dependencies [196160a]
- Updated dependencies [60bd774]
- Updated dependencies [35da130]
- Updated dependencies [28c92e0]
  - @memberjunction/global@6.2.0-edge.3
  - @memberjunction/core@6.2.0-edge.3
  - @memberjunction/record-graph@6.2.0-edge.3

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Introduce `@memberjunction/record-cloning-base` and `@memberjunction/record-cloning` engine packages.
  Includes deterministic clone planning, graph policy resolution, 12-stage field transformation pipeline, SHA-256 plan hash validation, transactional entity graph materialization, and remote operation handlers (RecordClone.Describe, RecordClone.Plan, RecordClone.Execute, and RecordClone.GetLineage).
  - A bare child key in a root's `Relationships` (`"MJ: AI Agent Actions"`) applies only to edges from the root's entity. Relationship-ID and `"<Child>.<JoinField>"` keys apply at any depth. The validator refuses a bare key that names no relationship of the root.
  - A row that points at another new row (a step path at a later step, a step at a copied sub-agent) is saved after that row.
  - A plan warns with `CHILD_ROWS_UNREADABLE` when the rows of an edge it copies can't be read, instead of planning a copy without them.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/record-graph@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
