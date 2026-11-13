"""
Bộ chạy tổng hợp hàng ngày:
Tự động tải cả Punchlist và Checksheet Overview (chỉ tải nếu hôm nay chưa có file).
Sau đó build lại dữ liệu dashboard và tự động đồng bộ lên GitHub (kích hoạt Deploy GitHub Pages).
"""

import logging
import os
import subprocess
import sys
from datetime import datetime
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
os.chdir(APP_DIR)

LOG_DIR = APP_DIR / "logs"
LOG_DIR.mkdir(exist_ok=True)

fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("daily_runner")
log.setLevel(logging.INFO)

fh = logging.FileHandler(LOG_DIR / f"daily_runner_{datetime.now():%Y-%m}.log", encoding="utf-8")
fh.setFormatter(fmt)
log.addHandler(fh)

if sys.stdout is not None:
    sh = logging.StreamHandler(sys.stdout)
    sh.setFormatter(fmt)
    log.addHandler(sh)

try:
    if sys.stdout is not None:
        sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass


def _resolve_background_python() -> str:
    exe = Path(sys.executable)
    if os.name == "nt" and exe.name.lower() == "python.exe":
        pw = exe.with_name("pythonw.exe")
        if pw.exists():
            return str(pw)
    return str(exe)


PYTHON = _resolve_background_python()

# Chạy ngầm hoàn toàn trên Windows: không tạo / không nháy cửa sổ Terminal cho subprocess & git
NO_WINDOW_KWARGS = {}
if os.name == "nt":
    _si = subprocess.STARTUPINFO()
    _si.dwFlags |= subprocess.STARTF_USESHOWWINDOW
    _si.wShowWindow = subprocess.SW_HIDE
    NO_WINDOW_KWARGS = {
        "creationflags": subprocess.CREATE_NO_WINDOW,
        "startupinfo": _si,
    }


def run(script_name: str) -> int:
    script = APP_DIR / script_name
    log.info("=== ĐANG CHẠY: %s ===", script_name)
    args = [PYTHON, str(script)]
    if script_name != "build_dashboard_data.py":
        args.append("--once-per-day")
    res = subprocess.run(
        args,
        cwd=APP_DIR,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        **NO_WINDOW_KWARGS,
    )
    if res.stdout and res.stdout.strip():
        for line in res.stdout.strip().splitlines()[-10:]:
            log.info("[%s] %s", script_name, line)
    if res.stderr and res.stderr.strip():
        for line in res.stderr.strip().splitlines()[-10:]:
            log.warning("[%s stderr] %s", script_name, line)
    log.info("=== KẾT THÚC %s (mã: %d) ===", script_name, res.returncode)
    return res.returncode


def _run_git(git_args: list[str], check: bool = False):
    env = {**os.environ, "GIT_TERMINAL_PROMPT": "0", "GCM_INTERACTIVE": "never"}
    return subprocess.run(
        ["git", *git_args],
        cwd=APP_DIR,
        env=env,
        stdin=subprocess.DEVNULL,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        check=check,
        **NO_WINDOW_KWARGS,
    )


def sync_git():
    try:
        git_check = _run_git(["remote"])
        if git_check.returncode == 0 and git_check.stdout.strip():
            log.info("=== TỰ ĐỘNG ĐẨY DỮ LIỆU MỚI LÊN GITHUB ===")
            _run_git(["add", "static/pms_data_bundle.js", "static/pms_data.json", "static/meta.json"], check=True)
            diff_res = _run_git(["diff", "--staged", "--quiet"])
            if diff_res.returncode != 0:
                commit_res = _run_git(["commit", "-m", "chore: auto-update daily PMS data from machine"])
                log.info("Git commit: %s", commit_res.stdout.strip())
                push_res = _run_git(["push"])
                if push_res.returncode == 0:
                    log.info("Đã push dữ liệu mới lên GitHub thành công! (GitHub Actions đang tự deploy)")
                else:
                    log.error("Git push thất bại: %s", push_res.stderr.strip())
            else:
                log.info("Dữ liệu trên GitHub đã là mới nhất.")
    except Exception as e:
        log.error("Lỗi Git Sync: %s", e)

def main():
    log.info("############################################################")
    log.info("BẮT ĐẦU CHU KỲ TẢI & CẬP NHẬT DỮ LIỆU HÀNG NGÀY")
    log.info("############################################################")

    rc1 = run("punchlist_downloader.py")
    rc2 = run("checksheet_downloader.py")

    log.info("=== TỰ ĐỘNG CẬP NHẬT DỮ LIỆU DASHBOARD ===")
    rc3 = run("build_dashboard_data.py")

    if rc3 == 0:
        sync_git()

    success = (rc1 == 0 and rc2 == 0 and rc3 == 0)
    log.info("HOÀN TẤT CHU KỲ (Punchlist: %d, Checksheet: %d, Build: %d) -> Thành công: %s", rc1, rc2, rc3, success)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
