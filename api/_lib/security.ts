import type { VercelRequest, VercelResponse } from '@vercel/node';

const DEBUG_API_LOGS = process.env.DEBUG_API_LOGS === 'true';

function toOrigin(input: string | undefined): string | null {
  if (!input) return null;
  try {
    return new URL(input).origin;
  } catch {
    return null;
  }
}

function getHeaderString(value: string | string[] | undefined): string | undefined {
  if (!value) return undefined;
  return Array.isArray(value) ? value[0] : value;
}

function getRequestOrigin(req: VercelRequest): string | null {
  const origin = getHeaderString(req.headers.origin);
  const referer = getHeaderString(req.headers.referer);
  return toOrigin(origin) || toOrigin(referer);
}

export function enforceAllowedOrigins(req: VercelRequest, res: VercelResponse): boolean {
  const configured = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(item => item.trim())
    .filter(Boolean);

  if (configured.length === 0) return true;

  const requestOrigin = getRequestOrigin(req);
  if (!requestOrigin) {
    res.status(403).json({ error: 'Origin required' });
    return false;
  }

  if (!configured.includes(requestOrigin)) {
    res.status(403).json({ error: 'Origin not allowed' });
    return false;
  }

  return true;
}

export function requireServerEnv(
  res: VercelResponse,
  envName: string,
  envValue: string | undefined
): boolean {
  if (envValue && envValue.trim().length > 0) return true;
  res.status(500).json({ error: `Server misconfigured: missing ${envName}` });
  return false;
}

export function debugLog(...args: unknown[]): void {
  if (DEBUG_API_LOGS) {
    console.log(...args);
  }
}
