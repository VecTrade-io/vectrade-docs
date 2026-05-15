# VecTrade Documentation

[![License](https://img.shields.io/github/license/VecTrade-io/vectrade-docs)](LICENSE)

Documentation source for [docs.vectrade.io](https://docs.vectrade.io).

## Local Development

```bash
# Install Mintlify CLI
npm i -g mintlify

# Run locally
mintlify dev
```

## Structure

```
docs/
├── mint.json              # Mintlify configuration
├── introduction.mdx       # Landing page
├── quickstart.mdx         # Getting started guide
├── sdks/
│   ├── python.mdx
│   ├── typescript.mdx
│   └── cli.mdx
├── api-reference/         # Auto-generated from OpenAPI
└── guides/
    ├── authentication.mdx
    ├── rate-limits.mdx
    └── webhooks.mdx
```

## License

Apache-2.0 — see [LICENSE](LICENSE).
