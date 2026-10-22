#!/usr/bin/env python3
"""Turn machine-readable lint/audit output into a GitHub job-summary section.

Used by .github/workflows/pr-extended-checks.yml. The reports are advisory:
this script always exits 0 so a malformed or missing input never fails the job.

Usage:
    ci_report.py clippy          <cargo-clippy.json>   [--rendered]
    ci_report.py cargo-audit     <cargo-audit.json>
    ci_report.py pnpm-audit      <pnpm-audit.json>

Markdown goes to stdout (pipe it into $GITHUB_STEP_SUMMARY).
"""

import json
import sys
from collections import Counter


def load_lines(path):
    """Yield one JSON object per line (cargo --message-format=json)."""
    try:
        with open(path, encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line.startswith("{"):
                    continue
                try:
                    yield json.loads(line)
                except ValueError:
                    continue
    except OSError:
        return


def load_document(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return None


def clippy_diagnostics(path):
    """Distinct lint diagnostics: (level, code, file, line, column, message)."""
    seen = {}
    for entry in load_lines(path):
        if entry.get("reason") != "compiler-message":
            continue
        message = entry.get("message") or {}
        code = (message.get("code") or {}).get("code")
        level = message.get("level")
        # Summary lines ("N warnings emitted", "aborting ...") carry no code.
        if not code or level not in ("warning", "error"):
            continue
        spans = message.get("spans") or [{}]
        span = spans[0]
        key = (
            level,
            code,
            span.get("file_name"),
            span.get("line_start"),
            span.get("column_start"),
            message.get("message"),
        )
        # --all-targets lints the lib twice (normal + test); keep one copy.
        seen.setdefault(key, message.get("rendered") or "")
    return seen


def report_clippy(path, rendered):
    diagnostics = clippy_diagnostics(path)
    if rendered:
        for text in diagnostics.values():
            print(text)
        return
    print("## Clippy (report-only)\n")
    if not diagnostics:
        print(
            "No lint diagnostics were produced (clippy may have been blocked by a "
            "build failure; see the step log)."
        )
        return
    levels = Counter(key[0] for key in diagnostics)
    print(f"- warnings: **{levels.get('warning', 0)}**")
    print(f"- errors (deny-by-default lints): **{levels.get('error', 0)}**\n")
    per_lint = Counter((key[0], key[1]) for key in diagnostics)
    print("| level | lint | count |")
    print("|-------|------|-------|")
    for (level, code), count in sorted(per_lint.items(), key=lambda item: (-item[1], item[0])):
        print(f"| {level} | `{code}` | {count} |")


def report_cargo_audit(path):
    print("## cargo audit (report-only)\n")
    document = load_document(path)
    if not isinstance(document, dict) or "vulnerabilities" not in document:
        print("cargo audit produced no parseable JSON (see the step log).")
        return
    vulnerabilities = document["vulnerabilities"] or {}
    listed = vulnerabilities.get("list") or []
    print(f"- vulnerabilities: **{vulnerabilities.get('count', len(listed))}**")
    warnings = document.get("warnings") or {}
    for kind, items in sorted(warnings.items()):
        print(f"- {kind} warnings: **{len(items or [])}**")
    print()
    if listed:
        print("Vulnerabilities:\n")
        for item in listed:
            advisory = item.get("advisory") or {}
            package = item.get("package") or {}
            print(
                f"- {advisory.get('id')} {package.get('name')} "
                f"{package.get('version')}: {advisory.get('title')}"
            )
        print()
    shown = False
    for kind, items in sorted(warnings.items()):
        for item in items or []:
            if not shown:
                print("Warnings (unmaintained / unsound / yanked):\n")
                shown = True
            package = item.get("package") or {}
            advisory = item.get("advisory") or {}
            suffix = f" ({advisory['id']})" if advisory.get("id") else ""
            print(f"- [{kind}] {package.get('name')} {package.get('version')}{suffix}")


def report_pnpm_audit(path):
    print("## pnpm audit --prod (report-only)\n")
    document = load_document(path)
    metadata = (document or {}).get("metadata") if isinstance(document, dict) else None
    counts = (metadata or {}).get("vulnerabilities") if isinstance(metadata, dict) else None
    if not isinstance(counts, dict):
        print("pnpm audit produced no parseable JSON (see the step log).")
        return
    for severity, count in counts.items():
        print(f"- {severity}: **{count}**")
    print()
    advisories = document.get("advisories") or {}
    for advisory in advisories.values():
        print(
            f"- [{advisory.get('severity')}] {advisory.get('module_name')} "
            f"{advisory.get('vulnerable_versions')}: {advisory.get('title')}"
        )


def main(argv):
    if len(argv) < 3:
        print(__doc__, file=sys.stderr)
        return 0
    command, path = argv[1], argv[2]
    if command == "clippy":
        report_clippy(path, rendered="--rendered" in argv[3:])
    elif command == "cargo-audit":
        report_cargo_audit(path)
    elif command == "pnpm-audit":
        report_pnpm_audit(path)
    else:
        print(__doc__, file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
