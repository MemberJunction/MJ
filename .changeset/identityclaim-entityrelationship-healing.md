---
"@memberjunction/core": minor
---

Supply the IdentityClaim CodeGen artifacts that no committed migration ever wrote, and stop the CodeGen drift gate failing on its own scratch file.

`V202608202300__v6.1.x__Identity_Claims_Infrastructure.sql` introduced the IdentityClaim entity without the CodeGen tail that normally accompanies it. Four EntityRelationship rows, the EntityFieldValue rows behind `CK_IdentityClaim_Status` with their `ValueListType='List'` flag, and three `RelatedEntityNameFieldMap` assignments therefore exist on every developer database — where `mj codegen` creates them locally — and on no database built purely from committed migrations. Against a clean database CodeGen re-emits all of them, which is what the drift gate has been reporting. See #4323.

Separately, the gate's diff step promised in its own comment to ignore CodeGen's scratch output but only ever removed `codegen.output.log`. CodeGen writes a `CodeGen_Run_<timestamp>.sql` on every run, empty when it has nothing to emit, so that file alone made the gate unpassable even with zero real drift. It is now removed alongside the log.
