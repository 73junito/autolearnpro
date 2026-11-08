$ErrorActionPreference = 'Stop'
Set-Location 'F:\autolearnpro'
$ErrorActionPreference = 'Continue'
$lines = & 'C:\Users\rod63\scoop\shims\supabase.exe' status -o env 2>$null
$ErrorActionPreference = 'Stop'
$map = @{}
foreach ($line in $lines) {
  if ($line -match '^([A-Z_]+)=(.*)$') { $map[$Matches[1]] = $Matches[2].Trim('"') }
}
if (-not $map.ContainsKey('ANON_KEY')) { throw 'local public API key not found' }
$base='http://127.0.0.1:55121'
$nonce=[guid]::NewGuid().ToString('N')
$pass='Loc@l7!'+[guid]::NewGuid().ToString('N')
$emails=@("student-a-$nonce@example.test","student-b-$nonce@example.test")
$ids=New-Object System.Collections.Generic.List[string]
$headers=@{apikey=$map['ANON_KEY'];'Content-Type'='application/json'}
function SendJson($path,$payload,$token,$method='Post') {
  $h=$headers.Clone()
  if ($token) {$h['Authorization']="Bearer $token"}
  return Invoke-RestMethod -Uri ($base+$path) -Method $method -Headers $h -Body ($payload|ConvertTo-Json -Compress) -TimeoutSec 15
}
function ExpectBlocked($label,[scriptblock]$operation) {
  try {& $operation | Out-Null; throw "SECURITY_FAIL $label unexpectedly permitted"} catch {
    if ($_.Exception.Message -like 'SECURITY_FAIL*') { throw }
    $code=0
    if ($_.Exception.Response) {$code=[int]$_.Exception.Response.StatusCode}
    if ($code -notin @(400,401,403,404,409,422)) {throw "UNEXPECTED_ERROR $label HTTP $code"}
    Write-Output "BLOCKED $label HTTP $code"
  }
}
try {
  $users=@()
  foreach($email in $emails) {
    $signup=SendJson '/auth/v1/signup' @{email=$email;password=$pass} $null
    if (-not $signup.user.id -or -not $signup.access_token) {throw 'Sign-up did not issue usable JWT'}
    $ids.Add([string]$signup.user.id)
    $users+=@{id=[string]$signup.user.id; token=[string]$signup.access_token}
  }
  Write-Output 'AUTH_SIGNUP_TWO_JWTS_PASSED'
  $a=$users[0];$b=$users[1]
  $created=SendJson '/rest/v1/alp_profiles' @{user_id=$a.id;display_name='Student A'} $a.token
  $ha=$headers.Clone();$ha['Authorization']="Bearer $($a.token)"
  $hb=$headers.Clone();$hb['Authorization']="Bearer $($b.token)"
  $aRows=@(Invoke-RestMethod -Uri ($base+'/rest/v1/alp_profiles?select=user_id,display_name') -Headers $ha -TimeoutSec 15)
  $bRows=@(Invoke-RestMethod -Uri ($base+'/rest/v1/alp_profiles?select=user_id,display_name') -Headers $hb -TimeoutSec 15)
  if (@($aRows | Where-Object { $_ -and $_.user_id }).Count -ne 1 -or @($bRows | Where-Object { $_ -and $_.user_id }).Count -ne 0) {throw "Profile visibility mismatch: A=$(@($aRows | Where-Object { $_ -and $_.user_id }).Count) B=$(@($bRows | Where-Object { $_ -and $_.user_id }).Count)"}
  Write-Output 'OWNERSHIP_READ_ISOLATION_PASSED'
  ExpectBlocked 'cross-user profile create' {SendJson '/rest/v1/alp_profiles' @{user_id=$a.id;display_name='Fraud'} $b.token}
  ExpectBlocked 'private role assignment API' {Invoke-RestMethod -Uri ($base+'/rest/v1/alp_role_assignments?select=*') -Headers $ha -TimeoutSec 15}
  ExpectBlocked 'change owner column' {Invoke-RestMethod -Uri ($base+"/rest/v1/alp_profiles?user_id=eq.$($a.id)") -Method Patch -Headers $ha -Body (@{user_id=$b.id}|ConvertTo-Json -Compress) -TimeoutSec 15}
  $updated=Invoke-RestMethod -Uri ($base+"/rest/v1/alp_profiles?user_id=eq.$($a.id)") -Method Patch -Headers $ha -Body (@{display_name='Student A Updated'}|ConvertTo-Json -Compress) -TimeoutSec 15
  $read=Invoke-RestMethod -Uri ($base+"/rest/v1/alp_profiles?user_id=eq.$($a.id)&select=display_name") -Headers $ha -TimeoutSec 15
  if ($read[0].display_name -ne 'Student A Updated') {throw 'own profile edit failed'}
  Write-Output 'OWN_PROFILE_UPDATE_PASSED'
} finally {
  foreach($id in $ids) {
    if ($id -match '^[a-f0-9-]{36}$') {
      $sql="delete from auth.users where id='$id';"
      docker exec supabase_db_autolearnpro-foundation6 psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c $sql | Out-Null
    }
  }
  Write-Output 'TEST_USER_CLEANUP_COMPLETED'
}
