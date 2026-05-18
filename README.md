# VecTrade Documentation

[![CI](https://github.com/VecTrade-io/vectrade-docs/actions/workflows/ci.yml/badge.svg)](https://github.com/VecTrade-io/vectrade-docs/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/VecTrade-io/vectrade-docs)](LICENSE)

Documentation source for [docs.vectrade.io](https://docs.vectrade.io), built with [Mintlify](https://mintlify.com).

## Local Development

```bash
# Install Mintlify CLI
npm i -g mintlify

# Run locally (hot-reload at http://localhost:3000)
mintlify dev
```

## Content Structure

```
docs/
├── mint.json              # Mintlify configuration & navigation
├── introduction.mdx       # Landing page
├── quickstart.mdx         # Getting started (5 min)
├── guides/
│   ├── authentication.mdx # API key management
│   ├── error-handling.mdx # Error types & retry logic
│   ├── streaming.mdx      # SSE streaming
│   ├── rate-limits.mdx    # Quotas & optimization
│   └── webhooks.mdx       # Event delivery & HMAC
├── sdks/
│   ├── python.mdx         # Python SDK reference
│   ├── typescript.mdx     # TypeScript SDK reference
│   ├── cli.mdx            # CLI reference
│   └── finkit.mdx         # FinKit (open-source library)
└── scripts/
    └── check-links.mjs    # Internal link validator
```

## Validation

```bash
# Check all page references in mint.json exist
node scripts/check-links.mjs

# Validate frontmatter exists on all .mdx files
for f in $(find . -name "*.mdx" -not -path "./node_modules/*"); do
  head -1 "$f" | grep -q "^---" || echo "Missing frontmatter: $f"
done
```

## Writing Guidelines

- Keep explanations concise — developers scan docs
- Always include multi-language code examples (Python, TypeScript, CLI)
- Use `<CodeGroup>` for language tabs
- Verify all code examples compile/run correctly
- Never include real API keys — use `vq_test_...` placeholders

## VecTrade Ecosystem

| Repository | Description |
|-----------|-------------|
| [vectrade-python](https://github.com/VecTrade-io/vectrade-python) | Python SDK |
| [vectrade-node](https://github.com/VecTrade-io/vectrade-node) | TypeScript SDK |
| [vectrade-cli](https://github.com/VecTrade-io/vectrade-cli) | Go CLI |
| [vectrade-ai-provider](https://github.com/VecTrade-io/vectrade-ai-provider) | Vercel AI SDK provider |
| [vectrade-mcp](https://github.com/VecTrade-io/vectrade-mcp) | MCP server |
| [finkit](https://github.com/VecTrade-io/finkit) | Financial computations |
| [vectrade-examples](https://github.com/VecTrade-io/vectrade-examples) | Runnable examples |
| [vectrade-openapi](https://github.com/VecTrade-io/vectrade-openapi) | OpenAPI spec |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for writing guidelines and local setup.

## License

Apache-2.0 — see [LICENSE](LICENSE).
