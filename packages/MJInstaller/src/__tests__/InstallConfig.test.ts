import { InstallConfigDefaults } from '../models/InstallConfig.js';

describe('InstallConfigDefaults', () => {
  it('should set DatabaseHost to "localhost"', () => {
    expect(InstallConfigDefaults.DatabaseHost).toBe('localhost');
  });

  it('should set DatabasePort to 1433', () => {
    expect(InstallConfigDefaults.DatabasePort).toBe(1433);
  });

  it('should set DatabaseTrustCert to false', () => {
    expect(InstallConfigDefaults.DatabaseTrustCert).toBe(false);
  });

  it('should set APIPort to 4000', () => {
    expect(InstallConfigDefaults.APIPort).toBe(4000);
  });

  it('should set ExplorerPort to 4200', () => {
    expect(InstallConfigDefaults.ExplorerPort).toBe(4200);
  });

  it('should set AuthProvider to "none"', () => {
    expect(InstallConfigDefaults.AuthProvider).toBe('none');
  });

  it('should have exactly 6 keys', () => {
    const keys = Object.keys(InstallConfigDefaults);
    expect(keys).toHaveLength(6);
    expect(keys).toEqual(
      expect.arrayContaining([
        'DatabaseHost',
        'DatabasePort',
        'DatabaseTrustCert',
        'APIPort',
        'ExplorerPort',
        'AuthProvider',
      ])
    );
  });
});
