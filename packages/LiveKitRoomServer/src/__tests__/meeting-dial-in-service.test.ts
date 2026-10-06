import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { UserInfo, IMetadataProvider } from '@memberjunction/core';
import { MeetingDialInService, DialInRateLimiter } from '../meeting-dial-in-service.js';

const mockRunView = vi.fn();

vi.mock('@memberjunction/core', async () => {
  const actual = await vi.importActual<typeof import('@memberjunction/core')>('@memberjunction/core');
  class MockRunView {
    RunView = mockRunView;
    static FromMetadataProvider = () => new MockRunView();
  }
  return {
    ...actual,
    RunView: MockRunView,
  };
});

describe('MeetingDialInService', () => {
  const service = MeetingDialInService.Instance;
  const user: UserInfo = { ID: 'user-1', Name: 'Alice', Email: 'alice@example.com' } as unknown as UserInfo;
  const provider = {} as IMetadataProvider;

  beforeEach(() => {
    mockRunView.mockReset();
    service.ClearRateLimitsForTesting();
  });

  describe('GenerateDialInCode', () => {
    it('generates a 6-digit numeric string', () => {
      for (let i = 0; i < 50; i++) {
        const code = service.GenerateDialInCode();
        expect(code).toMatch(/^\d{6}$/);
        const num = parseInt(code, 10);
        expect(num).toBeGreaterThanOrEqual(100000);
        expect(num).toBeLessThan(1000000);
      }
    });
  });

  describe('GenerateUniqueDialInCode', () => {
    it('returns code when no meeting collides', async () => {
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [] });

      const code = await service.GenerateUniqueDialInCode('phone-1', user, provider);
      expect(code).toBeDefined();
      expect(code).toMatch(/^\d{6}$/);
      expect(mockRunView).toHaveBeenCalledTimes(1);
    });

    it('retries on collision and succeeds on subsequent attempt', async () => {
      // First attempt collides, second attempt is unique
      mockRunView
        .mockResolvedValueOnce({ Success: true, Results: [{ ID: 'mtg-existing' }] })
        .mockResolvedValueOnce({ Success: true, Results: [] });

      const code = await service.GenerateUniqueDialInCode('phone-1', user, provider);
      expect(code).toBeDefined();
      expect(code).toMatch(/^\d{6}$/);
      expect(mockRunView).toHaveBeenCalledTimes(2);
    });

    it('returns undefined when all retry attempts collide', async () => {
      mockRunView.mockResolvedValue({ Success: true, Results: [{ ID: 'mtg-existing' }] });

      const code = await service.GenerateUniqueDialInCode('phone-1', user, provider);
      expect(code).toBeUndefined();
      expect(mockRunView).toHaveBeenCalledTimes(10);
    });
  });

  describe('VerifyDialInCode', () => {
    it('requires CallerNumber, DialedNumber, and DialInCode', async () => {
      const res1 = await service.VerifyDialInCode({ CallerNumber: '', DialedNumber: '+14155550100', DialInCode: '123456' });
      expect(res1.Success).toBe(false);
      expect(res1.ErrorMessage).toMatch(/caller number is required/i);

      const res2 = await service.VerifyDialInCode({ CallerNumber: '+14155550199', DialedNumber: '', DialInCode: '123456' });
      expect(res2.Success).toBe(false);
      expect(res2.ErrorMessage).toMatch(/dialed number is required/i);

      const res3 = await service.VerifyDialInCode({ CallerNumber: '+14155550199', DialedNumber: '+14155550100', DialInCode: '' });
      expect(res3.Success).toBe(false);
      expect(res3.ErrorMessage).toMatch(/dial-in code is required/i);
    });

    it('returns success and room info when matching meeting exists', async () => {
      mockRunView.mockResolvedValueOnce({
        Success: true,
        Results: [{ ID: 'meeting-1', RoomName: 'room-dialin-1' }],
      });

      const res = await service.VerifyDialInCode({
        CallerNumber: '+14155550199',
        DialedNumber: '+14155550100',
        DialInCode: '123456',
        ContextUser: user,
        Provider: provider,
      });

      expect(res.Success).toBe(true);
      expect(res.RoomName).toBe('room-dialin-1');
      expect(res.MeetingID).toBe('meeting-1');
    });

    it('returns failure on invalid code', async () => {
      mockRunView.mockResolvedValueOnce({ Success: true, Results: [] });

      const res = await service.VerifyDialInCode({
        CallerNumber: '+14155550199',
        DialedNumber: '+14155550100',
        DialInCode: '999999',
      });

      expect(res.Success).toBe(false);
      expect(res.ErrorMessage).toMatch(/invalid dial-in code/i);
    });

    it('locks out caller after 5 consecutive failures', async () => {
      mockRunView.mockResolvedValue({ Success: true, Results: [] });

      for (let i = 0; i < 5; i++) {
        const res = await service.VerifyDialInCode({
          CallerNumber: '+14155550199',
          DialedNumber: '+14155550100',
          DialInCode: '000000',
        });
        expect(res.Success).toBe(false);
        expect(res.ErrorMessage).toMatch(/invalid dial-in code/i);
      }

      // 6th attempt is rate-limited before reaching DB
      const res6 = await service.VerifyDialInCode({
        CallerNumber: '+14155550199',
        DialedNumber: '+14155550100',
        DialInCode: '000000',
      });
      expect(res6.Success).toBe(false);
      expect(res6.ErrorMessage).toMatch(/too many invalid attempts from this caller/i);
      // DB was only queried 5 times
      expect(mockRunView).toHaveBeenCalledTimes(5);
    });

    it('locks out dialed line after 20 consecutive failures across distinct callers', async () => {
      mockRunView.mockResolvedValue({ Success: true, Results: [] });

      // 20 distinct callers each fail once on the same dialed number
      for (let i = 1; i <= 20; i++) {
        const res = await service.VerifyDialInCode({
          CallerNumber: `+141555501${i.toString().padStart(2, '0')}`,
          DialedNumber: '+14155550100',
          DialInCode: '000000',
        });
        expect(res.Success).toBe(false);
      }

      // 21st caller to the same dialed number is locked out by line rate-limit
      const res21 = await service.VerifyDialInCode({
        CallerNumber: '+14155550999',
        DialedNumber: '+14155550100',
        DialInCode: '000000',
      });
      expect(res21.Success).toBe(false);
      expect(res21.ErrorMessage).toMatch(/too many invalid attempts on this line/i);
    });
  });

  describe('DialInRateLimiter', () => {
    it('clears expired window entries', () => {
      const limiter = new DialInRateLimiter(3, 100, 100);
      limiter.RecordFailure('key1');
      limiter.RecordFailure('key1');
      expect(limiter.CheckAllowed('key1').allowed).toBe(true);

      // Advance time beyond window
      vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 200);
      expect(limiter.CheckAllowed('key1').allowed).toBe(true);
      vi.restoreAllMocks();
    });
  });
});
