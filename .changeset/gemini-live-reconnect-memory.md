---
"@memberjunction/ai": patch
"@memberjunction/ai-realtime-client": patch
"@memberjunction/ai-gemini": patch
"@memberjunction/ai-vertex": patch
---

A Gemini Live call on the Developer API keeps its conversation across the 10-minute reconnect. The session reseeds every final turn on the new connection before any held audio, moves at 540 s at a turn boundary, and resumes even when Google issued no handle. A failed seed is a non-fatal `resume-seed-failed` error. Gemini Enterprise and Vertex AI keep the resumption handle as the memory and behave as before.
