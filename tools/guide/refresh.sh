#!/bin/sh
set -eu

repo=$(git rev-parse --show-toplevel)
git -C "$repo" fetch -q origin main
base=$(git -C "$repo" rev-parse --short=10 origin/main)
branch="guide/measure-$base"
tree=$(mktemp -d "${TMPDIR:-/tmp}/guide-measure.XXXXXX")/tree

git -C "$repo" worktree add -q -b "$branch" "$tree" origin/main
ln -s "$repo/node_modules" "$tree/node_modules"
cd "$tree"

node tools/guide/measure.ts

if git diff --quiet -- tools/guide/measured.json; then
  echo "guide: the numbers on main at $base are already current"
  cd "$repo"
  git worktree remove --force "$tree"
  git branch -q -D "$branch"
  exit 0
fi

git add tools/guide/measured.json
git commit -q -m "The guide's numbers are measured again on main at $base"
git push -q -u origin "$branch"
gh pr create --base main --head "$branch" --title "The guide's numbers are measured again on main at $base" --body "Re-measures \`tools/guide/measured.json\` on main at $base with \`npm run guide:refresh\`. Only that file changes."
echo "guide: branch $branch, worktree $tree"
