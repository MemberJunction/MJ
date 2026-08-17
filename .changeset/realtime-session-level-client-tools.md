---
"@memberjunction/ng-conversations": minor
---

Realtime: a client tool can belong to the SESSION, not to a channel (#3536)

Client tools were routed to a channel by the declaring channel's `ToolNamePrefix`, so a tool that
operates across surfaces — report every open surface, group two surfaces into a workspace, hand a
multi-step job to a delegate that drives several — had to be declared by whichever channel happened
to be present, and then shipped wearing that channel's badge:

```
browser_WorkspaceStatus      ← reports ALL surfaces, not just the browser
browser_CombineSurfaces      ← groups the whiteboard with something
```

Every description then opened by contradicting its own name ("Reports ALL open surfaces — not only
the one this tool is named after"), which is prompt budget spent undoing a routing decision, and it
degrades selection because a model reasonably infers scope from a name. It also created an ordering
hazard: the owning channel had to be present, so hosts ran a claim/ownership dance and the tool names
changed depending on which surface won.

`RegisterSessionClientTools(tools)` declares tools against the session. They carry their own names
with no channel prefix, are sent to the model at mint alongside the channel tools, and are dispatched
by **exact name** rather than by prefix — so they are reachable whether or not any particular channel
is open.

`Execute` may be **async**, which closes the issue's second limit. A channel's `ApplyAgentTool`
returns `string`, so a cross-surface tool that had to await something could only be declared by a
channel whose entry point happened to be async — making the tool's existence depend on which surface
claimed it. Thrown errors are wrapped into `{ success: false, error }` exactly like a channel tool's.

Starting a session whose session-tool name begins with a live channel's prefix now **throws** with
both names. Exact-match dispatch means such a name would silently swallow every call sharing that
prefix, and the channel would stop responding to its own tools with nothing to say why. The clash is
deterministic and belongs to the host's naming, so it surfaces the first time the session runs.
