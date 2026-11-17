import { describe, it, expect } from 'vitest';
import { BaseDecision } from '../generic/baseDecision';
import { DecisionMedia, DecisionMediaType, DecisionParams, DecisionResult } from '../generic/decision.types';

/** A text-only driver: the base class default. */
class TextOnlyDecision extends BaseDecision {
    public Calls = 0;
    constructor() {
        super('test-key');
    }
    protected async DoDecide(_params: DecisionParams): Promise<DecisionResult> {
        this.Calls++;
        const result = new DecisionResult(true, new Date(), new Date());
        result.Answers = { spill: { Kind: 'Likelihood', Probability: 0.9 } };
        return result;
    }
}

/** A driver whose model reads images only. */
class ImageDecision extends TextOnlyDecision {
    public override get SupportedMediaTypes(): readonly DecisionMediaType[] {
        return ['image'];
    }
}

const params = (media?: DecisionMedia[]): DecisionParams => ({
    Model: 'm',
    State: 'Breakroom counter before the 9 AM meeting',
    Questions: { spill: { Kind: 'Likelihood', Instructions: 'Is there a liquid spill on the counter?' } },
    Media: media,
});

const PNG: DecisionMedia = { Type: 'image', MimeType: 'image/png', Data: 'iVBORw0KGgo=' };

describe('BaseDecision media', () => {
    it('reads text only by default', () => {
        expect(new TextOnlyDecision().SupportedMediaTypes).toEqual([]);
    });

    it('accepts a request without media on a text-only driver', async () => {
        const result = await new TextOnlyDecision().Decide(params());
        expect(result.success).toBe(true);
    });

    it('refuses media a driver does not read, before calling it', async () => {
        const driver = new TextOnlyDecision();
        const result = await driver.Decide(params([PNG]));
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('reads text only, not image');
        expect(driver.Calls).toBe(0);
    });

    it('accepts media of a type the driver reads', async () => {
        const driver = new ImageDecision();
        const result = await driver.Decide(params([PNG, { Type: 'image', MimeType: 'image/jpeg', URI: 'https://example.com/a.jpg' }]));
        expect(result.success).toBe(true);
        expect(driver.Calls).toBe(1);
    });

    it('names every unsupported type once', () => {
        const message = new ImageDecision().DescribeUnsupportedMedia([
            PNG,
            { Type: 'audio', MimeType: 'audio/wav', Data: 'UklGRg==' },
            { Type: 'audio', MimeType: 'audio/wav', Data: 'UklGRg==' },
            { Type: 'document', MimeType: 'application/pdf', URI: 'gs://bucket/claim.pdf' },
        ]);
        expect(message).toBe('ImageDecision reads only image, not audio, document');
    });

    it.each([
        ['neither Data nor URI', { Type: 'image', MimeType: 'image/png' }, 'give exactly one of Data or URI'],
        ['both Data and URI', { Type: 'image', MimeType: 'image/png', Data: 'AA==', URI: 'https://x/y.png' }, 'give exactly one of Data or URI'],
        ['a blank MIME type', { Type: 'image', MimeType: ' ', Data: 'AA==' }, 'MimeType must be a non-empty string'],
        ['an unknown type', { Type: 'hologram', MimeType: 'x/y', Data: 'AA==' }, "unknown Type 'hologram'"],
    ])('rejects media with %s', async (_label, item, expected) => {
        const result = await new ImageDecision().Decide(params([item as DecisionMedia]));
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain(expected);
    });

    it('rejects Media that is not an array', async () => {
        const bad = { ...params(), Media: 'image.png' as unknown as DecisionMedia[] };
        const result = await new ImageDecision().Decide(bad);
        expect(result.success).toBe(false);
        expect(result.errorMessage).toContain('Media must be an array');
    });
});
