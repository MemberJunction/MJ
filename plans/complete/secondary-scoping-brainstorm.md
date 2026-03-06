# PRIMARY SCOPING
- User ID (MJ CORE)
- Company ID (MJ CORE)
- PrimaryScopeEntityID/PrimaryScopeRecordID

# SECONDARY SCOPING
**ANY** arbitrary set of key/value pairs that map to "dimensions" - we do not know what these are and don't care...

example

 - A: 1
 - B: 'xyz'
 - C: -500

# REQUIREMENTS
1. Need to have a new property in ExecuteAgentParams ---- called `SecondaryScopes` and this would be a `Record<string, any>` where you pass in the secondary scopes relevant to the Agent Run
2. You persist the SecondaryScopes into the `AI Agent Runs` entity --- because we need to know permaenntly that this particular run was linked to a set of secondary scopes (e..g A/B/C from above)
3. Memory Manager - this needs to be able to use this information per Agent Run to segment memory formation/management/removal/etc
4. Runtime - `BaseAgent` needs to inject examples/notes that are scoped based on the `ExecuteAgentParams.SecondaryScopes` passed in.
    Example:
      in the above - if I pass in those values for A/B/C, then we would FILTER all of the Memories (e.g. notes and examples) for the agent down to those **matching** A/B/C of values noted above, and then only consider those notes/examples for injection
