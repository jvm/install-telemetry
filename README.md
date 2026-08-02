# @mocito/install-telemetry

A small, runtime-agnostic helper for optional install/update telemetry in Node.js tools. It reports each tool version at most once, retries after failed requests, and prevents duplicate reports from concurrent processes.

## Usage

The library owns telemetry mechanics. The application owns its tool name, version, state location, and opt-out policy:

```ts
import { reportInstallTelemetry } from "@mocito/install-telemetry";

void reportInstallTelemetry({
  endpoint: "https://telemetry.example.com/api/report-install",
  tool: "my-tool",
  version: "1.2.3",
  statePath: "/home/user/.local/state/my-tool/install-telemetry.json",
  enabled: process.env.CI !== "true",
});
```

Use a user-private state path. Do not pass prompts, credentials, paths, or other user data as `tool` or `version`.

## Behavior

- Sends only `tool`, `version`, and a bounded runtime `User-Agent`.
- Uses the caller-configured HTTPS endpoint.
- Times out after five seconds and ignores network/filesystem failures.
- Writes the version marker only after a successful HTTP response.
- Uses an exclusive lock and stale-lock recovery to serialize concurrent callers.
- Does nothing when `enabled` is `false` or metadata fails the server-safe format checks.

The endpoint is required, must use HTTPS, and cannot contain credentials or a fragment. The timeout is intentionally fixed. Tests can inject `fetch` without changing production routing.
