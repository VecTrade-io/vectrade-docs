"""Tests for GitHub repository configuration."""

from __future__ import annotations

from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent


class TestOSSFiles:
    """Verify standard open-source files are present."""

    @pytest.mark.parametrize("filename", [
        "LICENSE",
        "README.md",
        "CHANGELOG.md",
        "CODE_OF_CONDUCT.md",
        "CONTRIBUTING.md",
        "SECURITY.md",
    ])
    def test_required_file_exists(self, filename):
        assert (ROOT / filename).exists(), f"Missing {filename}"

    def test_readme_not_empty(self):
        content = (ROOT / "README.md").read_text()
        assert len(content) > 100


class TestGitHubConfig:
    """Verify GitHub-specific configuration."""

    def test_codeowners_exists(self):
        assert (ROOT / ".github" / "CODEOWNERS").exists()

    def test_dependabot_exists(self):
        assert (ROOT / ".github" / "dependabot.yml").exists()

    def test_pr_template_exists(self):
        assert (ROOT / ".github" / "PULL_REQUEST_TEMPLATE.md").exists()

    def test_issue_templates_exist(self):
        templates = ROOT / ".github" / "ISSUE_TEMPLATE"
        assert templates.is_dir()
        assert len(list(templates.glob("*.md"))) >= 1

    def test_ci_workflow_exists(self):
        assert (ROOT / ".github" / "workflows" / "ci.yml").exists()
