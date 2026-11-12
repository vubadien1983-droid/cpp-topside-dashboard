# PTSC PMS Auto Downloader (Punchlist & Checksheet)

Công cụ tự động tải dữ liệu **Punchlist** và **Checksheet Overview** từ hệ thống PTSC M&C PMS hàng ngày.

---

### 📁 Cấu trúc thư mục

* **`Downloads/`**: Thư mục riêng lưu trữ các file Excel tải về hàng ngày:
  * `PunchList_CPP_TOPSIDE_YYYY-MM-DD.xlsx`
  * `Checksheet_CPP_TOPSIDE_YYYY-MM-DD.xlsx`
* **`logs/`**: Chứa lịch sử chạy (`run_YYYY-MM.log`, `checksheet_YYYY-MM.log`) và ảnh chụp màn hình khi có lỗi.
* **`config.json`**: Cấu hình chung (FacilityCode, URL các trang, tài khoản...).
* **`punchlist_downloader.py`**: Script tải dữ liệu Punchlist Overview.
* **`checksheet_downloader.py`**: Script tải dữ liệu Checksheet Overview.
* **`run_daily.py`**: Script chạy tổng hợp cả hai báo cáo hàng ngày (bỏ qua nếu ngày hôm đó đã có file).
* **`2_run_test.bat`**: Chạy thử tải Punchlist ngay lập tức (hiện trình duyệt).
* **`2_run_checksheet_test.bat`**: Chạy thử tải Checksheet Overview ngay lập tức (hiện trình duyệt).
* **`3_install_daily_schedule.bat`**: Cài đặt / cập nhật lịch tự động tải cả 2 báo cáo khi mở máy vào Windows Task Scheduler.

---

### ⚙️ Cơ chế hoạt động của lịch tự động

1. **Thời điểm kích hoạt**:
   * Khi bạn **bật máy / đăng nhập Windows** vào buổi sáng (chờ 2 phút để mạng Wi-Fi và Google Drive ổn định).
   * Khi bạn **mở khóa máy** (nếu để máy Sleep hoặc Lock qua đêm).
   * Cố định lúc **06:00 AM** mỗi ngày (nếu máy đang mở).
2. **Nguyên tắc "Mỗi ngày 1 lần"**:
   * Tự động kiểm tra trong thư mục `Downloads/`, nếu file ngày hôm đó đã tải rồi thì tự động bỏ qua.
3. **Bảo mật & Tự động đăng nhập**:
   * Tài khoản `PQ025874` được lưu trong `config.json`.
   * Mật khẩu được mã hóa an toàn trong **Windows Credential Manager**.
