"""
Xây dựng dữ liệu Dashboard từ 2 file Excel mới nhất trong thư mục Downloads/:
  - PunchList_CPP_TOPSIDE_*.xlsx
  - Checksheet_CPP_TOPSIDE_*.xlsx

Sinh ra:
  - static/pms_data.json       (dùng cho fetch / API / đồng bộ)
  - static/pms_data_bundle.js  (nạp trực tiếp vào index.html để chạy cực nhanh cả online & offline)
"""

import datetime
import io
import json
import os
import re
import sys
from pathlib import Path

import openpyxl

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

APP_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = APP_DIR / "Downloads"
STATIC_DIR = APP_DIR / "static"


def clean_str(val) -> str:
    if val is None:
        return ""
    if isinstance(val, (datetime.datetime, datetime.date)):
        return val.strftime("%d-%m-%Y")
    s = str(val).replace("\xa0", " ").strip()
    # Nếu là chuỗi datetime kiểu '2026-07-08 13:54:12.897000' -> chuyển về DD-MM-YYYY
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)}"
    return s


def clean_datetime_full(val) -> str:
    if val is None:
        return ""
    if isinstance(val, datetime.datetime):
        return val.strftime("%d-%m-%Y %H:%M")
    if isinstance(val, datetime.date):
        return val.strftime("%d-%m-%Y")
    s = str(val).replace("\xa0", " ").strip()
    m = re.match(r"^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}:\d{2})", s)
    if m:
        return f"{m.group(3)}-{m.group(2)}-{m.group(1)} {m.group(4)}"
    return s


def derive_system_no(sub_no: str) -> str:
    if not sub_no:
        return ""
    parts = sub_no.split("-")
    if len(parts) >= 2:
        return f"{parts[0]}-{parts[1]}"
    return sub_no


def find_latest_file(prefix: str) -> Path | None:
    files = sorted(
        DOWNLOADS_DIR.glob(f"{prefix}_*.xlsx"),
        key=lambda p: (p.name, p.stat().st_mtime),
        reverse=True,
    )
    return files[0] if files else None


class StringPool:
    def __init__(self):
        self.pool = [""]
        self.index = {"": 0}

    def add(self, s: str) -> int:
        s = s or ""
        idx = self.index.get(s)
        if idx is None:
            idx = len(self.pool)
            self.pool.append(s)
            self.index[s] = idx
        return idx


def build_data() -> dict:
    STATIC_DIR.mkdir(parents=True, exist_ok=True)

    pl_file = find_latest_file("PunchList_CPP_TOPSIDE")
    cs_file = find_latest_file("Checksheet_CPP_TOPSIDE")

    if not pl_file or not cs_file:
        raise FileNotFoundError(
            f"Không tìm thấy đủ 2 file trong {DOWNLOADS_DIR} (PunchList={pl_file}, Checksheet={cs_file})"
        )

    pl_mtime = datetime.datetime.fromtimestamp(pl_file.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    cs_mtime = datetime.datetime.fromtimestamp(cs_file.stat().st_mtime).strftime("%Y-%m-%d %H:%M:%S")
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    print(f"Đang đọc Checksheet: {cs_file.name} (cập nhật: {cs_mtime})...")
    wb_cs = openpyxl.load_workbook(io.BytesIO(cs_file.read_bytes()), data_only=True)
    ws_cs = wb_cs.active

    sub_desc_map = {}
    cs_pool = StringPool()
    cs_rows = []

    # Checksheet columns (1-based):
    # 2: No, 3: SubSystemNo, 4: SubSystemDescription, 5: TagNo, 6: TagDescription,
    # 7: Discipline, 8: Checksheet Type, 9: CompleteDate, 10: PlanFinish,
    # 11: Norm, 12: Phase, 13: Location, 14: SubContractor
    for r in range(2, ws_cs.max_row + 1):
        no_val = ws_cs.cell(r, 2).value
        sub_no = clean_str(ws_cs.cell(r, 3).value)
        sub_desc = clean_str(ws_cs.cell(r, 4).value)
        if sub_no and sub_desc and sub_no not in sub_desc_map:
            sub_desc_map[sub_no] = sub_desc

        tag_no = clean_str(ws_cs.cell(r, 5).value)
        if no_val is None and not tag_no:
            continue

        tag_desc = clean_str(ws_cs.cell(r, 6).value)
        disc = clean_str(ws_cs.cell(r, 7).value) or "Unassigned"
        cs_type = clean_str(ws_cs.cell(r, 8).value)
        comp_date = clean_str(ws_cs.cell(r, 9).value)
        plan_date = clean_str(ws_cs.cell(r, 10).value)
        try:
            norm = float(ws_cs.cell(r, 11).value or 0)
            if norm.is_integer():
                norm = int(norm)
        except Exception:
            norm = 0
        phase = clean_str(ws_cs.cell(r, 12).value)
        loc = clean_str(ws_cs.cell(r, 13).value)
        contractor = clean_str(ws_cs.cell(r, 14).value)

        cs_rows.append([
            int(no_val) if str(no_val or "").isdigit() else clean_str(no_val),
            cs_pool.add(sub_no),
            tag_no,
            cs_pool.add(tag_desc),
            cs_pool.add(disc),
            cs_pool.add(cs_type),
            cs_pool.add(comp_date),
            cs_pool.add(plan_date),
            norm,
            cs_pool.add(phase),
            cs_pool.add(loc),
            cs_pool.add(contractor),
        ])

    print(f" -> Đã trích xuất {len(cs_rows):,} checksheets trên {len(sub_desc_map)} SubSystems.")

    print(f"Đang đọc Punchlist: {pl_file.name} (cập nhật: {pl_mtime})...")
    wb_pl = openpyxl.load_workbook(io.BytesIO(pl_file.read_bytes()), data_only=True)
    ws_pl = wb_pl.active

    pl_pool = StringPool()
    pl_rows = []

    # Punchlist columns (1-based):
    # 2: SystemNo, 3: SubSystemNo, 4: PunchListNo, 5: PunchListRaisedNo,
    # 6: PackageName, 7: TagNo, 8: TagDescription, 9: DrawingNo,
    # 10: Category, 11: Status, 12: OpenDate, 13: ClosedDate,
    # 14: ActionBy, 15: MRIRNo, 16: ActionGroup, 17: DisciplineCode,
    # 18: DefectDescription, 19: CorrectiveAction, 20: RaiseBy, 21: RaiseDate,
    # 22: ExpectedMhrs, 23: Expected Clearance Date, 24: VendorRequired, 25: VendorName,
    # 26: Vendor Expected Date, 27: MaterialRequired, 28: MaterialDescription,
    # 29: Material Expected Date, 30: Phase, 31: Location, 32: Source
    for r in range(2, ws_pl.max_row + 1):
        pl_no = clean_str(ws_pl.cell(r, 4).value)
        if not pl_no:
            continue

        sys_no = clean_str(ws_pl.cell(r, 2).value)
        sub_no = clean_str(ws_pl.cell(r, 3).value)
        if not sys_no and sub_no:
            sys_no = derive_system_no(sub_no)

        raised_no = clean_str(ws_pl.cell(r, 5).value)
        pkg_name = clean_str(ws_pl.cell(r, 6).value)
        tag_no = clean_str(ws_pl.cell(r, 7).value)
        tag_desc = clean_str(ws_pl.cell(r, 8).value)
        dwg_no = clean_str(ws_pl.cell(r, 9).value)
        cat = clean_str(ws_pl.cell(r, 10).value).upper() or "B"
        status = clean_str(ws_pl.cell(r, 11).value) or "Open"
        open_date = clean_str(ws_pl.cell(r, 12).value)
        closed_date = clean_str(ws_pl.cell(r, 13).value)
        action_by = clean_str(ws_pl.cell(r, 14).value)
        mrir_no = clean_str(ws_pl.cell(r, 15).value)
        action_grp = clean_str(ws_pl.cell(r, 16).value)
        disc = clean_str(ws_pl.cell(r, 17).value) or "Unassigned"
        defect = clean_str(ws_pl.cell(r, 18).value)
        corrective = clean_str(ws_pl.cell(r, 19).value)
        raise_by = clean_str(ws_pl.cell(r, 20).value)
        raise_date = clean_str(ws_pl.cell(r, 21).value)
        mhrs = clean_str(ws_pl.cell(r, 22).value)
        target_date = clean_str(ws_pl.cell(r, 23).value)
        vendor_req = clean_str(ws_pl.cell(r, 24).value)
        vendor_name = clean_str(ws_pl.cell(r, 25).value)
        mat_req = clean_str(ws_pl.cell(r, 27).value)
        mat_desc = clean_str(ws_pl.cell(r, 28).value)
        phase = clean_str(ws_pl.cell(r, 30).value)
        loc = clean_str(ws_pl.cell(r, 31).value)
        source = clean_str(ws_pl.cell(r, 32).value)

        pl_rows.append([
            pl_pool.add(sys_no),
            pl_pool.add(sub_no),
            pl_no,
            pl_pool.add(raised_no),
            pl_pool.add(pkg_name),
            tag_no,
            pl_pool.add(tag_desc),
            pl_pool.add(dwg_no),
            cat,
            pl_pool.add(status),
            pl_pool.add(open_date),
            pl_pool.add(closed_date),
            pl_pool.add(action_by),
            pl_pool.add(mrir_no),
            pl_pool.add(action_grp),
            pl_pool.add(disc),
            pl_pool.add(defect),
            pl_pool.add(corrective),
            pl_pool.add(raise_by),
            pl_pool.add(raise_date),
            pl_pool.add(mhrs),
            pl_pool.add(target_date),
            pl_pool.add(vendor_req),
            pl_pool.add(vendor_name),
            pl_pool.add(mat_req),
            pl_pool.add(mat_desc),
            pl_pool.add(phase),
            pl_pool.add(loc),
            pl_pool.add(source),
        ])

    print(f" -> Đã trích xuất {len(pl_rows):,} punch items.")

    data_timestamp = max(pl_mtime, cs_mtime)

    # Check if existing data is already up-to-date with identical files
    meta_path = STATIC_DIR / "meta.json"
    if meta_path.exists():
        try:
            old_meta = json.loads(meta_path.read_text(encoding="utf-8"))
            if (
                old_meta.get("punchlist_file") == pl_file.name
                and old_meta.get("punchlist_updated") == pl_mtime
                and old_meta.get("checksheet_file") == cs_file.name
                and old_meta.get("checksheet_updated") == cs_mtime
            ):
                now_str = old_meta.get("last_updated") or now_str
        except Exception:
            pass

    payload = {
        "meta": {
            "project": "VIETNAM BLOCK B GAS PROJECT • EPC#1",
            "facility": "CPP TOPSIDE",
            "last_updated": now_str,
            "data_timestamp": data_timestamp,
            "punchlist_file": pl_file.name,
            "punchlist_updated": pl_mtime,
            "punchlist_count": len(pl_rows),
            "checksheet_file": cs_file.name,
            "checksheet_updated": cs_mtime,
            "checksheet_count": len(cs_rows),
        },
        "subsystems": sub_desc_map,
        "punchlist": {
            "pool": pl_pool.pool,
            "rows": pl_rows,
        },
        "checksheet": {
            "pool": cs_pool.pool,
            "rows": cs_rows,
        },
    }

    json_str = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    json_path = STATIC_DIR / "pms_data.json"
    json_path.write_text(json_str, encoding="utf-8")

    bundle_path = STATIC_DIR / "pms_data_bundle.js"
    bundle_path.write_text(f"window.PMS_INITIAL_DATA = {json_str};\n", encoding="utf-8")

    meta_path = STATIC_DIR / "meta.json"
    meta_path.write_text(json.dumps(payload["meta"], ensure_ascii=False, indent=2), encoding="utf-8")

    print(
        f"HOÀN TẤT: pms_data.json ({len(json_str.encode('utf-8')) / 1024:.1f} KB), "
        f"last_updated = {now_str}"
    )
    return payload["meta"]


if __name__ == "__main__":
    build_data()
