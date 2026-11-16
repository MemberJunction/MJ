---
'@memberjunction/core': minor
---

Data Analysis & Queries skill and the Query Strategist agent now grant Get Entity List and Explore Database Schema, and the skill text tells the agent to find the exact entity name (core entities carry the `MJ: ` prefix) before calling Get Entity Details (#4528). The IT56 PG9 integration check runs against a seeded `IT: Payload Malformed-Downstream Child` instead of saving malformed paths onto a shared agent at run time, which the server saw only after its debounced refresh (#5962).
