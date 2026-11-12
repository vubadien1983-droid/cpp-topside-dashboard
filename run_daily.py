"""
Bộ chạy tổng hợp hàng ngày:
Tự động tải cả Punchlist và Checksheet Overview (chỉ tải nếu hôm nay chưa có file).
"""

import subprocess
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

APP_DIR = Path(__file__).resolve().parent
PYTHON = sys.executable

def run(script_name: str):
    script = APP_DIR / script_name
    print(f"=== ĐANG CHẠY: {script_name} ===")
    res = subprocess.run([PYTHON, str(script), "--once-per-day"])
    print(f"=== KẾT THÚC {script_name} (mã: {res.returncode}) ===\n")
    return res.returncode

def main():
    rc1 = run("punchlist_downloader.py")
    rc2 = run("checksheet_downloader.py")

    # Tự động cập nhật dữ liệu cho Dashboard
    print("=== TỰ ĐỘNG CẬP NHẬT DỮ LIỆU DASHBOARD ===")
    rc3 = run("build_dashboard_data.py")

    # Tự động đẩy lên GitHub & Vercel nếu có git remote
    try:
        git_check = subprocess.run(["git", "remote"], capture_output=True, text=True)
        if git_check.returncode == 0 and git_check.stdout.strip():
            print("=== TỰ ĐỘNG ĐẨY DỮ LIỆU MỚI LÊN GITHUB & VERCEL ===")
            subprocess.run(["git", "add", "static/pms_data_bundle.js", "static/pms_data.json", "static/meta.json"])
            diff_res = subprocess.run(["git", "diff", "--staged", "--quiet"])
            if diff_res.returncode != 0:
                subprocess.run(["git", "commit", "-m", "chore: auto-update daily PMS data from machine [skip ci]"])
                subprocess.run(["git", "push"])
                print("Đã push dữ liệu mới lên GitHub thành công!")
            else:
                print("Dữ liệu trên GitHub đã là mới nhất.")
    except Exception as e:
        print(f"Lưu ý Git Sync: {e}")

    sys.exit(0 if (rc1 == 0 and rc2 == 0 and rc3 == 0) else 1)

if __name__ == "__main__":
    main()
