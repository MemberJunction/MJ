import fs from 'node:fs';
const urls = JSON.parse(fs.readFileSync('op-urls.json', 'utf8'));
const CONCURRENCY = 8;
let idx = 0;
let ok = 0, fail = 0;

async function worker() {
    while (idx < urls.length) {
        const i = idx++;
        const u = urls[i];
        const slug = u.helpUrl.split('/Help/Api/')[1];
        const outPath = `ops/${slug}.html`;
        if (fs.existsSync(outPath) && fs.statSync(outPath).size > 500) { ok++; continue; }
        try {
            const res = await fetch(u.helpUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const text = await res.text();
            if (res.status === 200) {
                fs.writeFileSync(outPath, text);
                ok++;
            } else {
                fs.writeFileSync(outPath + '.FAILED', `STATUS:${res.status}`);
                fail++;
            }
        } catch (e) {
            fs.writeFileSync(outPath + '.FAILED', String(e));
            fail++;
        }
    }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(JSON.stringify({ total: urls.length, ok, fail }));
