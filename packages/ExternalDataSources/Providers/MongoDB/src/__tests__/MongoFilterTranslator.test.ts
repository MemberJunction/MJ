import { describe, it, expect } from 'vitest';
import { ObjectId } from 'mongodb';
import { MongoFilterTranslator } from '../MongoFilterTranslator';

const t = (sql: string) => MongoFilterTranslator.Translate(sql);

describe('MongoFilterTranslator', () => {
  it('returns {} for empty/whitespace/undefined', () => {
    expect(t('')).toEqual({});
    expect(t('   ')).toEqual({});
    expect(MongoFilterTranslator.Translate(undefined)).toEqual({});
  });

  it('translates equality and the comparison operators', () => {
    expect(t("status = 'paid'")).toEqual({ status: { $eq: 'paid' } });
    expect(t('amount > 100')).toEqual({ amount: { $gt: 100 } });
    expect(t('amount >= 100')).toEqual({ amount: { $gte: 100 } });
    expect(t('amount < 100')).toEqual({ amount: { $lt: 100 } });
    expect(t('amount <= 100')).toEqual({ amount: { $lte: 100 } });
    expect(t("status != 'x'")).toEqual({ status: { $ne: 'x' } });
    expect(t("status <> 'x'")).toEqual({ status: { $ne: 'x' } }); // <> is an alias for !=
  });

  it('parses number, string, null, and boolean literals', () => {
    expect(t('qty = 5')).toEqual({ qty: { $eq: 5 } });
    expect(t('price = 9.99')).toEqual({ price: { $eq: 9.99 } });
    expect(t('active = TRUE')).toEqual({ active: { $eq: true } });
    expect(t('active = false')).toEqual({ active: { $eq: false } });
    expect(t("note = ''")).toEqual({ note: { $eq: '' } });
    expect(t("name = 'O''Brien'")).toEqual({ name: { $eq: "O'Brien" } }); // '' -> '
  });

  it('handles IN and NOT IN', () => {
    expect(t("status IN ('paid', 'pending')")).toEqual({ status: { $in: ['paid', 'pending'] } });
    expect(t('tier NOT IN (1, 2, 3)')).toEqual({ tier: { $nin: [1, 2, 3] } });
  });

  it('handles IS NULL / IS NOT NULL', () => {
    expect(t('email IS NULL')).toEqual({ email: { $eq: null } });
    expect(t('email IS NOT NULL')).toEqual({ email: { $ne: null } });
  });

  it('translates LIKE to an anchored, escaped, case-insensitive regex by default (% -> .*, _ -> .)', () => {
    // Case-insensitive ($options: 'i') is the default to match SQL Server's default collation
    // (MJ's most common backend). It is now configurable per data source (caseInsensitiveLike) for
    // PostgreSQL-style case-sensitive matching — see the dedicated test below.
    expect(t("name LIKE 'Ac%'")).toEqual({ name: { $regex: '^Ac.*$', $options: 'i' } });
    expect(t("code LIKE 'A_C'")).toEqual({ code: { $regex: '^A.C$', $options: 'i' } });
    expect(t("v LIKE 'a.b%'")).toEqual({ v: { $regex: '^a\\.b.*$', $options: 'i' } }); // dot escaped
  });

  it('LIKE is case-sensitive (no $options) when caseInsensitiveLike is false', () => {
    expect(MongoFilterTranslator.Translate("name LIKE 'Ac%'", { caseInsensitiveLike: false }))
      .toEqual({ name: { $regex: '^Ac.*$' } });
    // explicit true matches the default
    expect(MongoFilterTranslator.Translate("name LIKE 'Ac%'", { caseInsensitiveLike: true }))
      .toEqual({ name: { $regex: '^Ac.*$', $options: 'i' } });
  });

  it('combines predicates with AND / OR (AND binds tighter)', () => {
    expect(t("status = 'paid' AND amount > 50")).toEqual({
      $and: [{ status: { $eq: 'paid' } }, { amount: { $gt: 50 } }],
    });
    expect(t("status = 'paid' OR status = 'pending'")).toEqual({
      $or: [{ status: { $eq: 'paid' } }, { status: { $eq: 'pending' } }],
    });
    // a OR b AND c  ==  a OR (b AND c)
    expect(t("a = 1 OR b = 2 AND c = 3")).toEqual({
      $or: [{ a: { $eq: 1 } }, { $and: [{ b: { $eq: 2 } }, { c: { $eq: 3 } }] }],
    });
  });

  it('respects parentheses', () => {
    expect(t("(a = 1 OR b = 2) AND c = 3")).toEqual({
      $and: [{ $or: [{ a: { $eq: 1 } }, { b: { $eq: 2 } }] }, { c: { $eq: 3 } }],
    });
  });

  it('supports dotted field paths', () => {
    expect(t("address.city = 'NYC'")).toEqual({ 'address.city': { $eq: 'NYC' } });
  });

  it('throws on unsupported syntax (caller should use a native query)', () => {
    expect(() => t('amount BETWEEN 1 AND 10')).toThrow();
    expect(() => t('status =')).toThrow();
    expect(() => t('@#$')).toThrow();
  });

  describe('_id ObjectId coercion', () => {
    const hex = '507f1f77bcf86cd799439011';

    it('coerces a 24-hex _id equality value to an ObjectId', () => {
      const f = t(`_id = '${hex}'`) as { _id: { $eq: unknown } };
      expect(f._id.$eq).toBeInstanceOf(ObjectId);
      expect((f._id.$eq as ObjectId).toString()).toBe(hex);
    });

    it('coerces _id values inside IN / NOT IN lists', () => {
      const inF = t(`_id IN ('${hex}')`) as { _id: { $in: unknown[] } };
      expect(inF._id.$in[0]).toBeInstanceOf(ObjectId);
      const ninF = t(`_id NOT IN ('${hex}')`) as { _id: { $nin: unknown[] } };
      expect(ninF._id.$nin[0]).toBeInstanceOf(ObjectId);
    });

    it('leaves a non-hex _id string untouched (supports string-keyed collections)', () => {
      expect(t("_id = 'not-an-objectid'")).toEqual({ _id: { $eq: 'not-an-objectid' } });
    });

    it('does not coerce a non-_id field even when the value looks like a hex ObjectId', () => {
      expect(t(`token = '${hex}'`)).toEqual({ token: { $eq: hex } });
    });

    it('CoerceObjectId is a pure, uniform helper (used by LoadSingle too)', () => {
      expect(MongoFilterTranslator.CoerceObjectId('_id', hex)).toBeInstanceOf(ObjectId);
      expect(MongoFilterTranslator.CoerceObjectId('_id', 42)).toBe(42);      // non-string passes through
      expect(MongoFilterTranslator.CoerceObjectId('name', hex)).toBe(hex);   // non-_id passes through
    });
  });

  describe('LikeToRegex — ReDoS hardening (collapse consecutive %)', () => {
    it('collapses a run of % into a single .* (no catastrophic backtracking)', () => {
      expect(MongoFilterTranslator.LikeToRegex('%%%%%X')).toBe('^.*X$');
      expect(MongoFilterTranslator.LikeToRegex('%%a%%b%%')).toBe('^.*a.*b.*$');
    });
    it('still handles single wildcards and escapes regex metachars', () => {
      expect(MongoFilterTranslator.LikeToRegex('a_b')).toBe('^a.b$');
      expect(MongoFilterTranslator.LikeToRegex('a.b+c')).toBe('^a\\.b\\+c$');
    });
    it('a LIKE with many % no longer emits stacked .*.* groups', () => {
      const regex = (MongoFilterTranslator.Translate("name LIKE '%%%%%%%%%%x'") as { name: { $regex: string } }).name.$regex;
      expect(regex).toBe('^.*x$');
      expect(regex).not.toContain('.*.*');
    });
  });

  describe('numeric literal validation (fail loud, not silent NaN)', () => {
    it('throws on a malformed numeric literal instead of producing {$eq: NaN}', () => {
      expect(() => MongoFilterTranslator.Translate('version = 1.2.3')).toThrow(/Invalid numeric literal/);
      expect(() => MongoFilterTranslator.Translate('x = 1.2.3.4')).toThrow(/Invalid numeric literal/);
    });
    it('still parses a valid integer and decimal', () => {
      expect(MongoFilterTranslator.Translate('n = 42')).toEqual({ n: { $eq: 42 } });
      expect(MongoFilterTranslator.Translate('n = 3.14')).toEqual({ n: { $eq: 3.14 } });
    });
  });
});
