import { strict as assert } from "node:assert";
import { mkdtemp, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { reportInstallTelemetry } from "../dist/index.js";

const endpoint = "https://telemetry.example.test/api/report-install";

async function withState(callback) {
  const directory = await mkdtemp(join(tmpdir(), "install-telemetry-"));
  try {
    await callback(join(directory, "install-telemetry.json"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function successfulFetch(calls) {
  return async (url, init) => {
    calls.push({ url: new URL(url), init });
    return { ok: true, status: 201 };
  };
}

test("reports a version once and persists only after success", async () => {
  await withState(async (statePath) => {
    const calls = [];
    const fetch = successfulFetch(calls);
    const options = { endpoint, tool: "my-tool", version: "1.2.3", statePath, fetch };

    await reportInstallTelemetry(options);
    await reportInstallTelemetry(options);

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url.origin, "https://telemetry.example.test");
    assert.equal(calls[0].url.pathname, "/api/report-install");
    assert.equal(calls[0].url.searchParams.get("tool"), "my-tool");
    assert.equal(calls[0].url.searchParams.get("version"), "1.2.3");
    assert.match(calls[0].init.headers["User-Agent"], /^my-tool\/1\.2\.3 \(/);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { lastReportedVersion: "1.2.3" });
  });
});

test("retries after a non-OK response", async () => {
  await withState(async (statePath) => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { ok: calls === 2, status: calls === 1 ? 503 : 201 };
    };
    const options = { endpoint, tool: "my-tool", version: "1.2.3", statePath, fetch };

    await reportInstallTelemetry(options);
    await assert.rejects(stat(statePath));
    await reportInstallTelemetry(options);

    assert.equal(calls, 2);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { lastReportedVersion: "1.2.3" });
  });
});

test("serializes concurrent reports", async () => {
  await withState(async (statePath) => {
    let calls = 0;
    let releaseRequest;
    let resolveStarted;
    const requestGate = new Promise((resolve) => {
      releaseRequest = resolve;
    });
    const requestStarted = new Promise((resolve) => {
      resolveStarted = resolve;
    });
    const fetch = async () => {
      calls += 1;
      resolveStarted();
      await requestGate;
      return { ok: true, status: 201 };
    };
    const options = { endpoint, tool: "my-tool", version: "1.2.3", statePath, fetch };

    const first = reportInstallTelemetry(options);
    await requestStarted;
    const second = reportInstallTelemetry(options);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(calls, 1);

    releaseRequest();
    await Promise.all([first, second]);
    assert.deepEqual(JSON.parse(await readFile(statePath, "utf8")), { lastReportedVersion: "1.2.3" });
  });
});

test("recovers a stale lock", async () => {
  await withState(async (statePath) => {
    const calls = [];
    const lockPath = `${statePath}.lock`;
    const staleTime = new Date(Date.now() - 60_000);
    await writeFile(lockPath, "stale", "utf8");
    await utimes(lockPath, staleTime, staleTime);

    await reportInstallTelemetry({
      endpoint,
      tool: "my-tool",
      version: "1.2.3",
      statePath,
      fetch: successfulFetch(calls),
    });

    assert.equal(calls.length, 1);
    await assert.rejects(stat(lockPath));
  });
});

test("rejects non-HTTPS endpoints and invalid metadata", async () => {
  await withState(async (statePath) => {
    let calls = 0;
    const fetch = async () => {
      calls += 1;
      return { ok: true, status: 201 };
    };

    await reportInstallTelemetry({ endpoint: "http://localhost/report", tool: "my-tool", version: "1.2.3", statePath, fetch });
    await reportInstallTelemetry({ endpoint: "https://user:pass@example.test/report", tool: "my-tool", version: "1.2.3", statePath, fetch });
    await reportInstallTelemetry({ endpoint, tool: "../secret", version: "1.2.3", statePath, fetch });

    assert.equal(calls, 0);
    await assert.rejects(stat(statePath));
  });
});
