---
"@memberjunction/core-entities": minor
"@memberjunction/core-entities-server": minor
"@memberjunction/ng-base-forms": minor
"@memberjunction/ng-dashboards": minor
---

Custom forms and form panels can be published to a role or to everyone, and the server now
enforces who may do that.

- **One grant.** A new `Manage Form Defaults` authorization, granted to `Developer` and `Integration`, is needed to
  publish a panel (`MJ: Entity Form Contributions`) or a full custom form
  (`MJ: Entity Form Overrides`) to a role or to everyone, to change a shared item's audience, or to
  remove it. An `Owner` user counts as a holder. Any user can manage their own personal items. No
  one can write another user's personal item.
- **Enforced in the entity.** `MJEntityFormContributionEntityServer` and
  `MJEntityFormOverrideEntityServer` check every save and delete, so the rule holds for the
  drawer, Form Builder, agent actions, `mj sync` and direct saves. A `ReplayOnly` save needs the
  grant. `UserCanManageFormDefaults` in `@memberjunction/core-entities` is the same check for UI
  code.
- **The UI role can write both entities.** Ordinary users can now switch off and remove their own
  panels. The server rule above is what keeps them to their own rows.
- **One drawer, "Manage this form".** It lists the form choice and every panel, grouped as
  yours, shared with you, hidden and fixed. Holders get Publish and Audience. Publishing moves the
  row and retires the item that was live for that audience in the same transaction.
- **Hide for me.** Any user can hide a shared or compiled panel for themselves. Hides are stored
  in the `mj.formPanels.hidden.<entity>` user setting and change no row.
- Form Builder's override dialog shows the audience as read-only text to users without the grant.

**Deploy order:** deploy the server code before pushing the metadata. The metadata gives the UI
role write access to both entities, and only the new server subclasses keep that access to the
user's own rows.
