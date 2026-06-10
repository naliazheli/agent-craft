#!/usr/bin/env python3
"""Run SWE-bench harness with an explicit image architecture.

The upstream CLI defaults to x86_64. On Apple Silicon local runs we can reuse
prebuilt arm64 instance images by monkey-patching TestSpec creation.
"""

from __future__ import annotations

import argparse

from swebench.harness import run_evaluation
from swebench.harness.test_spec.test_spec import make_test_spec as upstream_make_test_spec


def str2bool(value: str | bool) -> bool:
    if isinstance(value, bool):
        return value
    lowered = value.lower()
    if lowered in {"true", "1", "yes", "y"}:
        return True
    if lowered in {"false", "0", "no", "n"}:
        return False
    raise argparse.ArgumentTypeError(f"invalid boolean: {value}")


def optional_namespace(value: str | None) -> str | None:
    if value is None or value.lower() == "none":
        return None
    return value


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("-d", "--dataset_name", default="SWE-bench/SWE-bench_Lite")
    parser.add_argument("-s", "--split", default="test")
    parser.add_argument("-i", "--instance_ids", nargs="*")
    parser.add_argument("-p", "--predictions_path", required=True)
    parser.add_argument("--max_workers", type=int, default=4)
    parser.add_argument("--open_file_limit", type=int, default=4096)
    parser.add_argument("-t", "--timeout", type=int, default=1800)
    parser.add_argument("--force_rebuild", type=str2bool, default=False)
    parser.add_argument("--cache_level", choices=["none", "base", "env", "instance"], default="env")
    parser.add_argument("--clean", type=str2bool, default=False)
    parser.add_argument("-id", "--run_id", required=True)
    parser.add_argument("-n", "--namespace", type=optional_namespace, default="swebench")
    parser.add_argument("--instance_image_tag", default="latest")
    parser.add_argument("--env_image_tag", default="latest")
    parser.add_argument("--rewrite_reports", type=str2bool, default=False)
    parser.add_argument("--report_dir", default=".")
    parser.add_argument("--modal", type=str2bool, default=False)
    parser.add_argument("--arch", choices=["x86_64", "arm64"], default="x86_64")
    args = parser.parse_args()

    def make_test_spec_with_arch(
        instance,
        namespace=None,
        base_image_tag="latest",
        env_image_tag="latest",
        instance_image_tag="latest",
    ):
        return upstream_make_test_spec(
            instance,
            namespace=namespace,
            base_image_tag=base_image_tag,
            env_image_tag=env_image_tag,
            instance_image_tag=instance_image_tag,
            arch=args.arch,
        )

    run_evaluation.make_test_spec = make_test_spec_with_arch
    kwargs = vars(args).copy()
    kwargs.pop("arch")
    run_evaluation.main(**kwargs)


if __name__ == "__main__":
    main()
