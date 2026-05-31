import WebSocket from 'ws';

const KEY = 'AIzaSyAmYvYs6NSPGd4lZHYsh-xMBH5snhNSc2Y';
const MODELS = [
    'models/gemini-2.5-flash-native-audio-latest',
    'models/gemini-2.0-flash-exp',
    'models/gemini-2.5-flash-preview-native-audio-dialog',
];

for (const model of MODELS) {
    process.stdout.write(`\n[testing] ${model}\n`);
    await new Promise((resolve) => {
        const ws = new WebSocket(
            `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${KEY}`
        );
        const timer = setTimeout(() => { try { ws.close(); } catch {}; resolve(); }, 5000);
        ws.on('open', () => {
            ws.send(JSON.stringify({
                setup: {
                    model,
                    generationConfig: { responseModalities: ['AUDIO'] },
                },
            }));
        });
        ws.on('message', (data) => {
            const msg = data.toString();
            console.log(`  ✓ got message: ${msg.slice(0, 200)}${msg.length > 200 ? '…' : ''}`);
            clearTimeout(timer);
            try { ws.close(); } catch {}
            resolve();
        });
        ws.on('error', (err) => {
            console.log(`  ✗ error: ${err.message}`);
            clearTimeout(timer);
            resolve();
        });
        ws.on('close', (code, reason) => {
            const r = reason?.toString() ?? '';
            if (r) console.log(`  close ${code}: ${r}`);
        });
    });
}
