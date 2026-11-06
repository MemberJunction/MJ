/**
 * #3847 — the three defects that made a service-account Drive account fail with no usable
 * diagnosis, tested at the seams they broke.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'stream';
import { GoogleDriveFileStorage } from '../drivers/GoogleDriveFileStorage';

type DriveCalls = {
  create: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
  list: ReturnType<typeof vi.fn>;
};

/** A driver with a fake Drive client installed, plus the calls it received. */
function driverWithFakeDrive(): { driver: GoogleDriveFileStorage; calls: DriveCalls } {
  const driver = new GoogleDriveFileStorage();
  const calls: DriveCalls = {
    create: vi.fn(async () => ({ data: { id: 'file-1' } })),
    update: vi.fn(async () => ({ data: { id: 'file-1' } })),
    // Empty lists: every path lookup misses, so PutObject takes the CREATE branch and
    // _getOrCreateParentFolder creates as it goes.
    list: vi.fn(async () => ({ data: { files: [] } })),
  };
  (driver as unknown as { _drive: unknown })._drive = {
    files: {
      create: calls.create,
      update: calls.update,
      list: calls.list,
      get: vi.fn(async () => ({ data: {} })),
    },
  };
  return { driver, calls };
}

describe('initialize() accepts every credential shape the constructor does (#3847 defect 1)', () => {
  it('keeps a working client when the credential record carries no auth material at all', async () => {
    // Attaching a credential record that only names the account must not un-configure a driver
    // the constructor already built from env — that is the "attaching a credential record broke a
    // working driver" half of the defect.
    const { driver } = driverWithFakeDrive();
    await expect(driver.initialize({ accountId: 'a1', accountName: 'Drive' })).resolves.toBeUndefined();
  });

  it('throws only when there is NO client and NO usable credential', async () => {
    const driver = new GoogleDriveFileStorage();
    (driver as unknown as { _drive: unknown })._drive = undefined;
    (driver as unknown as { _clientID?: string })._clientID = undefined;
    (driver as unknown as { _clientSecret?: string })._clientSecret = undefined;
    (driver as unknown as { _refreshToken?: string })._refreshToken = undefined;
    await expect(driver.initialize({ accountId: 'a1', accountName: 'Drive' }))
      .rejects.toThrow(/keyFile, credentialsJSON, or clientID/);
  });

  it('builds a service-account client from credentialsJSON in a database credential', async () => {
    const driver = new GoogleDriveFileStorage();
    (driver as unknown as { _drive: unknown })._drive = undefined;
    await driver.initialize({
      accountId: 'a1', accountName: 'Drive',
      credentialsJSON: JSON.stringify({
        client_email: 'svc@project.iam.gserviceaccount.com',
        // An RSA key the JWT client will accept structurally; no network call happens here.
        private_key: '-----BEGIN PRIVATE KEY-----\nMIIB\n-----END PRIVATE KEY-----\n',
      }),
    });
    expect((driver as unknown as { _drive: unknown })._drive).toBeDefined();
  });
});

/** The files.create call that carried media — the upload, not a folder creation along the path. */
function fileCreate(calls: DriveCalls): { media: { body: Readable } } {
  const call = calls.create.mock.calls.find((c) => c[0]?.media !== undefined);
  if (!call) {
    throw new Error('no files.create call carried media — the upload never happened');
  }
  return call[0];
}

describe('PutObject streams the payload (#3847 defect 2)', () => {
  let harness: { driver: GoogleDriveFileStorage; calls: DriveCalls };

  beforeEach(() => {
    harness = driverWithFakeDrive();
  });

  it('hands googleapis a Readable, never the raw Buffer', async () => {
    // googleapis calls media.body.pipe(); a Buffer has no .pipe, and the TypeError surfaced AFTER
    // auth and folder creation succeeded — which is why every symptom read as bad configuration.
    const ok = await harness.driver.PutObject('recordings/session-1.wav', Buffer.from('RIFF'), 'audio/wav');
    expect(ok).toBe(true);
    // The FIRST create is the parent folder (no media); the file upload is the one with media.
    const media = fileCreate(harness.calls).media;
    expect(media.body).toBeInstanceOf(Readable);
    expect(typeof media.body.pipe).toBe('function');
  });

  it('streams the same bytes the Buffer held', async () => {
    await harness.driver.PutObject('a/b.bin', Buffer.from('payload-bytes'));
    const body: Readable = fileCreate(harness.calls).media.body;
    const chunks: Buffer[] = [];
    for await (const chunk of body) {
      chunks.push(Buffer.from(chunk));
    }
    expect(Buffer.concat(chunks).toString()).toBe('payload-bytes');
  });
});

describe('Shared Drive support (#3847 defect 3)', () => {
  it('a driveID configures the navigation root — a Shared Drive id doubles as its root folder id', async () => {
    const driver = new GoogleDriveFileStorage();
    (driver as unknown as { _drive: unknown })._drive = { files: { list: vi.fn(async () => ({ data: { files: [] } })) } };
    await driver.initialize({ accountId: 'a1', accountName: 'Drive', driveID: 'shared-drive-9' });
    expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('shared-drive-9');
  });

  it("a credential naming a different Shared Drive replaces the server's drive as the root", async () => {
    // With STORAGE_GDRIVE_DRIVE_ID=A on the server, the constructor roots at A. A per-account record
    // naming drive B must navigate B — keeping root A would browse another tenant's drive.
    vi.stubEnv('STORAGE_GDRIVE_DRIVE_ID', 'server-drive-A');
    try {
      const driver = new GoogleDriveFileStorage();
      (driver as unknown as { _drive: unknown })._drive = { files: {} };
      expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('server-drive-A');
      await driver.initialize({ accountId: 'a1', accountName: 'Drive', driveID: 'account-drive-B' });
      expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('account-drive-B');
      expect((driver as unknown as { _driveId?: string })._driveId).toBe('account-drive-B');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("a server root folder does not survive a credential's Shared Drive either", async () => {
    vi.stubEnv('STORAGE_GDRIVE_ROOT_FOLDER_ID', 'folder-in-drive-A');
    try {
      const driver = new GoogleDriveFileStorage();
      (driver as unknown as { _drive: unknown })._drive = { files: {} };
      await driver.initialize({ accountId: 'a1', accountName: 'Drive', driveID: 'account-drive-B' });
      expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('account-drive-B');
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("an explicit rootFolderID in the credential wins over its driveID", async () => {
    const driver = new GoogleDriveFileStorage();
    (driver as unknown as { _drive: unknown })._drive = { files: {} };
    await driver.initialize({ accountId: 'a1', accountName: 'Drive', driveID: 'drive-B', rootFolderID: 'folder-in-B' });
    expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('folder-in-B');
    expect((driver as unknown as { _driveId?: string })._driveId).toBe('drive-B');
  });

  it('every request carries supportsAllDrives by default — the client is built with it', () => {
    // The flags ride as client-level default params, so all 25 call sites in the driver are
    // covered by construction instead of by 25 flags somebody must remember. Asserted on the
    // factory's output rather than per endpoint.
    const driver = new GoogleDriveFileStorage();
    const drive = (driver as unknown as {
      buildDrive(auth: unknown): { context: { _options: { params?: Record<string, unknown> } } };
    }).buildDrive(undefined);
    expect(drive.context._options.params).toEqual({ supportsAllDrives: true, includeItemsFromAllDrives: true });
  });
});

describe('IsConfigured counts a service-account client (#3847)', () => {
  // Search indexing (StorageSearchProvider) and content autotagging (AutotagCloudStorage) skip an
  // account whose driver reports IsConfigured false, so a working service account must count.
  it('is true for a client built from service-account credentials, with no OAuth fields', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const driver = new GoogleDriveFileStorage();
      await driver.initialize({
        accountId: 'a1',
        accountName: 'Drive',
        credentialsJSON: JSON.stringify({ client_email: 'svc@example.iam.gserviceaccount.com', private_key: 'not-a-real-key' }),
      });
      expect(driver.IsConfigured).toBe(true);
      expect(errorSpy).not.toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('is false, and says why, when there is no client and no OAuth credentials', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      const driver = new GoogleDriveFileStorage();
      expect(driver.IsConfigured).toBe(false);
      expect(errorSpy).toHaveBeenCalledOnce();
      expect(String(errorSpy.mock.calls[0][0])).toContain('STORAGE_GDRIVE_KEY_FILE');
    } finally {
      errorSpy.mockRestore();
    }
  });
});

describe("initialize() says when a credential falls back to the server's client", () => {
  it('warns, naming the account, when the record carries no auth material', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const driver = new GoogleDriveFileStorage();
      (driver as unknown as { _drive: unknown })._drive = { files: {} };
      await driver.initialize({ accountId: 'a1', accountName: 'Marketing Drive' });
      expect(warnSpy).toHaveBeenCalledOnce();
      expect(String(warnSpy.mock.calls[0][0])).toContain('Marketing Drive');
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('does not warn when the record authenticates on its own', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      const driver = new GoogleDriveFileStorage();
      await driver.initialize({ accountId: 'a1', accountName: 'Drive', clientID: 'id', clientSecret: 'secret', refreshToken: 'token' });
      expect(warnSpy).not.toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});
