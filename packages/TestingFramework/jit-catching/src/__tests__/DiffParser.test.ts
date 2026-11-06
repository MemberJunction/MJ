import { describe, it, expect } from 'vitest';
import { ParseUnifiedDiff, AddedLinesByFile } from '../git/DiffParser';

const diff = `diff --git a/packages/MJCore/src/a.ts b/packages/MJCore/src/a.ts
index 1..2 100644
--- a/packages/MJCore/src/a.ts
+++ b/packages/MJCore/src/a.ts
@@ -10,4 +10,5 @@ export class A {
     keep();
-    old();
+    newOne();
+    added();
     keep2();
@@ -40,1 +41,1 @@
-x
+y
diff --git a/packages/MJCore/src/b.ts b/packages/MJCore/src/b.ts
new file mode 100644
--- /dev/null
+++ b/packages/MJCore/src/b.ts
@@ -0,0 +1,2 @@
+line1
+line2
`;

describe('ParseUnifiedDiff', () => {
  it('splits hunks per file with their ranges and raw lines', () => {
    const hunks = ParseUnifiedDiff(diff);
    expect(hunks.map((h) => [h.Path, h.NewStart, h.NewLines])).toEqual([['packages/MJCore/src/a.ts', 10, 5], ['packages/MJCore/src/a.ts', 41, 1], ['packages/MJCore/src/b.ts', 1, 2]]);
    expect(hunks[0].Lines).toEqual(['     keep();', '-    old();', '+    newOne();', '+    added();', '     keep2();']);
  });
  it('AddedLinesByFile gives new-side line numbers of + lines', () => {
    expect(AddedLinesByFile(ParseUnifiedDiff(diff))).toEqual({ 'packages/MJCore/src/a.ts': [11, 12, 41], 'packages/MJCore/src/b.ts': [1, 2] });
  });
});
