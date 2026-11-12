"""
Tự động tải Punchlist từ PTSC PMS (PREC_ITR_PunchList_Overview).

Quy trình:
  1. Mở trang Punchlist Overview bằng profile Chrome riêng (đã đăng nhập sẵn).
  2. Nhập FacilityCode = "CPP TOPSIDE".
  3. Click "Load Data" và chờ dữ liệu tải xong (pager "1-xxxx of xxxx" ổn định).
  4. Click "Export data" -> "No Image".
  5. Lưu file vào thư mục này: PunchList_CPP_TOPSIDE_YYYY-MM-DD.xlsx

Cách dùng:
  python punchlist_downloader.py --login   # lần đầu: mở Chrome để đăng nhập & lưu phiên
  python punchlist_downloader.py --show    # chạy có hiện trình duyệt (để kiểm tra)
  python punchlist_downloader.py           # chạy ngầm (dùng cho lịch hàng ngày)
"""

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

APP_DIR = Path(__file__).resolve().parent
CONFIG_FILE = APP_DIR / "config.json"
LOG_DIR = APP_DIR / "logs"
# Profile Chrome riêng, đặt ngoài Google Drive để không bị đồng bộ
PROFILE_DIR = Path(os.environ["LOCALAPPDATA"]) / "PunchlistDownloader" / "chrome-profile"

PAGER_RE = re.compile(r"(\d+)\s*-\s*(\d+)\s+of\s+(\d+)", re.I)

log = logging.getLogger("punchlist")


def setup_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(LOG_DIR / f"run_{datetime.now():%Y-%m}.log", encoding="utf-8")
    fh.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(fh)
    if sys.stdout is not None:  # pythonw (chạy ngầm) không có console
        sh = logging.StreamHandler(sys.stdout)
        sh.setFormatter(fmt)
        log.addHandler(sh)
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def load_config() -> dict:
    with open(CONFIG_FILE, encoding="utf-8-sig") as f:
        cfg = json.load(f)
    cfg["url"] = cfg.get("punchlist_url", cfg.get("url", "https://pms-web.ptscmc.com.vn/PREC_ITR_PunchList_Overview"))
    cfg["file_prefix"] = cfg.get("punchlist_file_prefix", cfg.get("file_prefix", "PunchList_CPP_TOPSIDE"))
    d = Path(cfg.get("download_dir", "Downloads"))
    cfg["download_dir"] = d if d.is_absolute() else (APP_DIR / d).resolve()
    return cfg


def launch(p, headless: bool):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    return p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR),
        channel="chrome",  # dùng Chrome đã cài sẵn trên máy
        headless=headless,
        accept_downloads=True,
        viewport={"width": 1600, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )


def screenshot(page, name: str) -> None:
    try:
        path = LOG_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_{name}.png"
        page.screenshot(path=str(path), full_page=True)
        log.info("Đã chụp màn hình: %s", path.name)
    except Exception:
        pass


# --------------------------------------------------------------------------- #
# Các bước thao tác
# --------------------------------------------------------------------------- #
def get_credentials(cfg):
    """Mật khẩu lấy từ Windows Credential Manager (không lưu dạng chữ trong file)."""
    user = cfg.get("username")
    if not user:
        return None, None
    try:
        import keyring
        pwd = keyring.get_password("PTSC_PMS", user)
    except Exception:
        pwd = None
    return user, pwd


def auto_login(page, cfg) -> None:
    user, pwd = get_credentials(cfg)
    if not (user and pwd):
        raise RuntimeError("Phiên hết hạn và chưa lưu tài khoản (chạy 1_login_setup.bat)")
    log.info("Phiên hết hạn -> tự đăng nhập bằng tài khoản %s", user)
    u = page.locator("input[aria-label=Username]").first
    u.wait_for(state="visible", timeout=60_000)
    u.fill(user)
    page.locator("input[aria-label=Password]").first.fill(pwd)
    page.locator("button.login-button, button[aria-label=Login]").first.click()
    log.info("Đã gửi thông tin đăng nhập")

    # Bước 2: màn hình "Select project and facility"
    page.get_by_text("Select project and facility").first.wait_for(timeout=60_000)
    code = cfg["facility_code"]
    wrap = page.locator(".select-wrapper").filter(
        has=page.locator(f"option[value='{code}']")).first
    wrap.wait_for(state="attached", timeout=30_000)
    trigger = wrap.locator("input.select-dropdown").first
    if (trigger.input_value() or "").strip().upper() != code.upper():
        trigger.click()
        ul_id = trigger.get_attribute("data-target")
        page.locator(f"ul[id='{ul_id}'] li").filter(
            has_text=re.compile(rf"^\s*{re.escape(code)}\s*$")).first.click()
        page.wait_for_timeout(1000)
    log.info("Chọn Facility ở màn hình đăng nhập: %s", trigger.input_value())
    page.locator("button[aria-label=Next]").first.click()
    page.wait_for_url(lambda url: "/login" not in url.lower(), timeout=60_000)
    log.info("Đăng nhập thành công")
    if "punchlist" not in page.url.lower():
        page.goto(cfg["url"], wait_until="domcontentloaded", timeout=120_000)


def open_page(page, cfg) -> None:
    log.info("Mở trang: %s", cfg["url"])
    page.goto(cfg["url"], wait_until="domcontentloaded", timeout=120_000)
    load_btn = page.get_by_text("Load Data", exact=True).first
    pwd_box = page.locator("input[type=password]").first
    # Blazor WASM cần thời gian khởi động; chờ trang chính hoặc trang login
    deadline = time.time() + 180
    while time.time() < deadline:
        if load_btn.is_visible():
            return
        if "/login" in page.url.lower() and pwd_box.is_visible():
            auto_login(page, cfg)
            load_btn.wait_for(state="visible", timeout=180_000)
            return
        page.wait_for_timeout(1000)
    screenshot(page, "page_not_ready")
    raise RuntimeError("Không thấy nút 'Load Data' sau 3 phút")


def set_facility(page, cfg) -> None:
    code = cfg["facility_code"]
    inp = page.locator("input[aria-label=FacilityCode]:visible").first
    inp.wait_for(state="visible", timeout=60_000)
    current = (inp.input_value() or "").strip()
    if current.upper() == code.upper():
        log.info("FacilityCode đã là '%s'", current)
        return

    log.info("Nhập FacilityCode = '%s' (đang là '%s')", code, current)
    inp.click()
    inp.fill(code)
    inp.press("Tab")  # Blazor cập nhật giá trị khi sự kiện change xảy ra
    page.wait_for_timeout(1000)

    value = (inp.input_value() or "").strip()
    if value.upper() != code.upper():
        screenshot(page, "facility_not_set")
        raise RuntimeError(f"Không nhập được FacilityCode (giá trị hiện tại: '{value}')")
    log.info("FacilityCode OK: '%s'", value)


STATUS_JS = r"""() => {
  const m = document.body.textContent.match(/\d+\s*-\s*\d+\s+of\s+\d+/i);
  const busy = [...document.querySelectorAll('.preloader-wrapper')]
                 .some(e => e.offsetParent !== null);
  return [m ? m[0] : '', busy];
}"""


def page_status(page):
    """(pager, busy). Trang có thể 'đơ' khi đang dựng bảng -> coi như đang bận."""
    try:
        pager, is_busy = page.evaluate(STATUS_JS)
        return pager, is_busy
    except Exception:
        return "", True


def pager_text(page) -> str:
    return page_status(page)[0]


def busy(page) -> bool:
    return page_status(page)[1]


def load_data(page, cfg) -> int:
    log.info("Click 'Load Data'")
    before = pager_text(page)
    page.get_by_text("Load Data", exact=True).first.click()

    deadline = time.time() + cfg["load_timeout_sec"]
    last, stable_since = None, None
    time.sleep(3)
    while time.time() < deadline:
        cur, is_busy = page_status(page)
        if cur and not is_busy:
            if cur != last:
                last, stable_since = cur, time.time()
            elif time.time() - stable_since >= 8:  # ổn định 8 giây => tải xong
                total = int(PAGER_RE.search(cur).group(3))
                log.info("Dữ liệu đã tải xong: %s (trước đó: '%s')", cur, before or "-")
                return total
        else:
            last, stable_since = None, None
        time.sleep(2)

    screenshot(page, "load_timeout")
    raise RuntimeError("Hết thời gian chờ Load Data")


def export_data(page, cfg) -> Path:
    out_dir: Path = cfg["download_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info("Click 'Export data' -> '%s'", cfg["export_option"])
    with page.expect_download(timeout=cfg["download_timeout_sec"] * 1000) as dl_info:
        page.locator("button[aria-label='Export data']").first.click()
        opt = page.get_by_text(cfg["export_option"], exact=True).first
        opt.wait_for(state="visible", timeout=30_000)
        opt.click()
        log.info("Đang chờ file tải về...")
    dl = dl_info.value

    ext = Path(dl.suggested_filename).suffix or ".xlsx"
    target = out_dir / f"{cfg['file_prefix']}_{datetime.now():%Y-%m-%d}{ext}"
    if target.exists():
        target = out_dir / f"{cfg['file_prefix']}_{datetime.now():%Y-%m-%d_%H%M}{ext}"
    dl.save_as(str(target))
    size = target.stat().st_size
    if size == 0:
        raise RuntimeError("File tải về rỗng (0 byte)")
    log.info("ĐÃ LƯU: %s (%.1f KB, tên gốc: %s)", target.name, size / 1024, dl.suggested_filename)
    return target


def cleanup_old(cfg) -> None:
    days = int(cfg.get("keep_days") or 0)
    if days <= 0:
        return
    cutoff = datetime.now() - timedelta(days=days)
    for f in cfg["download_dir"].glob(f"{cfg['file_prefix']}_*"):
        if datetime.fromtimestamp(f.stat().st_mtime) < cutoff:
            f.unlink()
            log.info("Xoá file cũ: %s", f.name)


# --------------------------------------------------------------------------- #
def do_login(cfg) -> None:
    with sync_playwright() as p:
        ctx = launch(p, headless=False)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.goto(cfg["url"])
        print("\n>>> Hãy ĐĂNG NHẬP trong cửa sổ Chrome vừa mở (tick 'Remember me' nếu có).")
        print(">>> Khi đã thấy trang Punchlist Overview, quay lại đây và nhấn ENTER để lưu phiên.")
        input()
        ctx.close()
    print("Đã lưu phiên đăng nhập. Giờ có thể chạy 2_run_test.bat")


def do_run(cfg, headless: bool) -> int:
    log.info("=" * 60)
    log.info("BẮT ĐẦU tải Punchlist (%s)", cfg["facility_code"])
    with sync_playwright() as p:
        ctx = launch(p, headless=headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            open_page(page, cfg)
            set_facility(page, cfg)
            total = load_data(page, cfg)
            log.info("Tổng số dòng: %d", total)
            export_data(page, cfg)
            cleanup_old(cfg)
            log.info("HOÀN THÀNH")
            return 0
        except Exception as e:
            log.error("LỖI: %s", e)
            screenshot(page, "error")
            return 1
        finally:
            ctx.close()


def wait_for_network(timeout_sec: int = 600) -> bool:
    """Sau khi mở máy, Wi-Fi/VPN và Google Drive cần thời gian kết nối."""
    import socket
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            socket.create_connection(("pms-web.ptscmc.com.vn", 443), timeout=10).close()
            return True
        except OSError:
            time.sleep(15)
    return False


def main() -> None:
    setup_logging()
    ap = argparse.ArgumentParser()
    ap.add_argument("--login", action="store_true", help="Mở Chrome để đăng nhập lần đầu")
    ap.add_argument("--show", action="store_true", help="Hiện trình duyệt khi chạy")
    ap.add_argument("--retries", type=int, default=2, help="Số lần thử lại khi lỗi")
    ap.add_argument("--once-per-day", action="store_true",
                    help="Bỏ qua nếu hôm nay đã tải (dùng cho lịch khi mở máy)")
    args = ap.parse_args()
    cfg = load_config()

    if args.login:
        do_login(cfg)
        return

    if args.once_per_day:
        today = f"{cfg['file_prefix']}_{datetime.now():%Y-%m-%d}"
        if any(cfg["download_dir"].glob(today + "*")):
            log.info("Hôm nay đã có file %s* -> bỏ qua", today)
            sys.exit(0)
        if not wait_for_network():
            log.error("Không có mạng tới PMS -> dừng")
            sys.exit(1)

    headless = cfg.get("headless", True) and not args.show
    for attempt in range(1, args.retries + 2):
        rc = do_run(cfg, headless)
        if rc == 0:
            sys.exit(0)
        if attempt <= args.retries:
            log.info("Thử lại sau 60 giây (lần %d)...", attempt + 1)
            time.sleep(60)
    sys.exit(1)


if __name__ == "__main__":
    main()
