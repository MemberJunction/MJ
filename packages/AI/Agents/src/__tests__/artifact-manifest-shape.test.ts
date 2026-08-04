import { describe, it, expect } from 'vitest';
import { ArtifactToolManager } from '../ArtifactToolManager';
// Side-effect imports so the artifact-type tool libraries register for Initialize().
import '../artifact-tools/JSONToolLibrary';
import '../artifact-tools/TextToolLibrary';

describe('ArtifactToolManager manifest content-shape preview', () => {
    it('describes a top-level JSON array: length + item fields + "no content wrapper" hint', () => {
        const m = new ArtifactToolManager();
        m.Initialize([
            {
                name: 'orders.json',
                typeName: 'JSON',
                content: JSON.stringify([
                    { OrderID: '1', Customer: 'Acme', Status: 'Rejected' },
                    { OrderID: '2', Customer: 'Globex', Status: 'Approved' },
                ]),
            },
        ]);
        const manifest = m.ToManifestString();
        expect(manifest).toMatch(/JSON array of 2 item\(s\)/);
        expect(manifest).toMatch(/item fields: OrderID, Customer, Status/);
        expect(manifest).toMatch(/no "content" wrapper/);
    });

    it('describes a JSON object by its keys', () => {
        const m = new ArtifactToolManager();
        m.Initialize([{ name: 'cfg.json', typeName: 'JSON', content: JSON.stringify({ host: 'x', port: 1 }) }]);
        expect(m.ToManifestString()).toMatch(/JSON object; keys: host, port/);
    });

    it('previews plain text by line count', () => {
        const m = new ArtifactToolManager();
        m.Initialize([{ name: 'log.txt', typeName: 'Text', content: 'a\nb\nc' }]);
        expect(m.ToManifestString()).toMatch(/text, 3 line\(s\)/);
    });
});
