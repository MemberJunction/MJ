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
  it('a driveId configures the navigation root — a Shared Drive id doubles as its root folder id', async () => {
    const driver = new GoogleDriveFileStorage();
    (driver as unknown as { _drive: unknown })._drive = { files: { list: vi.fn(async () => ({ data: { files: [] } })) } };
    await driver.initialize({ accountId: 'a1', accountName: 'Drive', driveId: 'shared-drive-9' });
    expect((driver as unknown as { _rootFolderId?: string })._rootFolderId).toBe('shared-drive-9');
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
