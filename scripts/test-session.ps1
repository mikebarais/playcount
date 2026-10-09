param(
    [Parameter(Mandatory)]
    [string]$PersonalLink,
    [string]$Instance = 'lamanchette'
)

$configPath = Join-Path $PSScriptRoot "..\public\instances\$Instance.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json
$headers = @{ apikey = $config.publishableKey }

Write-Host "1. Exchanging personal link for a session token..."
try {
    $session = Invoke-RestMethod -Method Post `
        -Uri "$($config.supabaseUrl)/functions/v1/session" `
        -Headers $headers `
        -ContentType 'application/json' `
        -Body (@{ personalLink = $PersonalLink } | ConvertTo-Json)
} catch {
    Write-Host "   Failed: $($_.Exception.Response.StatusCode) $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}
Write-Host "   OK, token expires at $([DateTimeOffset]::FromUnixTimeSeconds($session.expiresAt).LocalDateTime)" -ForegroundColor Green

Write-Host "2. Reading own member row with the token..."
try {
    $members = Invoke-RestMethod -Method Get `
        -Uri "$($config.supabaseUrl)/rest/v1/members?select=name" `
        -Headers ($headers + @{ Authorization = "Bearer $($session.accessToken)" })
} catch {
    Write-Host "   Failed: $($_.Exception.Response.StatusCode) $($_.ErrorDetails.Message)" -ForegroundColor Red
    exit 1
}

if ($members.Count -eq 0) {
    Write-Host "   Token accepted, but no row returned. Is the members_read_own_row policy applied?" -ForegroundColor Yellow
    exit 1
}
Write-Host "   OK, signed in as $($members[0].name)" -ForegroundColor Green
