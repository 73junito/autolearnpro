param(
    [string]$OutputJson = "response-headers-policy.json",
    [string]$Csp = "default-src 'self'; script-src 'self' https://cdn.example.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; img-src 'self' data: https://images.example.com; frame-ancestors 'none';",
    [switch]$Force
)

$policy = @{
    ResponseHeadersPolicyConfig = @{
        Name = 'Catalog-Security-Headers'
        Comment = 'Mirrors app-layer security headers from frontend/web/next.config.js'
        SecurityHeadersConfig = @{
            ContentSecurityPolicy = @{
                ContentSecurityPolicy = $Csp
                Override = $true
            }
            StrictTransportSecurity = @{
                AccessControlMaxAgeSec = 63072000
                IncludeSubdomains = $true
                Preload = $true
                Override = $true
            }
            FrameOptions = @{
                FrameOption = 'DENY'
                Override = $true
            }
            XContentTypeOptions = @{
                Override = $true
            }
            ReferrerPolicy = @{
                ReferrerPolicy = 'no-referrer-when-downgrade'
                Override = $true
            }
            CrossOriginOpenerPolicy = @{
                CrossOriginOpenerPolicy = 'same-origin'
                Override = $true
            }
        }
    }
}

$json = $policy | ConvertTo-Json -Depth 10

if ((Test-Path $OutputJson) -and (-not $Force)) {
    Write-Host "File $OutputJson already exists. Use -Force to overwrite." -ForegroundColor Yellow
    exit 1
}

Set-Content -Path $OutputJson -Value $json -Encoding UTF8
Write-Host "Wrote $OutputJson"
Write-Host "Use: aws cloudfront create-response-headers-policy --response-headers-policy-config file://$OutputJson"
