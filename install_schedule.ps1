# Đăng ký lịch tự chạy trong Windows Task Scheduler
# Chạy SỚM NHẤT mỗi sáng: khi đăng nhập Windows / mở khoá máy / 06:00 (chạy bù nếu máy tắt)
# Script tự bỏ qua nếu hôm nay đã có file -> mỗi ngày chỉ tải 1 lần.
$TaskName = "PTSC Daily Download (Punchlist and Checksheet)"
$pyw    = "$env:LOCALAPPDATA\PunchlistDownloader\.venv\Scripts\pythonw.exe"
$script = Join-Path $PSScriptRoot "run_daily.py"
$user   = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" `
          -WorkingDirectory "$env:LOCALAPPDATA\PunchlistDownloader"

# 1) Khi đăng nhập Windows (mở máy), trễ 2 phút cho mạng & Google Drive sẵn sàng
$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$tLogon.Delay = "PT2M"
# 2) Khi mở khoá máy (trường hợp để máy Sleep/khoá qua đêm)
$cls = Get-CimClass -Namespace ROOT\Microsoft\Windows\TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger
$tUnlock = New-CimInstance -CimClass $cls -ClientOnly
$tUnlock.StateChange = 8   # SessionUnlock
$tUnlock.UserId = $user
$tUnlock.Delay = "PT1M"
# 3) 06:00 hằng ngày (nếu máy đang bật/sleep)
$tDaily = New-ScheduledTaskTrigger -Daily -At "06:00"

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger @($tLogon, $tUnlock, $tDaily) -Settings $settings -Force | Out-Null
Write-Host "Da dang ky lich '$TaskName': khi dang nhap, khi mo khoa may, va 06:00 hang ngay."
