# Changelog

## [Unreleased]

## [0.1.1] - 2026-08-02

### Fixed

- Replace the per-version state marker atomically so interrupted writes cannot leave a partial JSON file.

## [0.1.0] - 2026-08-02

- Add once-per-version install telemetry with atomic locking and retry-safe persistence.
