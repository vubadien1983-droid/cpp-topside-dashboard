# Đăng ký lịch tự chạy trong Windows Task Scheduler
# Chạy 2 khung giờ mỗi ngày:
#   - Sáng sớm: khi đăng nhập Windows / mở khoá máy / 06:00 (chạy bù nếu máy tắt)
#   - Trưa 12:30: cập nhật lại dữ liệu mới cho buổi chiều
# Script tự kiểm tra khung sáng (<12:25) & trưa/chiều (>=12:25) để không tải trùng thừa.
$TaskName = "PTSC Daily Download (Punchlist and Checksheet)"
$pyw    = "$env:LOCALAPPDATA\PunchlistDownloader\.venv\Scripts\pythonw.exe"
$script = Join-Path $PSScriptRoot "run_daily.py"
$user   = "$env:USERDOMAIN\$env:USERNAME"

$action = New-ScheduledTaskAction -Execute $pyw -Argument "`"$script`"" `
          -WorkingDirectory "$PSScriptRoot"

# 1) Khi đăng nhập Windows (mở máy), trễ 2 phút cho mạng & Google Drive sẵn sàng
$tLogon = New-ScheduledTaskTrigger -AtLogOn -User $user
$tLogon.Delay = "PT2M"
# 2) Khi mở khoá máy (trường hợp để máy Sleep/khoá qua đêm hoặc trưa)
$cls = Get-CimClass -Namespace ROOT\Microsoft\Windows\TaskScheduler -ClassName MSFT_TaskSessionStateChangeTrigger
$tUnlock = New-CimInstance -CimClass $cls -ClientOnly
$tUnlock.StateChange = 8   # SessionUnlock
$tUnlock.UserId = $user
$tUnlock.Delay = "PT1M"
# 3) 06:00 hằng ngày (buổi sáng sớm)
$tMorning = New-ScheduledTaskTrigger -Daily -At "06:00"
# 4) 12:30 hằng ngày (buổi trưa cập nhật dữ liệu chiều)
$tNoon = New-ScheduledTaskTrigger -Daily -At "12:30"

$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -WakeToRun `
            -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
            -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 1)

Register-ScheduledTask -TaskName $TaskName -Action $action `
    -Trigger @($tLogon, $tUnlock, $tMorning, $tNoon) -Settings $settings -Force | Out-Null
Write-Host "Da dang ky lich '$TaskName': khi dang nhap, mo khoa may, 06:00 sang va 12:30 trua hang ngay."
