// CPP TOPSIDE — Punchlist & Checksheet Dashboard Engine
// Designed following Project SOI0007689 SQCL Dashboard
(function () {
  "use strict";

  // Global State
  const state = {
    data: window.PMS_INITIAL_DATA || null,
    activeTab: "punchlist", // 'punchlist' or 'checksheet'
    deviceMode: window.innerWidth < 768 ? "phone" : "laptop",
    filters: {
      punchlist: {
        search: "",
        subSystem: "ALL",
        tag: "",
        category: "ALL",
        status: "ALL",
        discipline: "ALL",
        page: 1,
        pageSize: 50,
      },
      checksheet: {
        search: "",
        subSystem: "ALL",
        tag: "",
        status: "ALL", // 'ALL', 'Completed', 'Remaining'
        discipline: "ALL",
        checkType: "ALL",
        page: 1,
        pageSize: 50,
      },
    },
    charts: {},
  };

  function esc(s) {
    if (s === null || s === undefined) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // Helper to resolve string from pool
  function resolvePl(row, idx) {
    const pool = state.data.punchlist.pool;
    const v = row[idx];
    return typeof v === "number" ? pool[v] || "" : (v || "");
  }

  function resolveCs(row, idx) {
    const pool = state.data.checksheet.pool;
    const v = row[idx];
    return typeof v === "number" ? pool[v] || "" : (v || "");
  }

  // --- Initialize Application ---
  window.addEventListener("DOMContentLoaded", () => {
    initDeviceMode();
    if (state.data) {
      renderAll();
    } else {
      fetch("./static/pms_data.json")
        .then((r) => r.json())
        .then((data) => {
          state.data = data;
          renderAll();
        })
        .catch((err) => {
          document.getElementById("app-content").innerHTML = `
            <div class="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-6 text-center">
              <i class="fas fa-exclamation-triangle text-3xl mb-2 text-rose-600"></i>
              <h3 class="font-bold text-base">Không thể nạp dữ liệu Dashboard</h3>
              <p class="text-xs mt-1">${esc(err.message)}</p>
              <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow">
                Thử lại
              </button>
            </div>
          `;
        });
    }
  });

  // --- Device Mode Toggle ---
  function initDeviceMode() {
    setDeviceMode(state.deviceMode, false);
  }

  window.setDeviceMode = function (mode, reRender = true) {
    state.deviceMode = mode;
    if (mode === "phone") {
      document.body.classList.add("phone-mode-active");
    } else {
      document.body.classList.remove("phone-mode-active");
    }
    renderHeaderControls();
    if (reRender) renderTabContent();
  };

  function renderHeaderControls() {
    const toggleEl = document.getElementById("device-mode-toggle");
    if (toggleEl) {
      const isPhone = state.deviceMode === "phone";
      toggleEl.innerHTML = `
        <button onclick="setDeviceMode('laptop')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
          !isPhone ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
        }" title="Chế độ Màn hình Rộng (Laptop / Desktop)">
          <i class="fas fa-laptop text-xs"></i> <span class="hidden sm:inline">Laptop</span>
        </button>
        <button onclick="setDeviceMode('phone')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
          isPhone ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
        }" title="Chế độ Điện thoại (Mobile Screen)">
          <i class="fas fa-mobile-screen text-xs"></i> <span class="hidden sm:inline">Phone</span>
        </button>
      `;
    }

    if (state.data && state.data.meta) {
      const upEl = document.getElementById("header-updated-text");
      if (upEl) {
        upEl.textContent = `Updated: ${state.data.meta.last_updated || "Hôm nay"}`;
      }
    }
  }

  // --- Tab Bar ---
  window.switchMainTab = function (tabName) {
    if (state.activeTab === tabName) return;
    state.activeTab = tabName;
    renderTabBar();
    renderTabContent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function renderTabBar() {
    const bar = document.getElementById("multi-tab-bar");
    if (!bar || !state.data) return;

    const plCount = state.data.meta.punchlist_count || state.data.punchlist.rows.length;
    const csCount = state.data.meta.checksheet_count || state.data.checksheet.rows.length;

    const isPl = state.activeTab === "punchlist";
    const isCs = state.activeTab === "checksheet";

    bar.innerHTML = `
      <div class="flex items-center gap-2">
        <button
          onclick="switchMainTab('punchlist')"
          class="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2.5 transition-all shadow-sm ${
            isPl
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-clipboard-list text-sm"></i>
          <span>1. Punchlist Overview</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${
            isPl ? "bg-white/20 text-white" : "bg-slate-700 text-slate-300"
          }">
            ${plCount.toLocaleString()}
          </span>
        </button>

        <button
          onclick="switchMainTab('checksheet')"
          class="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2.5 transition-all shadow-sm ${
            isCs
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-tasks text-sm"></i>
          <span>2. Checksheet Overview</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${
            isCs ? "bg-white/20 text-white" : "bg-slate-700 text-slate-300"
          }">
            ${csCount.toLocaleString()}
          </span>
        </button>
      </div>

      <div class="hidden md:flex items-center gap-2 text-xs text-slate-400 pr-2">
        <span class="inline-flex items-center gap-1.5"><i class="fas fa-server text-blue-400"></i> CPP TOPSIDE</span>
        <span>•</span>
        <span>${Object.keys(state.data.subsystems || {}).length} SubSystems</span>
      </div>
    `;
  }

  // --- Main Render ---
  function renderAll() {
    renderHeaderControls();
    renderTabBar();
    renderTabContent();
  }

  function renderTabContent() {
    const container = document.getElementById("app-content");
    if (!container || !state.data) return;

    if (state.activeTab === "punchlist") {
      renderPunchlistTab(container);
    } else {
      renderChecksheetTab(container);
    }
  }

  // =========================================================================
  // TAB 1: PUNCHLIST OVERVIEW
  // =========================================================================
  function getFilteredPunchlist() {
    const f = state.filters.punchlist;
    const rows = state.data.punchlist.rows;
    const pool = state.data.punchlist.pool;

    const q = f.search.trim().toLowerCase();
    const tagQ = f.tag.trim().toLowerCase();
    const subQ = f.subSystem;
    const catQ = f.category;
    const statusQ = f.status;
    const discQ = f.discipline;

    return rows.filter((r) => {
      // 0: sys, 1: sub, 2: pl_no, 5: tag_no, 6: tag_desc, 8: cat, 9: status, 15: disc, 16: defect
      if (subQ !== "ALL" && (pool[r[1]] || "") !== subQ) return false;
      if (catQ !== "ALL" && r[8] !== catQ) return false;
      if (statusQ !== "ALL" && (pool[r[9]] || "") !== statusQ) return false;
      if (discQ !== "ALL" && (pool[r[15]] || "") !== discQ) return false;

      if (tagQ && !(r[5] || "").toLowerCase().includes(tagQ)) return false;

      if (q) {
        const text = `${r[2]} ${r[5]} ${pool[r[6]] || ""} ${pool[r[16]] || ""} ${pool[r[1]] || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }

  function renderPunchlistTab(container) {
    const allRows = state.data.punchlist.rows;
    const pool = state.data.punchlist.pool;
    const filtered = getFilteredPunchlist();
    const f = state.filters.punchlist;

    // Compute KPIs
    let total = allRows.length, catA = 0, catB = 0, catC = 0, open = 0, closed = 0;
    const discSet = new Set();
    const subSet = new Set();

    allRows.forEach((r) => {
      const c = r[8];
      if (c === "A") catA++;
      else if (c === "B") catB++;
      else if (c === "C" || c === "c") catC++;

      const st = pool[r[9]] || "";
      if (st === "Closed") closed++;
      else open++;

      const d = pool[r[15]] || "";
      if (d) discSet.add(d);

      const s = pool[r[1]] || "";
      if (s) subSet.add(s);
    });

    const pctClosed = total > 0 ? ((closed / total) * 100).toFixed(1) : 0;

    // Subsystem options
    const sortedSubs = Array.from(subSet).sort();
    const subDescMap = state.data.subsystems || {};

    // Disciplines options
    const sortedDiscs = Array.from(discSet).sort();

    // Pagination
    const totalPages = Math.max(1, Math.ceil(filtered.length / f.pageSize));
    if (f.page > totalPages) f.page = totalPages;
    const startIdx = (f.page - 1) * f.pageSize;
    const pageRows = filtered.slice(startIdx, startIdx + f.pageSize);

    container.innerHTML = `
      <!-- 1. KPI Cards Row -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Punch -->
        <div onclick="setPlFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Punch</p>
              <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-clipboard-list"></i>
            </div>
          </div>
          <p class="text-[10px] text-slate-500 mt-2">Toàn bộ danh mục Punchlist</p>
        </div>

        <!-- Cat A -->
        <div onclick="setPlFilter('category','A')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.category === "A" ? "ring-2 ring-rose-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-rose-700">Category A</p>
              <h3 class="text-xl sm:text-2xl font-black text-rose-600 mt-1">${catA.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-skull-crossbones"></i>
            </div>
          </div>
          <p class="text-[10px] text-rose-700 font-semibold mt-2">Punch nghiêm trọng (Pre-CC)</p>
        </div>

        <!-- Cat B -->
        <div onclick="setPlFilter('category','B')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-amber-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all ${
          f.category === "B" ? "ring-2 ring-amber-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-amber-700">Category B</p>
              <h3 class="text-xl sm:text-2xl font-black text-amber-600 mt-1">${catB.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-triangle-exclamation"></i>
            </div>
          </div>
          <p class="text-[10px] text-amber-700 font-semibold mt-2">Trước Handover (Pre-Ready)</p>
        </div>

        <!-- Cat C -->
        <div onclick="setPlFilter('category','C')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-blue-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all ${
          f.category === "C" ? "ring-2 ring-blue-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-blue-700">Category C</p>
              <h3 class="text-xl sm:text-2xl font-black text-blue-600 mt-1">${catC.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-circle-info"></i>
            </div>
          </div>
          <p class="text-[10px] text-blue-700 font-semibold mt-2">Punch tồn đọng cho phép</p>
        </div>

        <!-- Open Items -->
        <div onclick="setPlFilter('status','Open')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-orange-200 shadow-sm hover:shadow-md hover:border-orange-400 transition-all ${
          f.status === "Open" ? "ring-2 ring-orange-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-orange-700">Status: Open</p>
              <h3 class="text-xl sm:text-2xl font-black text-orange-600 mt-1">${open.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-hourglass-start"></i>
            </div>
          </div>
          <p class="text-[10px] text-orange-700 font-semibold mt-2">Đang chờ xử lý đóng punch</p>
        </div>

        <!-- Closed Items -->
        <div onclick="setPlFilter('status','Closed')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Closed" ? "ring-2 ring-emerald-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Status: Closed</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 class="text-xl sm:text-2xl font-black text-emerald-600">${closed.toLocaleString()}</h3>
                <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${pctClosed}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-check-double"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full" style="width: ${pctClosed}%"></div>
          </div>
        </div>
      </div>

      <!-- 2. Interactive Filter & Search Bar -->
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
              Bộ lọc & Tìm kiếm Punchlist
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
              ${filtered.length.toLocaleString()} / ${total.toLocaleString()} mục
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="resetPlFilters()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1">
              <i class="fas fa-rotate-left text-[10px]"></i> Xóa lọc
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Filter SubSystemNo -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-sitemap text-blue-600 mr-1"></i> SubSystem No:
            </label>
            <select
              onchange="setPlFilter('subSystem', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- Tất cả SubSystems (${sortedSubs.length}) --</option>
              ${sortedSubs
                .map((s) => {
                  const desc = subDescMap[s] ? ` - ${subDescMap[s]}` : "";
                  return `<option value="${esc(s)}" ${f.subSystem === s ? "selected" : ""}>${esc(s)}${esc(desc)}</option>`;
                })
                .join("")}
            </select>
          </div>

          <!-- Filter Tag No -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-tag text-emerald-600 mr-1"></i> Tag No:
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.tag)}"
                oninput="setPlFilter('tag', this.value)"
                placeholder="Nhập Tag No (vd: CPB1-PJB...)"
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>

          <!-- Filter Discipline -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-wrench text-indigo-600 mr-1"></i> Bộ môn (Discipline):
            </label>
            <select
              onchange="setPlFilter('discipline', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- Tất cả bộ môn --</option>
              ${sortedDiscs
                .map((d) => `<option value="${esc(d)}" ${f.discipline === d ? "selected" : ""}>${esc(d)}</option>`)
                .join("")}
            </select>
          </div>

          <!-- Keyword Search -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-magnifying-glass text-slate-600 mr-1"></i> Tìm tự do (PL No, mô tả...):
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.search)}"
                oninput="setPlFilter('search', this.value)"
                placeholder="Tìm nội dung khiếm khuyết, PL No..."
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-font absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- Quick Filter Pills -->
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span class="text-slate-400 text-[11px] font-medium">Lọc nhanh:</span>
          <button onclick="setPlFilter('category','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }">All Cats</button>
          <button onclick="setPlFilter('category','A')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "A" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
          }">Cat A</button>
          <button onclick="setPlFilter('category','B')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "B" ? "bg-amber-600 text-white" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          }">Cat B</button>
          <button onclick="setPlFilter('category','C')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "C" ? "bg-blue-600 text-white" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }">Cat C</button>
          <span class="text-slate-300">|</span>
          <button onclick="setPlFilter('status','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }">All Status</button>
          <button onclick="setPlFilter('status','Open')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Open" ? "bg-orange-600 text-white" : "bg-orange-50 text-orange-700 hover:bg-orange-100"
          }">Open</button>
          <button onclick="setPlFilter('status','Closed')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Closed" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }">Closed</button>
        </div>
      </div>

      <!-- 3. High-Performance Paginated Data Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Danh sách Punchlist chi tiết
            </h4>
            <span class="text-xs text-slate-500 font-medium">
              (Hiển thị ${pageRows.length > 0 ? (startIdx + 1) : 0} - ${Math.min(filtered.length, startIdx + f.pageSize)} của ${filtered.length.toLocaleString()})
            </span>
          </div>

          <!-- Page Controls -->
          <div class="flex items-center gap-2">
            <button
              onclick="setPlPage(${f.page - 1})"
              ${f.page <= 1 ? "disabled" : ""}
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-100"
            >
              <i class="fas fa-chevron-left"></i>
            </button>
            <span class="text-xs font-bold text-slate-700">Trang ${f.page} / ${totalPages}</span>
            <button
              onclick="setPlPage(${f.page + 1})"
              ${f.page >= totalPages ? "disabled" : ""}
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-100"
            >
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left sqcl-grid-table">
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-3 text-center w-12">#</th>
                <th class="py-2.5 px-3">PunchList No</th>
                <th class="py-2.5 px-3">SubSystem</th>
                <th class="py-2.5 px-3">Tag No</th>
                <th class="py-2.5 px-3">Tag Description</th>
                <th class="py-2.5 px-2 text-center w-16">Cat</th>
                <th class="py-2.5 px-2 text-center w-20">Status</th>
                <th class="py-2.5 px-3">Discipline</th>
                <th class="py-2.5 px-4 min-w-[240px]">Defect Description</th>
                <th class="py-2.5 px-3">Target Date</th>
                <th class="py-2.5 px-3 text-center w-20">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                pageRows.length === 0
                  ? `<tr><td colspan="11" class="py-12 text-center text-slate-400 text-xs">Không tìm thấy bản ghi nào phù hợp với bộ lọc.</td></tr>`
                  : pageRows
                      .map((r, idx) => {
                        const sysNo = resolvePl(r, 0);
                        const subNo = resolvePl(r, 1);
                        const plNo = r[2];
                        const tagNo = r[5];
                        const tagDesc = resolvePl(r, 6);
                        const cat = r[8];
                        const status = resolvePl(r, 9);
                        const disc = resolvePl(r, 15);
                        const defect = resolvePl(r, 16);
                        const targetDate = r[21] || "-";

                        const catBadge =
                          cat === "A"
                            ? "bg-rose-100 text-rose-800 border-rose-300"
                            : cat === "B"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : "bg-blue-100 text-blue-800 border-blue-300";

                        const statusBadge =
                          status === "Closed"
                            ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : "bg-orange-100 text-orange-800 border-orange-300";

                        return `
                          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs transition-colors">
                            <td class="py-2 px-3 text-center text-slate-400 font-mono">${startIdx + idx + 1}</td>
                            <td class="py-2 px-3 font-extrabold text-blue-700 font-mono">
                              <button onclick="viewPunchDetail('${esc(plNo)}')" class="hover:underline text-left">
                                ${esc(plNo)}
                              </button>
                            </td>
                            <td class="py-2 px-3 font-semibold text-slate-800 font-mono">
                              <button onclick="setPlFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600">
                                ${esc(subNo)}
                              </button>
                            </td>
                            <td class="py-2 px-3 font-mono font-bold text-slate-900">
                              <button onclick="setPlFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600">
                                ${esc(tagNo)}
                              </button>
                            </td>
                            <td class="py-2 px-3 text-slate-600 max-w-xs truncate" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
                            <td class="py-2 px-2 text-center">
                              <span class="px-2 py-0.5 rounded font-black text-[10px] border ${catBadge}">${esc(cat)}</span>
                            </td>
                            <td class="py-2 px-2 text-center">
                              <span class="px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusBadge}">${esc(status)}</span>
                            </td>
                            <td class="py-2 px-3 text-slate-700 font-medium">${esc(disc)}</td>
                            <td class="py-2 px-4 text-slate-700 line-clamp-2" title="${esc(defect)}">${esc(defect)}</td>
                            <td class="py-2 px-3 text-slate-500 font-mono text-[11px] whitespace-nowrap">${esc(targetDate)}</td>
                            <td class="py-2 px-3 text-center">
                              <button
                                onclick="viewPunchDetail('${esc(plNo)}')"
                                class="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] transition-colors"
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        `;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.setPlFilter = function (key, val) {
    state.filters.punchlist[key] = val;
    state.filters.punchlist.page = 1;
    renderTabContent();
  };

  window.setPlPage = function (p) {
    state.filters.punchlist.page = p;
    renderTabContent();
  };

  window.resetPlFilters = function () {
    state.filters.punchlist = {
      search: "",
      subSystem: "ALL",
      tag: "",
      category: "ALL",
      status: "ALL",
      discipline: "ALL",
      page: 1,
      pageSize: 50,
    };
    renderTabContent();
  };

  window.viewPunchDetail = function (plNo) {
    const r = state.data.punchlist.rows.find((x) => x[2] === plNo);
    if (!r) return;

    const modal = document.getElementById("item-detail-modal");
    const h = document.getElementById("item-detail-header");
    const b = document.getElementById("item-detail-body");
    const f = document.getElementById("item-detail-footer");

    const cat = r[8];
    const status = resolvePl(r, 9);
    const catBadge =
      cat === "A"
        ? "bg-rose-100 text-rose-800 border-rose-300"
        : cat === "B"
        ? "bg-amber-100 text-amber-800 border-amber-300"
        : "bg-blue-100 text-blue-800 border-blue-300";

    h.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-2 py-0.5 rounded text-xs font-black border ${catBadge}">Category ${esc(cat)}</span>
        <span class="px-2 py-0.5 rounded-full text-xs font-bold ${
          status === "Closed" ? "bg-emerald-100 text-emerald-800" : "bg-orange-100 text-orange-800"
        }">Status: ${esc(status)}</span>
        <h3 class="font-black text-slate-900 text-base font-mono">Punchlist No: ${esc(plNo)}</h3>
      </div>
    `;

    b.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div><strong>System No:</strong> <span class="font-mono text-blue-700">${esc(resolvePl(r, 0))}</span></div>
        <div><strong>SubSystem No:</strong> <span class="font-mono font-bold text-slate-900">${esc(resolvePl(r, 1))}</span></div>
        <div><strong>Tag No:</strong> <span class="font-mono font-bold text-emerald-700">${esc(r[5])}</span></div>
        <div><strong>Discipline:</strong> <span class="font-semibold">${esc(resolvePl(r, 15))}</span></div>
        <div class="sm:col-span-2"><strong>Tag Description:</strong> ${esc(resolvePl(r, 6))}</div>
        <div class="sm:col-span-2"><strong>Package:</strong> ${esc(resolvePl(r, 4))}</div>
        <div><strong>Open Date:</strong> ${esc(r[10]) || "-"}</div>
        <div><strong>Closed Date:</strong> ${esc(r[11]) || "-"}</div>
        <div><strong>Target Date:</strong> ${esc(r[21]) || "-"}</div>
        <div><strong>Action By:</strong> ${esc(resolvePl(r, 12))}</div>
        <div><strong>MRIR No:</strong> ${esc(resolvePl(r, 13)) || "-"}</div>
        <div><strong>Drawing No:</strong> ${esc(resolvePl(r, 7)) || "-"}</div>
      </div>

      <div class="space-y-2">
        <label class="block font-bold text-slate-900 text-xs">
          <i class="fas fa-triangle-exclamation text-rose-600 mr-1"></i> Defect Description (Mô tả khiếm khuyết):
        </label>
        <div class="p-3 bg-rose-50/60 rounded-xl border border-rose-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans font-medium">
          ${esc(resolvePl(r, 16))}
        </div>
      </div>

      <div class="space-y-2">
        <label class="block font-bold text-slate-900 text-xs">
          <i class="fas fa-check-circle text-emerald-600 mr-1"></i> Corrective Action (Hành động khắc phục):
        </label>
        <div class="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans font-medium">
          ${esc(resolvePl(r, 17)) || "Chưa có nội dung"}
        </div>
      </div>
    `;

    f.innerHTML = `
      <div class="text-[11px] text-slate-500">
        Raise By: <strong>${esc(resolvePl(r, 18))}</strong> (${esc(r[19]) || "-"})
      </div>
      <button onclick="closeItemDetailModal()" class="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">
        Đóng
      </button>
    `;

    modal.classList.remove("hidden");
  };

  // =========================================================================
  // TAB 2: CHECKSHEET OVERVIEW
  // =========================================================================
  function getFilteredChecksheets() {
    const f = state.filters.checksheet;
    const rows = state.data.checksheet.rows;
    const pool = state.data.checksheet.pool;

    const q = f.search.trim().toLowerCase();
    const tagQ = f.tag.trim().toLowerCase();
    const subQ = f.subSystem;
    const statusQ = f.status;
    const discQ = f.discipline;
    const typeQ = f.checkType;

    return rows.filter((r) => {
      // 0: no, 1: sub, 2: tag_no, 3: tag_desc, 4: disc, 5: cs_type, 6: comp_date, 8: norm
      if (subQ !== "ALL" && (pool[r[1]] || "") !== subQ) return false;
      if (discQ !== "ALL" && (pool[r[4]] || "") !== discQ) return false;
      if (typeQ !== "ALL" && (pool[r[5]] || "") !== typeQ) return false;

      const isCompleted = Boolean(r[6]);
      if (statusQ === "Completed" && !isCompleted) return false;
      if (statusQ === "Remaining" && isCompleted) return false;

      if (tagQ && !(r[2] || "").toLowerCase().includes(tagQ)) return false;

      if (q) {
        const text = `${r[2]} ${pool[r[3]] || ""} ${pool[r[1]] || ""} ${pool[r[5]] || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }

  function renderChecksheetTab(container) {
    const allRows = state.data.checksheet.rows;
    const pool = state.data.checksheet.pool;
    const filtered = getFilteredChecksheets();
    const f = state.filters.checksheet;

    let total = allRows.length, completed = 0, remaining = 0;
    let totalNorm = 0, compNorm = 0;
    const discSet = new Set();
    const subSet = new Set();
    const typeSet = new Set();

    allRows.forEach((r) => {
      const isComp = Boolean(r[6]);
      const norm = Number(r[8] || 0);
      totalNorm += norm;
      if (isComp) {
        completed++;
        compNorm += norm;
      } else {
        remaining++;
      }

      const d = pool[r[4]] || "";
      if (d) discSet.add(d);

      const s = pool[r[1]] || "";
      if (s) subSet.add(s);

      const t = pool[r[5]] || "";
      if (t) typeSet.add(t);
    });

    const pctDone = total > 0 ? ((completed / total) * 100).toFixed(1) : 0;
    const pctNorm = totalNorm > 0 ? ((compNorm / totalNorm) * 100).toFixed(1) : 0;

    const sortedSubs = Array.from(subSet).sort();
    const subDescMap = state.data.subsystems || {};
    const sortedDiscs = Array.from(discSet).sort();
    const sortedTypes = Array.from(typeSet).sort();

    const totalPages = Math.max(1, Math.ceil(filtered.length / f.pageSize));
    if (f.page > totalPages) f.page = totalPages;
    const startIdx = (f.page - 1) * f.pageSize;
    const pageRows = filtered.slice(startIdx, startIdx + f.pageSize);

    container.innerHTML = `
      <!-- 1. KPI Cards Row -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Checksheets -->
        <div onclick="setCsFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Checksheet</p>
              <h3 class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-list-check"></i>
            </div>
          </div>
          <p class="text-[10px] text-slate-500 mt-2">Tổng số biên bản nghiệm thu ITR</p>
        </div>

        <!-- Completed Checksheets -->
        <div onclick="setCsFilter('status','Completed')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Completed" ? "ring-2 ring-emerald-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Completed (Ký xong)</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 class="text-xl sm:text-2xl font-black text-emerald-600">${completed.toLocaleString()}</h3>
                <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${pctDone}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-check-double"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-emerald-500 h-full rounded-full" style="width: ${pctDone}%"></div>
          </div>
        </div>

        <!-- Remaining Checksheets -->
        <div onclick="setCsFilter('status','Remaining')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.status === "Remaining" ? "ring-2 ring-rose-500" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-rose-700">Remaining (Còn lại)</p>
              <h3 class="text-xl sm:text-2xl font-black text-rose-600 mt-1">${remaining.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-clock"></i>
            </div>
          </div>
          <p class="text-[10px] text-rose-700 font-semibold mt-2">Chưa hoàn thành ký nghiệm thu</p>
        </div>

        <!-- Total Norm Manhours -->
        <div class="bg-white rounded-2xl p-3.5 border border-indigo-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Total Manhours</p>
              <h3 class="text-xl sm:text-2xl font-black text-indigo-600 mt-1">${totalNorm.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-user-gear"></i>
            </div>
          </div>
          <p class="text-[10px] text-indigo-700 font-semibold mt-2">Tổng giờ định mức (Norm)</p>
        </div>

        <!-- Completed Norm Manhours -->
        <div class="bg-white rounded-2xl p-3.5 border border-teal-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-teal-700">Earned Manhours</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 class="text-xl sm:text-2xl font-black text-teal-600">${compNorm.toLocaleString()}</h3>
                <span class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800">${pctNorm}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-chart-pie"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div class="bg-teal-500 h-full rounded-full" style="width: ${pctNorm}%"></div>
          </div>
        </div>

        <!-- Subsystems Count -->
        <div class="bg-white rounded-2xl p-3.5 border border-purple-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-purple-700">SubSystems</p>
              <h3 class="text-xl sm:text-2xl font-black text-purple-600 mt-1">${sortedSubs.length}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-network-wired"></i>
            </div>
          </div>
          <p class="text-[10px] text-purple-700 font-semibold mt-2">Phân hệ nghiệm thu CPP</p>
        </div>
      </div>

      <!-- 2. Interactive Filter Bar -->
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
              Bộ lọc & Tìm kiếm Checksheet
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
              ${filtered.length.toLocaleString()} / ${total.toLocaleString()} mục
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="resetCsFilters()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1">
              <i class="fas fa-rotate-left text-[10px]"></i> Xóa lọc
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <!-- Filter SubSystemNo -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-sitemap text-blue-600 mr-1"></i> SubSystem No:
            </label>
            <select
              onchange="setCsFilter('subSystem', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- Tất cả SubSystems (${sortedSubs.length}) --</option>
              ${sortedSubs
                .map((s) => {
                  const desc = subDescMap[s] ? ` - ${subDescMap[s]}` : "";
                  return `<option value="${esc(s)}" ${f.subSystem === s ? "selected" : ""}>${esc(s)}${esc(desc)}</option>`;
                })
                .join("")}
            </select>
          </div>

          <!-- Filter Tag No -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-tag text-emerald-600 mr-1"></i> Tag No:
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.tag)}"
                oninput="setCsFilter('tag', this.value)"
                placeholder="Nhập Tag No (vd: CPPT-EBC...)"
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>

          <!-- Filter Discipline -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-wrench text-indigo-600 mr-1"></i> Bộ môn (Discipline):
            </label>
            <select
              onchange="setCsFilter('discipline', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- Tất cả bộ môn --</option>
              ${sortedDiscs
                .map((d) => `<option value="${esc(d)}" ${f.discipline === d ? "selected" : ""}>${esc(d)}</option>`)
                .join("")}
            </select>
          </div>

          <!-- Keyword Search -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-magnifying-glass text-slate-600 mr-1"></i> Tìm tự do (Mô tả, Loại ITR...):
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.search)}"
                oninput="setCsFilter('search', this.value)"
                placeholder="Tìm loại form, mô tả thiết bị..."
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-font absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- Quick Filter Pills -->
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span class="text-slate-400 text-[11px] font-medium">Trạng thái:</span>
          <button onclick="setCsFilter('status','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }">Tất cả (${total.toLocaleString()})</button>
          <button onclick="setCsFilter('status','Completed')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Completed" ? "bg-emerald-600 text-white" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }">Completed (${completed.toLocaleString()})</button>
          <button onclick="setCsFilter('status','Remaining')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Remaining" ? "bg-rose-600 text-white" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
          }">Remaining (${remaining.toLocaleString()})</button>
        </div>
      </div>

      <!-- 3. Paginated Data Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Danh sách Checksheet chi tiết
            </h4>
            <span class="text-xs text-slate-500 font-medium">
              (Hiển thị ${pageRows.length > 0 ? (startIdx + 1) : 0} - ${Math.min(filtered.length, startIdx + f.pageSize)} của ${filtered.length.toLocaleString()})
            </span>
          </div>

          <!-- Page Controls -->
          <div class="flex items-center gap-2">
            <button
              onclick="setCsPage(${f.page - 1})"
              ${f.page <= 1 ? "disabled" : ""}
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-100"
            >
              <i class="fas fa-chevron-left"></i>
            </button>
            <span class="text-xs font-bold text-slate-700">Trang ${f.page} / ${totalPages}</span>
            <button
              onclick="setCsPage(${f.page + 1})"
              ${f.page >= totalPages ? "disabled" : ""}
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white text-slate-700 text-xs font-bold disabled:opacity-40 hover:bg-slate-100"
            >
              <i class="fas fa-chevron-right"></i>
            </button>
          </div>
        </div>

        <div class="overflow-x-auto">
          <table class="w-full text-left sqcl-grid-table">
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-3 text-center w-12">No</th>
                <th class="py-2.5 px-3">SubSystem</th>
                <th class="py-2.5 px-3">Tag No</th>
                <th class="py-2.5 px-4 min-w-[200px]">Tag Description</th>
                <th class="py-2.5 px-3">Discipline</th>
                <th class="py-2.5 px-3">CheckSheet Type</th>
                <th class="py-2.5 px-2 text-center w-24">Status</th>
                <th class="py-2.5 px-3">Complete Date</th>
                <th class="py-2.5 px-3">Plan Finish</th>
                <th class="py-2.5 px-2 text-center w-16">Norm</th>
                <th class="py-2.5 px-3">SubContractor</th>
                <th class="py-2.5 px-3 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody>
              ${
                pageRows.length === 0
                  ? `<tr><td colspan="12" class="py-12 text-center text-slate-400 text-xs">Không tìm thấy bản ghi checksheet nào phù hợp.</td></tr>`
                  : pageRows
                      .map((r, idx) => {
                        const no = r[0] || (startIdx + idx + 1);
                        const subNo = resolveCs(r, 1);
                        const tagNo = r[2];
                        const tagDesc = resolveCs(r, 3);
                        const disc = resolveCs(r, 4);
                        const csType = resolveCs(r, 5);
                        const compDate = r[6];
                        const planFinish = r[7];
                        const norm = r[8];
                        const contractor = resolveCs(r, 11);
                        const isComp = Boolean(compDate);

                        const statusBadge = isComp
                          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : "bg-slate-100 text-slate-700 border-slate-300";

                        return `
                          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs transition-colors">
                            <td class="py-2 px-3 text-center text-slate-400 font-mono">${esc(no)}</td>
                            <td class="py-2 px-3 font-semibold text-slate-800 font-mono">
                              <button onclick="setCsFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600">
                                ${esc(subNo)}
                              </button>
                            </td>
                            <td class="py-2 px-3 font-mono font-bold text-slate-900">
                              <button onclick="setCsFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600">
                                ${esc(tagNo)}
                              </button>
                            </td>
                            <td class="py-2 px-4 text-slate-700 max-w-xs truncate" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
                            <td class="py-2 px-3 text-slate-700 font-medium">${esc(disc)}</td>
                            <td class="py-2 px-3 font-mono font-bold text-indigo-700">${esc(csType)}</td>
                            <td class="py-2 px-2 text-center">
                              <span class="px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusBadge}">
                                ${isComp ? "Completed" : "Remaining"}
                              </span>
                            </td>
                            <td class="py-2 px-3 font-mono text-[11px] ${isComp ? "text-emerald-700 font-semibold" : "text-slate-400"}">
                              ${esc(compDate) || "-"}
                            </td>
                            <td class="py-2 px-3 font-mono text-[11px] text-slate-500">${esc(planFinish) || "-"}</td>
                            <td class="py-2 px-2 text-center font-bold text-slate-700 font-mono">${esc(norm)}</td>
                            <td class="py-2 px-3 text-slate-600">${esc(contractor)}</td>
                            <td class="py-2 px-3 text-center">
                              <button
                                onclick="viewChecksheetDetail('${esc(tagNo)}', '${esc(csType)}')"
                                class="px-2 py-1 rounded-lg bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white font-bold text-[11px] transition-colors"
                              >
                                Xem
                              </button>
                            </td>
                          </tr>
                        `;
                      })
                      .join("")
              }
            </tbody>
          </table>
        </div>
      </div>
    `;
  }

  window.setCsFilter = function (key, val) {
    state.filters.checksheet[key] = val;
    state.filters.checksheet.page = 1;
    renderTabContent();
  };

  window.setCsPage = function (p) {
    state.filters.checksheet.page = p;
    renderTabContent();
  };

  window.resetCsFilters = function () {
    state.filters.checksheet = {
      search: "",
      subSystem: "ALL",
      tag: "",
      status: "ALL",
      discipline: "ALL",
      checkType: "ALL",
      page: 1,
      pageSize: 50,
    };
    renderTabContent();
  };

  window.viewChecksheetDetail = function (tagNo, csType) {
    const r = state.data.checksheet.rows.find((x) => x[2] === tagNo && resolveCs(x, 5) === csType);
    if (!r) return;

    const modal = document.getElementById("item-detail-modal");
    const h = document.getElementById("item-detail-header");
    const b = document.getElementById("item-detail-body");
    const f = document.getElementById("item-detail-footer");

    const compDate = r[6];
    const isComp = Boolean(compDate);

    h.innerHTML = `
      <div class="flex items-center gap-2 flex-wrap">
        <span class="px-2.5 py-0.5 rounded-full text-xs font-bold ${
          isComp ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"
        }">Status: ${isComp ? "Completed" : "Remaining"}</span>
        <span class="px-2.5 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-bold font-mono">Type: ${esc(csType)}</span>
        <h3 class="font-black text-slate-900 text-base font-mono">Tag: ${esc(tagNo)}</h3>
      </div>
    `;

    b.innerHTML = `
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
        <div><strong>Item No:</strong> <span class="font-mono">${esc(r[0])}</span></div>
        <div><strong>SubSystem No:</strong> <span class="font-mono font-bold text-slate-900">${esc(resolveCs(r, 1))}</span></div>
        <div class="sm:col-span-2"><strong>SubSystem Description:</strong> ${esc(state.data.subsystems[resolveCs(r, 1)] || "")}</div>
        <div><strong>Discipline:</strong> <span class="font-semibold">${esc(resolveCs(r, 4))}</span></div>
        <div><strong>CheckSheet Type:</strong> <span class="font-bold text-indigo-700 font-mono">${esc(csType)}</span></div>
        <div class="sm:col-span-2"><strong>Tag Description:</strong> ${esc(resolveCs(r, 3))}</div>
        <div><strong>Complete Date:</strong> <span class="font-bold text-emerald-700">${esc(compDate) || "Chưa ký"}</span></div>
        <div><strong>Plan Finish:</strong> ${esc(r[7]) || "-"}</div>
        <div><strong>Norm (Manhours):</strong> <span class="font-bold font-mono">${esc(r[8])}</span></div>
        <div><strong>Phase:</strong> ${esc(resolveCs(r, 9))}</div>
        <div><strong>Location:</strong> ${esc(resolveCs(r, 10))}</div>
        <div><strong>SubContractor:</strong> ${esc(resolveCs(r, 11))}</div>
      </div>
    `;

    f.innerHTML = `
      <div class="text-[11px] text-slate-500">
        PTSCMC Pre-commissioning Management System
      </div>
      <button onclick="closeItemDetailModal()" class="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">
        Đóng
      </button>
    `;

    modal.classList.remove("hidden");
  };

  window.closeItemDetailModal = function () {
    const modal = document.getElementById("item-detail-modal");
    if (modal) modal.classList.add("hidden");
  };

  // --- Export to Excel (Client-side via SheetJS) ---
  window.exportActiveTabToExcel = function () {
    if (!window.XLSX || !state.data) {
      alert("Thư viện Excel đang tải, vui lòng thử lại sau giây lát.");
      return;
    }

    const isPl = state.activeTab === "punchlist";
    let dataToExport = [];
    let filename = "";

    if (isPl) {
      filename = `PunchList_CPP_TOPSIDE_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const filtered = getFilteredPunchlist();
      dataToExport = filtered.map((r) => ({
        "System No": resolvePl(r, 0),
        "SubSystem No": resolvePl(r, 1),
        "PunchList No": r[2],
        "Tag No": r[5],
        "Tag Description": resolvePl(r, 6),
        "Category": r[8],
        "Status": resolvePl(r, 9),
        "Open Date": r[10],
        "Closed Date": r[11],
        "Discipline": resolvePl(r, 15),
        "Defect Description": resolvePl(r, 16),
        "Corrective Action": resolvePl(r, 17),
        "Target Date": r[21],
        "Action By": resolvePl(r, 12),
        "MRIR No": resolvePl(r, 13),
      }));
    } else {
      filename = `Checksheet_CPP_TOPSIDE_Export_${new Date().toISOString().slice(0, 10)}.xlsx`;
      const filtered = getFilteredChecksheets();
      dataToExport = filtered.map((r) => ({
        "No": r[0],
        "SubSystem No": resolveCs(r, 1),
        "SubSystem Description": state.data.subsystems[resolveCs(r, 1)] || "",
        "Tag No": r[2],
        "Tag Description": resolveCs(r, 3),
        "Discipline": resolveCs(r, 4),
        "CheckSheet Type": resolveCs(r, 5),
        "Status": r[6] ? "Completed" : "Remaining",
        "Complete Date": r[6],
        "Plan Finish": r[7],
        "Norm (Mhrs)": r[8],
        "Phase": resolveCs(r, 9),
        "Location": resolveCs(r, 10),
        "SubContractor": resolveCs(r, 11),
      }));
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, isPl ? "Punchlist" : "Checksheet");
    XLSX.writeFile(wb, filename);
    showToast(`Đã xuất ${dataToExport.length.toLocaleString()} dòng ra file Excel!`, "success");
  };

  // --- Export to PDF ---
  window.exportActiveTabToPDF = function () {
    if (!window.jspdf) {
      alert("Thư viện PDF đang tải, vui lòng thử lại sau.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");
    const isPl = state.activeTab === "punchlist";

    doc.setFontSize(14);
    doc.text(`CPP TOPSIDE - ${isPl ? "Punchlist Overview" : "Checksheet Overview"}`, 14, 15);
    doc.setFontSize(9);
    doc.text(`Export Date: ${new Date().toLocaleString()} | Total items: ${isPl ? getFilteredPunchlist().length : getFilteredChecksheets().length}`, 14, 21);

    if (isPl) {
      const rows = getFilteredPunchlist().slice(0, 100).map((r, i) => [
        i + 1,
        r[2],
        resolvePl(r, 1),
        r[5],
        r[8],
        resolvePl(r, 9),
        resolvePl(r, 15),
        (resolvePl(r, 16) || "").slice(0, 50),
      ]);
      doc.autoTable({
        startY: 25,
        head: [["#", "PL No", "SubSystem", "Tag No", "Cat", "Status", "Disc", "Defect"]],
        body: rows,
        styles: { fontSize: 8 },
      });
    } else {
      const rows = getFilteredChecksheets().slice(0, 100).map((r, i) => [
        i + 1,
        resolveCs(r, 1),
        r[2],
        resolveCs(r, 4),
        resolveCs(r, 5),
        r[6] ? "Completed" : "Remaining",
        r[6] || "-",
      ]);
      doc.autoTable({
        startY: 25,
        head: [["#", "SubSystem", "Tag No", "Disc", "Type", "Status", "Complete Date"]],
        body: rows,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`${isPl ? "Punchlist" : "Checksheet"}_CPP_TOPSIDE_Report.pdf`);
    showToast("Đã xuất báo cáo PDF (100 mục đầu tiên)!", "success");
  };

  // --- Modals ---
  window.openSourceModal = function () {
    const modal = document.getElementById("source-modal");
    if (!modal) return;
    const metaEl = document.getElementById("modal-source-meta");
    if (metaEl && state.data && state.data.meta) {
      const m = state.data.meta;
      metaEl.innerHTML = `
        <div>• <strong>Punchlist:</strong> ${esc(m.punchlist_file)} (${m.punchlist_count.toLocaleString()} dòng, cập nhật: ${m.punchlist_updated})</div>
        <div>• <strong>Checksheet:</strong> ${esc(m.checksheet_file)} (${m.checksheet_count.toLocaleString()} dòng, cập nhật: ${m.checksheet_updated})</div>
        <div>• <strong>Dữ liệu tổng hợp lúc:</strong> ${esc(m.last_updated)}</div>
      `;
    }
    modal.classList.remove("hidden");
  };

  window.closeSourceModal = function () {
    const modal = document.getElementById("source-modal");
    if (modal) modal.classList.add("hidden");
  };

  window.openShareModal = function () {
    const modal = document.getElementById("share-modal");
    if (!modal) return;
    const input = document.getElementById("share-url-input");
    const qrImg = document.getElementById("share-qr-img");
    const curUrl = window.location.href.split("?")[0];
    if (input) input.value = curUrl;
    if (qrImg) qrImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(curUrl)}`;
    modal.classList.remove("hidden");
  };

  window.closeShareModal = function () {
    const modal = document.getElementById("share-modal");
    if (modal) modal.classList.add("hidden");
  };

  window.copyShareUrl = function () {
    const input = document.getElementById("share-url-input");
    if (input) {
      navigator.clipboard.writeText(input.value);
      showToast("Đã sao chép đường link Dashboard!", "success");
    }
  };

  window.syncLatestData = async function () {
    const btn = document.getElementById("btn-sync-cloud");
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-1"></i> Syncing...`;
    }
    try {
      const res = await fetch("./static/pms_data.json?t=" + Date.now());
      if (res.ok) {
        state.data = await res.json();
        renderAll();
        showToast("Đã đồng bộ dữ liệu mới nhất thành công!", "success");
      } else {
        showToast("Dữ liệu hiện tại đã là mới nhất.", "info");
      }
    } catch (e) {
      showToast("Không thể kết nối máy chủ Cloud, đang dùng dữ liệu Offline.", "info");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<i class="fas fa-sync-alt"></i> <span class="hidden sm:inline">Sync Data</span>`;
      }
    }
  };

  window.handleExcelUpload = function (ev, type) {
    const file = ev.target.files[0];
    if (!file) return;
    showToast(`Đang đọc file Excel ${type}...`, "info");
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        showToast("Đã đọc file Excel thành công!", "success");
        closeSourceModal();
      } catch (err) {
        showToast("Lỗi đọc file Excel: " + err.message, "error");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  window.showToast = function (msg, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const el = document.createElement("div");
    const colors =
      type === "success"
        ? "bg-emerald-600 text-white"
        : type === "error"
        ? "bg-rose-600 text-white"
        : "bg-slate-800 text-white";
    const icon =
      type === "success"
        ? "fa-check-circle"
        : type === "error"
        ? "fa-exclamation-triangle"
        : "fa-info-circle";
    el.className = `${colors} px-4 py-3 rounded-xl shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-medium transition-all duration-300 transform translate-y-0 opacity-100 z-50`;
    el.innerHTML = `<i class="fas ${icon} text-base"></i><span>${esc(msg)}</span>`;
    container.appendChild(el);
    setTimeout(() => {
      el.classList.add("opacity-0", "translate-y-2");
      setTimeout(() => el.remove(), 300);
    }, 3500);
  };
})();
