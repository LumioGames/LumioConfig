#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
spec="$root/.spec"

test -d "$spec/agents"
test -d "$spec/skills"
mkdir -p "$root/.claude" "$root/.agents"
rm -f "$root/.claude/agents" "$root/.claude/skills" "$root/.agents/skills"
ln -s ../.spec/agents "$root/.claude/agents"
ln -s ../.spec/skills "$root/.claude/skills"
ln -s ../.spec/skills "$root/.agents/skills"
printf '%s\n' 'Agent links: OK'
