// Google Drive client for the cockpit's per-deal document folders. Ported from
// the NestJS backend src/integrations/google/drive.client.ts. The @Injectable
// class with @Inject(ENV) becomes a globalThis-pinned singleton (g.__driveClient)
// reading env via getEnv(). Server-to-server as a DEDICATED service account
// (cockpit-drive), minting a short-lived access token from the SA key via an
// RS256 JWT, exactly like the GA4 client. Distinct credentials and a distinct
// Drive scope; the GA4 client stays analytics-read-only and is never widened.
//
// Every call targets the cockpit Shared Drive, so all of them carry the Shared
// Drive parameters (supportsAllDrives, and for search corpora/driveId), which
// the v3 API requires for a Shared Drive. Folder names are the Zoho deal id
// only; no patient name ever reaches a folder name or a log here.
//
// SERVER ONLY. Node runtime (uses node:crypto and Buffer). Never import from a
// client component.
import { createPrivateKey, createSign } from 'node:crypto';
import { getEnv, type Env } from '../env';
import type { ReasonDto } from '../envelope';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPE = 'https://www.googleapis.com/auth/drive';
const FILES_API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export interface DriveFolder {
  id: string;
  name: string;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

function base64url(data: string | Buffer): string {
  return Buffer.from(data)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

export class DriveClient {
  private token: string | null = null;
  private expiresAt = 0;
  private inflight: Promise<string> | null = null;

  constructor(private readonly env: Env) {}

  configured(): boolean {
    return Boolean(
      this.env.GOOGLE_DRIVE_CLIENT_EMAIL &&
        this.env.GOOGLE_DRIVE_PRIVATE_KEY &&
        this.env.GOOGLE_DRIVE_SHARED_DRIVE_ID,
    );
  }

  /** The authored reason served when a Drive-backed feature reads null. */
  notConfiguredReason(): ReasonDto {
    return {
      key: 'drive_not_configured',
      title: 'Google Drive is not connected',
      text: 'GOOGLE_DRIVE_CLIENT_EMAIL and GOOGLE_DRIVE_PRIVATE_KEY are not set on saleem-api, so per-deal document folders are unavailable. Set the cockpit-drive service account credentials.',
    };
  }

  private get sharedDriveId(): string {
    return this.env.GOOGLE_DRIVE_SHARED_DRIVE_ID;
  }

  /** Confirm the service account can write to the Shared Drive: create a
   *  throwaway folder, then delete it. Returns the transient id it used.
   *  Throws on any failure. */
  async verifyAccess(): Promise<{ ok: true; created_and_deleted: string }> {
    const folder = await this.createFolder('test-delete-me');
    await this.deleteFolder(folder.id);
    return { ok: true, created_and_deleted: folder.id };
  }

  /** Find a folder by exact name directly under the Shared Drive root, or null.
   *  Searches within the Shared Drive only (corpora=drive). */
  async findFolderByName(name: string): Promise<DriveFolder | null> {
    const token = await this.accessToken();
    const q = [
      `name = '${escapeQ(name)}'`,
      `'${this.sharedDriveId}' in parents`,
      `mimeType = '${FOLDER_MIME}'`,
      'trashed = false',
    ].join(' and ');
    const params = new URLSearchParams({
      q,
      corpora: 'drive',
      driveId: this.sharedDriveId,
      includeItemsFromAllDrives: 'true',
      supportsAllDrives: 'true',
      fields: 'files(id,name)',
      pageSize: '1',
    });
    const res = await fetch(`${FILES_API}?${params.toString()}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    const body = (await res.json()) as {
      files?: DriveFolder[];
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        `Drive search failed ${res.status}: ${body.error?.message ?? 'unknown'}`,
      );
    }
    return body.files?.[0] ?? null;
  }

  /** Create a folder directly under the Shared Drive root. */
  async createFolder(name: string): Promise<DriveFolder> {
    const token = await this.accessToken();
    const params = new URLSearchParams({
      supportsAllDrives: 'true',
      fields: 'id,name',
    });
    const res = await fetch(`${FILES_API}?${params.toString()}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name,
        mimeType: FOLDER_MIME,
        parents: [this.sharedDriveId],
      }),
    });
    const body = (await res.json()) as DriveFolder & {
      error?: { message?: string };
    };
    if (!res.ok) {
      throw new Error(
        `Drive folder create failed ${res.status}: ${body.error?.message ?? 'unknown'}`,
      );
    }
    return { id: body.id, name: body.name };
  }

  /** Upload a file's bytes into the given folder on the Shared Drive, using a
   *  v3 multipart upload (metadata + content in one request). The file name is
   *  the only metadata sent; no patient value reaches a log here. Returns the
   *  new file id. */
  async uploadFile(
    folderId: string,
    name: string,
    mimeType: string,
    content: Buffer,
  ): Promise<{ id: string }> {
    const token = await this.accessToken();
    const params = new URLSearchParams({
      uploadType: 'multipart',
      supportsAllDrives: 'true',
      fields: 'id',
    });
    const boundary = `saleem-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const metadata = JSON.stringify({ name, parents: [folderId] });
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\n` +
          'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
          `${metadata}\r\n` +
          `--${boundary}\r\n` +
          `Content-Type: ${mimeType}\r\n\r\n`,
      ),
      content,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await fetch(`${UPLOAD_API}?${params.toString()}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/related; boundary=${boundary}`,
      },
      body,
    });
    const resBody = (await res.json()) as {
      id?: string;
      error?: { message?: string };
    };
    if (!res.ok || !resBody.id) {
      throw new Error(
        `Drive upload failed ${res.status}: ${resBody.error?.message ?? 'unknown'}`,
      );
    }
    return { id: resBody.id };
  }

  /** Delete a file or folder by id. Used by verifyAccess; per-deal folders are
   *  never deleted in normal operation. */
  async deleteFolder(id: string): Promise<void> {
    const token = await this.accessToken();
    const params = new URLSearchParams({ supportsAllDrives: 'true' });
    const res = await fetch(
      `${FILES_API}/${encodeURIComponent(id)}?${params.toString()}`,
      { method: 'DELETE', headers: { authorization: `Bearer ${token}` } },
    );
    if (!res.ok && res.status !== 404) {
      const body = await res.text().catch(() => '');
      throw new Error(`Drive delete failed ${res.status}: ${body}`);
    }
  }

  /** Find the folder named exactly `name`, or create it. Idempotent against a
   *  re-run and (paired with the deal->folder mapping) against concurrent
   *  callers. */
  async findOrCreateFolder(name: string): Promise<DriveFolder> {
    const existing = await this.findFolderByName(name);
    if (existing) return existing;
    return this.createFolder(name);
  }

  private async accessToken(): Promise<string> {
    if (!this.configured()) {
      throw new Error(
        'Drive is not configured: set GOOGLE_DRIVE_CLIENT_EMAIL, GOOGLE_DRIVE_PRIVATE_KEY, GOOGLE_DRIVE_SHARED_DRIVE_ID.',
      );
    }
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token;
    if (this.inflight) return this.inflight;

    this.inflight = (async () => {
      try {
        const jwt = this.mintJwt();
        const res = await fetch(TOKEN_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion: jwt,
          }),
        });
        const data = (await res.json()) as TokenResponse;
        if (!data.access_token) {
          throw new Error(
            data.error_description ??
              data.error ??
              'Failed to get a Google Drive access token',
          );
        }
        this.token = data.access_token;
        this.expiresAt = Date.now() + (data.expires_in ?? 3600) * 1000;
        return this.token;
      } finally {
        this.inflight = null;
      }
    })();

    return this.inflight;
  }

  private mintJwt(): string {
    const clientEmail = this.env.GOOGLE_DRIVE_CLIENT_EMAIL as string;
    // Support both \n literals (hosting dashboards) and real newlines (.env).
    let privateKey = (this.env.GOOGLE_DRIVE_PRIVATE_KEY as string).replace(
      /\\n/g,
      '\n',
    );
    if (!privateKey.includes('-----BEGIN')) {
      privateKey = `-----BEGIN PRIVATE KEY-----\n${privateKey.trim()}\n-----END PRIVATE KEY-----\n`;
    }

    const now = Math.floor(Date.now() / 1000);
    const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const payload = base64url(
      JSON.stringify({
        iss: clientEmail,
        scope: SCOPE,
        aud: TOKEN_URL,
        exp: now + 3600,
        iat: now,
      }),
    );
    const unsigned = `${header}.${payload}`;
    const keyObject = createPrivateKey(privateKey);
    const sign = createSign('RSA-SHA256');
    sign.update(unsigned);
    return `${unsigned}.${base64url(sign.sign(keyObject))}`;
  }
}

/** Escape a single quote for a Drive v3 query string literal. */
function escapeQ(value: string): string {
  return value.replace(/'/g, "\\'");
}

// globalThis-pinned singleton: the minted access token and its expiry survive
// across requests in one warm instance, so a hot instance reuses the token and
// concurrent callers share one refresh.
const DRIVE_KEY = '__driveClient';

type GlobalWithDrive = typeof globalThis & {
  [DRIVE_KEY]?: DriveClient;
};

export function getDriveClient(): DriveClient {
  const g = globalThis as GlobalWithDrive;
  if (!g[DRIVE_KEY]) {
    g[DRIVE_KEY] = new DriveClient(getEnv());
  }
  return g[DRIVE_KEY];
}
