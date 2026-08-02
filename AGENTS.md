# Repository Guidelines

## Project Structure & Module Organization

- `src/index.ts` contains the public TypeScript API and telemetry implementation.
- `test/install-telemetry.test.mjs` contains Node’s built-in test-runner tests.
- `dist/` is generated output and is ignored by Git; `prepack` builds it before packaging.
- `.github/workflows/` contains CodeQL, TruffleHog, zizmor, Scorecard, and npm release automation.
- `README.md`, `SECURITY.md`, `CONTRIBUTING.md`, and `CHANGELOG.md` document usage, disclosure, contribution, and releases.

## Build, Test, and Development Commands

Run these from the repository root:

```bash
npm ci                 # Install the locked dependency set
npm run check          # Strict TypeScript typecheck without emitting files
npm test               # Build dist/ and run all Node tests
npm run build          # Emit declarations, source maps, and JavaScript to dist/
npm run pack:dry-run   # Inspect the npm tarball without publishing
```

Use Node.js 20.6+ locally. Publishing is performed by the GitHub release workflow, not by committing generated `dist/` files.

## Coding Style & Naming Conventions

Use strict TypeScript, ES modules, two-space indentation, semicolons, and double-quoted strings. Name functions and variables in `camelCase`, interfaces and types in `PascalCase`, and constants in `UPPER_SNAKE_CASE`. Keep the public API small and runtime-agnostic; reuse Node.js standard-library APIs before adding dependencies. No formatter or linter is currently configured, so match the surrounding code.

## Testing Guidelines

Tests use `node:test` and `node:assert`; name files `*.test.mjs` under `test/`. Add focused behavior tests for changes, especially around filesystem locks, endpoint validation, failure handling, and persistence. Run `npm test` before submitting; there is no coverage threshold.

## Commit & Pull Request Guidelines

Use concise imperative commit subjects, such as `Add release workflow`. Pull requests should explain the behavior change, security or privacy impact, and verification commands run. Update `CHANGELOG.md` for user-visible or release changes. Do not include secrets, credentials, user data, or unrelated generated files.

## Security & Release Notes

Preserve HTTPS-only endpoints, metadata validation, bounded headers, opt-out behavior, and success-only state persistence. Keep GitHub Actions pinned to commit SHAs. To release, update the package version and changelog, create a matching GitHub release tag (`vX.Y.Z`), and configure npm Trusted Publishing for `publish.yml`.
