import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

const REPORT_INSTALL_TIMEOUT_MS = 5000;
const LOCK_STALE_MS = REPORT_INSTALL_TIMEOUT_MS * 6;
const TOOL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const VERSION_PATTERN = /^[a-z0-9][a-z0-9._+:-]{0,63}$/i;

interface InstallTelemetryState {
  lastReportedVersion?: string;
}

export interface InstallTelemetryOptions {
  /** HTTPS endpoint owned by the integrating application. */
  endpoint: string;
  /** Server-safe tool identifier, for example `pi-fast` or `raindrop-cli`. */
  tool: string;
  /** Published package version to report. */
  version: string;
  /** Per-tool state file path owned by the calling application. */
  statePath: string;
  /** Set false after applying the application's opt-out and CI policy. */
  enabled?: boolean;
  /** Injectable transport for tests; production callers should omit it. */
  fetch?: typeof globalThis.fetch;
}

function getEndpoint(value: string): URL | undefined {
  try {
    const endpoint = new URL(value);
    if (endpoint.protocol !== "https:" || endpoint.username || endpoint.password || endpoint.hash) {
      return undefined;
    }
    return endpoint;
  } catch {
    return undefined;
  }
}

function isValidMetadata(value: string, pattern: RegExp): boolean {
  return pattern.test(value);
}

function getUserAgent(tool: string, version: string): string {
  const runtimeVersions = process.versions as NodeJS.ProcessVersions & { bun?: string };
  const runtime = runtimeVersions.bun ? `bun/${runtimeVersions.bun}` : `node/${process.version}`;
  return `${tool}/${version} (${process.platform}; ${runtime}; ${process.arch})`;
}

async function readState(statePath: string): Promise<InstallTelemetryState> {
  try {
    return JSON.parse(await readFile(statePath, "utf8")) as InstallTelemetryState;
  } catch {
    return {};
  }
}

async function isStaleLock(lockPath: string): Promise<boolean> {
  try {
    return Date.now() - (await stat(lockPath)).mtimeMs > LOCK_STALE_MS;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "ENOENT";
  }
}

async function acquireLock(lockPath: string): Promise<string | undefined> {
  const token = randomUUID();
  try {
    await writeFile(lockPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
    return token;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    if (!(await isStaleLock(lockPath))) return undefined;

    await rm(lockPath, { force: true });
    try {
      await writeFile(lockPath, token, { encoding: "utf8", flag: "wx", mode: 0o600 });
      return token;
    } catch (retryError) {
      const code = (retryError as NodeJS.ErrnoException).code;
      if (code === "EEXIST" || code === "ENOENT") return undefined;
      throw retryError;
    }
  }
}

async function releaseLock(lockPath: string, token: string): Promise<void> {
  try {
    if ((await readFile(lockPath, "utf8")).trim() === token) {
      await rm(lockPath, { force: true });
    }
  } catch {
    // Best-effort cleanup; a later invocation can recover stale locks.
  }
}

/**
 * Reports one successful install/update per tool version.
 *
 * The endpoint is supplied by the caller and must use HTTPS. The timeout is
 * fixed. Callers provide project-specific identity, state location, and opt-out policy.
 */
export async function reportInstallTelemetry(options: InstallTelemetryOptions): Promise<void> {
  try {
    if (options.enabled === false) return;
    const endpoint = getEndpoint(options.endpoint);
    if (!endpoint) return;
    if (!isValidMetadata(options.tool, TOOL_PATTERN)) return;
    if (!isValidMetadata(options.version, VERSION_PATTERN)) return;

    const statePath = options.statePath;
    const lockPath = `${statePath}.lock`;
    await mkdir(dirname(statePath), { recursive: true, mode: 0o700 });
    const token = await acquireLock(lockPath);
    if (!token) return;

    try {
      const state = await readState(statePath);
      if (state.lastReportedVersion === options.version) return;

      endpoint.searchParams.set("tool", options.tool);
      endpoint.searchParams.set("version", options.version);
      const request = options.fetch ?? globalThis.fetch;
      if (typeof request !== "function") return;

      const response = await request(endpoint, {
        headers: { "User-Agent": getUserAgent(options.tool, options.version) },
        signal: AbortSignal.timeout(REPORT_INSTALL_TIMEOUT_MS),
      });
      if (!response.ok) return;

      await writeFile(
        statePath,
        `${JSON.stringify({ lastReportedVersion: options.version }, null, 2)}\n`,
        { encoding: "utf8", mode: 0o600 },
      );
    } finally {
      await releaseLock(lockPath, token);
    }
  } catch {
    // Best-effort telemetry: ignore policy, filesystem, and network failures.
  }
}
