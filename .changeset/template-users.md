---
"@memberjunction/core": minor
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/server": minor
"@memberjunction/cli": minor
"@memberjunction/open-app-engine": minor
"@memberjunction/record-cloning-base": minor
"@memberjunction/record-cloning": minor
"@memberjunction/record-graph": minor
"@memberjunction/ng-core-entity-forms": minor
"@memberjunction/ng-explorer-core": minor
"@memberjunction/ng-explorer-app": minor
---

Template users: an account set up to be copied, with its pinned apps, views, settings, dashboards and Skip conversations, so a new user starts with all of it.

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
