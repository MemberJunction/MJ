import { describe, expect, it } from 'vitest';
import { RegisterClass } from '@memberjunction/global';
import {
    BaseColumnSignature,
    BaseContentTypeSignature,
    BaseXmlSignature,
    CheckContentTypeSignatures,
    SignatureProbe,
} from '../extract/ContentTypeSignature.js';
import { ResolveConfidence } from '../ConfidenceScale.js';

@RegisterClass(BaseContentTypeSignature, 'SigStandards')
class StandardsSignature extends BaseColumnSignature {
    public readonly Key = 'SigStandards';
    public readonly FileTypes = ['csv'];
    public readonly ContentType = 'Standard';
    public readonly RequiredColumns = ['standard id', 'title', 'effective date'];
}

@RegisterClass(BaseContentTypeSignature, 'SigSessions')
class SessionsSignature extends BaseColumnSignature {
    public readonly Key = 'SigSessions';
    public readonly FileTypes = ['csv'];
    public readonly ContentType = 'Session';
    public readonly RequiredColumns = ['session code', 'speaker'];
    public override readonly Confidence = 5;
}

@RegisterClass(BaseContentTypeSignature, 'SigRss')
class RssSignature extends BaseXmlSignature {
    public readonly Key = 'SigRss';
    public readonly FileTypes = ['xml'];
    public readonly ContentType = 'Feed';
    public override readonly RootElements = ['rss', 'feed'];
}

@RegisterClass(BaseContentTypeSignature, 'SigThrows')
class ThrowingSignature extends BaseContentTypeSignature {
    public readonly Key = 'SigThrows';
    public readonly FileTypes = ['csv'];
    public async Check(): Promise<null> {
        throw new Error('malformed signature');
    }
}

const probe = (body: string, fileType: string): SignatureProbe => ({
    Content: new TextEncoder().encode(body),
    FileType: fileType,
    URL: 'https://x.test/a',
});

describe('column signatures', () => {
    it('matches a header row carrying every required column', async () => {
        const matches = await CheckContentTypeSignatures(
            probe('Standard ID,Title,Effective Date\n1,A,2026', 'csv'),
        );
        expect(matches).toContainEqual({ ContentType: 'Standard', Confidence: 7 });
    });

    it('does not match when a required column is missing', async () => {
        const matches = await CheckContentTypeSignatures(probe('Standard ID,Title\n1,A', 'csv'));
        expect(matches.map((m) => m.ContentType)).not.toContain('Standard');
    });

    it('ignores quoting and case in the header', async () => {
        const matches = await CheckContentTypeSignatures(
            probe('"standard id","TITLE","effective date"\n1,A,2026', 'csv'),
        );
        expect(matches.map((m) => m.ContentType)).toContain('Standard');
    });

    it('lets a reference spreadsheet fall through on its own', async () => {
        // Its columns match nothing, so it reaches the generic extractor without a special case.
        const matches = await CheckContentTypeSignatures(probe('Lookup,Value\nA,1', 'csv'));
        expect(matches).toEqual([]);
    });
});

describe('xml signatures', () => {
    it('matches a root element', async () => {
        const matches = await CheckContentTypeSignatures(probe('<?xml version="1.0"?><rss><channel/></rss>', 'xml'));
        expect(matches).toContainEqual({ ContentType: 'Feed', Confidence: 7 });
    });

    it('accepts any one of several alternative structures', async () => {
        const matches = await CheckContentTypeSignatures(probe('<feed xmlns="http://www.w3.org/2005/Atom"/>', 'xml'));
        expect(matches.map((m) => m.ContentType)).toContain('Feed');
    });

    it('matches a namespaced root element', async () => {
        const matches = await CheckContentTypeSignatures(probe('<ns:rss xmlns:ns="urn:x"/>', 'xml'));
        expect(matches.map((m) => m.ContentType)).toContain('Feed');
    });

    it('does not match an unrelated document', async () => {
        const matches = await CheckContentTypeSignatures(probe('<catalog><item/></catalog>', 'xml'));
        expect(matches).toEqual([]);
    });
});

describe('checking many signatures at once', () => {
    it('is scoped by file type — an xml signature is never checked against a csv', async () => {
        const matches = await CheckContentTypeSignatures(probe('<rss/>', 'csv'));
        expect(matches.map((m) => m.ContentType)).not.toContain('Feed');
    });

    it('returns EVERY match, leaving ranking to the confidence mechanism', async () => {
        const matches = await CheckContentTypeSignatures(
            probe('Standard ID,Title,Effective Date,Session Code,Speaker\n1,A,2026,S1,X', 'csv'),
        );
        expect(matches.map((m) => m.ContentType).sort()).toEqual(['Session', 'Standard']);
    });

    it('survives one signature throwing', async () => {
        const matches = await CheckContentTypeSignatures(
            probe('Standard ID,Title,Effective Date\n1,A,2026', 'csv'),
        );
        expect(matches.map((m) => m.ContentType)).toContain('Standard');
    });

    it('returns nothing when no signature applies to the file type', async () => {
        expect(await CheckContentTypeSignatures(probe('anything', 'pdf'))).toEqual([]);
    });
});

describe('signature confidence follows the run', () => {
    it('uses the run\'s ContentTypeStructural when a signature declares none', async () => {
        const matches = await CheckContentTypeSignatures({
            ...probe('Standard ID,Title,Effective Date\n1,A,2026', 'csv'),
            Confidence: { ...ResolveConfidence({ Confidence: { ContentTypeStructural: 3 } }) },
        });
        expect(matches.find((m) => m.ContentType === 'Standard')?.Confidence).toBe(3);
    });

    it('keeps a signature\'s OWN declared confidence, which overrides the run', async () => {
        // SessionsSignature declares 5 — it is saying it knows better than the general case.
        const matches = await CheckContentTypeSignatures({
            ...probe('Session Code,Speaker\nS1,X', 'csv'),
            Confidence: { ...ResolveConfidence({ Confidence: { ContentTypeStructural: 3 } }) },
        });
        expect(matches.find((m) => m.ContentType === 'Session')?.Confidence).toBe(5);
    });

    it('falls back to the default scale when no confidence is supplied', async () => {
        const matches = await CheckContentTypeSignatures(probe('Standard ID,Title,Effective Date\n1,A,2026', 'csv'));
        expect(matches.find((m) => m.ContentType === 'Standard')?.Confidence).toBe(7);
    });
});
