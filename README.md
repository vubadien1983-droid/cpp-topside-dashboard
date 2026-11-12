# CPP TOPSIDE — Punchlist & Checksheet Dashboard

Hệ thống quản lý, phân tích và tự động đồng bộ dữ liệu **Punchlist** và **Checksheet Overview** cho dự án **Vietnam Block B Gas Project • EPC#1 (CPP TOPSIDE)**.

---

### 🌐 Trải nghiệm Online (Máy tính & Điện thoại)

* **GitHub Pages Live Link**: [https://vubadien1983-droid.github.io/cpp-topside-dashboard/](https://vubadien1983-droid.github.io/cpp-topside-dashboard/)
* **GitHub Repository**: [https://github.com/vubadien1983-droid/cpp-topside-dashboard](https://github.com/vubadien1983-droid/cpp-topside-dashboard)
* **Vercel Deployment**: Bạn chỉ cần liên kết repo `cpp-topside-dashboard` trên Vercel để nhận thêm link domain `*.vercel.app` nếu muốn.

---

### 🚀 Tính năng nổi bật của Dashboard

1. **Giao diện chuẩn Project SOI0007689 SQCL Check List**:
   * Thiết kế tông màu kỹ thuật chuyên nghiệp (Dark Slate Header, Clean Grid Table, Badge màu theo Category và Status).
   * **Chế độ hiển thị linh hoạt**: Hỗ trợ chuyển đổi nhanh giữa **Laptop Mode** (màn hình rộng, đa cột) và **Phone Mode** (giao diện tối ưu cho màn hình cảm ứng di động).
   * **Thông tin thời gian thực**: Góc trên hiển thị chi tiết ngày giờ cập nhật dữ liệu từ PTSC PMS (`Updated: YYYY-MM-DD HH:mm:ss`).

2. **Cấu trúc 2 Tabs chuyên biệt**:
   * **Tab 1: Punchlist Overview (8,981 mục)**:
     * 6 Thẻ KPI: Total Punch, Category A (Đỏ), Category B (Cam), Category C (Xanh), Status Open, Status Closed (% hoàn thành).
     * Bộ lọc mạnh mẽ theo **SubSystem No**, **Tag No**, **Bộ môn (Discipline)**, và **Từ khóa tự do**.
     * Nút lọc nhanh: All Cats, Cat A, Cat B, Cat C, Open, Closed.
     * Cửa sổ xem chi tiết (Detail Modal) đầy đủ nội dung khiếm khuyết (*Defect Description*), hành động khắc phục (*Corrective Action*), người phụ trách, ngày mục tiêu...
   * **Tab 2: Checksheet Overview (33,732 mục)**:
     * 6 Thẻ KPI: Total Checksheet, Completed (Đã ký), Remaining (Còn lại), Tổng giờ định mức (Norm Mhrs), Giờ đạt được (Earned Mhrs), Số lượng phân hệ (SubSystems).
     * Bộ lọc theo **SubSystem No**, **Tag No**, **Loại ITR (CheckSheet Type)**, **Bộ môn (Discipline)**.
     * Phân loại trạng thái tức thì: Completed vs Remaining.

3. **Tiện ích xuất báo cáo & Chia sẻ**:
   * **Excel Export**: Xuất dữ liệu đang lọc ra file Excel `.xlsx` ngay tại chỗ.
   * **PDF Export**: Xuất báo cáo tóm tắt ra file PDF `.pdf` chuẩn A4 Landscape.
   * **Share & QR Code**: Tạo mã QR và link rút gọn để quét bằng camera điện thoại và xem ngay tại hiện trường.

---

### 🔄 Quy trình Tự động hóa Hàng ngày (End-to-End Auto Sync)

1. **Lập lịch Windows Task Scheduler**:
   * Chạy sớm nhất khi mở máy / đăng nhập Windows / mở khóa màn hình (hoặc lúc 06:00 AM).
2. **Tự động tải 2 file**:
   * Tải `PunchList_CPP_TOPSIDE_YYYY-MM-DD.xlsx`
   * Tải `Checksheet_CPP_TOPSIDE_YYYY-MM-DD.xlsx`
   * Lưu vào thư mục riêng `Downloads/`.
3. **Tự động đóng gói & Cập nhật Dashboard**:
   * `build_dashboard_data.py` tự động phân tích cả 2 file, nén dữ liệu và ghi thời gian cập nhật.
4. **Tự động đẩy lên Cloud**:
   * `run_daily.py` tự động chạy `git commit` & `git push` lên GitHub.
   * GitHub Pages & Vercel tự động nhận dữ liệu mới và cập nhật lên web trực tuyến.

---

### 💻 Khởi động cục bộ (Offline Local Server)

Nếu muốn xem offline khi không có mạng, chỉ cần nhấp đúp file:
* **`start_dashboard.bat`**: Mở trực tiếp Dashboard trên trình duyệt tại `http://localhost:8080`.
