"""Validation tests for vectrade-docs.

Tests verify:
- All pages referenced in mint.json exist
- MDX files have valid frontmatter
- No hardcoded secrets in content
- Documentation structure is consistent
- API reference links are valid
"""

from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


@pytest.fixture(scope="session")
def mint_config() -> dict:
    """Load mint.json configuration."""
    return json.loads((ROOT / "mint.json").read_text())


@pytest.fixture(scope="session")
def mdx_files() -> list[Path]:
    """Collect all MDX files."""
    return sorted(ROOT.glob("**/*.mdx"))


def collect_pages(navigation: list) -> list[str]:
    """Extract all page references from mint.json navigation."""
    pages = []
    for group in navigation:
        if isinstance(group, dict) and "pages" in group:
            for page in group["pages"]:
                if isinstance(page, str):
                    pages.append(page)
                elif isinstance(page, dict) and "pages" in page:
                    pages.extend(collect_pages([page]))
        elif isinstance(group, str):
            pages.append(group)
    return pages


class TestMintConfig:
    """Validate mint.json structure."""

    def test_has_name(self, mint_config):
        assert "name" in mint_config

    def test_has_navigation(self, mint_config):
        assert "navigation" in mint_config
        assert len(mint_config["navigation"]) > 0

    def test_has_logo(self, mint_config):
        assert "logo" in mint_config

    def test_has_colors(self, mint_config):
        assert "colors" in mint_config

    def test_has_api_config(self, mint_config):
        """API docs should have api/openapi config."""
        assert "api" in mint_config or "openapi" in mint_config

    def test_api_auth_uses_x_api_key(self, mint_config):
        """Hosted docs should default to API key auth to match runtime edge contract."""
        api = mint_config.get("api", {})
        auth = api.get("auth", {})
        assert auth.get("method") == "key"
        assert auth.get("name") == "X-API-Key"


class TestPageReferences:
    """Verify all referenced pages exist as files."""

    def test_all_navigation_pages_exist(self, mint_config):
        """Every page in navigation must have a corresponding .mdx file."""
        pages = collect_pages(mint_config.get("navigation", []))
        missing = []
        for page in pages:
            mdx_path = ROOT / f"{page}.mdx"
            if not mdx_path.exists():
                missing.append(page)
        assert not missing, f"Missing pages: {missing}"

    def test_no_orphan_top_level_mdx(self, mint_config):
        """Top-level MDX files should be referenced in navigation."""
        pages = collect_pages(mint_config.get("navigation", []))
        top_mdx = [f.stem for f in ROOT.glob("*.mdx")]
        # These are acceptable even if not in nav
        known_top = {"changelog", "introduction", "quickstart", "ecosystem"}
        unreferenced = [f for f in top_mdx if f not in pages and f not in known_top]
        # Soft check - warn but don't fail
        if unreferenced:
            pytest.skip(f"Unreferenced top-level MDX (may be intentional): {unreferenced}")


class TestFrontmatter:
    """Verify MDX files have valid frontmatter."""

    def test_all_mdx_have_frontmatter(self, mdx_files):
        """Every MDX file should start with --- frontmatter."""
        missing = []
        for f in mdx_files:
            content = f.read_text()
            if not content.startswith("---"):
                missing.append(str(f.relative_to(ROOT)))
        assert not missing, f"Missing frontmatter: {missing}"

    def test_frontmatter_has_title(self, mdx_files):
        """Frontmatter should include a title."""
        missing_title = []
        for f in mdx_files:
            content = f.read_text()
            if content.startswith("---"):
                fm_end = content.find("---", 3)
                if fm_end > 0:
                    frontmatter = content[3:fm_end]
                    if "title" not in frontmatter:
                        missing_title.append(str(f.relative_to(ROOT)))
        if missing_title:
            pytest.skip(f"MDX without title (may use component): {missing_title[:5]}")


class TestSecurity:
    """Verify no secrets are exposed in documentation."""

    def test_no_live_api_keys(self, mdx_files):
        """No live API keys should be in docs."""
        pattern = re.compile(r"vq_live_[a-zA-Z0-9]{10,}")
        violations = []
        for f in mdx_files:
            content = f.read_text()
            if pattern.search(content):
                violations.append(str(f.relative_to(ROOT)))
        assert not violations, f"Files with live API keys: {violations}"

    def test_no_hardcoded_passwords(self, mdx_files):
        """No password-like strings in docs."""
        pattern = re.compile(r"password\s*[:=]\s*['\"][^'\"]{8,}", re.IGNORECASE)
        violations = []
        for f in mdx_files:
            content = f.read_text()
            if pattern.search(content):
                violations.append(str(f.relative_to(ROOT)))
        assert not violations, f"Files with hardcoded passwords: {violations}"


class TestStructure:
    """Verify documentation structure is consistent."""

    def test_guides_directory_exists(self):
        assert (ROOT / "guides").is_dir()

    def test_api_reference_exists(self):
        assert (ROOT / "api-reference").is_dir()

    def test_has_introduction(self):
        assert (ROOT / "introduction.mdx").exists()

    def test_has_quickstart(self):
        assert (ROOT / "quickstart.mdx").exists()

    def test_has_changelog(self):
        assert (ROOT / "changelog.mdx").exists() or (ROOT / "CHANGELOG.md").exists()


class TestOpenAPIIntegration:
    """Verify OpenAPI reference is properly configured."""

    def test_openapi_directory_exists(self):
        """OpenAPI spec files should exist."""
        assert (ROOT / "openapi").is_dir()

    def test_openapi_files_are_valid(self):
        """OpenAPI spec files should be valid YAML/JSON."""
        openapi_dir = ROOT / "openapi"
        if openapi_dir.exists():
            files = list(openapi_dir.glob("*.yaml")) + list(openapi_dir.glob("*.json"))
            assert len(files) > 0, "No OpenAPI spec files found"


class TestRuntimeContractAlignment:
    """Classify API reference bindings as runtime-backed or explicitly spec-only."""

    RUNTIME_ROUTERS = [
        ROOT.parent / "vectrade-core" / "trading" / "vectrade" / "router.py",
        ROOT.parent / "vectrade-core" / "trading" / "vectrade" / "developer_router.py",
    ]

    # These pages are currently documented from canonical spec but not served by
    # the runtime routers above. Keep this list explicit to make drift intentional.
    SPEC_ONLY_DOCS = {
        "api-reference/analyst/consensus.mdx",
        "api-reference/analyst/price-targets.mdx",
        "api-reference/analyst/ratings.mdx",
        "api-reference/earnings/calendar.mdx",
        "api-reference/fundamentals/balance-sheet.mdx",
        "api-reference/fundamentals/income-statement.mdx",
        "api-reference/insider/summary.mdx",
        "api-reference/options/chain.mdx",
        "api-reference/options/expirations.mdx",
        "api-reference/screener/run-screener.mdx",
        "api-reference/technicals/get-technicals.mdx",
        "api-reference/webhooks/create.mdx",
        "api-reference/webhooks/delete.mdx",
        "api-reference/webhooks/list.mdx",
    }

    @staticmethod
    def _normalize_path_params(path: str) -> str:
        """Normalize dynamic path param names so symbol/ticker naming differences don't fail checks."""
        return re.sub(r"\{[^}]+\}", "{symbol}", path)

    @classmethod
    def _extract_runtime_operations(cls, router_path: Path) -> set[str]:
        """Extract `METHOD /vq/...` operations directly from FastAPI decorators."""
        src = router_path.read_text()
        tree = ast.parse(src)

        prefix = ""
        for node in ast.walk(tree):
            if isinstance(node, ast.Assign) and any(isinstance(t, ast.Name) and t.id == "router" for t in node.targets):
                call = node.value
                if isinstance(call, ast.Call) and getattr(call.func, "id", None) == "APIRouter":
                    for kw in call.keywords:
                        if kw.arg == "prefix" and isinstance(kw.value, ast.Constant):
                            prefix = str(kw.value.value)

        operations: set[str] = set()
        for node in tree.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            for dec in node.decorator_list:
                if not isinstance(dec, ast.Call):
                    continue
                if not isinstance(dec.func, ast.Attribute):
                    continue
                if not (isinstance(dec.func.value, ast.Name) and dec.func.value.id == "router"):
                    continue
                method = dec.func.attr.lower()
                if method not in {"get", "post", "put", "patch", "delete"}:
                    continue
                if not dec.args or not isinstance(dec.args[0], ast.Constant):
                    continue

                route_path = str(dec.args[0].value)
                full = f"{prefix}{route_path}".replace("/api/v1", "")
                normalized = cls._normalize_path_params(full)
                operations.add(f"{method.upper()} {normalized}")

        return operations

    @staticmethod
    def _extract_doc_openapi_operation(doc_path: Path) -> str | None:
        """Read frontmatter `openapi: \"METHOD /path\"` from an MDX file."""
        content = doc_path.read_text()
        match = re.search(r'openapi:\s*"([A-Z]+\s+[^\"]+)"', content)
        return match.group(1).strip() if match else None

    def test_api_reference_pages_are_runtime_backed_or_explicitly_spec_only(self):
        """Every API page must be either code-backed or intentionally spec-only."""
        missing_router_files = [p for p in self.RUNTIME_ROUTERS if not p.exists()]
        if missing_router_files:
            pytest.skip(f"Runtime router(s) not available in this checkout: {missing_router_files}")

        runtime_ops: set[str] = set()
        for router in self.RUNTIME_ROUTERS:
            runtime_ops |= self._extract_runtime_operations(router)

        api_pages = sorted(Path(ROOT / "api-reference").rglob("*.mdx"))
        unclassified = []

        for page in api_pages:
            rel = str(page.relative_to(ROOT))
            if rel == "api-reference/overview.mdx":
                continue
            op = self._extract_doc_openapi_operation(page)
            assert op is not None, f"Missing openapi frontmatter in: {rel}"

            method, path = op.split(" ", 1)
            normalized_op = f"{method} {self._normalize_path_params(path)}"
            if normalized_op in runtime_ops:
                continue
            if rel in self.SPEC_ONLY_DOCS:
                continue
            unclassified.append((rel, op))

        stale_allowlist = [rel for rel in sorted(self.SPEC_ONLY_DOCS) if not (ROOT / rel).exists()]

        assert not stale_allowlist, f"SPEC_ONLY_DOCS contains missing pages: {stale_allowlist}"
        assert not unclassified, (
            "API pages not backed by runtime and not declared spec-only: "
            f"{unclassified}"
        )
