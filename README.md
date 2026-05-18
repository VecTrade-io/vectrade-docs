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
├── mint.json              # Mintlify configuration & navigation
├── favicon.svg            # Site favicon
├── logo/
│   ├── dark.svg           # Logo for dark mode
│   └── light.svg          # Logo for light mode
├── openapi/
│   └── spec.yaml          # OpenAPI 3.1 spec (27 endpoints)
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
│   ├── finkit.mdx         # FinKit (open-source library)
│   ├── mcp.mdx            # MCP server for AI IDEs
│   └── ai-provider.mdx    # Vercel AI SDK provider
├── api-reference/
│   ├── overview.mdx       # API reference landing page
│   ├── quotes/            # Quote endpoints
│   ├── fundamentals/      # Fundamentals endpoints
│   ├── technicals/        # Technicals endpoints
│   ├── news/              # News endpoints
│   ├── screener/          # Screener endpoints
│   ├── ai/               # AI analysis endpoints
│   ├── analyst/           # Analyst endpoints
│   ├── earnings/          # Earnings endpoints
│   ├── insider/           # Insider endpoints
│   ├── options/           # Options endpoints
│   ├── webhooks/          # Webhook endpoints
│   └── developer/         # Developer/key management endpoints
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

| Repository | Description | Docs Page |
|-----------|-------------|-----------|
| [vectrade-python](https://github.com/VecTrade-io/vectrade-python) | Python SDK | [/sdks/python](https://docs.vectrade.io/sdks/python) |
| [vectrade-node](https://github.com/VecTrade-io/vectrade-node) | TypeScript SDK | [/sdks/typescript](https://docs.vectrade.io/sdks/typescript) |
| [vectrade-cli](https://github.com/VecTrade-io/vectrade-cli) | Go CLI | [/sdks/cli](https://docs.vectrade.io/sdks/cli) |
| [vectrade-ai-provider](https://github.com/VecTrade-io/vectrade-ai-provider) | Vercel AI SDK provider | [/sdks/ai-provider](https://docs.vectrade.io/sdks/ai-provider) |
| [vectrade-mcp](https://github.com/VecTrade-io/vectrade-mcp) | MCP server for AI IDEs | [/sdks/mcp](https://docs.vectrade.io/sdks/mcp) |
| [finkit](https://github.com/VecTrade-io/finkit) | Financial computations | [/sdks/finkit](https://docs.vectrade.io/sdks/finkit) |
| [vectrade-openapi](https://github.com/VecTrade-io/vectrade-openapi) | OpenAPI spec | [/api-reference](https://docs.vectrade.io/api-reference/overview) |
| [vectrade-examples](https://github.com/VecTrade-io/vectrade-examples) | Runnable examples | — |
| [vectrade-sdk-generator](https://github.com/VecTrade-io/vectrade-sdk-generator) | SDK code generator | — |
| [homebrew-vectrade](https://github.com/VecTrade-io/homebrew-vectrade) | Homebrew tap | — |
| [scoop-vectrade](https://github.com/VecTrade-io/scoop-vectrade) | Scoop bucket (Windows) | — |
| [awesome-vectrade](https://github.com/VecTrade-io/awesome-vectrade) | Community resources | — |
| [.github](https://github.com/VecTrade-io/.github) | Org-level governance | — |

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for writing guidelines and local setup.

## License

Apache-2.0 — see [LICENSE](LICENSE).
