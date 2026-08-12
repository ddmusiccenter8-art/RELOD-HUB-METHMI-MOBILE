$jsonLines = Get-Content -Path 'C:\Users\pc\.gemini\antigravity\brain\1f66bdc0-6237-49d2-ab25-cf601f8920bf\.system_generated\steps\1511\content.md' | Select-Object -Skip 8
$jsonStr = $jsonLines -join "`n"
$obj = $jsonStr | ConvertFrom-Json
$bytes = [System.Convert]::FromBase64String($obj.content)
[System.IO.File]::WriteAllBytes('C:\Users\pc\.gemini\antigravity\scratch\phone_sales_app\admin.html', $bytes)
Write-Host "Success"
