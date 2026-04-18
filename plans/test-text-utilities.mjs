/**
 * Test script for TextChunker and TextExtractor utilities.
 * Run with: node plans/test-text-utilities.mjs
 */
import { TextChunker, TextExtractor } from '../packages/AI/Vectors/Core/dist/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function printHeader(title) {
  console.log('\n' + '='.repeat(70));
  console.log(`  ${title}`);
  console.log('='.repeat(70));
}

function printSubHeader(title) {
  console.log(`\n--- ${title} ---`);
}

function printChunkSummary(chunks) {
  console.log(`  Chunk count : ${chunks.length}`);
  for (const c of chunks) {
    const preview = c.Text.length > 80 ? c.Text.slice(0, 77) + '...' : c.Text;
    console.log(`  [${c.Index}] tokens=${c.TokenCount}  offsets=${c.StartOffset}-${c.EndOffset}  "${preview}"`);
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------
const SHORT_TEXT = 'Hello world.';

const MEDIUM_TEXT =
  'The quick brown fox jumps over the lazy dog. ' +
  'Artificial intelligence is transforming how we process information. ' +
  'Vector databases enable semantic search at scale. ' +
  'Text chunking is essential for fitting content into embedding models. ' +
  'Overlap between chunks preserves context across boundaries.';

const LONG_TEXT = Array.from({ length: 20 }, (_, i) =>
  `Sentence number ${i + 1} adds more content to this document so we can test how the chunker handles longer inputs with multiple natural boundaries.`
).join(' ');

const HTML_TEXT = `
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Welcome to MemberJunction</h1>
  <p>This is a <strong>paragraph</strong> with <em>inline</em> formatting.</p>
  <p>Second paragraph with a <a href="https://example.com">link</a> inside.</p>
  <ul>
    <li>Item one</li>
    <li>Item two</li>
    <li>Item three</li>
  </ul>
</body>
</html>`;

const COMPLEX_HTML = `
<!DOCTYPE html>
<html>
<head>
  <style>.hidden { display: none; } body { font-family: Arial; }</style>
  <script>console.log("this should be stripped");</script>
</head>
<body>
  <div class="hidden">Hidden div content</div>
  <p>Visible paragraph one.</p>
  <script>var x = 42;</script>
  <p>Visible paragraph two.</p>
  <!-- HTML comment that should be stripped -->
  <p>Final visible paragraph with &amp; entity and &lt;angle brackets&gt;.</p>
</body>
</html>`;

const PLAIN_WITH_CONTROL = 'Line one.\x00\x01\x02 Line two.\t\tTabbed.\r\nWindows newline.\nUnix newline.';

const EMPTY_TEXT = '';

// ---------------------------------------------------------------------------
// TextChunker tests
// ---------------------------------------------------------------------------
printHeader('TextChunker Tests');

const strategies = ['sentence', 'paragraph', 'fixed'];
const testCases = [
  { label: 'Short text', text: SHORT_TEXT },
  { label: 'Medium text', text: MEDIUM_TEXT },
  { label: 'Long text', text: LONG_TEXT },
  { label: 'HTML content (raw)', text: HTML_TEXT },
  { label: 'Empty text', text: EMPTY_TEXT },
];

for (const tc of testCases) {
  printSubHeader(tc.label);
  console.log(`  Input length: ${tc.text.length} chars, ~${TextChunker.EstimateTokenCount(tc.text)} tokens`);

  for (const strategy of strategies) {
    const chunks = TextChunker.ChunkText({
      Text: tc.text,
      MaxChunkTokens: 64,
      Strategy: strategy,
    });
    console.log(`\n  Strategy: ${strategy}`);
    printChunkSummary(chunks);
  }
}

// Test with different MaxChunkTokens values
printSubHeader('Long text - varying MaxChunkTokens');
for (const max of [32, 128, 256, 512]) {
  const chunks = TextChunker.ChunkText({
    Text: LONG_TEXT,
    MaxChunkTokens: max,
    Strategy: 'sentence',
  });
  console.log(`  MaxChunkTokens=${max}  => ${chunks.length} chunks`);
}

// Test with explicit overlap
printSubHeader('Long text - explicit overlap');
for (const overlap of [0, 10, 30]) {
  const chunks = TextChunker.ChunkText({
    Text: LONG_TEXT,
    MaxChunkTokens: 128,
    OverlapTokens: overlap,
    Strategy: 'sentence',
  });
  console.log(`  OverlapTokens=${overlap}  => ${chunks.length} chunks`);
}

// ---------------------------------------------------------------------------
// TextExtractor tests
// ---------------------------------------------------------------------------
printHeader('TextExtractor Tests');

printSubHeader('ExtractFromHTML - simple');
const simpleResult = TextExtractor.ExtractFromHTML(HTML_TEXT);
console.log(`  Input length : ${HTML_TEXT.length}`);
console.log(`  Output length: ${simpleResult.length}`);
console.log(`  Output: "${simpleResult}"`);

printSubHeader('ExtractFromHTML - complex (scripts/styles)');
const complexResult = TextExtractor.ExtractFromHTML(COMPLEX_HTML);
console.log(`  Input length : ${COMPLEX_HTML.length}`);
console.log(`  Output length: ${complexResult.length}`);
console.log(`  Output: "${complexResult}"`);
console.log(`  Contains "console.log": ${complexResult.includes('console.log')}`);
console.log(`  Contains "display: none": ${complexResult.includes('display: none')}`);
console.log(`  Contains "&amp;": ${complexResult.includes('&amp;')}`);
console.log(`  Contains "&" (decoded): ${complexResult.includes('&')}`);

printSubHeader('ExtractFromPlainText - control characters');
const plainResult = TextExtractor.ExtractFromPlainText(PLAIN_WITH_CONTROL);
console.log(`  Input : ${JSON.stringify(PLAIN_WITH_CONTROL)}`);
console.log(`  Output: "${plainResult}"`);

printSubHeader('ExtractFromPlainText - empty');
const emptyResult = TextExtractor.ExtractFromPlainText(EMPTY_TEXT);
console.log(`  Input : "${EMPTY_TEXT}"`);
console.log(`  Output: "${emptyResult}"`);
console.log(`  Length: ${emptyResult.length}`);

printSubHeader('ExtractByMimeType routing');
const htmlMime = TextExtractor.ExtractByMimeType(HTML_TEXT, 'text/html');
const plainMime = TextExtractor.ExtractByMimeType('Hello  world', 'text/plain');
const fallbackMime = TextExtractor.ExtractByMimeType('Fallback  content', 'text/csv');
console.log(`  text/html  => length ${htmlMime.length}`);
console.log(`  text/plain => "${plainMime}"`);
console.log(`  text/csv   => "${fallbackMime}"`);

printSubHeader('TruncateToTokenLimit');
const longForTrunc = 'word '.repeat(100); // ~100 tokens
for (const limit of [10, 50, 200]) {
  const truncated = TextExtractor.TruncateToTokenLimit(longForTrunc, limit);
  const tokenEst = TextChunker.EstimateTokenCount(truncated);
  console.log(`  limit=${limit}  => ${truncated.length} chars, ~${tokenEst} tokens`);
}

// ---------------------------------------------------------------------------
// Integration: extract HTML then chunk
// ---------------------------------------------------------------------------
printHeader('Integration: HTML Extract -> Chunk');

const extracted = TextExtractor.ExtractFromHTML(COMPLEX_HTML);
console.log(`  Extracted text (${extracted.length} chars): "${extracted}"`);

const intChunks = TextChunker.ChunkText({
  Text: extracted,
  MaxChunkTokens: 32,
  Strategy: 'sentence',
});
console.log(`  Chunked into ${intChunks.length} chunk(s):`);
printChunkSummary(intChunks);

console.log('\nAll tests completed successfully.');
