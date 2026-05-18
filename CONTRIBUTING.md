# Contributing to VecTrade Docs

Thank you for helping improve our documentation!

## Quick Edits

For small fixes (typos, broken links), click "Edit this page" on any docs page
or submit a PR directly.

## Local Development

```bash
# Install Mintlify CLI
npm i -g mintlify

# Run docs locally
mintlify dev
```

The local server runs at `http://localhost:3000`.

## Adding a Page

1. Create a `.mdx` file in the appropriate directory
2. Add the page path to `mint.json` → `navigation`
3. Include proper frontmatter (`title`, `description`)

## Writing Guidelines

- **Be concise** — developers scan, not read
- **Show, don't tell** — use code examples liberally
- **Multi-language** — include Python, TypeScript, and CLI examples where possible
- **Test examples** — verify code snippets actually work
- **Link related pages** — help readers discover related content

## Frontmatter

Every `.mdx` file needs:

```yaml
---
title: Page Title
description: One-line description for SEO and navigation.
---
```

## Code Examples

Use `<CodeGroup>` for multi-language examples:

```mdx
<CodeGroup>
\`\`\`python Python
from vectrade import VecTrade
\`\`\`

\`\`\`typescript TypeScript
import { VecTrade } from '@vectrade/sdk';
\`\`\`
</CodeGroup>
```

## Commit Convention

Use [Conventional Commits](https://www.conventionalcommits.org/):

- `docs: add webhook retry guide`
- `fix: correct Python example in quickstart`
- `feat: add options chain guide`
