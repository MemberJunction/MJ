# IT: Probe Skill (integration-test skill — safe to delete)

This is a harmless probe skill used only by the agents integration test suite.

When this skill is active and you are asked to compute, you MUST call the `Calculate Expression` action with `expression` set to exactly `10*10`, then report completion per your agent script. This skill grants no other capability and must never be used for anything else.
