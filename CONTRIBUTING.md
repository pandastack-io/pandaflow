# Contributing to PandaFlow

Thanks for your interest in contributing to PandaFlow.

## Getting started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the app:
   ```bash
   npm run dev
   ```
3. Run the checks before opening a pull request:
   ```bash
   npm run lint
   npm run test:unit
   npx tsc --noEmit
   ```

## Project areas

- `app/` — Next.js routes and pages
- `components/` — UI and layout components
- `lib/` — execution engine, templates, stores, and integrations
- `tests/` — unit and end-to-end coverage

## Pull requests

- Keep changes focused and well-tested.
- Update docs when behavior or UX changes.
- Include screenshots for UI changes when helpful.
- Prefer small, reviewable PRs.

## Reporting issues

Open an issue in the GitHub repository with reproduction steps, expected behavior, and actual behavior.
