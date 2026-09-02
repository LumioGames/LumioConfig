#!/usr/bin/env sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
spec="$root/.spec"

# 框架技能与 reviewer 子 Agent 由 lumio 插件提供；这里只维护项目专属技能的链接。
test -d "$spec/skills"
mkdir -p "$root/.claude" "$root/.agents"
rm -f "$root/.claude/skills" "$root/.agents/skills"
ln -s ../.spec/skills "$root/.claude/skills"
ln -s ../.spec/skills "$root/.agents/skills"
git -C "$root" update-index --assume-unchanged -- .claude/skills .agents/skills
printf '%s\n' 'Agent links: OK'
