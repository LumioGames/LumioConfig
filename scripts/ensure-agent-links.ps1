$ErrorActionPreference = 'Stop'

$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$spec = Join-Path $root '.spec'
# 框架技能与 reviewer 子 Agent 由 lumio 插件提供；这里只维护项目专属技能的链接。
$links = @{
    (Join-Path $root '.claude\skills') = Join-Path $spec 'skills'
    (Join-Path $root '.agents\skills') = Join-Path $spec 'skills'
}

foreach ($entry in $links.GetEnumerator()) {
    $link = $entry.Key
    $target = $entry.Value
    if (-not (Test-Path -LiteralPath $target -PathType Container)) {
        throw "Missing .spec target: $target"
    }
    New-Item -ItemType Directory -Force -Path (Split-Path -Parent $link) | Out-Null
    $existing = Get-Item -Force -LiteralPath $link -ErrorAction SilentlyContinue
    if ($null -ne $existing) {
        if ($existing.PSIsContainer) {
            cmd /c "rmdir `"$link`"" | Out-Null
        } else {
            Remove-Item -Force -LiteralPath $link
        }
    }
    New-Item -ItemType Junction -Path $link -Target $target | Out-Null
    $resolved = ((Get-Item -Force -LiteralPath $link).Target | Select-Object -First 1)
    if ($resolved -ne $target) {
        throw "Link does not resolve into .spec: $link -> $resolved"
    }
}

git -C $root update-index --assume-unchanged -- .claude/skills .agents/skills

Write-Output 'Agent links: OK'
