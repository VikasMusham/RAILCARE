$ErrorActionPreference = 'Stop'
$booking = Invoke-RestMethod -Method Post -Uri 'http://localhost:3000/api/bookings' -Body (@{passengerName='RejTest'; station='Secunderabad'; trainName='Test 101'; coach='S1'; seat='12'; services=@('Luggage'); language='English'; price=50 } | ConvertTo-Json -Depth 5) -ContentType 'application/json'
Write-Output '---CREATE---'
$booking | ConvertTo-Json -Depth 5
$assistants = Invoke-RestMethod -Uri 'http://localhost:3000/api/assistants'
Write-Output '---ASSISTANTS---'
$assistants | ConvertTo-Json -Depth 5
$ana = $assistants | Where-Object { $_.verified -eq $true } | Select-Object -First 1
if (-not $ana) { Write-Output 'No verified assistant found'; exit 0 }
$ana | ConvertTo-Json -Depth 5
$aid = $ana._id
$bid = $booking.booking._id
Write-Output '---ACCEPT---'
$acc = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/bookings/$bid/accept" -Body (@{assistantId=$aid} | ConvertTo-Json) -ContentType 'application/json'
$acc | ConvertTo-Json -Depth 5
Write-Output '---REJECT---'
$rej = Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/bookings/$bid/reject" -Body (@{assistantId=$aid} | ConvertTo-Json) -ContentType 'application/json'
$rej | ConvertTo-Json -Depth 5
Write-Output '---FINAL---'
$final = Invoke-RestMethod -Uri "http://localhost:3000/api/bookings/$bid"
$final | ConvertTo-Json -Depth 5
