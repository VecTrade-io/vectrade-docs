# VecTrade Docs — Copilot Instructions

## Workflow

All agents follow the standard workflow defined in `instructions/agent-workflow.instructions.md`:
**Implement → Verify → Changelog → Commit**

## Agents

| Agent | When to Use |
|-------|------------|
| `@vt-docs-writer` | Writing/updating documentation pages |
| `@vt-docs-reviewer` | Reviewing PRs, checking accuracy and links |

## Conventions

- All `.mdx` files require frontmatter (`title`, `description`)
- Use Mintlify components (`<Card>`, `<CodeGroup>`, `<Note>`, `<Warning>`)
- Never hardcode live API keys — use `vq_test_` prefix
- Internal links use relative paths
- All pages must be registered in `mint.json` navigation
- Run `npm run check-links` before committing

## Build & Test

```bash
npm ci                    # Install dependencies
npm run check-links       # Validate internal links
npx mintlify dev          # Local preview (port 3000)
```

## Deployment

Pushes to `main` auto-deploy to `docs.vectrade.io` via Mintlify.
