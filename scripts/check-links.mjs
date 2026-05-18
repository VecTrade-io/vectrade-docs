/**
 * Internal link checker for Mintlify docs.
 * Validates that all page references in mint.json exist as .mdx files.
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const config = JSON.parse(readFileSync("mint.json", "utf-8"));
const errors = [];

function collectPages(navigation) {
  const pages = [];
  for (const group of navigation) {
    if (group.pages) {
      for (const page of group.pages) {
        if (typeof page === "string") {
          pages.push(page);
        } else if (page.pages) {
          pages.push(...page.pages);
        }
      }
    }
  }
  return pages;
}

const pages = collectPages(config.navigation || []);

for (const page of pages) {
  const filePath = resolve(`${page}.mdx`);
  if (!existsSync(filePath)) {
    errors.push(`Missing: ${page}.mdx (referenced in mint.json)`);
  }
}

if (errors.length > 0) {
  console.error("Broken internal links found:\n");
  errors.forEach((e) => console.error(`  ✗ ${e}`));
  process.exit(1);
} else {
  console.log(`✓ All ${pages.length} page references in mint.json are valid`);
}
