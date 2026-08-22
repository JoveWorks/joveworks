#!/usr/bin/env bash
# Trigger the Release GitHub Action (.github/workflows/release.yml) from main.
#
# Usage: ./release.sh [patch|minor]
#   Defaults to "minor" when no argument is given.
#   Prerelease is always true (project is still alpha).

set -euo pipefail

release_as="${1:-minor}"

case "$release_as" in
  patch|minor|major) ;;
  *)
    echo "Usage: $0 [patch|minor]" >&2
    exit 1
    ;;
esac

if ! command -v gh >/dev/null 2>&1; then
  echo "error: gh (GitHub CLI) is not installed. Install it and run 'gh auth login' first." >&2
  exit 1
fi

current_branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$current_branch" != "main" ]; then
  echo "error: releases are always cut from main (currently on '$current_branch')." >&2
  exit 1
fi

gh workflow run release.yml \
  -f "release-as=$release_as" \
  -f "prerelease=true"

echo "Release workflow dispatched (release-as=$release_as, prerelease=true)."
echo "Track it with: gh run watch"
