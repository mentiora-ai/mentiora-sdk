# Contributing to Mentiora SDK

Thank you for your interest in contributing to Mentiora SDK! This document provides guidelines and setup instructions.

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Development Setup

### Prerequisites

- **Python 3.11+**
- **Node.js 20+**
- **uv** (Python package manager)
- **pnpm** (Node.js package manager)

### Python SDK Setup

```bash
cd python
uv pip install -e ".[dev,openai,langchain]"
```

### TypeScript SDK Setup

```bash
cd typescript
pnpm install
```

## Project Structure

```
mentiora-sdk/
├── python/          # Python SDK
│   ├── src/        # Source code
│   └── tests/      # Test files
├── typescript/     # TypeScript SDK
│   └── src/        # Source code and tests
└──  docs/           # Docusaurus documentation
```

## Coding Standards

### Python

- **Formatter**: Ruff (line length 100, single quotes)
- **Linter**: Ruff
- **Type Checker**: MyPy (strict mode)
- **Testing**: pytest
- Unused variables prefixed with `_` are allowed

### TypeScript

- **Formatter**: Prettier
- **Linter**: ESLint 9 (flat config)
- **Type Checker**: TypeScript strict mode
- **Testing**: Vitest
- Unused variables prefixed with `_` are allowed

### Pre-commit Hooks

- Husky + lint-staged automatically runs on commit
- Enforces formatting and linting before commit

## Running Tests

### Python

```bash
cd python
pytest tests/              # Run all tests
pytest tests/test_client.py  # Run specific file
pytest -k "test_name"      # Run specific test
```

### TypeScript

```bash
cd typescript
pnpm test              # Run all tests
pnpm test:watch        # Run in watch mode
```

## Running Linting and Formatting

### Python

```bash
cd python
ruff check .           # Lint
ruff check . --fix     # Lint with auto-fix
ruff format .          # Format
mypy src/              # Type check
```

### TypeScript

```bash
cd typescript
pnpm run lint          # Lint
pnpm run lint:fix      # Lint with auto-fix
pnpm run format        # Format
pnpm run format:check  # Check formatting
pnpm run type-check    # Type check
```

## CI/CD Pipeline

All pull requests automatically run:

- **Python**: ruff (lint), ruff format (check), mypy (type check), pytest (tests)
- **TypeScript**: ESLint, Prettier check, tsc (type check), vitest (tests), build

Both Python and TypeScript CI must pass before merge.

## Making Changes

1. **Fork the repository** (for external contributors) or **create a branch** (for maintainers)
2. **Create a feature branch**: `git checkout -b feature/your-feature-name`
3. **Make your changes** following coding standards
4. **Write tests** for new functionality
5. **Ensure all tests pass** locally before pushing
6. **Commit your changes** with clear commit messages
7. **Push to your fork/branch**
8. **Open a Pull Request**

## Pull Request Guidelines

### PR Title

- Clear and descriptive
- Use imperative mood: "Add feature" not "Added feature"

### PR Description

Include:

- **Summary**: What does this PR do?
- **Motivation**: Why is this change needed?
- **Test Coverage**: What tests were added/modified?
- **Breaking Changes**: Any breaking API changes?
- **Related Issues**: Link to related issues (Fixes #123, Closes #456)

### PR Checklist

- [ ] Tests added/updated and passing
- [ ] Documentation updated (if needed)
- [ ] Type annotations added (Python) / types correct (TypeScript)
- [ ] No breaking changes (or documented if necessary)
- [ ] CI checks passing

## Review Process

1. Maintainers review PRs within 48 hours
2. Address review feedback by pushing new commits
3. Once approved, maintainers will merge
4. PRs require at least one approval before merge

## Architecture Guidelines

### Client-Service Pattern

Both SDKs follow the same architecture:

```
MentioraClient (entry point, config validation)
  ├── HttpClient (auth, retries, timeout)
  └── TracingClient (trace validation, UUID v7 generation)
```

### Key Design Principles

- **UUID v7 required** for trace/span/thread IDs
- **Non-throwing tracing**: Return result objects, don't throw
- **Graceful degradation**: Plugin errors never crash user apps
- **Async-first** (TypeScript only; Python has both sync/async)

### Plugin System

- Plugins are optional peer dependencies
- Errors caught and logged, never break user code
- Support both streaming and non-streaming responses

## Questions or Need Help?

- Open a [GitHub Issue](https://github.com/mentiora-ai/mentiora-sdk/issues)
- Check existing issues and discussions

## License

By contributing, you agree that your contributions will be licensed under the Apache-2.0 License.
