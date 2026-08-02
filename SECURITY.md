# Security

Report security issues privately to the repository owner rather than opening a public issue.

The library sends only the caller-supplied tool identifier and package version to the configured HTTPS endpoint, plus a bounded runtime `User-Agent`. It does not send prompts, credentials, environment variables, file contents, command output, or provider responses.

The endpoint must use HTTPS and cannot contain credentials or a fragment. It is supplied by trusted application configuration, not end-user input. State paths are supplied by the integrating application and should point to a user-private state directory. Telemetry is best-effort, disabled when the adapter sets `enabled: false`, uses a five-second timeout, and persists a version marker only after a successful response.
