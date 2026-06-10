#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path


def load_rows(dataset_file: str) -> list[dict]:
    try:
        from datasets import load_dataset
    except Exception as exc:
        raise RuntimeError("Missing dependency: install datasets or run inside agentcraft/codex-swebench:local") from exc

    suffix = Path(dataset_file).suffix.lower()
    if suffix == ".parquet":
        dataset = load_dataset("parquet", data_files=dataset_file, split="train")
    elif suffix in {".json", ".jsonl"}:
        dataset = load_dataset("json", data_files=dataset_file, split="train")
    else:
        raise RuntimeError(f"Unsupported dataset file type: {dataset_file}")
    return [dict(row) for row in dataset]


def choose_mixed_subset(rows: list[dict], limit: int) -> list[dict]:
    by_repo: dict[str, list[dict]] = defaultdict(list)
    for row in rows:
        by_repo[row["repo"]].append(row)

    selected: list[dict] = []
    repos = sorted(by_repo)
    cursor = 0
    while len(selected) < limit and repos:
        repo = repos[cursor % len(repos)]
        bucket = by_repo[repo]
        if bucket:
            selected.append(bucket.pop(0))
        repos = [item for item in repos if by_repo[item]]
        cursor += 1
    return selected


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-file", required=True)
    parser.add_argument("--limit", type=int, default=25)
    parser.add_argument("--ids-out", required=True)
    parser.add_argument("--json-out", required=True)
    args = parser.parse_args()

    rows = choose_mixed_subset(load_rows(args.dataset_file), args.limit)
    ids_out = Path(args.ids_out)
    json_out = Path(args.json_out)
    ids_out.parent.mkdir(parents=True, exist_ok=True)
    json_out.parent.mkdir(parents=True, exist_ok=True)
    ids_out.write_text("\n".join(row["instance_id"] for row in rows) + "\n", encoding="utf-8")
    json_out.write_text(json.dumps(rows, indent=2, ensure_ascii=True), encoding="utf-8")

    repo_counts: dict[str, int] = defaultdict(int)
    for row in rows:
        repo_counts[row["repo"]] += 1
    print(json.dumps({"count": len(rows), "repos": dict(sorted(repo_counts.items()))}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
