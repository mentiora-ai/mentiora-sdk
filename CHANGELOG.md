# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-02-12

### Added

- Core `MentioraClient` with configuration validation and environment URL handling
- `TracingClient` for sending trace events with UUID v7 generation
- `HttpClient` with retry logic, exponential backoff, and 429 rate limit handling
- OpenAI plugin (`trackOpenAI` / `track_openai`) for automatic tracing of chat completions
- LangChain plugin (`MentioraTracingLangChain`) callback handler for run lifecycle tracing
- Support for both streaming and non-streaming AI API calls
- TypeScript SDK (`@mentiora.ai/sdk`) with dual CJS/ESM output
- Python SDK (`mentiora-sdk`) with sync and async support
- Comprehensive error hierarchy: `MentioraError`, `NetworkError`, `ValidationError`, `ConfigurationError`
- Non-throwing trace design — tracing failures never crash user applications
- Graceful degradation for optional plugin dependencies
