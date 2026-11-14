import { describe, expect, it } from 'vitest';
import { ObjectKeyReservations } from '../object-key-reservations';

const PROVIDER = '7C3B2E4D-5F60-4172-8C8D-9E0F1A2B3C4D';
const OTHER_PROVIDER = '1A2B3C4D-5E6F-4071-8293-A4B5C6D7E8F9';
const KEY = 'predictive-studio/model-artifacts/0F1E2D3C-4B5A-4697-8877-665544332211/model.json';

describe('ObjectKeyReservations', () => {
  it('refuses a second reservation of a key until the first is released', () => {
    const r = ObjectKeyReservations.Instance;
    expect(r.TryReserve(PROVIDER, KEY)).toBe(true);
    expect(r.TryReserve(PROVIDER, KEY)).toBe(false);
    expect(r.IsReserved(PROVIDER, KEY)).toBe(true);
    r.Release(PROVIDER, KEY);
    expect(r.IsReserved(PROVIDER, KEY)).toBe(false);
    expect(r.TryReserve(PROVIDER, KEY)).toBe(true);
    r.Release(PROVIDER, KEY);
  });

  it('compares provider IDs as UUIDs and keeps providers apart', () => {
    const r = ObjectKeyReservations.Instance;
    expect(r.TryReserve(PROVIDER, KEY)).toBe(true);
    expect(r.TryReserve(PROVIDER.toLowerCase(), KEY)).toBe(false);
    expect(r.TryReserve(OTHER_PROVIDER, KEY)).toBe(true);
    r.Release(PROVIDER.toLowerCase(), KEY);
    r.Release(OTHER_PROVIDER, KEY);
    expect(r.IsReserved(PROVIDER, KEY)).toBe(false);
    expect(r.IsReserved(OTHER_PROVIDER, KEY)).toBe(false);
  });

  it('compares keys exactly and ignores the release of a key that is not reserved', () => {
    const r = ObjectKeyReservations.Instance;
    expect(r.TryReserve(PROVIDER, KEY)).toBe(true);
    expect(r.TryReserve(PROVIDER, KEY.toUpperCase())).toBe(true);
    r.Release(PROVIDER, `${KEY}.other`);
    expect(r.IsReserved(PROVIDER, KEY)).toBe(true);
    r.Release(PROVIDER, KEY);
    r.Release(PROVIDER, KEY.toUpperCase());
    expect(r.IsReserved(PROVIDER, KEY)).toBe(false);
  });

  it('is one instance for the process', () => {
    expect(ObjectKeyReservations.Instance).toBe(ObjectKeyReservations.Instance);
  });
});
