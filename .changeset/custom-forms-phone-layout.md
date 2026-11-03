---
"@memberjunction/ng-core-entity-forms": patch
"@memberjunction/ng-explorer-core": patch
"@memberjunction/ng-ui-components": patch
---

Custom entity forms fit a 375px phone: tab strips scroll instead of spilling past the edge, hero action rows (Run / Refresh / Export / Re-run) drop under the title, the title block stacks over the Run button on Actions, AI Prompts and Templates, metadata rows on Queries wrap, and the Entities header wraps its stat tiles two per row. All rules sit under the existing 768px breakpoint; desktop is unchanged. The hero header panels (Users, Companies, Employees, Conversations, AI Agent Categories) let a long title wrap instead of scrolling the panel column sideways, and the records region fills the full height on phones now that its layout runs headerless. `@memberjunction/ng-ui-components` gains `mj-section-picker`, the phone replacement for a section rail or tab strip: one button naming the current section that opens a searchable Sections bottom sheet.
