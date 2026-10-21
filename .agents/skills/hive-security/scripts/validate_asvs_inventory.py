#!/usr/bin/env python3
"""Check the pinned OWASP ASVS 5.0.0 CSV inventory and expected counts."""

import csv
from collections import Counter
import hashlib
from pathlib import Path


ROOT = Path(__file__).resolve().parents[4]
INVENTORY = ROOT / "docs" / "security" / "asvs-v5.0.0-requirements.csv"
EXPECTED = {"1": 70, "2": 183, "3": 92}
EXPECTED_SHA256 = "98c8fe911b9edb403af8ee05d3ce8201ecac2659e313b053890a62847cdcf680"
REQUIRED_COLUMNS = {
    "chapter_id",
    "chapter_name",
    "section_id",
    "section_name",
    "req_id",
    "req_description",
    "L",
}


def main() -> int:
    digest = hashlib.sha256(INVENTORY.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Unexpected inventory SHA-256: {digest}")
    with INVENTORY.open(encoding="utf-8-sig", newline="") as source:
        reader = csv.DictReader(source)
        missing = REQUIRED_COLUMNS.difference(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"Missing CSV columns: {', '.join(sorted(missing))}")
        rows = list(reader)

    ids = [row["req_id"].strip() for row in rows]
    if any(not value for value in ids):
        raise SystemExit("Inventory contains an empty requirement ID")
    if len(set(ids)) != len(ids):
        raise SystemExit("Inventory contains duplicate requirement IDs")

    counts = Counter(row["L"].strip() for row in rows)
    if counts != Counter(EXPECTED):
        raise SystemExit(f"Unexpected level counts: {dict(sorted(counts.items()))}")
    if len(rows) != 345:
        raise SystemExit(f"Expected 345 requirements, found {len(rows)}")

    print(f"ASVS 5.0.0 inventory valid: {len(rows)} unique requirements")
    print(f"SHA-256: {digest}")
    print("Minimum level counts: " + ", ".join(f"L{level}={counts[level]}" for level in ("1", "2", "3")))
    print(f"L1+L2 baseline: {counts['1'] + counts['2']}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
