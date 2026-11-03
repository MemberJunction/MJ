/**
 * The package index exports the magic-link service and its token helpers for Open Apps. Source-scanned:
 * importing the index (or MagicLinkService) evaluates server config at module load.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { hashToken, generateRawToken } from '../auth/magicLink/magicLinkCore.js';

const INDEX = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'index.ts'), 'utf8');

describe('@memberjunction/server magic-link exports', () => {
    it('exports MagicLinkService, HashToken and GenerateRawToken from the package index', () => {
        expect(INDEX).toMatch(
            /export \{ MagicLinkService, hashToken as HashToken, generateRawToken as GenerateRawToken \} from '\.\/auth\/magicLink\/index\.js';/,
        );
    });

    it('the token helpers it aliases are the real implementations', () => {
        const raw = generateRawToken();
        expect(hashToken(raw)).toMatch(/^[A-Za-z0-9_-]{43}$/); // SHA-256, base64url
    });
});
