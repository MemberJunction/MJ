# @memberjunction/record-graph

## 6.2.1

### Patch Changes

- Updated dependencies [41142bd]
  - @memberjunction/core@6.2.1
  - @memberjunction/global@6.2.1

## 6.2.0

### Minor Changes

- 7e57b48: Extract `@memberjunction/record-graph` from Version History and Metadata Sync to provide generalized record dependency graph traversal, topological sorting, relationship collection resolution, and link encoding across MemberJunction.

  The walker finds IS-A subtype rows on UUID keys (it passed the record-id string where the bare key value is expected), matches soft links stored as the bare key value, and builds its queries from the provider it was given. `WalkOptions.OnLoadFailure` reports an edge whose rows couldn't be loaded, which the walk otherwise only logs.

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

- Updated dependencies [1419ba7]
- Updated dependencies [39b35f1]
- Updated dependencies [e97d95c]
- Updated dependencies [6c36fb6]
- Updated dependencies [cc36de5]
- Updated dependencies [9cb815b]
- Updated dependencies [709de1a]
- Updated dependencies [c159e2f]
- Updated dependencies [d2db108]
- Updated dependencies [dfe40a4]
- Updated dependencies [a3539d2]
- Updated dependencies [db39145]
- Updated dependencies [41274aa]
- Updated dependencies [29b16ee]
- Updated dependencies [c671f85]
- Updated dependencies [49f26d9]
- Updated dependencies [5e4205c]
- Updated dependencies [7be1684]
- Updated dependencies [21f9e15]
- Updated dependencies [c8c48e1]
- Updated dependencies [f2248d5]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [3bace5a]
- Updated dependencies [88e6902]
- Updated dependencies [c87f87a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [e1fd4c1]
- Updated dependencies [4248fb3]
- Updated dependencies [d29b5c2]
- Updated dependencies [59e32e0]
- Updated dependencies [0a7c255]
- Updated dependencies [0adaf76]
- Updated dependencies [0ff7523]
- Updated dependencies [d86bcbc]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [5f0baf7]
- Updated dependencies [f65fec7]
- Updated dependencies [9b5b489]
- Updated dependencies [cb205de]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [683f652]
- Updated dependencies [914e6ff]
- Updated dependencies [2274f42]
- Updated dependencies [0fb3649]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [705ab4e]
- Updated dependencies [a7da50b]
- Updated dependencies [0f04590]
- Updated dependencies [4c0eaec]
- Updated dependencies [f26084f]
- Updated dependencies [db39145]
- Updated dependencies [f48dffc]
- Updated dependencies [41c2c08]
- Updated dependencies [630bb88]
- Updated dependencies [e69634e]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [17cc774]
- Updated dependencies [dae1d31]
- Updated dependencies [bfd67c6]
- Updated dependencies [80905a1]
- Updated dependencies [397ae9a]
- Updated dependencies [7e72c86]
- Updated dependencies [a17a228]
- Updated dependencies [ee1f0d9]
- Updated dependencies [4ef13d6]
- Updated dependencies [25f7b82]
- Updated dependencies [104125c]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [d296edd]
- Updated dependencies [66fd011]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [509d2aa]
- Updated dependencies [196160a]
- Updated dependencies [5513c2a]
- Updated dependencies [90829e3]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [8c120db]
- Updated dependencies [9a2d7cc]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [36a3f9e]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [60bd774]
- Updated dependencies [0a348e2]
- Updated dependencies [ac18db8]
- Updated dependencies [35da130]
- Updated dependencies [5b41d48]
- Updated dependencies [4b9542c]
- Updated dependencies [28c92e0]
- Updated dependencies [5f707d1]
- Updated dependencies [369e229]
- Updated dependencies [ba00ac7]
- Updated dependencies [8a5d2c0]
- Updated dependencies [aca4317]
- Updated dependencies [d52f9ba]
- Updated dependencies [0e5a4cd]
- Updated dependencies [b968642]
- Updated dependencies [68a7e3b]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
- Updated dependencies [2c590b0]
- Updated dependencies [1ba9315]
- Updated dependencies [b8a9e5e]
- Updated dependencies [e8258a1]
- Updated dependencies [dc38250]
  - @memberjunction/global@6.2.0
  - @memberjunction/core@6.2.0

## 6.2.0-edge.8

### Patch Changes

- Updated dependencies [6c36fb6]
- Updated dependencies [9cb815b]
- Updated dependencies [d2db108]
- Updated dependencies [c671f85]
- Updated dependencies [59e32e0]
- Updated dependencies [5f0baf7]
- Updated dependencies [a6f8c1c]
- Updated dependencies [56d7614]
- Updated dependencies [902d086]
- Updated dependencies [62c91ea]
- Updated dependencies [e69634e]
- Updated dependencies [ac18db8]
  - @memberjunction/core@6.2.0-edge.8
  - @memberjunction/global@6.2.0-edge.8

## 6.2.0-edge.7

### Patch Changes

- Updated dependencies [1419ba7]
- Updated dependencies [29b16ee]
- Updated dependencies [c8c48e1]
- Updated dependencies [3bace5a]
- Updated dependencies [f4cd5fb]
- Updated dependencies [42df19d]
- Updated dependencies [4283a82]
- Updated dependencies [d6b39c4]
- Updated dependencies [f65fec7]
- Updated dependencies [0fb3649]
- Updated dependencies [4c0eaec]
- Updated dependencies [397ae9a]
- Updated dependencies [4ef13d6]
- Updated dependencies [509d2aa]
- Updated dependencies [9a2d7cc]
- Updated dependencies [36a3f9e]
- Updated dependencies [4b9542c]
- Updated dependencies [ba00ac7]
- Updated dependencies [aca4317]
  - @memberjunction/global@6.2.0-edge.7
  - @memberjunction/core@6.2.0-edge.7

## 6.2.0-edge.6

### Patch Changes

- Updated dependencies [cc36de5]
- Updated dependencies [709de1a]
- Updated dependencies [f2248d5]
- Updated dependencies [0ff7523]
- Updated dependencies [cb205de]
- Updated dependencies [914e6ff]
- Updated dependencies [f26084f]
- Updated dependencies [dae1d31]
- Updated dependencies [d296edd]
- Updated dependencies [6a5fb64]
- Updated dependencies [0e93e1f]
- Updated dependencies [c65f754]
- Updated dependencies [49d0d3c]
- Updated dependencies [0a348e2]
- Updated dependencies [5b41d48]
- Updated dependencies [718b01c]
- Updated dependencies [374b1a4]
  - @memberjunction/core@6.2.0-edge.6
  - @memberjunction/global@6.2.0-edge.6

## 6.2.0-edge.5

### Patch Changes

- Updated dependencies [39b35f1]
- Updated dependencies [c159e2f]
- Updated dependencies [db39145]
- Updated dependencies [5e4205c]
- Updated dependencies [81aea34]
- Updated dependencies [5465489]
- Updated dependencies [d29b5c2]
- Updated dependencies [2274f42]
- Updated dependencies [db39145]
- Updated dependencies [b73e3bc]
- Updated dependencies [08be974]
- Updated dependencies [7e72c86]
- Updated dependencies [8c120db]
- Updated dependencies [3ab85f9]
- Updated dependencies [17a4137]
- Updated dependencies [b4afc13]
- Updated dependencies [5f707d1]
- Updated dependencies [dc38250]
  - @memberjunction/core@6.2.0-edge.5
  - @memberjunction/global@6.2.0-edge.5

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

## 6.2.0-edge.2

### Minor Changes

- 7e57b48: Extract `@memberjunction/record-graph` from Version History and Metadata Sync to provide generalized record dependency graph traversal, topological sorting, relationship collection resolution, and link encoding across MemberJunction.

  The walker finds IS-A subtype rows on UUID keys (it passed the record-id string where the bare key value is expected), matches soft links stored as the bare key value, and builds its queries from the provider it was given. `WalkOptions.OnLoadFailure` reports an edge whose rows couldn't be loaded, which the walk otherwise only logs.

### Patch Changes

- Updated dependencies [e97d95c]
- Updated dependencies [21f9e15]
- Updated dependencies [4248fb3]
- Updated dependencies [0adaf76]
- Updated dependencies [705ab4e]
- Updated dependencies [7e57b48]
- Updated dependencies [7e57b48]
- Updated dependencies [5986939]
- Updated dependencies [4d647e6]
- Updated dependencies [369e229]
  - @memberjunction/core@6.2.0-edge.2
  - @memberjunction/global@6.2.0-edge.2
