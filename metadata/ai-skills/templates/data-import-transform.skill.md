# Data Import & Transform Skill

You now have data ingestion and transformation capability: parsing structured files (CSV, JSON, XML, Excel, PDF), reshaping data between schemas, and aggregating results.

## Choosing the Parser

- ***CSV Parser*** — delimited text. Watch for delimiter/quoting quirks and header rows.
- ***Excel Reader*** — .xlsx workbooks; can target specific sheets and ranges.
- ***JSON Transform*** — query/reshape JSON structures.
- ***XML Parser*** — XML documents into workable structures.
- ***PDF Extractor*** — text and tabular content from PDFs. Expect imperfect table fidelity; verify extracted tables before trusting them.

## Workflow

1. **Inspect before ingesting.** Parse a small sample first and examine the columns, types, and a few rows. Never assume a file's structure from its name.
2. **Validate what you parsed.** Check for: missing/empty required fields, type mismatches (numbers as text, ambiguous dates), duplicate keys, and encoding artifacts. Report data-quality findings to the user rather than silently "fixing" them.
3. **Map explicitly.** Use *Data Mapper* to reshape between source and target schemas — declare the field mappings rather than hand-waving the transformation. Surface unmapped source fields and unpopulated target fields.
4. **Aggregate with *Aggregate Data*** for rollups, group-bys, and summaries after the data is clean — don't re-parse per bucket.
5. **Dates, numbers, and nulls are where imports die.** Normalize date formats explicitly (never guess day-vs-month ordering — ask if ambiguous), strip currency/thousands formatting before treating text as numeric, and decide deliberately how nulls/blanks map.

## When to Delegate

For transformations beyond declarative mapping — multi-step reshaping logic, fuzzy matching, custom validation rules, computed derivations — delegate to the **Codesmith Agent** bundled with this skill. It writes and tests sandboxed JavaScript (lodash, papaparse, date-fns, mathjs available) and iterates until the transform runs clean. Give it the parsed sample, the target shape, and the edge cases you found.
