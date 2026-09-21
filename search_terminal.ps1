$content = [System.IO.File]::ReadAllText("hb_main.js", [System.Text.Encoding]::UTF8)

$regex = [System.Text.RegularExpressions.Regex]::new('(/terminal|/api/terminal|term-output|stdin|terminal-output)')
$matches = $regex.Matches($content)
foreach ($m in $matches) {
    Write-Output "Terminal match: $($m.Value)"
}

$regex2 = [System.Text.RegularExpressions.Regex]::new('socket\.io[^\"]*')
$matches2 = $regex2.Matches($content)
foreach ($m in $matches2) {
    Write-Output "Socket match: $($m.Value)"
}
