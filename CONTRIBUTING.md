# Contributing

Thanks for contributing to `@fictjs/react`.

## Development Setup

1. Use Node.js 20+.
2. Enable Corepack and install dependencies:
   - `corepack enable`
   - `pnpm install --ignore-workspace --lockfile-dir .`

## Local Validation

Run these before opening a PR:

- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
- `pnpm test:it`
- `pnpm build`

Optional browser checks:

- `pnpm test:e2e`

## Commit and PR Guidelines

- Keep commits focused and small.
- Use clear commit messages.
- Include tests for behavior changes.
- Update docs when public APIs or workflows change.

## Release Notes

- This package is published from GitHub Actions via `.github/workflows/npm-publish.yml`.
- npm publish uses provenance attestations.
