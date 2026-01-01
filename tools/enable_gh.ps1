$paths = @(
"$($env:ProgramFiles)\\GitHub CLI\\gh.exe",
"$($env['ProgramFiles(x86)'])\\GitHub CLI\\gh.exe",
"$($env:LOCALAPPDATA)\\Programs\\GitHub CLI\\gh.exe",
"$($env:USERPROFILE)\\AppData\\Local\\Programs\\GitHub CLI\\gh.exe",
"$($env:USERPROFILE)\\AppData\\Local\\Microsoft\\WindowsApps\\gh.exe"
)
foreach($p in $paths){
    if( $p -and (Test-Path $p) ){
        Write-Host "FOUND: $p"
        $dir = Split-Path $p -Parent
        $env:Path = "$dir;$env:Path"
        Write-Host "Added to PATH: $dir"
        gh --version
        exit 0
    }
}

# Fallback scan common roots (may be slow)
$roots = @($env:ProgramFiles, $env:LOCALAPPDATA, $env:UserProfile)
foreach($r in $roots){
    if( Test-Path $r ){
        $found = Get-ChildItem -Path $r -Filter gh.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
        if( $found ){
            $p = $found.FullName
            Write-Host "FOUND (scan): $p"
            $dir = Split-Path $p -Parent
            $env:Path = "$dir;$env:Path"
            Write-Host "Added to PATH: $dir"
            gh --version
            exit 0
        }
    }
}

Write-Host 'gh.exe not found'
exit 1
