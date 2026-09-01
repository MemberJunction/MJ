---
"@memberjunction/integration-engine": patch
---

Discovery samples ~50 records per table by default, not 500.

Sampling exists to answer three questions, and 50 rows fully answers two of them: a statistically
significant primary key (50 IS the classifier's significance floor — more rows change no verdict) and
which custom columns exist in the data. Only the third, the largest observed string, benefits from
more rows, and it has its own safety nets: the width bucket pads to twice the observed maximum, the
overlay only ever grows a width, and a value that overflows at sync time is recorded as a widening
candidate rather than lost.

Paying ten times the discovery time on every object of every connection to sharpen one answer in
three is the wrong default. On a large catalog that difference is the difference between a discovery
a person will wait for and one they won't.

The default is now sourced from `PK_STAT_MIN_ROWS_FOR_SIGNIFICANCE` rather than restated, so the
sample target and the floor it is chosen to match cannot drift apart. The precedence chain is
unchanged — explicit options, then per-connection `discoveryMaxRecords`, then
`MJ_INTEGRATION_DISCOVERY_MAX_RECORDS`, then this default — so a connection that wants deeper width
fidelity raises it.
