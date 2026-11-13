"""
Tự động tải Checksheet Overview từ PTSC PMS (PREC_ITR_Checksheet_Overview_Viewer).

Quy trình:
  1. Mở trang Checksheet Overview bằng profile Chrome riêng (đã lưu phiên/tự đăng nhập).
  2. Nhập FacilityCode = "CPP TOPSIDE".
  3. Click "Load Data" và chờ dữ liệu tải xong (pager "1-xxx of xxxxx" ổn định).
  4. Click "Export data" (tải trực tiếp file Excel).
  5. Lưu file vào thư mục Downloads: Checksheet_CPP_TOPSIDE_YYYY-MM-DD.xlsx
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
PROFILE_DIR = Path(os.environ["LOCALAPPDATA"]) / "PunchlistDownloader" / "chrome-profile"

PAGER_RE = re.compile(r"(\d+)\s*-\s*(\d+)\s+of\s+(\d+)", re.I)

STATUS_JS = r"""() => {
  const m = document.body.textContent.match(/\d+\s*-\s*\d+\s+of\s+\d+/i);
  const busy = [...document.querySelectorAll('.preloader-wrapper')]
                 .some(e => e.offsetParent !== null);
  return [m ? m[0] : '', busy];
}"""

log = logging.getLogger("checksheet")


def setup_logging() -> None:
    LOG_DIR.mkdir(exist_ok=True)
    fmt = logging.Formatter("%(asctime)s [%(levelname)s] %(message)s")
    fh = logging.FileHandler(LOG_DIR / f"checksheet_{datetime.now():%Y-%m}.log", encoding="utf-8")
    fh.setFormatter(fmt)
    log.setLevel(logging.INFO)
    log.addHandler(fh)
    if sys.stdout is not None:
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
    cfg["url"] = cfg.get("checksheet_url", "https://pms-web.ptscmc.com.vn/PREC_ITR_Checksheet_Overview_Viewer")
    cfg["file_prefix"] = cfg.get("checksheet_file_prefix", "Checksheet_CPP_TOPSIDE")
    d = Path(cfg.get("download_dir", "Downloads"))
    cfg["download_dir"] = d if d.is_absolute() else (APP_DIR / d).resolve()
    return cfg


def launch(p, headless: bool):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    return p.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR),
        channel="chrome",
        headless=headless,
        accept_downloads=True,
        viewport={"width": 1600, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )


def screenshot(page, name: str) -> None:
    try:
        path = LOG_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_checksheet_{name}.png"
        page.screenshot(path=str(path), full_page=True)
        log.info("Đã chụp màn hình: %s", path.name)
    except Exception:
        pass


def get_credentials(cfg):
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
        raise RuntimeError("Phiên hết hạn và chưa lưu tài khoản.")
    log.info("Phiên hết hạn -> tự đăng nhập bằng tài khoản %s", user)
    u = page.locator("input[aria-label=Username]").first
    u.wait_for(state="visible", timeout=60_000)
    u.fill(user)
    page.locator("input[aria-label=Password]").first.fill(pwd)
    page.locator("button.login-button, button[aria-label=Login]").first.click()
    log.info("Đã gửi thông tin đăng nhập")

    # Màn hình "Select project and facility" nếu có
    try:
        page.get_by_text("Select project and facility").first.wait_for(timeout=20_000)
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
    except Exception:
        pass

    page.wait_for_url(lambda url: "/login" not in url.lower(), timeout=60_000)
    log.info("Đăng nhập thành công")
    if "checksheet" not in page.url.lower():
        page.goto(cfg["url"], wait_until="domcontentloaded", timeout=120_000)


def open_page(page, cfg) -> None:
    log.info("Mở trang: %s", cfg["url"])
    page.goto(cfg["url"], wait_until="domcontentloaded", timeout=120_000)
    load_btn = page.get_by_text("Load Data", exact=True).first
    pwd_box = page.locator("input[type=password]").first

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
    inp.press("Tab")
    page.wait_for_timeout(1000)

    value = (inp.input_value() or "").strip()
    if value.upper() != code.upper():
        screenshot(page, "facility_not_set")
        raise RuntimeError(f"Không nhập được FacilityCode (giá trị hiện tại: '{value}')")
    log.info("FacilityCode OK: '%s'", value)


def page_status(page):
    try:
        pager, is_busy = page.evaluate(STATUS_JS)
        return pager, is_busy
    except Exception:
        return "", True


def load_data(page, cfg) -> int:
    log.info("Click 'Load Data'")
    page.get_by_text("Load Data", exact=True).first.click()

    deadline = time.time() + cfg["load_timeout_sec"]
    last, stable_since = None, None
    time.sleep(3)
    while time.time() < deadline:
        cur, is_busy = page_status(page)
        if cur and not is_busy:
            if cur != last:
                last, stable_since = cur, time.time()
            elif time.time() - stable_since >= 8:
                total = int(PAGER_RE.search(cur).group(3))
                log.info("Dữ liệu đã tải xong: %s", cur)
                return total
        else:
            last, stable_since = None, None
        time.sleep(2)

    screenshot(page, "load_timeout")
    raise RuntimeError("Hết thời gian chờ Load Data")


def export_data(page, cfg) -> Path:
    out_dir: Path = cfg["download_dir"]
    out_dir.mkdir(parents=True, exist_ok=True)

    log.info("Click 'Export data'")
    exp_btn = page.locator("button[aria-label='Export data']").first
    exp_btn.wait_for(state="visible", timeout=60_000)

    with page.expect_download(timeout=cfg["download_timeout_sec"] * 1000) as dl_info:
        exp_btn.click()
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


def wait_for_network(timeout_sec: int = 600) -> bool:
    import socket
    deadline = time.time() + timeout_sec
    while time.time() < deadline:
        try:
            socket.create_connection(("pms-web.ptscmc.com.vn", 443), timeout=10).close()
            return True
        except OSError:
            time.sleep(15)
    return False


def do_run(cfg, headless: bool) -> int:
    log.info("=" * 60)
    log.info("BẮT ĐẦU tải Checksheet (%s)", cfg["facility_code"])
    with sync_playwright() as p:
        ctx = launch(p, headless=headless)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            open_page(page, cfg)
            set_facility(page, cfg)
            total = load_data(page, cfg)
            log.info("Tổng số checksheets: %d", total)
            export_data(page, cfg)
            cleanup_old(cfg)
            log.info("HOÀN THÀNH TẢI CHECKSHEET")
            return 0
        except Exception as e:
            log.error("LỖI: %s", e)
            screenshot(page, "error")
            return 1
        finally:
            ctx.close()


def main() -> None:
    setup_logging()
    ap = argparse.ArgumentParser()
    ap.add_argument("--show", action="store_true", help="Hiện trình duyệt khi chạy")
    ap.add_argument("--retries", type=int, default=2, help="Số lần thử lại khi lỗi")
    ap.add_argument("--once-per-day", action="store_true",
                    help="Bỏ qua nếu đã tải trong phiên sáng (<12:25) hoặc phiên chiều (>=12:25)")
    ap.add_argument("--force", action="store_true",
                    help="Ép tải lại bất kể hôm nay đã có file hay chưa")
    args = ap.parse_args()
    cfg = load_config()

    if args.once_per_day and not args.force:
        now = datetime.now()
        today_prefix = f"{cfg['file_prefix']}_{now:%Y-%m-%d}"
        today_files = list(cfg["download_dir"].glob(today_prefix + "*"))
        midday_cutoff = now.replace(hour=12, minute=25, second=0, microsecond=0)
        if now < midday_cutoff:
            if today_files:
                log.info("Phiên sáng (<12:25) hôm nay đã có file %s* -> bỏ qua", today_prefix)
                sys.exit(0)
        else:
            afternoon_done = any(
                datetime.fromtimestamp(f.stat().st_mtime) >= midday_cutoff for f in today_files
            )
            if afternoon_done:
                log.info("Phiên trưa/chiều (>=12:25) hôm nay đã có file %s* -> bỏ qua", today_prefix)
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
