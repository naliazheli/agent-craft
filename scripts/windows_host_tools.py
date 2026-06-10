#!/usr/bin/env python3
"""Windows host bridge for WSL network operations.

This script provides network access via Windows host when WSL has connectivity issues.
Usage: python scripts/windows_host_tools.py <command> [args]
"""

import subprocess
import sys
import os

def run_on_windows(command):
    """Execute a command on Windows host via wsl.exe."""
    wsl_cmd = ['wsl.exe', '-d', 'Windows', '--'] if os.path.exists('/mnt/c/Windows') else ['powershell.exe', '-Command']
    full_cmd = wsl_cmd + command
    result = subprocess.run(full_cmd, capture_output=True, text=True)
    return result

def github_head():
    """Check GitHub API rate limit via Windows host."""
    result = run_on_windows(['curl', '-sI', 'https://api.github.com'])
    print(result.stdout)
    print(result.stderr, file=sys.stderr)
    return result.returncode

def git_ls_remote(repo, ref='HEAD'):
    """List remote refs via Windows host git."""
    result = run_on_windows(['git', 'ls-remote', repo, ref])
    print(result.stdout)
    return result.returncode

def git_clone(repo, destination):
    """Clone repository via Windows host git."""
    result = run_on_windows(['git', 'clone', '--depth=1', repo, destination])
    print(result.stdout)
    print(result.stderr, file=sys.stderr)
    return result.returncode

def download_archive(owner, repo, ref, destination):
    """Download GitHub archive via Windows host."""
    url = f'https://github.com/{owner}/{repo}/archive/refs/heads/{ref}.zip'
    result = run_on_windows(['curl', '-L', '-o', destination, url])
    print(result.stdout)
    return result.returncode

def main():
    if len(sys.argv) < 2:
        print("Usage: python windows_host_tools.py <command> [args]")
        print("Commands: github-head, git-ls-remote, git-clone, download-archive")
        sys.exit(1)

    cmd = sys.argv[1]

    if cmd == 'github-head':
        sys.exit(github_head())
    elif cmd == 'git-ls-remote':
        if len(sys.argv) < 3:
            print("Usage: git-ls-remote <repo> [ref]")
            sys.exit(1)
        sys.exit(git_ls_remote(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else 'HEAD'))
    elif cmd == 'git-clone':
        if len(sys.argv) < 4:
            print("Usage: git-clone <repo> <destination>")
            sys.exit(1)
        sys.exit(git_clone(sys.argv[2], sys.argv[3]))
    elif cmd == 'download-archive':
        if len(sys.argv) < 6:
            print("Usage: download-archive <owner> <repo> <ref> <destination>")
            sys.exit(1)
        sys.exit(download_archive(sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]))
    else:
        print(f"Unknown command: {cmd}")
        sys.exit(1)

if __name__ == '__main__':
    main()
