$files = 'catalog-root\storybook.log','catalog-root\storybook.err'
Get-Content -Path $files -Wait -Tail 0 | ForEach-Object {
  Write-Host $_
  if ($_ -match '(?i)(compiled successfully|preview.*ready|Started manager|Starting preview|Storybook.*started|listening|WARN Broken build|ERROR|^Error:)') {
    Write-Host '--- Ready or error marker found, exiting stream ---'
    exit 0
  }
}
