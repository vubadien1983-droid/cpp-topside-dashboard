// CPP TOPSIDE — Punchlist & Checksheet Dashboard Engine
// Designed following Project SOI0007689 SQCL Dashboard
(function () {
  "use strict";

  const DEFAULT_PL_COL_WIDTHS = [45, 115, 120, 110, 140, 200, 60, 75, 105, 340, 105, 280];
  const DEFAULT_CS_COL_WIDTHS = [50, 110, 140, 220, 100, 115, 95, 105, 105, 65, 120, 95];

  function loadColWidths(key, defaults) {
    try {
      const saved = localStorage.getItem(`CPP_${key.toUpperCase()}_COL_WIDTHS`);
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr) && arr.length === defaults.length) return arr;
      }
    } catch (e) {}
    return [...defaults];
  }

  function saveColWidths(key, widths) {
    try {
      localStorage.setItem(`CPP_${key.toUpperCase()}_COL_WIDTHS`, JSON.stringify(widths));
    } catch (e) {}
  }

  // Global State
  const state = {
    data: window.PMS_INITIAL_DATA || null,
    activeTab: "overview", // 'overview', 'punchlist', 'checksheet', or 'detail_...'
    detailTabs: [],
    overviewFilters: {
      system: "ALL",
      subSearch: "",
      subQuickFilter: "ALL", // 'ALL', 'OPEN_PUNCH_A', 'OPEN_PUNCH', 'REM_ITR_A', 'REM_ITR_B', 'DONE_100'
      itrBarMetric: "ALL_ITR", // 'ALL_ITR', 'ITR-A', 'ITR-B'
      punchBarMetric: "ALL_PUNCH", // 'ALL_PUNCH', 'PUNCH-A', 'PUNCH-B', 'PUNCH-C'
      itrLineFocus: "A_B", // 'A_B', 'ITR-A', 'ITR-B', 'TOTAL'
      itrLineGran: "week", // 'week', 'month', 'day'
      itrLineMode: "pct", // 'pct' | 'count'
      punchLineFocus: "A_B_C", // 'A_B_C', 'PUNCH-A', 'PUNCH-B', 'PUNCH-C', 'ALL'
      punchLineGran: "week", // 'week', 'month', 'day'
      punchLineMode: "pct", // 'pct' | 'count'
    },
    overviewCache: null,
    deviceMode: window.innerWidth < 768 ? "phone" : "laptop",
    colMode: {
      punchlist: "auto", // 'auto' (content auto-fit by default) or 'custom'
      checksheet: "custom",
    },
    limit: {
      punchlist: 100, // Continuous scroll batch size
      checksheet: 100,
    },
    colWidths: {
      punchlist: loadColWidths("punchlist", DEFAULT_PL_COL_WIDTHS),
      checksheet: loadColWidths("checksheet", DEFAULT_CS_COL_WIDTHS),
    },
    filters: {
      punchlist: {
        search: "",
        system: "ALL",
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
        system: "ALL",
        subSystem: "ALL",
        tag: "",
        status: "ALL", // 'ALL', 'Completed', 'Remaining'
        itrGroup: "ALL", // 'ALL', 'ITR-A', 'ITR-B'
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

  window.toggleAutoFit = function (key) {
    if (state.colMode[key] === "auto") {
      state.colMode[key] = "custom";
      showToast(`${key === "punchlist" ? "Punchlist" : "Checksheet"} column widths fixed.`, "info");
    } else {
      state.colMode[key] = "auto";
      if (key === "punchlist") {
        localStorage.removeItem("CPP_PUNCHLIST_COL_WIDTHS");
        state.colWidths.punchlist = [...DEFAULT_PL_COL_WIDTHS];
      } else {
        localStorage.removeItem("CPP_CHECKSHEET_COL_WIDTHS");
        state.colWidths.checksheet = [...DEFAULT_CS_COL_WIDTHS];
      }
      showToast(`${key === "punchlist" ? "Punchlist" : "Checksheet"} set to Auto-fit column content!`, "success");
    }
    renderTabContent();
  };

  window.resetColWidths = function (key) {
    state.colMode[key] = "auto";
    if (key === "punchlist") {
      localStorage.removeItem("CPP_PUNCHLIST_COL_WIDTHS");
      state.colWidths.punchlist = [...DEFAULT_PL_COL_WIDTHS];
    } else {
      localStorage.removeItem("CPP_CHECKSHEET_COL_WIDTHS");
      state.colWidths.checksheet = [...DEFAULT_CS_COL_WIDTHS];
    }
    renderTabContent();
    showToast("Restored Auto-fit column widths!", "info");
  };

  function initColumnResizers(tableId, tabKey) {
    const table = document.getElementById(tableId);
    if (!table) return;

    const resizers = table.querySelectorAll(".col-resizer");
    resizers.forEach((resizer) => {
      resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const colIndex = parseInt(resizer.getAttribute("data-col-index"), 10);

        if (state.colMode[tabKey] === "auto") {
          state.colMode[tabKey] = "custom";
          const ths = table.querySelectorAll("thead th");
          const measuredWidths = Array.from(ths).map((th) => Math.max(35, th.offsetWidth));
          state.colWidths[tabKey] = measuredWidths;
          table.style.tableLayout = "fixed";
          let cg = table.querySelector("colgroup");
          if (!cg) {
            cg = document.createElement("colgroup");
            table.insertBefore(cg, table.firstChild);
          }
          cg.innerHTML = measuredWidths.map((w) => `<col style="width: ${w}px;">`).join("");
        }

        const colEl = table.querySelector(`colgroup col:nth-child(${colIndex + 1})`);
        const thEl = table.querySelector(`thead th:nth-child(${colIndex + 1})`);
        const startWidth = colEl ? colEl.offsetWidth : (thEl ? thEl.offsetWidth : 80);
        const startX = e.pageX;
        const currentWidths = state.colWidths[tabKey];

        resizer.classList.add("is-resizing");
        document.body.classList.add("resizing-columns");

        function onMouseMove(moveEv) {
          const delta = moveEv.pageX - startX;
          const newWidth = Math.max(35, startWidth + delta);
          if (colEl) colEl.style.width = `${newWidth}px`;
          if (thEl) thEl.style.width = `${newWidth}px`;
          currentWidths[colIndex] = newWidth;
        }

        function onMouseUp() {
          resizer.classList.remove("is-resizing");
          document.body.classList.remove("resizing-columns");
          document.removeEventListener("mousemove", onMouseMove);
          document.removeEventListener("mouseup", onMouseUp);
          saveColWidths(tabKey, currentWidths);
        }

        document.addEventListener("mousemove", onMouseMove);
        document.addEventListener("mouseup", onMouseUp);
      });
    });
  }

  // --- Initialize Application ---
  function checkUrlDetailParams() {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("detail") === "1") {
        const criteria = {
          source: params.get("source") || "checksheet",
          system: params.get("system") || "ALL",
          subSystem: params.get("subSystem") || "ALL",
          discipline: params.get("discipline") || "ALL",
          category: params.get("category") || "ALL",
          itrGroup: params.get("itrGroup") || "ALL",
          status: params.get("status") || "ALL",
          title: params.get("title") || "",
        };
        openDetailTab(criteria, false);
        return true;
      }
    } catch (e) {}
    return false;
  }

  function updateAppHeaderStickyOffset() {
    const hdr = document.getElementById("app-top-header");
    if (!hdr) return;
    const h = Math.ceil(hdr.getBoundingClientRect().height);
    if (h > 0) {
      document.documentElement.style.setProperty("--app-header-h", `${h}px`);
    }
  }
  window.addEventListener("resize", updateAppHeaderStickyOffset);

  window.addEventListener("DOMContentLoaded", () => {
    initDeviceMode();
    if (state.data) {
      if (!checkUrlDetailParams()) renderAll();
    } else {
      fetch("./static/pms_data.json")
        .then((r) => r.json())
        .then((data) => {
          state.data = data;
          if (!checkUrlDetailParams()) renderAll();
        })
        .catch((err) => {
          document.getElementById("app-content").innerHTML = `
            <div class="bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl p-6 text-center">
              <i class="fas fa-exclamation-triangle text-3xl mb-2 text-rose-600"></i>
              <h3 class="font-bold text-base">Unable to load Dashboard data</h3>
              <p class="text-xs mt-1">${esc(err.message)}</p>
              <button onclick="location.reload()" class="mt-3 px-4 py-2 bg-rose-600 text-white rounded-xl text-xs font-bold shadow">
                Retry
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
        }" title="Laptop / Desktop View">
          <i class="fas fa-laptop text-xs"></i> <span class="hidden sm:inline">Laptop</span>
        </button>
        <button onclick="setDeviceMode('phone')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
          isPhone ? "bg-blue-600 text-white shadow" : "text-slate-300 hover:text-white"
        }" title="Mobile Phone View">
          <i class="fas fa-mobile-screen text-xs"></i> <span class="hidden sm:inline">Phone</span>
        </button>
      `;
    }

    if (state.data && state.data.meta) {
      const upEl = document.getElementById("header-updated-text");
      const badgeEl = document.getElementById("header-updated-badge");
      const m = state.data.meta;
      const dataTime = m.data_timestamp || m.punchlist_updated || m.last_updated || "Today";
      if (upEl) {
        upEl.textContent = `Data: ${dataTime}`;
      }
      if (badgeEl) {
        badgeEl.title = `Data exported from PMS at ${dataTime}\n• Punchlist: ${m.punchlist_file} (${m.punchlist_updated || "-"})\n• Checksheet: ${m.checksheet_file} (${m.checksheet_updated || "-"})\n• Synced: ${m.last_updated || "-"}`;
      }
    }
  }

  // --- Tab Bar & Multi-Tab Detail Navigation (Matches SOI0007689 SQCL) ---
  window.switchMainTab = function (tabName) {
    if (state.activeTab === tabName) return;
    state.activeTab = tabName;
    renderTabBar();
    renderTabContent();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  function buildDetailUrl(criteria) {
    const url = new URL(window.location.href.split("?")[0]);
    url.searchParams.set("detail", "1");
    if (criteria.source) url.searchParams.set("source", criteria.source);
    if (criteria.system && criteria.system !== "ALL") url.searchParams.set("system", criteria.system);
    if (criteria.subSystem && criteria.subSystem !== "ALL") url.searchParams.set("subSystem", criteria.subSystem);
    if (criteria.discipline && criteria.discipline !== "ALL") url.searchParams.set("discipline", criteria.discipline);
    if (criteria.category && criteria.category !== "ALL") url.searchParams.set("category", criteria.category);
    if (criteria.itrGroup && criteria.itrGroup !== "ALL") url.searchParams.set("itrGroup", criteria.itrGroup);
    if (criteria.status && criteria.status !== "ALL") url.searchParams.set("status", criteria.status);
    if (criteria.title) url.searchParams.set("title", criteria.title);
    return url.toString();
  }

  window.openDetailTab = function (criteria, forceNewWindow = false) {
    if (!criteria) return;
    if (forceNewWindow) {
      window.open(buildDetailUrl(criteria), "_blank");
      return;
    }

    const srcKey = criteria.source || "checksheet";
    const sysKey = criteria.system || "ALL";
    const subKey = criteria.subSystem || "ALL";
    const discKey = criteria.discipline || "ALL";
    const catKey = criteria.category || "ALL";
    const itrKey = criteria.itrGroup || "ALL";
    const stKey = criteria.status || "ALL";

    const tabId = (
      "detail_" +
      [srcKey, sysKey, subKey, discKey, catKey, itrKey, stKey]
        .join("__")
        .replace(/[^a-zA-Z0-9_-]/g, "_")
    );

    const existing = state.detailTabs.find((t) => t.id === tabId);
    if (existing) {
      existing.localFilters.status = stKey;
      state.activeTab = tabId;
      renderAll();
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    let shortTitle = criteria.title || "";
    if (!shortTitle) {
      const scopeLabel =
        subKey !== "ALL"
          ? subKey
          : discKey !== "ALL"
          ? discKey
          : sysKey !== "ALL"
          ? sysKey
          : "All Scope";
      const gateLabel =
        srcKey === "subsystem"
          ? "Full Detail"
          : srcKey === "checksheet"
          ? itrKey !== "ALL"
            ? itrKey
            : "Checksheets"
          : catKey !== "ALL"
          ? `Punch Cat ${catKey}`
          : "Punchlist";
      const stSuffix = stKey !== "ALL" ? ` (${stKey})` : "";
      shortTitle = `${scopeLabel} • ${gateLabel}${stSuffix}`;
    }

    const newTab = {
      id: tabId,
      title: shortTitle,
      source: srcKey,
      criteria: {
        source: srcKey,
        system: sysKey,
        subSystem: subKey,
        discipline: discKey,
        category: catKey,
        itrGroup: itrKey,
        status: stKey,
        title: shortTitle,
      },
      localFilters: {
        search: "",
        status: stKey,
        section: criteria.section || "ALL",
        gate: criteria.gate || "ALL",
      },
      limit: BATCH_SIZE,
      limitPl: BATCH_SIZE,
      limitCs: BATCH_SIZE,
    };

    state.detailTabs.push(newTab);
    state.activeTab = tabId;
    renderAll();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  window.closeDetailTab = function (tabId, ev) {
    if (ev) ev.stopPropagation();
    const idx = state.detailTabs.findIndex((t) => t.id === tabId);
    if (idx === -1) return;
    state.detailTabs.splice(idx, 1);
    if (state.activeTab === tabId) {
      state.activeTab =
        state.detailTabs.length > 0
          ? state.detailTabs[Math.max(0, idx - 1)].id
          : "overview";
    }
    renderAll();
  };

  function renderTabBar() {
    const bar = document.getElementById("multi-tab-bar");
    if (!bar || !state.data) return;

    const totalPl = state.data.punchlist.rows.length;
    const filteredPl = getFilteredPunchlist();
    const plCount = filteredPl.length;
    const isPlFiltered = plCount !== totalPl;

    const totalCs = state.data.checksheet.rows.length;
    const filteredCs = getFilteredChecksheets();
    const csCount = filteredCs.length;
    const isCsFiltered = csCount !== totalCs;

    const isOv = state.activeTab === "overview";
    const isPl = state.activeTab === "punchlist";
    const isCs = state.activeTab === "checksheet";

    const ovStats = getOverviewStats();
    const totalAllGates =
      ovStats.global.itrA.total +
      ovStats.global.itrB.total +
      ovStats.global.punchA.total +
      ovStats.global.punchB.total +
      ovStats.global.punchC.total;
    const closedAllGates =
      ovStats.global.itrA.closed +
      ovStats.global.itrB.closed +
      ovStats.global.punchA.closed +
      ovStats.global.punchB.closed +
      ovStats.global.punchC.closed;
    const ovPct = totalAllGates > 0 ? ((closedAllGates / totalAllGates) * 100).toFixed(1) : "0.0";

    const allSubsCount = ovStats.bySubSystem.length;
    let activeSubsCount = allSubsCount;
    if (isPl && isPlFiltered) {
      const sSet = new Set();
      filteredPl.forEach((r) => {
        const s = state.data.punchlist.pool[r[1]];
        if (s) sSet.add(s);
      });
      activeSubsCount = sSet.size;
    } else if (isCs && isCsFiltered) {
      const sSet = new Set();
      filteredCs.forEach((r) => {
        const s = state.data.checksheet.pool[r[1]];
        if (s) sSet.add(s);
      });
      activeSubsCount = sSet.size;
    }
    const currentTabFiltered = (isPl && isPlFiltered) || (isCs && isCsFiltered);

    const detailTabsHtml = state.detailTabs
      .map((t) => {
        const active = state.activeTab === t.id;
        const isDetSub = t.source === "subsystem";
        const isDetPl = t.source === "punchlist";
        const rowsCount = isDetSub
          ? getSubDetailCounts(t).totalFiltered
          : getDetailFilteredRows(t).length;
        const tabActiveCls = isDetSub
          ? "bg-teal-600 text-white border-teal-500 shadow-md ring-2 ring-white/20"
          : isDetPl
          ? "bg-rose-600 text-white border-rose-500 shadow-md ring-2 ring-white/20"
          : "bg-indigo-600 text-white border-indigo-500 shadow-md ring-2 ring-white/20";
        const badgeCls = isDetSub
          ? "bg-teal-900/50 text-teal-100"
          : isDetPl
          ? "bg-rose-900/50 text-rose-100"
          : "bg-blue-900/50 text-blue-100";
        const badgeLabel = isDetSub ? "SUB" : isDetPl ? "PL" : "ITR";
        return `
          <div
            onclick="switchMainTab('${esc(t.id)}')"
            class="group cursor-pointer px-3.5 py-2 rounded-xl text-xs sm:text-sm font-bold flex items-center gap-2 transition-all shadow-sm shrink-0 border ${
              active
                ? tabActiveCls
                : "bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
            }"
            title="${esc(t.title)}"
          >
            <span class="px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${badgeCls}">${badgeLabel}</span>
            <span class="max-w-[180px] truncate">${esc(t.title)}</span>
            <span id="detail-tab-badge-${esc(t.id)}" class="px-2 py-0.5 rounded-full text-xs font-black ${
              active ? "bg-white/20 text-white" : "bg-slate-700 text-slate-300"
            }">${rowsCount.toLocaleString()}</span>
            <button
              onclick="closeDetailTab('${esc(t.id)}', event)"
              class="ml-0.5 w-4 h-4 rounded-full flex items-center justify-center hover:bg-white/25 transition-colors ${
                active ? "text-white" : "text-slate-400 hover:text-white"
              }"
              title="Close tab"
            >
              <i class="fas fa-times text-[10px]"></i>
            </button>
          </div>
        `;
      })
      .join("");

    bar.innerHTML = `
      <div class="flex items-center gap-2">
        <button
          onclick="switchMainTab('overview')"
          class="px-4 py-2 rounded-xl text-sm sm:text-base font-black flex items-center gap-2.5 transition-all shadow-sm shrink-0 ${
            isOv
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-chart-pie text-base"></i>
          <span>Overview</span>
          <span class="px-2.5 py-0.5 rounded-full text-xs font-black ${
            isOv ? "bg-white/20 text-white" : "bg-slate-700 text-emerald-300"
          }" title="Overall Gate Completion %">
            ${ovPct}%
          </span>
        </button>

        <button
          onclick="switchMainTab('punchlist')"
          class="px-4 py-2 rounded-xl text-sm sm:text-base font-black flex items-center gap-2.5 transition-all shadow-sm shrink-0 ${
            isPl
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-clipboard-list text-base"></i>
          <span>Punchlist</span>
          <span id="tab-pl-badge" class="px-2.5 py-0.5 rounded-full text-xs font-black transition-all ${
            isPlFiltered
              ? "bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-300"
              : isPl
              ? "bg-white/20 text-white"
              : "bg-slate-700 text-slate-300"
          }" title="${isPlFiltered ? `Filtered: ${plCount.toLocaleString()} of ${totalPl.toLocaleString()} items` : `Total: ${totalPl.toLocaleString()} items`}">
            ${isPlFiltered ? `${plCount.toLocaleString()} / ${totalPl.toLocaleString()}` : totalPl.toLocaleString()}
          </span>
        </button>

        <button
          onclick="switchMainTab('checksheet')"
          class="px-4 py-2 rounded-xl text-sm sm:text-base font-black flex items-center gap-2.5 transition-all shadow-sm shrink-0 ${
            isCs
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-tasks text-base"></i>
          <span>Checksheet</span>
          <span id="tab-cs-badge" class="px-2.5 py-0.5 rounded-full text-xs font-black transition-all ${
            isCsFiltered
              ? "bg-amber-400 text-slate-900 shadow-sm ring-1 ring-amber-300"
              : isCs
              ? "bg-white/20 text-white"
              : "bg-slate-700 text-slate-300"
          }" title="${isCsFiltered ? `Filtered: ${csCount.toLocaleString()} of ${totalCs.toLocaleString()} items` : `Total: ${totalCs.toLocaleString()} items`}">
            ${isCsFiltered ? `${csCount.toLocaleString()} / ${totalCs.toLocaleString()}` : totalCs.toLocaleString()}
          </span>
        </button>

        ${detailTabsHtml}
      </div>

      <div class="hidden md:flex items-center gap-2 text-xs text-slate-400 pr-2 shrink-0">
        <span class="inline-flex items-center gap-1.5"><i class="fas fa-server text-blue-400"></i> CPP TOPSIDE</span>
        <span>•</span>
        <span id="header-subs-summary" class="${currentTabFiltered ? "text-amber-300 font-bold" : ""}">
          ${currentTabFiltered ? `${activeSubsCount} / ${allSubsCount} SubSystems (Filtered)` : `${allSubsCount} SubSystems`}
        </span>
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

    if (state.activeTab === "overview") {
      renderOverviewTab(container);
    } else if (state.activeTab === "punchlist") {
      renderPunchlistTab(container);
    } else if (state.activeTab === "checksheet") {
      renderChecksheetTab(container);
    } else {
      const dTab = state.detailTabs.find((t) => t.id === state.activeTab);
      if (dTab) {
        renderDetailTab(dTab, container);
      } else {
        state.activeTab = "overview";
        renderOverviewTab(container);
      }
    }
    requestAnimationFrame(updateAppHeaderStickyOffset);
  }

  // =========================================================================
  // TAB 0: OVERVIEW SUMMARY (ITR-A, PUNCH A/B/C, ITR-B) - REF: SOI0007689
  // =========================================================================
  const DISC_THEMES = {
    Piping: { bar: "#3B82F6", badge: "bg-blue-100 text-blue-700" },
    Mechanical: { bar: "#10B981", badge: "bg-emerald-100 text-emerald-700" },
    Electrical: { bar: "#F59E0B", badge: "bg-amber-100 text-amber-700" },
    Instrument: { bar: "#8B5CF6", badge: "bg-purple-100 text-purple-700" },
    Safety: { bar: "#EF4444", badge: "bg-rose-100 text-rose-700" },
    Structure: { bar: "#64748B", badge: "bg-slate-200 text-slate-700" },
    HVAC: { bar: "#06B6D4", badge: "bg-cyan-100 text-cyan-700" },
    Telecom: { bar: "#EC4899", badge: "bg-pink-100 text-pink-700" },
    Architecture: { bar: "#6366F1", badge: "bg-indigo-100 text-indigo-700" },
    Painting: { bar: "#EA580C", badge: "bg-orange-100 text-orange-700" },
    Unassigned: { bar: "#94A3B8", badge: "bg-slate-100 text-slate-600" },
  };

  function makeGateBucket() {
    return { total: 0, closed: 0, open: 0, pct: 0 };
  }

  function finalizeGateBucket(b) {
    b.open = Math.max(0, b.total - b.closed);
    b.pct = b.total > 0 ? Number(((b.closed / b.total) * 100).toFixed(1)) : 0;
    return b;
  }

  function finalizeSummaryRow(row) {
    finalizeGateBucket(row.itrA);
    finalizeGateBucket(row.punchA);
    finalizeGateBucket(row.punchB);
    finalizeGateBucket(row.punchC);
    finalizeGateBucket(row.itrB);
    row.overallTotal =
      row.itrA.total + row.punchA.total + row.punchB.total + row.punchC.total + row.itrB.total;
    row.overallClosed =
      row.itrA.closed + row.punchA.closed + row.punchB.closed + row.punchC.closed + row.itrB.closed;
    row.overallPct =
      row.overallTotal > 0 ? Number(((row.overallClosed / row.overallTotal) * 100).toFixed(1)) : 0;
    const itrTot = row.itrA.total + row.itrB.total;
    const itrCl = row.itrA.closed + row.itrB.closed;
    row.itrPct = itrTot > 0 ? Number(((itrCl / itrTot) * 100).toFixed(1)) : 0;
    const plTot = row.punchA.total + row.punchB.total + row.punchC.total;
    const plCl = row.punchA.closed + row.punchB.closed + row.punchC.closed;
    row.punchPct = plTot > 0 ? Number(((plCl / plTot) * 100).toFixed(1)) : 0;
    return row;
  }

  function inferSystemFromSub(subNo) {
    if (!subNo) return "";
    const parts = subNo.split("-");
    return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : subNo;
  }
  const deriveSystemNo = inferSystemFromSub;
  window.deriveSystemNo = deriveSystemNo;
  window.inferSystemFromSub = inferSystemFromSub;

  function getOverviewStats() {
    const rawSysFilter = (state.overviewFilters.system || "ALL").trim();
    const sysFilter = rawSysFilter.toUpperCase();
    const isSysFiltered = sysFilter !== "ALL" && sysFilter !== "";
    if (
      state.overviewCache &&
      state.overviewCache.dataRef === state.data &&
      state.overviewCache.system === sysFilter
    ) {
      return state.overviewCache.stats;
    }

    const plRows = state.data.punchlist.rows;
    const plPool = state.data.punchlist.pool;
    const csRows = state.data.checksheet.rows;
    const csPool = state.data.checksheet.pool;
    const subsDict = state.data.subsystems || {};

    const global = {
      itrA: makeGateBucket(),
      punchA: makeGateBucket(),
      punchB: makeGateBucket(),
      punchC: makeGateBucket(),
      itrB: makeGateBucket(),
    };

    const sysSet = new Set();
    const discMap = new Map();
    const subMap = new Map();

    function getDiscEntry(discName) {
      const key = discName || "Unassigned";
      if (!discMap.has(key)) {
        discMap.set(key, {
          discipline: key,
          itrA: makeGateBucket(),
          punchA: makeGateBucket(),
          punchB: makeGateBucket(),
          punchC: makeGateBucket(),
          itrB: makeGateBucket(),
        });
      }
      return discMap.get(key);
    }

    function getSubEntry(subNo, sysNo) {
      const key = subNo || "Unassigned";
      if (!subMap.has(key)) {
        subMap.set(key, {
          subSystem: key,
          description: subsDict[key] || "",
          systemNo: sysNo || inferSystemFromSub(key),
          itrA: makeGateBucket(),
          punchA: makeGateBucket(),
          punchB: makeGateBucket(),
          punchC: makeGateBucket(),
          itrB: makeGateBucket(),
        });
      }
      return subMap.get(key);
    }

    // Checksheets Loop
    for (let i = 0; i < csRows.length; i++) {
      const r = csRows[i];
      const subNo = csPool[r[1]] || "";
      const sysNo = inferSystemFromSub(subNo);
      if (sysNo) sysSet.add(sysNo);
      if (isSysFiltered) {
        const sysUpper = sysNo.toUpperCase();
        if (sysUpper !== sysFilter && !sysUpper.includes(sysFilter)) continue;
      }

      const disc = csPool[r[4]] || "Unassigned";
      const csType = (csPool[r[5]] || "").trim().toUpperCase();
      const isComp = Boolean(csPool[r[6]]);

      let gateKey = null;
      if (csType.endsWith("A")) gateKey = "itrA";
      else if (csType.endsWith("B")) gateKey = "itrB";
      if (!gateKey) continue;

      global[gateKey].total++;
      if (isComp) global[gateKey].closed++;

      const dEntry = getDiscEntry(disc);
      dEntry[gateKey].total++;
      if (isComp) dEntry[gateKey].closed++;

      const sEntry = getSubEntry(subNo, sysNo);
      sEntry[gateKey].total++;
      if (isComp) sEntry[gateKey].closed++;
    }

    // Punchlist Loop
    for (let i = 0; i < plRows.length; i++) {
      const r = plRows[i];
      const sysNo = plPool[r[0]] || inferSystemFromSub(plPool[r[1]] || "");
      const subNo = plPool[r[1]] || "";
      if (sysNo) sysSet.add(sysNo);
      if (isSysFiltered) {
        const sysUpper = sysNo.toUpperCase();
        if (sysUpper !== sysFilter && !sysUpper.includes(sysFilter)) continue;
      }

      const cat = (r[8] || "").toUpperCase();
      const status = plPool[r[9]] || "";
      const isClosed = status === "Closed";
      const disc = plPool[r[15]] || "Unassigned";

      let gateKey = null;
      if (cat === "A") gateKey = "punchA";
      else if (cat === "B") gateKey = "punchB";
      else if (cat === "C") gateKey = "punchC";
      if (!gateKey) continue;

      global[gateKey].total++;
      if (isClosed) global[gateKey].closed++;

      const dEntry = getDiscEntry(disc);
      dEntry[gateKey].total++;
      if (isClosed) dEntry[gateKey].closed++;

      const sEntry = getSubEntry(subNo, sysNo);
      sEntry[gateKey].total++;
      if (isClosed) sEntry[gateKey].closed++;
    }

    finalizeGateBucket(global.itrA);
    finalizeGateBucket(global.punchA);
    finalizeGateBucket(global.punchB);
    finalizeGateBucket(global.punchC);
    finalizeGateBucket(global.itrB);

    const byDiscipline = Array.from(discMap.values())
      .map(finalizeSummaryRow)
      .sort((a, b) => a.discipline.localeCompare(b.discipline));

    const bySubSystem = Array.from(subMap.values())
      .map(finalizeSummaryRow)
      .sort((a, b) => a.subSystem.localeCompare(b.subSystem));

    const stats = {
      global,
      allSystems: Array.from(sysSet).sort(),
      byDiscipline,
      bySubSystem,
    };

    state.overviewCache = {
      dataRef: state.data,
      system: sysFilter,
      stats,
    };
    return stats;
  }

  function renderGateCellHtml(bucket, allCriteria, openCriteria, themeAccent = "blue") {
    if (!bucket || bucket.total === 0) {
      return `<td class="py-2.5 px-2.5 text-center text-slate-300 font-mono text-xs">-</td>`;
    }

    const barColor =
      bucket.pct >= 100
        ? "bg-emerald-500"
        : themeAccent === "rose"
        ? "bg-rose-500"
        : themeAccent === "amber"
        ? "bg-amber-500"
        : themeAccent === "indigo"
        ? "bg-indigo-500"
        : "bg-blue-500";

    const pctBadgeClass =
      bucket.pct >= 100
        ? "bg-emerald-100 text-emerald-800 border-emerald-200"
        : bucket.pct >= 60
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : "bg-amber-50 text-amber-800 border-amber-200";

    const openColorClass =
      themeAccent === "rose"
        ? "bg-rose-100 hover:bg-rose-200 text-rose-800 border-rose-200"
        : themeAccent === "amber"
        ? "bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200"
        : "bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200";

    const closedStatus = allCriteria && allCriteria.source === "checksheet" ? "Completed" : "Closed";
    const closedCriteria = Object.assign({}, allCriteria, {
      status: closedStatus,
      title: `${allCriteria.title || "Detail"} (${closedStatus})`,
    });
    const allJson = esc(JSON.stringify(allCriteria));
    const closedJson = esc(JSON.stringify(closedCriteria));
    const openJson = esc(JSON.stringify(openCriteria));

    return `
      <td class="py-2.5 px-3 text-xs sm:text-sm">
        <div
          onclick="openDetailTab(${allJson})"
          class="cursor-pointer rounded-xl p-2 hover:bg-blue-50/70 transition-colors border border-transparent hover:border-blue-200"
          title="Click to view all ${bucket.total.toLocaleString()} items"
        >
          <div class="flex items-center justify-between gap-2 whitespace-nowrap">
            <span class="font-mono text-xs sm:text-sm inline-flex items-center gap-0.5">
              <button
                type="button"
                onclick="event.stopPropagation(); openDetailTab(${closedJson})"
                class="px-1 py-0.2 rounded text-emerald-700 hover:bg-emerald-100 font-black transition-colors cursor-pointer"
                title="Click to inspect ${bucket.closed.toLocaleString()} ${closedStatus.toLowerCase()} items"
              >${bucket.closed.toLocaleString()}</button><span class="text-slate-400 font-semibold">/${bucket.total.toLocaleString()}</span>
            </span>
            <span class="px-2 py-0.5 rounded-md text-xs font-black border ${pctBadgeClass}">
              ${bucket.pct}%
            </span>
          </div>
          <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
            <div class="h-full rounded-full ${barColor}" style="width: ${bucket.pct}%"></div>
          </div>
          <div class="mt-1.5 flex items-center justify-between">
            ${
              bucket.open > 0
                ? `<button
                    onclick="event.stopPropagation(); openDetailTab(${openJson})"
                    class="px-2 py-0.5 rounded-md text-xs font-bold border ${openColorClass} transition-colors"
                    title="Click to inspect ${bucket.open.toLocaleString()} open/remaining items"
                  >
                    Open: ${bucket.open.toLocaleString()}
                  </button>`
                : `<span class="text-xs font-bold text-emerald-600 flex items-center gap-1"><i class="fas fa-check-circle text-xs"></i> Complete</span>`
            }
          </div>
        </div>
      </td>
    `;
  }

  function getFilteredOverviewSubSystems(bySubSystem) {
    const q = (state.overviewFilters.subSearch || "").trim().toLowerCase();
    const qf = state.overviewFilters.subQuickFilter || "ALL";

    return bySubSystem.filter((s) => {
      if (qf === "OPEN_PUNCH_A" && s.punchA.open <= 0) return false;
      if (qf === "OPEN_PUNCH" && s.punchA.open + s.punchB.open + s.punchC.open <= 0) return false;
      if (qf === "REM_ITR_A" && s.itrA.open <= 0) return false;
      if (qf === "REM_ITR_B" && s.itrB.open <= 0) return false;
      if (qf === "DONE_100" && s.overallPct < 100) return false;

      if (q) {
        const hay = `${s.subSystem} ${s.description}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderOvSubTableRows(filteredSubs) {
    if (filteredSubs.length === 0) {
      return `<tr><td colspan="8" class="py-10 text-center text-slate-400 text-xs">No matching SubSystems found.</td></tr>`;
    }
    const sys = state.overviewFilters.system || "ALL";
    return filteredSubs
      .map((s, idx) => {
        const sub = s.subSystem;
        const subFullCrit = esc(JSON.stringify({ source: "subsystem", system: sys, subSystem: sub, title: `${sub} • Full Detail` }));
        const itrAllCrit = esc(JSON.stringify({ source: "checksheet", system: sys, subSystem: sub, itrGroup: "ALL", status: "ALL", title: `${sub} • All ITRs` }));
        const plAllCrit = esc(JSON.stringify({ source: "punchlist", system: sys, subSystem: sub, category: "ALL", status: "ALL", title: `${sub} • All Punch` }));

        return `
          <tr class="hover:bg-blue-50/30 border-b border-slate-100 text-xs sm:text-sm transition-colors">
            <td class="py-2.5 px-2.5 text-center text-slate-400 font-mono font-semibold whitespace-nowrap">${idx + 1}</td>
            <td class="py-2.5 px-3 min-w-[200px] max-w-[280px]">
              <button
                type="button"
                onclick="openDetailTab(${subFullCrit})"
                class="font-mono font-black text-blue-700 hover:text-blue-900 hover:underline text-xs sm:text-sm inline-flex items-center gap-1.5 text-left cursor-pointer group/sub"
                title="Open full detail for SubSystem ${esc(sub)} (ITR-A/B & Punchlist A/B/C) in new tab"
              >
                <span>${esc(sub)}</span>
                <i class="fas fa-arrow-up-right-from-square text-[10px] text-blue-400 group-hover/sub:text-blue-700"></i>
              </button>
              ${s.description ? `<div class="text-xs text-slate-600 font-medium truncate max-w-[260px] mt-0.5" title="${esc(s.description)}">${esc(s.description)}</div>` : ""}
              <div class="flex items-center gap-2 mt-1.5">
                <button onclick="openDetailTab(${itrAllCrit})" class="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition-colors">All ITRs</button>
                <button onclick="openDetailTab(${plAllCrit})" class="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-xs font-bold transition-colors">All Punch</button>
              </div>
            </td>
            ${renderGateCellHtml(
              s.itrA,
              { source: "checksheet", system: sys, subSystem: sub, itrGroup: "ITR-A", status: "ALL", title: `${sub} • ITR-A` },
              { source: "checksheet", system: sys, subSystem: sub, itrGroup: "ITR-A", status: "Remaining", title: `${sub} • ITR-A (Remaining)` },
              "blue"
            )}
            ${renderGateCellHtml(
              s.punchA,
              { source: "punchlist", system: sys, subSystem: sub, category: "A", status: "ALL", title: `${sub} • Punch Cat A` },
              { source: "punchlist", system: sys, subSystem: sub, category: "A", status: "Open", title: `${sub} • Punch Cat A (Open)` },
              "rose"
            )}
            ${renderGateCellHtml(
              s.punchB,
              { source: "punchlist", system: sys, subSystem: sub, category: "B", status: "ALL", title: `${sub} • Punch Cat B` },
              { source: "punchlist", system: sys, subSystem: sub, category: "B", status: "Open", title: `${sub} • Punch Cat B (Open)` },
              "amber"
            )}
            ${renderGateCellHtml(
              s.punchC,
              { source: "punchlist", system: sys, subSystem: sub, category: "C", status: "ALL", title: `${sub} • Punch Cat C` },
              { source: "punchlist", system: sys, subSystem: sub, category: "C", status: "Open", title: `${sub} • Punch Cat C (Open)` },
              "blue"
            )}
            ${renderGateCellHtml(
              s.itrB,
              { source: "checksheet", system: sys, subSystem: sub, itrGroup: "ITR-B", status: "ALL", title: `${sub} • ITR-B` },
              { source: "checksheet", system: sys, subSystem: sub, itrGroup: "ITR-B", status: "Remaining", title: `${sub} • ITR-B (Remaining)` },
              "indigo"
            )}
            <td class="py-2.5 px-3 min-w-[135px]">
              <div class="flex items-center justify-between text-xs sm:text-sm font-black text-slate-800">
                <span>${s.overallPct}%</span>
                <span class="text-xs font-mono text-slate-500 font-semibold">${s.overallClosed}/${s.overallTotal}</span>
              </div>
              <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                <div class="h-full rounded-full ${s.overallPct >= 100 ? "bg-emerald-500" : "bg-teal-500"}" style="width: ${s.overallPct}%"></div>
              </div>
              <div class="text-xs text-slate-500 mt-1 font-mono font-medium">ITR: ${s.itrPct}% | PL: ${s.punchPct}%</div>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  let debounceOvSubTimer = null;
  window.debounceOvSubSearch = function (val) {
    state.overviewFilters.subSearch = val;
    clearTimeout(debounceOvSubTimer);
    debounceOvSubTimer = setTimeout(() => {
      const stats = getOverviewStats();
      const filteredSubs = getFilteredOverviewSubSystems(stats.bySubSystem);
      const tbody = document.getElementById("ov-sub-tbody");
      if (tbody) tbody.innerHTML = renderOvSubTableRows(filteredSubs);
      const badge = document.getElementById("ov-sub-count-badge");
      if (badge) badge.textContent = `${filteredSubs.length} of ${stats.bySubSystem.length} SubSystems`;
    }, 180);
  };

  window.setOvSystem = function (sysVal, keepFocus) {
    state.overviewFilters.system = sysVal || "ALL";
    state.overviewCache = null;
    renderTabContent();
    if (keepFocus) {
      requestAnimationFrame(() => {
        const inp = document.getElementById("ov-sys-search");
        if (inp) {
          inp.focus();
          const len = inp.value.length;
          inp.setSelectionRange(len, len);
        }
      });
    }
  };

  let debounceOvSysTimer = null;
  window.debounceOvSystemSearch = function (val) {
    const clearBtn = document.getElementById("ov-sys-clear-btn");
    if (clearBtn) {
      if (val && val.trim() !== "" && val.trim().toUpperCase() !== "ALL") {
        clearBtn.classList.remove("hidden");
      } else {
        clearBtn.classList.add("hidden");
      }
    }
    clearTimeout(debounceOvSysTimer);
    debounceOvSysTimer = setTimeout(() => {
      setOvSystem(val, true);
    }, 280);
  };

  window.setOvSubQuickFilter = function (qf) {
    state.overviewFilters.subQuickFilter = qf;
    renderTabContent();
  };

  window.setOvItrBarMetric = function (metric) {
    state.overviewFilters.itrBarMetric = metric;
    document.querySelectorAll("[data-ov-itr-bar]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-itr-bar") === metric;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderItrDisciplineBarChart(getOverviewStats());
  };

  window.setOvPunchBarMetric = function (metric) {
    state.overviewFilters.punchBarMetric = metric;
    document.querySelectorAll("[data-ov-punch-bar]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-punch-bar") === metric;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-rose-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderPunchDisciplineBarChart(getOverviewStats());
  };

  window.setOvItrLineFocus = function (focus) {
    state.overviewFilters.itrLineFocus = focus;
    document.querySelectorAll("[data-ov-itr-focus]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-itr-focus") === focus;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-indigo-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderItrLineChart();
  };

  window.setOvItrLineGran = function (gran) {
    state.overviewFilters.itrLineGran = gran;
    document.querySelectorAll("[data-ov-itr-gran]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-itr-gran") === gran;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderItrLineChart();
  };

  window.setOvItrLineMode = function (mode) {
    state.overviewFilters.itrLineMode = mode;
    document.querySelectorAll("[data-ov-itr-mode]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-itr-mode") === mode;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderItrLineChart();
  };

  window.setOvPunchLineFocus = function (focus) {
    state.overviewFilters.punchLineFocus = focus;
    document.querySelectorAll("[data-ov-punch-focus]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-punch-focus") === focus;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-amber-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderPunchLineChart();
  };

  window.setOvPunchLineGran = function (gran) {
    state.overviewFilters.punchLineGran = gran;
    document.querySelectorAll("[data-ov-punch-gran]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-punch-gran") === gran;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderPunchLineChart();
  };

  window.setOvPunchLineMode = function (mode) {
    state.overviewFilters.punchLineMode = mode;
    document.querySelectorAll("[data-ov-punch-mode]").forEach((btn) => {
      const active = btn.getAttribute("data-ov-punch-mode") === mode;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-rose-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
    renderPunchLineChart();
  };

  const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  function parseDdMmYyyyParts(dateStr) {
    if (!dateStr || typeof dateStr !== "string") return null;
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(dateStr.trim());
    if (!m) return null;
    const dd = Number(m[1]);
    const mm = Number(m[2]);
    const yyyy = Number(m[3]);
    if (!dd || !mm || !yyyy || mm > 12 || dd > 31) return null;
    return { dd, mm, yyyy, mStr: m[2], dStr: m[1], yStr: m[3], iso: `${m[3]}-${m[2]}-${m[1]}` };
  }

  function dateToBucket(parts, granularity) {
    if (!parts) return null;
    if (granularity === "month") {
      return {
        key: `${parts.yStr}-${parts.mStr}`,
        label: `${MONTHS_SHORT[parts.mm - 1]} ${parts.yStr.slice(2)}`,
      };
    }
    if (granularity === "day") {
      return {
        key: parts.iso,
        label: `${parts.dStr} ${MONTHS_SHORT[parts.mm - 1]}`,
      };
    }
    const utcMs = Date.UTC(parts.yyyy, parts.mm - 1, parts.dd);
    const utcDay = new Date(utcMs).getUTCDay();
    const diffToMon = (utcDay + 6) % 7;
    const monDate = new Date(utcMs - diffToMon * 86400000);
    const my = monDate.getUTCFullYear();
    const mm = String(monDate.getUTCMonth() + 1).padStart(2, "0");
    const md = String(monDate.getUTCDate()).padStart(2, "0");
    return {
      key: `${my}-${mm}-${md}`,
      label: `${md} ${MONTHS_SHORT[monDate.getUTCMonth()]} ${String(my).slice(2)}`,
    };
  }

  /**
   * Build cumulative Plan (Bar) vs Actual (Line) timeline points, stopping Actual lines
   * at maxActualKey while allowing Plan bars to extend across future scheduled periods.
   */
  function buildMixedTimeline(bucketMap, maxActualKey, keys, totals, granularity) {
    const sortedAll = Array.from(bucketMap.values()).sort((a, b) => a.key.localeCompare(b.key));
    const cumAct = {};
    const cumPlan = {};
    keys.forEach((k) => {
      cumAct[k] = 0;
      cumPlan[k] = 0;
    });

    const fullPoints = sortedAll.map((b) => {
      const isFutureActual = !maxActualKey || b.key > maxActualKey;
      const point = {
        key: b.key,
        label: b.label,
        deltaAct: {},
        deltaPlan: {},
        cumAct: {},
        cumPlan: {},
        pctAct: {},
        pctPlan: {},
      };
      keys.forEach((k) => {
        const dA = b.act[k] || 0;
        const dP = b.plan[k] || 0;
        cumAct[k] += dA;
        cumPlan[k] += dP;
        const tot = totals[k] || 0;
        point.deltaAct[k] = isFutureActual ? null : dA;
        point.deltaPlan[k] = dP;
        point.cumAct[k] = isFutureActual ? null : cumAct[k];
        point.cumPlan[k] = cumPlan[k];
        point.pctAct[k] = isFutureActual || tot <= 0 ? null : Number(((cumAct[k] / tot) * 100).toFixed(1));
        point.pctPlan[k] = tot > 0 ? Number(((cumPlan[k] / tot) * 100).toFixed(1)) : null;
      });
      return point;
    });

    let points = fullPoints;
    if (granularity === "day" && fullPoints.length > 45) {
      let maxIdx = maxActualKey ? fullPoints.findIndex((p) => p.key === maxActualKey) : fullPoints.length - 1;
      if (maxIdx < 0) maxIdx = fullPoints.length - 1;
      let endIdx = Math.min(fullPoints.length, maxIdx + 11);
      const startIdx = Math.max(0, endIdx - 45);
      if (endIdx - startIdx < 45 && endIdx < fullPoints.length) {
        endIdx = Math.min(fullPoints.length, startIdx + 45);
      }
      points = fullPoints.slice(startIdx, endIdx);
    }
    return { points, totals, maxActualKey };
  }

  function computeChecksheetTimeline(sysFilter, granularity) {
    const bucketMap = new Map();
    const ensureBucket = (key, label) => {
      let b = bucketMap.get(key);
      if (!b) {
        b = {
          key,
          label,
          act: { itrA: 0, itrB: 0, all: 0 },
          plan: { itrA: 0, itrB: 0, all: 0 },
        };
        bucketMap.set(key, b);
      }
      return b;
    };

    let totA = 0, totB = 0, maxActualKey = "";
    const csRows = state.data.checksheet.rows;
    const csPool = state.data.checksheet.pool;
    for (let i = 0; i < csRows.length; i++) {
      const r = csRows[i];
      const subNo = csPool[r[1]] || "";
      if (sysFilter !== "ALL" && inferSystemFromSub(subNo) !== sysFilter) continue;
      const csType = (csPool[r[5]] || "").trim().toUpperCase();
      const isA = csType.endsWith("A");
      const isB = !isA && csType.endsWith("B");
      if (isA) totA++;
      else if (isB) totB++;
      else continue;

      const actStr = r[6] != null ? csPool[r[6]] || "" : "";
      if (actStr) {
        const bkAct = dateToBucket(parseDdMmYyyyParts(actStr), granularity);
        if (bkAct) {
          const obj = ensureBucket(bkAct.key, bkAct.label);
          if (isA) obj.act.itrA++;
          else obj.act.itrB++;
          obj.act.all++;
          if (bkAct.key > maxActualKey) maxActualKey = bkAct.key;
        }
      }

      const planStr = r[7] != null ? csPool[r[7]] || "" : "";
      if (planStr) {
        const bkPlan = dateToBucket(parseDdMmYyyyParts(planStr), granularity);
        if (bkPlan) {
          const obj = ensureBucket(bkPlan.key, bkPlan.label);
          if (isA) obj.plan.itrA++;
          else obj.plan.itrB++;
          obj.plan.all++;
        }
      }
    }

    return buildMixedTimeline(
      bucketMap,
      maxActualKey,
      ["itrA", "itrB", "all"],
      { itrA: totA, itrB: totB, all: totA + totB },
      granularity
    );
  }

  function computePunchTimeline(sysFilter, granularity) {
    const bucketMap = new Map();
    const ensureBucket = (key, label) => {
      let b = bucketMap.get(key);
      if (!b) {
        b = {
          key,
          label,
          act: { punchA: 0, punchB: 0, punchC: 0, all: 0 },
          plan: { punchA: 0, punchB: 0, punchC: 0, all: 0 },
        };
        bucketMap.set(key, b);
      }
      return b;
    };

    let totA = 0, totB = 0, totC = 0, maxActualKey = "";
    const plRows = state.data.punchlist.rows;
    const plPool = state.data.punchlist.pool;
    for (let i = 0; i < plRows.length; i++) {
      const r = plRows[i];
      const sysNo = plPool[r[0]] || "";
      const subNo = plPool[r[1]] || "";
      if (sysFilter !== "ALL" && sysNo !== sysFilter && inferSystemFromSub(subNo) !== sysFilter) continue;
      const cat = (r[8] || "B").toUpperCase();
      const status = plPool[r[9]] || "Open";
      if (cat === "A") totA++;
      else if (cat === "B") totB++;
      else if (cat === "C") totC++;
      else continue;

      const keyName = cat === "A" ? "punchA" : cat === "B" ? "punchB" : "punchC";

      if (status === "Closed") {
        const closedStr = r[11] != null ? plPool[r[11]] || "" : "";
        if (closedStr) {
          const bkAct = dateToBucket(parseDdMmYyyyParts(closedStr), granularity);
          if (bkAct) {
            const obj = ensureBucket(bkAct.key, bkAct.label);
            obj.act[keyName]++;
            obj.act.all++;
            if (bkAct.key > maxActualKey) maxActualKey = bkAct.key;
          }
        }
      }

      const planStr = r[21] != null ? plPool[r[21]] || "" : "";
      if (planStr) {
        const bkPlan = dateToBucket(parseDdMmYyyyParts(planStr), granularity);
        if (bkPlan) {
          const obj = ensureBucket(bkPlan.key, bkPlan.label);
          obj.plan[keyName]++;
          obj.plan.all++;
        }
      }
    }

    return buildMixedTimeline(
      bucketMap,
      maxActualKey,
      ["punchA", "punchB", "punchC", "all"],
      { punchA: totA, punchB: totB, punchC: totC, all: totA + totB + totC },
      granularity
    );
  }

  function renderItrDisciplineBarChart(stats) {
    if (!window.Chart) return;
    const canvas = document.getElementById("chart-ov-itr-disc");
    if (!canvas) return;
    if (state.charts.ovItrDisc) state.charts.ovItrDisc.destroy();

    const sys = state.overviewFilters.system || "ALL";
    const metric = state.overviewFilters.itrBarMetric || "ALL_ITR";
    const discList = stats.byDiscipline.filter((d) => (d.itrA.total + d.itrB.total) > 0);
    const labels = discList.map((d) => d.discipline);

    const getBucket = (d) => {
      if (metric === "ITR-A") return d.itrA;
      if (metric === "ITR-B") return d.itrB;
      const total = d.itrA.total + d.itrB.total;
      const closed = d.itrA.closed + d.itrB.closed;
      return {
        closed,
        open: Math.max(0, total - closed),
        total,
        pct: total > 0 ? Number(((closed / total) * 100).toFixed(1)) : 0,
      };
    };

    state.charts.ovItrDisc = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Completed (Signed-off)",
            data: discList.map((d) => getBucket(d).closed),
            backgroundColor: "#2563EB",
            borderRadius: 4,
          },
          {
            label: "Remaining (Pending)",
            data: discList.map((d) => getBucket(d).open),
            backgroundColor: "#CBD5E1",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (!elements || !elements.length) return;
          const dObj = discList[elements[0].index];
          if (!dObj) return;
          const isOpen = elements[0].datasetIndex === 1;
          const itrGrp = metric === "ALL_ITR" ? "ALL" : metric;
          openDetailTab({
            source: "checksheet",
            system: sys,
            discipline: dObj.discipline,
            itrGroup: itrGrp,
            status: isOpen ? "Remaining" : "ALL",
            title: `${dObj.discipline} • ${itrGrp === "ALL" ? "All ITRs" : itrGrp}${isOpen ? " (Remaining)" : ""}`,
          });
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, font: { size: 12, weight: "bold" } } },
          tooltip: {
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 12 },
            callbacks: {
              afterBody: (items) => {
                if (!items.length) return "";
                const b = getBucket(discList[items[0].dataIndex]);
                return `Completion: ${b.closed.toLocaleString()} / ${b.total.toLocaleString()} (${b.pct}%)`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 11, weight: "bold" } } },
          y: { stacked: true, beginAtZero: true, ticks: { font: { size: 11, weight: "bold" } } },
        },
      },
    });
  }

  /**
   * Render a combined Plan (Bar) + Actual Progress (Line) Chart.js instance.
   */
  function renderMixedPlanActualChart({ canvas, chartKey, tl, seriesDefs, mode }) {
    if (!window.Chart || !canvas) return;
    if (state.charts[chartKey]) state.charts[chartKey].destroy();

    const pts = tl.points;
    const datasets = [];
    const datasetMeta = [];

    // Actual Progress Lines rendered on top of Plan Bars (order: 1 < order: 2)
    seriesDefs.forEach((s) => {
      datasets.push({
        type: "line",
        order: 1,
        label: s.actualLabel,
        data: pts.map((p) => (mode === "pct" ? p.pctAct[s.key] : p.cumAct[s.key])),
        borderColor: s.lineColor,
        backgroundColor: s.lineColor + "1A",
        borderWidth: 2.8,
        tension: 0.22,
        spanGaps: false,
        pointRadius: pts.length > 40 ? 1.5 : 3.2,
        pointHoverRadius: 5,
        fill: false,
      });
      datasetMeta.push({ key: s.key, kind: "actual", label: s.actualLabel, groupLabel: s.groupLabel });
    });

    // Cumulative Planned Bars behind Actual Lines (order: 2)
    seriesDefs.forEach((s) => {
      datasets.push({
        type: "bar",
        order: 2,
        label: s.planLabel,
        data: pts.map((p) => (mode === "pct" ? p.pctPlan[s.key] : p.cumPlan[s.key])),
        backgroundColor: s.barBg,
        borderColor: s.barBorder,
        borderWidth: 1,
        borderRadius: 3,
        barPercentage: 0.86,
        categoryPercentage: 0.78,
      });
      datasetMeta.push({ key: s.key, kind: "plan", label: s.planLabel, groupLabel: s.groupLabel });
    });

    state.charts[chartKey] = new Chart(canvas, {
      type: "bar",
      data: {
        labels: pts.map((p) => p.label),
        datasets,
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: {
            position: "top",
            labels: { boxWidth: 14, usePointStyle: true, font: { size: 12, weight: "bold" } },
          },
          tooltip: {
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 12 },
            callbacks: {
              label: (ctx) => {
                const meta = datasetMeta[ctx.datasetIndex];
                const pt = pts[ctx.dataIndex];
                if (!pt || !meta) return "";
                const tot = tl.totals[meta.key] || 0;
                if (!tot) return `${meta.label}: No items`;
                if (meta.kind === "actual") {
                  const cum = pt.cumAct[meta.key];
                  if (cum == null) return `${meta.label}: — (future period)`;
                  const pct = pt.pctAct[meta.key];
                  const delta = pt.deltaAct[meta.key] || 0;
                  return `${meta.label}: ${pct}% (${cum.toLocaleString()}/${tot.toLocaleString()})${delta > 0 ? ` (+${delta.toLocaleString()})` : ""}`;
                }
                const cumP = pt.cumPlan[meta.key] || 0;
                const pctP = pt.pctPlan[meta.key] ?? 0;
                const deltaP = pt.deltaPlan[meta.key] || 0;
                return `${meta.label}: ${pctP}% (${cumP.toLocaleString()}/${tot.toLocaleString()})${deltaP > 0 ? ` (+${deltaP.toLocaleString()})` : ""}`;
              },
              afterBody: (items) => {
                if (!items || !items.length) return [];
                const pt = pts[items[0].dataIndex];
                if (!pt) return [];
                const lines = [];
                seriesDefs.forEach((s) => {
                  const tot = tl.totals[s.key] || 0;
                  const cumA = pt.cumAct[s.key];
                  const cumP = pt.cumPlan[s.key];
                  if (!tot || cumA == null || cumP == null) return;
                  const diffCnt = cumA - cumP;
                  const diffPct = ((diffCnt / tot) * 100).toFixed(1);
                  const sign = diffCnt > 0 ? "+" : "";
                  lines.push(`Variance (${s.groupLabel}): ${sign}${diffPct}% (${sign}${diffCnt.toLocaleString()} items)`);
                });
                return lines;
              },
            },
          },
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { maxRotation: 40, autoSkip: true, maxTicksLimit: 14, font: { size: 11, weight: "bold" } },
          },
          y: {
            beginAtZero: true,
            max: mode === "pct" ? 100 : undefined,
            ticks: {
              font: { size: 11, weight: "bold" },
              callback: (v) => (mode === "pct" ? v + "%" : Number(v).toLocaleString()),
            },
          },
        },
      },
    });
  }

  const ITR_MIXED_SERIES = {
    "A_B": [
      {
        key: "itrA",
        groupLabel: "ITR-A",
        planLabel: "ITR-A Plan (Bar)",
        actualLabel: "ITR-A Actual (Line)",
        barBg: "rgba(59, 130, 246, 0.24)",
        barBorder: "rgba(37, 99, 235, 0.55)",
        lineColor: "#1D4ED8",
      },
      {
        key: "itrB",
        groupLabel: "ITR-B",
        planLabel: "ITR-B Plan (Bar)",
        actualLabel: "ITR-B Actual (Line)",
        barBg: "rgba(139, 92, 246, 0.24)",
        barBorder: "rgba(124, 58, 237, 0.55)",
        lineColor: "#6D28D9",
      },
    ],
    "ITR-A": [
      {
        key: "itrA",
        groupLabel: "ITR-A",
        planLabel: "ITR-A Plan (Bar)",
        actualLabel: "ITR-A Actual (Line)",
        barBg: "rgba(59, 130, 246, 0.26)",
        barBorder: "rgba(37, 99, 235, 0.6)",
        lineColor: "#1D4ED8",
      },
    ],
    "ITR-B": [
      {
        key: "itrB",
        groupLabel: "ITR-B",
        planLabel: "ITR-B Plan (Bar)",
        actualLabel: "ITR-B Actual (Line)",
        barBg: "rgba(139, 92, 246, 0.26)",
        barBorder: "rgba(124, 58, 237, 0.6)",
        lineColor: "#6D28D9",
      },
    ],
    "TOTAL": [
      {
        key: "all",
        groupLabel: "All ITR",
        planLabel: "All ITR Plan (Bar)",
        actualLabel: "All ITR Actual (Line)",
        barBg: "rgba(15, 118, 110, 0.24)",
        barBorder: "rgba(13, 148, 136, 0.55)",
        lineColor: "#0F766E",
      },
    ],
  };

  function renderItrLineChart() {
    const canvas = document.getElementById("chart-ov-itr-line");
    if (!canvas) return;
    const sys = state.overviewFilters.system || "ALL";
    const focus = state.overviewFilters.itrLineFocus || "A_B";
    const gran = state.overviewFilters.itrLineGran || "week";
    const mode = state.overviewFilters.itrLineMode || "pct";
    const tl = computeChecksheetTimeline(sys, gran);
    const seriesDefs = ITR_MIXED_SERIES[focus] || ITR_MIXED_SERIES.A_B;
    renderMixedPlanActualChart({ canvas, chartKey: "ovItrLine", tl, seriesDefs, mode });
  }

  function renderPunchDisciplineBarChart(stats) {
    if (!window.Chart) return;
    const canvas = document.getElementById("chart-ov-punch-disc");
    if (!canvas) return;
    if (state.charts.ovPunchDisc) state.charts.ovPunchDisc.destroy();

    const sys = state.overviewFilters.system || "ALL";
    const metric = state.overviewFilters.punchBarMetric || "ALL_PUNCH";
    const discList = stats.byDiscipline.filter((d) => (d.punchA.total + d.punchB.total + d.punchC.total) > 0);
    const labels = discList.map((d) => d.discipline);

    const getBucket = (d) => {
      if (metric === "PUNCH-A") return d.punchA;
      if (metric === "PUNCH-B") return d.punchB;
      if (metric === "PUNCH-C") return d.punchC;
      const total = d.punchA.total + d.punchB.total + d.punchC.total;
      const closed = d.punchA.closed + d.punchB.closed + d.punchC.closed;
      return {
        closed,
        open: Math.max(0, total - closed),
        total,
        pct: total > 0 ? Number(((closed / total) * 100).toFixed(1)) : 0,
      };
    };

    state.charts.ovPunchDisc = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: "Closed",
            data: discList.map((d) => getBucket(d).closed),
            backgroundColor: "#10B981",
            borderRadius: 4,
          },
          {
            label: "Open",
            data: discList.map((d) => getBucket(d).open),
            backgroundColor: "#E11D48",
            borderRadius: 4,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        onClick: (evt, elements) => {
          if (!elements || !elements.length) return;
          const dObj = discList[elements[0].index];
          if (!dObj) return;
          const isOpen = elements[0].datasetIndex === 1;
          const cat = metric === "ALL_PUNCH" ? "ALL" : metric.split("-")[1];
          openDetailTab({
            source: "punchlist",
            system: sys,
            discipline: dObj.discipline,
            category: cat,
            status: isOpen ? "Open" : "ALL",
            title: `${dObj.discipline} • ${cat === "ALL" ? "All Punch" : "Punch Cat " + cat}${isOpen ? " (Open)" : ""}`,
          });
        },
        plugins: {
          legend: { position: "top", labels: { boxWidth: 14, font: { size: 12, weight: "bold" } } },
          tooltip: {
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 12 },
            callbacks: {
              afterBody: (items) => {
                if (!items.length) return "";
                const b = getBucket(discList[items[0].dataIndex]);
                return `Closed Rate: ${b.closed.toLocaleString()} / ${b.total.toLocaleString()} (${b.pct}%)`;
              },
            },
          },
        },
        scales: {
          x: { stacked: true, ticks: { font: { size: 11, weight: "bold" } } },
          y: { stacked: true, beginAtZero: true, ticks: { font: { size: 11, weight: "bold" } } },
        },
      },
    });
  }

  const PUNCH_MIXED_SERIES = {
    "A_B_C": [
      {
        key: "punchA",
        groupLabel: "Cat A",
        planLabel: "Cat A Plan (Bar)",
        actualLabel: "Cat A Actual (Line)",
        barBg: "rgba(225, 29, 72, 0.22)",
        barBorder: "rgba(225, 29, 72, 0.55)",
        lineColor: "#BE123C",
      },
      {
        key: "punchB",
        groupLabel: "Cat B",
        planLabel: "Cat B Plan (Bar)",
        actualLabel: "Cat B Actual (Line)",
        barBg: "rgba(217, 119, 6, 0.22)",
        barBorder: "rgba(217, 119, 6, 0.55)",
        lineColor: "#B45309",
      },
      {
        key: "punchC",
        groupLabel: "Cat C",
        planLabel: "Cat C Plan (Bar)",
        actualLabel: "Cat C Actual (Line)",
        barBg: "rgba(2, 132, 199, 0.22)",
        barBorder: "rgba(2, 132, 199, 0.55)",
        lineColor: "#0369A1",
      },
    ],
    "PUNCH-A": [
      {
        key: "punchA",
        groupLabel: "Cat A",
        planLabel: "Cat A Plan (Bar)",
        actualLabel: "Cat A Actual (Line)",
        barBg: "rgba(225, 29, 72, 0.26)",
        barBorder: "rgba(225, 29, 72, 0.6)",
        lineColor: "#BE123C",
      },
    ],
    "PUNCH-B": [
      {
        key: "punchB",
        groupLabel: "Cat B",
        planLabel: "Cat B Plan (Bar)",
        actualLabel: "Cat B Actual (Line)",
        barBg: "rgba(217, 119, 6, 0.26)",
        barBorder: "rgba(217, 119, 6, 0.6)",
        lineColor: "#B45309",
      },
    ],
    "PUNCH-C": [
      {
        key: "punchC",
        groupLabel: "Cat C",
        planLabel: "Cat C Plan (Bar)",
        actualLabel: "Cat C Actual (Line)",
        barBg: "rgba(2, 132, 199, 0.26)",
        barBorder: "rgba(2, 132, 199, 0.6)",
        lineColor: "#0369A1",
      },
    ],
    "ALL": [
      {
        key: "all",
        groupLabel: "All Punch",
        planLabel: "All Punch Plan (Bar)",
        actualLabel: "All Punch Actual (Line)",
        barBg: "rgba(100, 116, 139, 0.25)",
        barBorder: "rgba(71, 85, 105, 0.55)",
        lineColor: "#E11D48",
      },
    ],
  };

  function renderPunchLineChart() {
    const canvas = document.getElementById("chart-ov-punch-line");
    if (!canvas) return;
    const sys = state.overviewFilters.system || "ALL";
    const focus = state.overviewFilters.punchLineFocus || "A_B_C";
    const gran = state.overviewFilters.punchLineGran || "week";
    const mode = state.overviewFilters.punchLineMode || "pct";
    const tl = computePunchTimeline(sys, gran);
    const seriesDefs = PUNCH_MIXED_SERIES[focus] || PUNCH_MIXED_SERIES.A_B_C;
    renderMixedPlanActualChart({ canvas, chartKey: "ovPunchLine", tl, seriesDefs, mode });
  }

  function renderAllOverviewCharts(stats) {
    renderItrDisciplineBarChart(stats);
    renderItrLineChart();
    renderPunchDisciplineBarChart(stats);
    renderPunchLineChart();
  }

  // =========================================================================
  // SHARED PER-DISCIPLINE SUMMARY STRIP FOR ALL TABS & OPENED DETAIL TABS
  // Summarizes Closed/Completed vs Open/Remaining for ITR-A/B & Punch A/B/C
  // Hidden automatically if user selected a single Discipline!
  // =========================================================================
  function computeDisciplineBreakdown(opts = {}) {
    const sysRaw = (opts.system || "ALL").trim();
    const sysQ = sysRaw === "ALL" || !sysRaw ? "ALL" : sysRaw.toUpperCase();
    const sub = opts.subSystem || "ALL";
    const subSet = opts.subSet || null; // optional Set of SubSystems matching filtered records
    const plSource = opts.plRows || state.data.punchlist.rows;
    const csSource = opts.csRows || state.data.checksheet.rows;
    const plPool = state.data.punchlist.pool;
    const csPool = state.data.checksheet.pool;

    const map = new Map();
    const getRow = (disc) => {
      const k = disc || "Unassigned";
      let o = map.get(k);
      if (!o) {
        o = {
          discipline: k,
          itrA: makeGateBucket(),
          itrB: makeGateBucket(),
          punchA: makeGateBucket(),
          punchB: makeGateBucket(),
          punchC: makeGateBucket(),
        };
        map.set(k, o);
      }
      return o;
    };

    for (let i = 0; i < plSource.length; i++) {
      const r = plSource[i];
      const sysNo = plPool[r[0]] || "";
      const subNo = plPool[r[1]] || "";
      if (!opts.plRows) {
        if (sysQ !== "ALL") {
          const rowSys = (sysNo || inferSystemFromSub(subNo)).toUpperCase();
          if (rowSys !== sysQ && !rowSys.includes(sysQ)) continue;
        }
        if (sub !== "ALL" && subNo !== sub) continue;
        if (subSet && !subSet.has(subNo)) continue;
      }
      const disc = plPool[r[15]] || "Unassigned";
      const cat = (r[8] || "B").toUpperCase();
      const closed = (plPool[r[9]] || "Open") === "Closed";
      const d = getRow(disc);
      const b = cat === "A" ? d.punchA : cat === "C" ? d.punchC : d.punchB;
      b.total++;
      if (closed) b.closed++;
    }

    for (let i = 0; i < csSource.length; i++) {
      const r = csSource[i];
      const subNo = csPool[r[1]] || "";
      if (!opts.csRows) {
        if (sysQ !== "ALL") {
          const rowSys = inferSystemFromSub(subNo).toUpperCase();
          if (rowSys !== sysQ && !rowSys.includes(sysQ)) continue;
        }
        if (sub !== "ALL" && subNo !== sub) continue;
        if (subSet && !subSet.has(subNo)) continue;
      }
      const disc = csPool[r[4]] || "Unassigned";
      const csType = (csPool[r[5]] || "").trim().toUpperCase();
      const comp = Boolean(csPool[r[6]]);
      const d = getRow(disc);
      if (csType.endsWith("A")) {
        d.itrA.total++;
        if (comp) d.itrA.closed++;
      } else if (csType.endsWith("B")) {
        d.itrB.total++;
        if (comp) d.itrB.closed++;
      }
    }

    const list = Array.from(map.values()).map((row) => finalizeSummaryRow(row));
    list.sort((a, b) => b.overallTotal - a.overallTotal);
    return list;
  }

  function renderInteractiveSummaryGateCell(b, disc, gateKey, opts) {
    if (!b || b.total === 0) {
      return `<td class="py-2 px-2.5 text-center text-slate-300 font-mono text-xs">-</td>`;
    }
    const ctx = opts.context || "subsystem";
    const tid = opts.tabId || "";
    const isActGate = (opts.activeGate === gateKey);
    const isActDisc = (opts.activeDiscipline === disc || (disc === "ALL" && (!opts.activeDiscipline || opts.activeDiscipline === "ALL")));
    const isActCell = isActGate && isActDisc;
    const isClosedAct = isActCell && (opts.activeStatus === "Closed" || opts.activeStatus === "Completed");
    const isOpenAct = isActCell && (opts.activeStatus === "Open" || opts.activeStatus === "Remaining");
    const isAllAct = isActCell && opts.activeStatus === "ALL";

    const cellBg = isActCell ? "bg-amber-50/90 ring-1 ring-amber-400" : "";

    return `
      <td class="py-2 px-2 text-center whitespace-nowrap transition-colors ${cellBg}">
        <div class="inline-flex items-center gap-1 font-mono text-xs sm:text-sm">
          <button
            type="button"
            onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(disc)}', '${gateKey}', 'Closed')"
            class="px-1.5 py-0.5 rounded font-black text-emerald-700 hover:bg-emerald-100 hover:scale-105 cursor-pointer transition-all ${isClosedAct ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm' : ''}"
            title="Click to view Closed/Completed items (${b.closed.toLocaleString()}) for ${disc} • ${gateKey}"
          >${b.closed.toLocaleString()}</button>
          <span class="text-slate-300 font-semibold select-none">/</span>
          <button
            type="button"
            onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(disc)}', '${gateKey}', 'ALL')"
            class="px-1.5 py-0.5 rounded font-bold text-slate-700 hover:bg-slate-200 hover:scale-105 cursor-pointer transition-all ${isAllAct ? 'bg-slate-700 text-white hover:bg-slate-800 shadow-sm' : ''}"
            title="Click to view all items (${b.total.toLocaleString()}) for ${disc} • ${gateKey}"
          >${b.total.toLocaleString()}</button>
        </div>
        <div class="inline-flex items-center justify-center gap-1 text-[11px] font-bold mt-0.5">
          <button
            type="button"
            onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(disc)}', '${gateKey}', 'ALL')"
            class="text-slate-500 hover:text-blue-700 hover:underline cursor-pointer transition-colors ${isAllAct ? 'text-blue-700 font-black' : ''}"
            title="Click to view all items (${b.total.toLocaleString()}) for ${disc} • ${gateKey}"
          >${b.pct}%</button>
          <span class="text-slate-300 select-none">•</span>
          ${
            b.open > 0
              ? `<button
                  type="button"
                  onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(disc)}', '${gateKey}', 'Open')"
                  class="px-1 py-0.2 rounded font-bold ${isOpenAct ? 'bg-rose-600 text-white font-black hover:bg-rose-700 shadow-sm' : 'text-rose-600 hover:bg-rose-100'} hover:scale-105 cursor-pointer transition-all"
                  title="Click to view Open/Remaining items (${b.open.toLocaleString()}) for ${disc} • ${gateKey}"
                >Rem: ${b.open.toLocaleString()}</button>`
              : `<span class="text-[10px] text-emerald-600 font-bold">Done</span>`
          }
        </div>
      </td>
    `;
  }

  function renderDisciplineSummaryStrip(opts = {}) {
    if (opts.selectedDiscipline && opts.selectedDiscipline !== "ALL" && !opts.context) return "";
    const list = computeDisciplineBreakdown(opts);
    if (list.length === 0) return "";

    const tot = {
      itrA: makeGateBucket(),
      punchA: makeGateBucket(),
      punchB: makeGateBucket(),
      punchC: makeGateBucket(),
      itrB: makeGateBucket(),
    };
    list.forEach((d) => {
      ["itrA", "punchA", "punchB", "punchC", "itrB"].forEach((k) => {
        tot[k].total += d[k].total;
        tot[k].closed += d[k].closed;
      });
    });
    ["itrA", "punchA", "punchB", "punchC", "itrB"].forEach((k) => finalizeGateBucket(tot[k]));

    const ctx = opts.context || "subsystem";
    const tid = opts.tabId || "";

    return `
      <details open class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <summary class="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 cursor-pointer select-none list-none">
          <div class="flex items-center gap-2.5 flex-wrap">
            <i class="fas fa-layer-group text-indigo-600 text-sm"></i>
            <span class="text-sm font-black text-slate-800 uppercase tracking-wide">
              Discipline Closure Summary (ITR-A/B &amp; Punch Cat A/B/C)
            </span>
            <span class="px-2.5 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-xs font-bold">${list.length} Disciplines</span>
            ${opts.scopeLabel ? `<span class="text-xs text-slate-500 font-medium">(${esc(opts.scopeLabel)})</span>` : ""}
          </div>
          <div class="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <span><strong class="text-emerald-700 font-bold">Closed</strong> / <strong class="text-slate-700 font-bold">Total</strong> • <strong class="text-rose-600 font-bold">Rem</strong></span>
            <span class="text-blue-600 font-bold hidden sm:inline"><i class="fas fa-hand-pointer mr-1"></i>Click numbers to filter detail</span>
            <span class="px-2 py-0.5 rounded bg-slate-200 text-slate-700 font-bold text-xs">Toggle</span>
          </div>
        </summary>
        <div class="overflow-x-auto">
          <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              <tr class="bg-slate-800 text-white text-xs uppercase font-black tracking-wider">
                <th class="py-2.5 px-3.5 whitespace-nowrap">Discipline</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-A (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch A (Cls / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch B (Cls / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch C (Cls / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-B (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Overall</th>
              </tr>
            </thead>
            <tbody>
              ${list
                .map((d) => {
                  const theme = DISC_THEMES[d.discipline] || DISC_THEMES.Unassigned;
                  const isRowActive = opts.activeDiscipline === d.discipline;
                  return `
                    <tr class="hover:bg-slate-50 border-b border-slate-100 text-xs sm:text-sm ${isRowActive ? "bg-indigo-50/40" : ""}">
                      <td class="py-2 px-3.5 font-black text-slate-800 whitespace-nowrap">
                        <button
                          type="button"
                          onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(d.discipline)}', 'ALL', 'ALL')"
                          class="inline-flex items-center gap-2 hover:text-indigo-700 hover:underline cursor-pointer text-left font-black"
                          title="Click to filter all items for Discipline: ${esc(d.discipline)}"
                        >
                          <span class="inline-block w-2.5 h-2.5 rounded-full" style="background:${theme.bar}"></span>
                          <span>${esc(d.discipline)}</span>
                          ${isRowActive ? `<span class="ml-1 text-[10px] px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-800 font-bold">Active</span>` : ""}
                        </button>
                      </td>
                      ${renderInteractiveSummaryGateCell(d.itrA, d.discipline, "ITR-A", opts)}
                      ${renderInteractiveSummaryGateCell(d.punchA, d.discipline, "PUNCH-A", opts)}
                      ${renderInteractiveSummaryGateCell(d.punchB, d.discipline, "PUNCH-B", opts)}
                      ${renderInteractiveSummaryGateCell(d.punchC, d.discipline, "PUNCH-C", opts)}
                      ${renderInteractiveSummaryGateCell(d.itrB, d.discipline, "ITR-B", opts)}
                      <td class="py-2 px-3 text-center whitespace-nowrap font-mono text-xs sm:text-sm font-black text-slate-800">
                        <button
                          type="button"
                          onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', '${esc(d.discipline)}', 'ALL', 'ALL')"
                          class="hover:text-indigo-700 hover:underline cursor-pointer"
                          title="Click to filter all items for Discipline: ${esc(d.discipline)}"
                        >
                          ${d.overallPct}% <span class="text-xs font-normal text-slate-400">(${d.overallClosed.toLocaleString()}/${d.overallTotal.toLocaleString()})</span>
                        </button>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr class="bg-slate-100 border-t border-slate-300 text-xs sm:text-sm font-black">
                <td class="py-2.5 px-3.5 text-slate-900 font-black uppercase">
                  <button
                    type="button"
                    onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', 'ALL', 'ALL', 'ALL')"
                    class="hover:text-blue-700 hover:underline cursor-pointer text-left font-black"
                    title="Click to reset filters and view All Disciplines"
                  >TOTAL</button>
                </td>
                ${renderInteractiveSummaryGateCell(tot.itrA, "ALL", "ITR-A", opts)}
                ${renderInteractiveSummaryGateCell(tot.punchA, "ALL", "PUNCH-A", opts)}
                ${renderInteractiveSummaryGateCell(tot.punchB, "ALL", "PUNCH-B", opts)}
                ${renderInteractiveSummaryGateCell(tot.punchC, "ALL", "PUNCH-C", opts)}
                ${renderInteractiveSummaryGateCell(tot.itrB, "ALL", "ITR-B", opts)}
                <td class="py-2.5 px-3 text-center whitespace-nowrap font-mono text-xs sm:text-sm font-black text-emerald-700">
                  <button
                    type="button"
                    onclick="onDisciplineSummaryCellClick('${ctx}', '${tid}', 'ALL', 'ALL', 'ALL')"
                    class="hover:text-emerald-900 hover:underline cursor-pointer"
                    title="Click to reset all filters"
                  >
                    ${
                      (() => {
                        const gt = tot.itrA.total + tot.punchA.total + tot.punchB.total + tot.punchC.total + tot.itrB.total;
                        const gc = tot.itrA.closed + tot.punchA.closed + tot.punchB.closed + tot.punchC.closed + tot.itrB.closed;
                        const gp = gt > 0 ? ((gc / gt) * 100).toFixed(1) : "0.0";
                        return `${gp}% <span class="text-xs font-normal text-slate-500">(${gc.toLocaleString()}/${gt.toLocaleString()})</span>`;
                      })()
                    }
                  </button>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </details>
    `;
  }

  function getFilteredSubsetSet(rows, pool, subIdx) {
    const s = new Set();
    for (let i = 0; i < rows.length; i++) {
      const sub = pool[rows[i][subIdx]];
      if (sub) s.add(sub);
    }
    return s;
  }

  function buildPunchlistTabDisciplineSummary() {
    const f = state.filters.punchlist;
    const sys = f.system && f.system !== "ALL" ? f.system : "ALL";
    const sub = f.subSystem && f.subSystem !== "ALL" ? f.subSystem : "ALL";
    const scopeLabel = sub !== "ALL"
      ? `SubSystem: ${sub}`
      : sys !== "ALL"
      ? `System: ${sys}`
      : "All Disciplines & SubSystems";
    return renderDisciplineSummaryStrip({
      context: "punchlist",
      selectedDiscipline: "ALL",
      activeDiscipline: f.discipline || "ALL",
      activeGate: f.category && f.category !== "ALL" ? `PUNCH-${f.category}` : "ALL",
      activeStatus: f.status || "ALL",
      system: sys,
      subSystem: sub,
      scopeLabel,
    });
  }

  function buildChecksheetTabDisciplineSummary() {
    const f = state.filters.checksheet;
    const sys = f.system && f.system !== "ALL" ? f.system : "ALL";
    const sub = f.subSystem && f.subSystem !== "ALL" ? f.subSystem : "ALL";
    const scopeLabel = sub !== "ALL"
      ? `SubSystem: ${sub}`
      : sys !== "ALL"
      ? `System: ${sys}`
      : "All Disciplines & SubSystems";
    const normStatus = f.status === "Completed" ? "Closed" : f.status === "Remaining" ? "Open" : "ALL";
    return renderDisciplineSummaryStrip({
      context: "checksheet",
      selectedDiscipline: "ALL",
      activeDiscipline: f.discipline || "ALL",
      activeGate: f.itrGroup && f.itrGroup !== "ALL" ? f.itrGroup : "ALL",
      activeStatus: normStatus,
      system: sys,
      subSystem: sub,
      scopeLabel,
    });
  }

  function renderOverviewTab(container) {
    const stats = getOverviewStats();
    const g = stats.global;
    const sys = state.overviewFilters.system || "ALL";
    const filteredSubs = getFilteredOverviewSubSystems(stats.bySubSystem);

    const kpiCards = [
      {
        title: "ITR-A",
        sub: "Pre-Comm Checksheets",
        bucket: g.itrA,
        border: "border-blue-200 hover:border-blue-500",
        titleColor: "text-blue-700",
        valColor: "text-blue-600",
        pillBg: "bg-blue-100 text-blue-800",
        barColor: "bg-blue-600",
        iconBg: "bg-blue-100 text-blue-600 group-hover:bg-blue-600 group-hover:text-white",
        icon: "fa-hammer",
        openLabel: "Remaining",
        allCrit: { source: "checksheet", system: sys, itrGroup: "ITR-A", status: "ALL", title: `${sys === "ALL" ? "All" : sys} • ITR-A` },
        openCrit: { source: "checksheet", system: sys, itrGroup: "ITR-A", status: "Remaining", title: `${sys === "ALL" ? "All" : sys} • ITR-A (Remaining)` },
      },
      {
        title: "Punch Cat A",
        sub: "Critical Punch (Pre-CC)",
        bucket: g.punchA,
        border: "border-rose-200 hover:border-rose-500",
        titleColor: "text-rose-700",
        valColor: "text-rose-600",
        pillBg: "bg-rose-100 text-rose-800",
        barColor: "bg-rose-600",
        iconBg: "bg-rose-100 text-rose-600 group-hover:bg-rose-600 group-hover:text-white",
        icon: "fa-skull-crossbones",
        openLabel: "Open",
        allCrit: { source: "punchlist", system: sys, category: "A", status: "ALL", title: `${sys === "ALL" ? "All" : sys} • Punch Cat A` },
        openCrit: { source: "punchlist", system: sys, category: "A", status: "Open", title: `${sys === "ALL" ? "All" : sys} • Punch Cat A (Open)` },
      },
      {
        title: "Punch Cat B",
        sub: "Pre-Handover Punch",
        bucket: g.punchB,
        border: "border-amber-200 hover:border-amber-500",
        titleColor: "text-amber-700",
        valColor: "text-amber-600",
        pillBg: "bg-amber-100 text-amber-800",
        barColor: "bg-amber-500",
        iconBg: "bg-amber-100 text-amber-700 group-hover:bg-amber-600 group-hover:text-white",
        icon: "fa-triangle-exclamation",
        openLabel: "Open",
        allCrit: { source: "punchlist", system: sys, category: "B", status: "ALL", title: `${sys === "ALL" ? "All" : sys} • Punch Cat B` },
        openCrit: { source: "punchlist", system: sys, category: "B", status: "Open", title: `${sys === "ALL" ? "All" : sys} • Punch Cat B (Open)` },
      },
      {
        title: "Punch Cat C",
        sub: "Agreed Carryover",
        bucket: g.punchC,
        border: "border-sky-200 hover:border-sky-500",
        titleColor: "text-sky-700",
        valColor: "text-sky-600",
        pillBg: "bg-sky-100 text-sky-800",
        barColor: "bg-sky-500",
        iconBg: "bg-sky-100 text-sky-600 group-hover:bg-sky-600 group-hover:text-white",
        icon: "fa-circle-info",
        openLabel: "Open",
        allCrit: { source: "punchlist", system: sys, category: "C", status: "ALL", title: `${sys === "ALL" ? "All" : sys} • Punch Cat C` },
        openCrit: { source: "punchlist", system: sys, category: "C", status: "Open", title: `${sys === "ALL" ? "All" : sys} • Punch Cat C (Open)` },
      },
      {
        title: "ITR-B",
        sub: "Commissioning Checksheets",
        bucket: g.itrB,
        border: "border-indigo-200 hover:border-indigo-500",
        titleColor: "text-indigo-700",
        valColor: "text-indigo-600",
        pillBg: "bg-indigo-100 text-indigo-800",
        barColor: "bg-indigo-600",
        iconBg: "bg-indigo-100 text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white",
        icon: "fa-vial-circle-check",
        openLabel: "Remaining",
        allCrit: { source: "checksheet", system: sys, itrGroup: "ITR-B", status: "ALL", title: `${sys === "ALL" ? "All" : sys} • ITR-B` },
        openCrit: { source: "checksheet", system: sys, itrGroup: "ITR-B", status: "Remaining", title: `${sys === "ALL" ? "All" : sys} • ITR-B (Remaining)` },
      },
    ];

    const discTotalRow = {
      itrA: g.itrA,
      punchA: g.punchA,
      punchB: g.punchB,
      punchC: g.punchC,
      itrB: g.itrB,
    };
    const totAll =
      g.itrA.total + g.punchA.total + g.punchB.total + g.punchC.total + g.itrB.total;
    const totClosed =
      g.itrA.closed + g.punchA.closed + g.punchB.closed + g.punchC.closed + g.itrB.closed;
    const totPct = totAll > 0 ? Number(((totClosed / totAll) * 100).toFixed(1)) : 0;

    container.innerHTML = `
      <!-- 0. Scope Control & Overview Banner -->
      <div class="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-black uppercase tracking-wider">Executive Summary</span>
            <h2 class="text-base sm:text-lg lg:text-xl font-black text-slate-900">
              CPP TOPSIDE — Pre-Commissioning &amp; Punchlist Closure Overview
            </h2>
          </div>
          <p class="text-xs sm:text-sm text-slate-600 font-medium mt-1">
            Closed / Completed vs Total across <strong>ITR-A, Punch A, B, C, ITR-B</strong>. Click any card, chart bar, or table cell to open a Detail Tab.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2.5">
          <label class="text-xs sm:text-sm font-bold text-slate-700 flex items-center gap-1.5">
            <i class="fas fa-layer-group text-blue-600"></i>
            <span>System (XXX-YY):</span>
          </label>

          <!-- System Search Box with Datalist & Clear -->
          <div class="relative flex items-center">
            <i class="fas fa-search absolute left-3 text-slate-400 text-xs"></i>
            <input
              type="text"
              id="ov-sys-search"
              list="ov-sys-datalist"
              value="${sys === "ALL" ? "" : esc(sys)}"
              oninput="debounceOvSystemSearch(this.value)"
              placeholder="Search System (e.g. CPPT-66)..."
              class="pl-8.5 pr-7 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-mono font-bold bg-white text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm w-44 sm:w-56"
            />
            <button
              id="ov-sys-clear-btn"
              type="button"
              onclick="document.getElementById('ov-sys-search').value = ''; setOvSystem('ALL')"
              class="absolute right-2 text-slate-400 hover:text-slate-600 text-xs p-1 ${sys !== 'ALL' && sys ? '' : 'hidden'}"
              title="Reset to All Systems"
            >
              <i class="fas fa-times-circle"></i>
            </button>
            <datalist id="ov-sys-datalist">
              ${stats.allSystems.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
            </datalist>
          </div>

          <!-- Quick Dropdown Selector -->
          <select
            id="ov-sys-select"
            onchange="setOvSystem(this.value)"
            class="px-3 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-bold bg-white text-slate-800 focus:outline-none focus:border-blue-500 shadow-sm"
          >
            <option value="ALL">-- All Systems (${stats.allSystems.length}) --</option>
            ${stats.allSystems
              .map((s) => `<option value="${esc(s)}" ${sys === s ? "selected" : ""}>${esc(s)}</option>`)
              .join("")}
          </select>
        </div>
      </div>

      <!-- 1. Top 5 Gate KPI Cards (ITR-A, Punch A, Punch B, Punch C, ITR-B) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        ${kpiCards
          .map((c) => {
            const b = c.bucket;
            const allJson = esc(JSON.stringify(c.allCrit));
            const openJson = esc(JSON.stringify(c.openCrit));
            return `
              <div
                onclick="openDetailTab(${allJson})"
                class="group cursor-pointer bg-white rounded-2xl p-4 sm:p-5 border ${c.border} shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-xs sm:text-sm font-black uppercase tracking-wider ${c.titleColor}">${esc(c.title)}</p>
                      <p class="text-xs text-slate-500 font-semibold mt-0.5">${esc(c.sub)}</p>
                    </div>
                    <div class="flex items-center gap-1.5">
                      <button
                        onclick="event.stopPropagation(); openDetailTab(${allJson}, true)"
                        class="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-xs transition-colors"
                        title="Open in new browser window"
                      >
                        <i class="fas fa-external-link-alt"></i>
                      </button>
                      <div class="w-9 h-9 rounded-xl ${c.iconBg} flex items-center justify-center transition-colors">
                        <i class="fas ${c.icon} text-sm"></i>
                      </div>
                    </div>
                  </div>

                  <div class="mt-3 flex items-baseline justify-between gap-2">
                    <div class="font-mono">
                      <span class="text-2xl sm:text-3xl lg:text-4xl font-black ${c.valColor}">${b.closed.toLocaleString()}</span>
                      <span class="text-sm font-bold text-slate-400">/ ${b.total.toLocaleString()}</span>
                    </div>
                    <span class="text-xs sm:text-sm font-black px-2.5 py-1 rounded-lg ${c.pillBg}">${b.pct}%</span>
                  </div>

                  <div class="mt-2.5 w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                    <div class="${c.barColor} h-full rounded-full transition-all duration-300" style="width: ${b.pct}%"></div>
                  </div>
                </div>

                <div class="mt-3.5 pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm">
                  <button
                    onclick="event.stopPropagation(); openDetailTab(${openJson})"
                    class="font-black text-rose-600 hover:underline"
                    title="Click to inspect ${c.openLabel.toLowerCase()} items"
                  >
                    ${c.openLabel}: ${b.open.toLocaleString()}
                  </button>
                  <span class="${c.titleColor} font-black group-hover:translate-x-0.5 transition-transform">
                    Details <i class="fas fa-arrow-right text-xs"></i>
                  </span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <!-- 1B. Summary Matrix by Discipline (Right on Top below KPIs) -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2.5">
            <i class="fas fa-layer-group text-indigo-600 text-base"></i>
            <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
              1. Summary Matrix by Discipline (ITR-A, Punch A/B/C, ITR-B)
            </h3>
            <span class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
              ${stats.byDiscipline.length} Disciplines
            </span>
          </div>
          <span class="text-xs text-slate-500 font-medium">
            <i class="fas fa-mouse-pointer mr-1 text-blue-500"></i> Click any cell to open Detail Tab
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              <tr class="bg-slate-900 text-white text-xs sm:text-sm uppercase font-black tracking-wider">
                <th class="py-2.5 px-3.5 whitespace-nowrap">Discipline</th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>ITR-A</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Comp / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat A</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat B</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat C</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>ITR-B</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Comp / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Overall %</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Progress</span></th>
              </tr>
            </thead>
            <tbody>
              ${stats.byDiscipline
                .map((d) => {
                  const theme = DISC_THEMES[d.discipline] || DISC_THEMES.Unassigned;
                  const discItrCrit = esc(JSON.stringify({ source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ALL", status: "ALL", title: `${d.discipline} • All ITRs` }));
                  const discPlCrit = esc(JSON.stringify({ source: "punchlist", system: sys, discipline: d.discipline, category: "ALL", status: "ALL", title: `${d.discipline} • All Punch` }));
                  return `
                    <tr class="hover:bg-blue-50/30 border-b border-slate-100 text-xs sm:text-sm transition-colors">
                      <td class="py-2.5 px-3.5 min-w-[170px]">
                        <div class="flex items-center gap-2">
                          <span class="w-3 h-3 rounded-full shrink-0" style="background:${theme.bar}"></span>
                          <span class="font-black text-slate-900 text-sm sm:text-base">${esc(d.discipline)}</span>
                        </div>
                        <div class="flex items-center gap-2 mt-1.5 pl-5">
                          <button onclick="openDetailTab(${discItrCrit})" class="px-2 py-0.5 rounded-md bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-xs font-bold transition-colors">All ITRs</button>
                          <button onclick="openDetailTab(${discPlCrit})" class="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-xs font-bold transition-colors">All Punch</button>
                        </div>
                      </td>
                      ${renderGateCellHtml(
                        d.itrA,
                        { source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ITR-A", status: "ALL", title: `${d.discipline} • ITR-A` },
                        { source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ITR-A", status: "Remaining", title: `${d.discipline} • ITR-A (Remaining)` },
                        "blue"
                      )}
                      ${renderGateCellHtml(
                        d.punchA,
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "A", status: "ALL", title: `${d.discipline} • Punch Cat A` },
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "A", status: "Open", title: `${d.discipline} • Punch Cat A (Open)` },
                        "rose"
                      )}
                      ${renderGateCellHtml(
                        d.punchB,
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "B", status: "ALL", title: `${d.discipline} • Punch Cat B` },
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "B", status: "Open", title: `${d.discipline} • Punch Cat B (Open)` },
                        "amber"
                      )}
                      ${renderGateCellHtml(
                        d.punchC,
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "C", status: "ALL", title: `${d.discipline} • Punch Cat C` },
                        { source: "punchlist", system: sys, discipline: d.discipline, category: "C", status: "Open", title: `${d.discipline} • Punch Cat C (Open)` },
                        "blue"
                      )}
                      ${renderGateCellHtml(
                        d.itrB,
                        { source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ITR-B", status: "ALL", title: `${d.discipline} • ITR-B` },
                        { source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ITR-B", status: "Remaining", title: `${d.discipline} • ITR-B (Remaining)` },
                        "indigo"
                      )}
                      <td class="py-2.5 px-3.5 min-w-[140px]">
                        <div class="flex items-center justify-between text-xs sm:text-sm font-black text-slate-800">
                          <span>${d.overallPct}%</span>
                          <span class="text-xs font-mono text-slate-500 font-semibold">${d.overallClosed.toLocaleString()}/${d.overallTotal.toLocaleString()}</span>
                        </div>
                        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1.5">
                          <div class="h-full rounded-full" style="width:${d.overallPct}%; background:${theme.bar}"></div>
                        </div>
                        <div class="text-xs text-slate-500 mt-1 font-mono font-medium">ITR: ${d.itrPct}% | PL: ${d.punchPct}%</div>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr class="bg-slate-100 border-t-2 border-slate-300 font-black text-xs sm:text-sm">
                <td class="py-3 px-3.5 font-black text-slate-900 uppercase">TOTAL (${sys === "ALL" ? "CPP TOPSIDE" : esc(sys)})</td>
                ${renderGateCellHtml(
                  discTotalRow.itrA,
                  { source: "checksheet", system: sys, itrGroup: "ITR-A", status: "ALL", title: "All ITR-A" },
                  { source: "checksheet", system: sys, itrGroup: "ITR-A", status: "Remaining", title: "ITR-A (Remaining)" },
                  "blue"
                )}
                ${renderGateCellHtml(
                  discTotalRow.punchA,
                  { source: "punchlist", system: sys, category: "A", status: "ALL", title: "All Punch Cat A" },
                  { source: "punchlist", system: sys, category: "A", status: "Open", title: "Punch Cat A (Open)" },
                  "rose"
                )}
                ${renderGateCellHtml(
                  discTotalRow.punchB,
                  { source: "punchlist", system: sys, category: "B", status: "ALL", title: "All Punch Cat B" },
                  { source: "punchlist", system: sys, category: "B", status: "Open", title: "Punch Cat B (Open)" },
                  "amber"
                )}
                ${renderGateCellHtml(
                  discTotalRow.punchC,
                  { source: "punchlist", system: sys, category: "C", status: "ALL", title: "All Punch Cat C" },
                  { source: "punchlist", system: sys, category: "C", status: "Open", title: "Punch Cat C (Open)" },
                  "blue"
                )}
                ${renderGateCellHtml(
                  discTotalRow.itrB,
                  { source: "checksheet", system: sys, itrGroup: "ITR-B", status: "ALL", title: "All ITR-B" },
                  { source: "checksheet", system: sys, itrGroup: "ITR-B", status: "Remaining", title: "ITR-B (Remaining)" },
                  "indigo"
                )}
                <td class="py-3 px-3.5 min-w-[140px]">
                  <div class="flex items-center justify-between text-xs sm:text-sm font-black text-slate-900">
                    <span>${totPct}%</span>
                    <span class="text-xs font-mono text-slate-600 font-bold">${totClosed.toLocaleString()}/${totAll.toLocaleString()}</span>
                  </div>
                  <div class="w-full h-2.5 bg-slate-200 rounded-full overflow-hidden mt-1.5">
                    <div class="h-full rounded-full bg-emerald-600" style="width:${totPct}%"></div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 2A. Checksheets Charts Section (Dedicated ITR-A & ITR-B) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="min-w-0 overflow-hidden bg-white rounded-2xl border border-blue-200/80 p-4 sm:p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-md bg-blue-100 text-blue-800 text-xs font-black uppercase">Checksheets</span>
                <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                  ITR-A &amp; ITR-B Status by Discipline
                </h3>
              </div>
              <p class="text-xs text-slate-500 font-medium mt-1">Click any bar to inspect ITR records in a Detail Tab</p>
            </div>
            <div class="flex items-center gap-1.5">
              ${[
                { k: "ALL_ITR", lbl: "All ITRs" },
                { k: "ITR-A", lbl: "ITR-A" },
                { k: "ITR-B", lbl: "ITR-B" },
              ]
                .map(
                  (m) => `
                <button
                  data-ov-itr-bar="${m.k}"
                  onclick="setOvItrBarMetric('${m.k}')"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    state.overviewFilters.itrBarMetric === m.k ? "bg-blue-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }"
                >${m.lbl}</button>
              `
                )
                .join("")}
            </div>
          </div>
          <div class="mt-3 relative w-full" style="height:340px;">
            <canvas id="chart-ov-itr-disc" class="w-full h-full"></canvas>
          </div>
        </div>

        <div class="min-w-0 overflow-hidden bg-white rounded-2xl border border-blue-200/80 p-4 sm:p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-800 text-xs font-black uppercase">ITR Plan vs Actual</span>
                <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                  ITR-A &amp; ITR-B Plan (Bar) vs Actual (Line)
                </h3>
              </div>
              <p class="text-xs text-slate-500 font-medium mt-1">Cumulative Plan (PlanFinish) vs Actual Progress (CompleteDate)</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1 border-r border-slate-200 pr-2">
                ${[
                  { k: "A_B", lbl: "A & B" },
                  { k: "ITR-A", lbl: "ITR-A" },
                  { k: "ITR-B", lbl: "ITR-B" },
                  { k: "TOTAL", lbl: "Total" },
                ]
                  .map(
                    (f) => `
                  <button
                    data-ov-itr-focus="${f.k}"
                    onclick="setOvItrLineFocus('${f.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.itrLineFocus === f.k ? "bg-indigo-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${f.lbl}</button>
                `
                  )
                  .join("")}
              </div>
              <div class="flex items-center gap-1 border-r border-slate-200 pr-2">
                ${[
                  { k: "week", lbl: "Weekly" },
                  { k: "month", lbl: "Monthly" },
                  { k: "day", lbl: "Daily (45d)" },
                ]
                  .map(
                    (g) => `
                  <button
                    data-ov-itr-gran="${g.k}"
                    onclick="setOvItrLineGran('${g.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.itrLineGran === g.k ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${g.lbl}</button>
                `
                  )
                  .join("")}
              </div>
              <div class="flex items-center gap-1">
                ${[
                  { k: "pct", lbl: "%" },
                  { k: "count", lbl: "Count" },
                ]
                  .map(
                    (m) => `
                  <button
                    data-ov-itr-mode="${m.k}"
                    onclick="setOvItrLineMode('${m.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.itrLineMode === m.k ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${m.lbl}</button>
                `
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="mt-3 relative w-full" style="height:340px;">
            <canvas id="chart-ov-itr-line" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- 2B. Punch List Charts Section (Dedicated Cat A / B / C) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="min-w-0 overflow-hidden bg-white rounded-2xl border border-rose-200/80 p-4 sm:p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-md bg-rose-100 text-rose-800 text-xs font-black uppercase">Punch List</span>
                <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                  Punch Closed vs Open by Discipline
                </h3>
              </div>
              <p class="text-xs text-slate-500 font-medium mt-1">Click any bar to inspect Punch items in a Detail Tab</p>
            </div>
            <div class="flex items-center gap-1.5">
              ${[
                { k: "ALL_PUNCH", lbl: "All Cats" },
                { k: "PUNCH-A", lbl: "Cat A" },
                { k: "PUNCH-B", lbl: "Cat B" },
                { k: "PUNCH-C", lbl: "Cat C" },
              ]
                .map(
                  (m) => `
                <button
                  data-ov-punch-bar="${m.k}"
                  onclick="setOvPunchBarMetric('${m.k}')"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    state.overviewFilters.punchBarMetric === m.k ? "bg-rose-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }"
                >${m.lbl}</button>
              `
                )
                .join("")}
            </div>
          </div>
          <div class="mt-3 relative w-full" style="height:340px;">
            <canvas id="chart-ov-punch-disc" class="w-full h-full"></canvas>
          </div>
        </div>

        <div class="min-w-0 overflow-hidden bg-white rounded-2xl border border-rose-200/80 p-4 sm:p-5 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <div class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-md bg-amber-100 text-amber-800 text-xs font-black uppercase">Punch Plan vs Actual</span>
                <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
                  Punch Cat A / B / C Plan (Bar) vs Actual (Line)
                </h3>
              </div>
              <p class="text-xs text-slate-500 font-medium mt-1">Cumulative Plan (Expected Clearance Date) vs Actual Closure (ClosedDate)</p>
            </div>
            <div class="flex flex-wrap items-center gap-2">
              <div class="flex items-center gap-1 border-r border-slate-200 pr-2">
                ${[
                  { k: "A_B_C", lbl: "A/B/C" },
                  { k: "PUNCH-A", lbl: "Cat A" },
                  { k: "PUNCH-B", lbl: "Cat B" },
                  { k: "PUNCH-C", lbl: "Cat C" },
                  { k: "ALL", lbl: "All Punch" },
                ]
                  .map(
                    (f) => `
                  <button
                    data-ov-punch-focus="${f.k}"
                    onclick="setOvPunchLineFocus('${f.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.punchLineFocus === f.k ? "bg-amber-700 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${f.lbl}</button>
                `
                  )
                  .join("")}
              </div>
              <div class="flex items-center gap-1 border-r border-slate-200 pr-2">
                ${[
                  { k: "week", lbl: "Weekly" },
                  { k: "month", lbl: "Monthly" },
                  { k: "day", lbl: "Daily (45d)" },
                ]
                  .map(
                    (g) => `
                  <button
                    data-ov-punch-gran="${g.k}"
                    onclick="setOvPunchLineGran('${g.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.punchLineGran === g.k ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${g.lbl}</button>
                `
                  )
                  .join("")}
              </div>
              <div class="flex items-center gap-1">
                ${[
                  { k: "pct", lbl: "%" },
                  { k: "count", lbl: "Count" },
                ]
                  .map(
                    (m) => `
                  <button
                    data-ov-punch-mode="${m.k}"
                    onclick="setOvPunchLineMode('${m.k}')"
                    class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                      state.overviewFilters.punchLineMode === m.k ? "bg-rose-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }"
                  >${m.lbl}</button>
                `
                  )
                  .join("")}
              </div>
            </div>
          </div>
          <div class="mt-3 relative w-full" style="height:340px;">
            <canvas id="chart-ov-punch-line" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- 4. Table 2: Summary Matrix by SubSystem -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm">
        <div class="p-4 bg-slate-50 border-b border-slate-200 rounded-t-2xl flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2.5">
            <i class="fas fa-sitemap text-teal-600 text-base"></i>
            <h3 class="text-sm sm:text-base font-black text-slate-800 uppercase tracking-wide">
              2. Summary Matrix by SubSystem (ITR-A, Punch A/B/C, ITR-B)
            </h3>
            <span id="ov-sub-count-badge" class="px-2.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-xs font-bold">
              ${filteredSubs.length} of ${stats.bySubSystem.length} SubSystems
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <div class="relative">
              <input
                type="text"
                value="${esc(state.overviewFilters.subSearch)}"
                id="ov-sub-search"
                oninput="debounceOvSubSearch(this.value)"
                placeholder="Search SubSystem No or Description..."
                class="w-60 sm:w-72 pl-9 pr-3.5 py-2 rounded-xl border border-slate-300 text-xs sm:text-sm font-medium bg-white focus:outline-none focus:border-blue-500 shadow-sm"
              />
              <i class="fas fa-search absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- SubSystem Quick Filter Pills -->
        <div class="px-4 py-2.5 bg-white border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs sm:text-sm">
          <span class="text-xs font-bold text-slate-500 mr-1">Focus:</span>
          ${[
            { k: "ALL", lbl: "All SubSystems" },
            { k: "OPEN_PUNCH_A", lbl: "With Open Punch A" },
            { k: "OPEN_PUNCH", lbl: "With Any Open Punch" },
            { k: "REM_ITR_A", lbl: "Remaining ITR-A" },
            { k: "REM_ITR_B", lbl: "Remaining ITR-B" },
            { k: "DONE_100", lbl: "100% Complete" },
          ]
            .map(
              (f) => `
            <button
              onclick="setOvSubQuickFilter('${f.k}')"
              class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                state.overviewFilters.subQuickFilter === f.k
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }"
            >${f.lbl}</button>
          `
            )
            .join("")}
        </div>

        <div class="overflow-x-auto md:overflow-x-clip md:overflow-y-visible max-h-[75vh] md:max-h-none bg-white rounded-b-2xl">
          <table id="ov-sub-table" class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              <tr class="bg-slate-900 text-white text-xs sm:text-sm uppercase font-black tracking-wider">
                <th class="py-2.5 px-2.5 text-center whitespace-nowrap">#</th>
                <th class="py-2.5 px-3 whitespace-nowrap">SubSystem No &amp; Description</th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>ITR-A</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Comp / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat A</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat B</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Punch Cat C</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Closed / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>ITR-B</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Comp / Total</span></th>
                <th class="py-2.5 px-2 text-center whitespace-nowrap"><div>Overall %</div><span class="block text-[11px] font-bold text-slate-400 tracking-normal normal-case">Progress</span></th>
              </tr>
            </thead>
            <tbody id="ov-sub-tbody">
              ${renderOvSubTableRows(filteredSubs)}
            </tbody>
          </table>
        </div>
      </div>
    `;

    requestAnimationFrame(() => {
      if (state.activeTab === "overview") {
        updateAppHeaderStickyOffset();
        renderAllOverviewCharts(stats);
      }
    });
  }

  // =========================================================================
  // DYNAMIC DETAIL TAB ENGINE (OPENED FROM OVERVIEW CLICK)
  // =========================================================================
  function getDetailFilteredRows(tab) {
    const c = tab.criteria;
    const isPl = c.source === "punchlist";
    const rows = isPl ? state.data.punchlist.rows : state.data.checksheet.rows;
    const pool = isPl ? state.data.punchlist.pool : state.data.checksheet.pool;
    const stQ = tab.localFilters.status || "ALL";
    const q = (tab.localFilters.search || "").trim().toLowerCase();

    return rows.filter((r) => {
      if (isPl) {
        const sysNo = pool[r[0]] || "";
        const subNo = pool[r[1]] || "";
        const cat = (r[8] || "").toUpperCase();
        const status = pool[r[9]] || "";
        const disc = pool[r[15]] || "Unassigned";

        if (c.system !== "ALL" && sysNo !== c.system && inferSystemFromSub(subNo) !== c.system) return false;
        if (tab.localFilters.system && tab.localFilters.system !== "ALL") {
          const sysQ = tab.localFilters.system.trim().toUpperCase();
          const rowSys = (sysNo || inferSystemFromSub(subNo)).toUpperCase();
          if (rowSys !== sysQ && !rowSys.includes(sysQ)) return false;
        }
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) return false;
        if (c.discipline !== "ALL" && disc !== c.discipline) return false;
        if (tab.localFilters.discipline && tab.localFilters.discipline !== "ALL" && disc !== tab.localFilters.discipline) return false;
        if (c.category !== "ALL" && cat !== c.category.toUpperCase()) return false;
        if (stQ !== "ALL" && status !== stQ) return false;

        if (q) {
          const hay = `${r[2]} ${pool[r[3]] || ""} ${r[5]} ${pool[r[6]] || ""} ${pool[r[16]] || ""} ${subNo}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      } else {
        const subNo = pool[r[1]] || "";
        const sysNo = inferSystemFromSub(subNo);
        const disc = pool[r[4]] || "Unassigned";
        const csType = (pool[r[5]] || "").trim().toUpperCase();
        const isComp = Boolean(pool[r[6]]);

        if (c.system !== "ALL" && sysNo !== c.system) return false;
        if (tab.localFilters.system && tab.localFilters.system !== "ALL") {
          const sysQ = tab.localFilters.system.trim().toUpperCase();
          const rowSys = sysNo.toUpperCase();
          if (rowSys !== sysQ && !rowSys.includes(sysQ)) return false;
        }
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) return false;
        if (c.discipline !== "ALL" && disc !== c.discipline) return false;
        if (tab.localFilters.discipline && tab.localFilters.discipline !== "ALL" && disc !== tab.localFilters.discipline) return false;
        if (c.itrGroup === "ITR-A" && !csType.endsWith("A")) return false;
        if (c.itrGroup === "ITR-B" && !csType.endsWith("B")) return false;
        if (stQ === "Completed" && !isComp) return false;
        if (stQ === "Remaining" && isComp) return false;

        if (q) {
          const hay = `${r[2]} ${pool[r[3]] || ""} ${subNo} ${pool[r[5]] || ""} ${pool[r[11]] || ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      }
    });
  }

  function getDetailBaseStats(tab) {
    // Counts ignoring localFilters.status/search to show card breakdown cleanly
    const c = tab.criteria;
    const isPl = c.source === "punchlist";
    const rows = isPl ? state.data.punchlist.rows : state.data.checksheet.rows;
    const pool = isPl ? state.data.punchlist.pool : state.data.checksheet.pool;
    let total = 0, closed = 0;

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      if (isPl) {
        const sysNo = pool[r[0]] || "";
        const subNo = pool[r[1]] || "";
        const cat = (r[8] || "").toUpperCase();
        const status = pool[r[9]] || "";
        const disc = pool[r[15]] || "Unassigned";
        if (c.system !== "ALL" && sysNo !== c.system && inferSystemFromSub(subNo) !== c.system) continue;
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) continue;
        if (c.discipline !== "ALL" && disc !== c.discipline) continue;
        if (c.category !== "ALL" && cat !== c.category.toUpperCase()) continue;
        total++;
        if (status === "Closed") closed++;
      } else {
        const subNo = pool[r[1]] || "";
        const sysNo = inferSystemFromSub(subNo);
        const disc = pool[r[4]] || "Unassigned";
        const csType = (pool[r[5]] || "").trim().toUpperCase();
        const isComp = Boolean(pool[r[6]]);
        if (c.system !== "ALL" && sysNo !== c.system) continue;
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) continue;
        if (c.discipline !== "ALL" && disc !== c.discipline) continue;
        if (c.itrGroup === "ITR-A" && !csType.endsWith("A")) continue;
        if (c.itrGroup === "ITR-B" && !csType.endsWith("B")) continue;
        total++;
        if (isComp) closed++;
      }
    }
    const open = total - closed;
    const pct = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";
    return { total, closed, open, pct };
  }

  function getSubDetailCounts(tab) {
    const subNo = tab.criteria.subSystem;
    const plRows = state.data.punchlist.rows;
    const plPool = state.data.punchlist.pool;
    const csRows = state.data.checksheet.rows;
    const csPool = state.data.checksheet.pool;

    const itrA = makeGateBucket();
    const itrB = makeGateBucket();
    const punchA = makeGateBucket();
    const punchB = makeGateBucket();
    const punchC = makeGateBucket();

    const plBase = [];
    for (let i = 0; i < plRows.length; i++) {
      const r = plRows[i];
      if ((plPool[r[1]] || "") !== subNo) continue;
      plBase.push(r);
      const cat = (r[8] || "B").toUpperCase();
      const closed = (plPool[r[9]] || "") === "Closed";
      const target = cat === "A" ? punchA : cat === "C" ? punchC : punchB;
      target.total++;
      if (closed) target.closed++;
    }

    const csBase = [];
    for (let i = 0; i < csRows.length; i++) {
      const r = csRows[i];
      if ((csPool[r[1]] || "") !== subNo) continue;
      csBase.push(r);
      const csType = (csPool[r[5]] || "").trim().toUpperCase();
      const comp = Boolean(csPool[r[6]]);
      const target = csType.endsWith("A") ? itrA : csType.endsWith("B") ? itrB : null;
      if (target) {
        target.total++;
        if (comp) target.closed++;
      }
    }

    finalizeGateBucket(itrA);
    finalizeGateBucket(itrB);
    finalizeGateBucket(punchA);
    finalizeGateBucket(punchB);
    finalizeGateBucket(punchC);

    const stQ = tab.localFilters.status || "ALL";
    const gateQ = tab.localFilters.gate || "ALL";
    const discQ = tab.localFilters.discipline || "ALL";
    const q = (tab.localFilters.search || "").trim().toLowerCase();

    const plFiltered = plBase.filter((r) => {
      const cat = (r[8] || "B").toUpperCase();
      const status = plPool[r[9]] || "Open";
      const disc = plPool[r[15]] || "Unassigned";

      if (discQ !== "ALL" && disc.toUpperCase() !== discQ.toUpperCase()) return false;
      if (gateQ === "ITR-A" || gateQ === "ITR-B") return false;
      if (gateQ === "PUNCH-A" && cat !== "A") return false;
      if (gateQ === "PUNCH-B" && cat !== "B") return false;
      if (gateQ === "PUNCH-C" && cat !== "C") return false;
      if (stQ === "Closed" && status !== "Closed") return false;
      if (stQ === "Open" && status === "Closed") return false;
      if (q) {
        const hay = `${r[2]} ${plPool[r[3]] || ""} ${r[5]} ${plPool[r[6]] || ""} ${plPool[r[15]] || ""} ${plPool[r[16]] || ""} ${plPool[r[17]] || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const csFiltered = csBase.filter((r) => {
      const csType = (csPool[r[5]] || "").trim().toUpperCase();
      const isComp = Boolean(csPool[r[6]]);
      const disc = csPool[r[4]] || "Unassigned";

      if (discQ !== "ALL" && disc.toUpperCase() !== discQ.toUpperCase()) return false;
      if (gateQ.startsWith("PUNCH-")) return false;
      if (gateQ === "ITR-A" && !csType.endsWith("A")) return false;
      if (gateQ === "ITR-B" && !csType.endsWith("B")) return false;
      if ((stQ === "Closed" || stQ === "Completed") && !isComp) return false;
      if ((stQ === "Open" || stQ === "Remaining") && isComp) return false;
      if (q) {
        const hay = `${r[2]} ${csPool[r[3]] || ""} ${csPool[r[4]] || ""} ${csPool[r[5]] || ""} ${csPool[r[11]] || ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const overallTotal = itrA.total + itrB.total + punchA.total + punchB.total + punchC.total;
    const overallClosed = itrA.closed + itrB.closed + punchA.closed + punchB.closed + punchC.closed;
    const overallPct = overallTotal > 0 ? Number(((overallClosed / overallTotal) * 100).toFixed(1)) : 0;

    return {
      itrA,
      itrB,
      punchA,
      punchB,
      punchC,
      overallTotal,
      overallClosed,
      overallPct,
      plBase,
      csBase,
      plFiltered,
      csFiltered,
      totalFiltered: plFiltered.length + csFiltered.length,
    };
  }

  window.setSubDetailSection = function (tabId, sec) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters.section = sec;
    if (sec === "punchlist" && (tab.localFilters.gate || "").startsWith("ITR-")) tab.localFilters.gate = "ALL";
    if (sec === "checksheet" && (tab.localFilters.gate || "").startsWith("PUNCH-")) tab.localFilters.gate = "ALL";
    renderTabBar();
    renderTabContent();
  };

  window.setSubDetailGate = function (tabId, gate) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const nextGate = tab.localFilters.gate === gate ? "ALL" : gate;
    tab.localFilters.gate = nextGate;
    if (nextGate === "ALL") tab.localFilters.section = "ALL";
    else if (nextGate.startsWith("ITR-")) tab.localFilters.section = "checksheet";
    else if (nextGate.startsWith("PUNCH-")) tab.localFilters.section = "punchlist";
    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
  };

  window.setSubDetailDiscipline = function (tabId, disc) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.localFilters) tab.localFilters = {};
    tab.localFilters.discipline = tab.localFilters.discipline === disc ? "ALL" : disc;
    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
  };

  window.resetSubDetailFilters = function (tabId) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters = {
      search: "",
      status: "ALL",
      section: "ALL",
      gate: "ALL",
      discipline: "ALL",
    };
    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
    showToast("Reset all filters in SubSystem detail", "info");
  };

  window.filterSubDetailFromSummary = function (tabId, disc, gateKey, statusPart) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.localFilters) tab.localFilters = {};

    const curDisc = tab.localFilters.discipline || "ALL";
    const curGate = tab.localFilters.gate || "ALL";
    const curSt = tab.localFilters.status || "ALL";

    if (curDisc === disc && curGate === gateKey && curSt === statusPart) {
      tab.localFilters.discipline = "ALL";
      tab.localFilters.gate = "ALL";
      tab.localFilters.status = "ALL";
      tab.localFilters.section = "ALL";
      showToast("Reset filters to all records in SubSystem", "info");
    } else {
      tab.localFilters.discipline = disc || "ALL";
      tab.localFilters.gate = gateKey || "ALL";
      tab.localFilters.status = statusPart || "ALL";

      if (gateKey && gateKey.startsWith("ITR-")) {
        tab.localFilters.section = "checksheet";
      } else if (gateKey && gateKey.startsWith("PUNCH-")) {
        tab.localFilters.section = "punchlist";
      } else {
        tab.localFilters.section = "ALL";
      }
      const label = `${disc !== "ALL" ? disc : "All Disc"} • ${gateKey !== "ALL" ? gateKey : "All Gates"}${statusPart !== "ALL" ? ` • ${statusPart}` : ""}`;
      showToast(`Filtered SubSystem detail: ${label}`, "info");
    }

    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();

    setTimeout(() => {
      const el = document.getElementById(`detail-sub-tables-${tabId}`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 60);
  };

  window.filterGateDetailFromSummary = function (tabId, disc, gateKey, statusPart) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    if (!tab.localFilters) tab.localFilters = {};
    const c = tab.criteria;

    // Determine target source & gate if user clicked a specific gate column
    let nextSource = tab.source;
    let nextCat = c.category || "ALL";
    let nextItr = c.itrGroup || "ALL";
    if (gateKey && gateKey.startsWith("PUNCH-")) {
      nextSource = "punchlist";
      nextCat = gateKey.replace("PUNCH-", "");
      nextItr = "ALL";
    } else if (gateKey === "ITR-A" || gateKey === "ITR-B") {
      nextSource = "checksheet";
      nextItr = gateKey;
      nextCat = "ALL";
    }

    const isPl = nextSource === "punchlist";
    const curDisc = tab.localFilters.discipline || c.discipline || "ALL";
    const curGate = tab.source === "punchlist"
      ? (c.category && c.category !== "ALL" ? `PUNCH-${c.category}` : "ALL")
      : (c.itrGroup && c.itrGroup !== "ALL" ? c.itrGroup : "ALL");
    const targetStatus = statusPart === "Closed"
      ? (isPl ? "Closed" : "Completed")
      : statusPart === "Open"
      ? (isPl ? "Open" : "Remaining")
      : "ALL";

    if (disc === "ALL" && gateKey === "ALL" && statusPart === "ALL") {
      c.discipline = "ALL";
      tab.localFilters.discipline = "ALL";
      tab.localFilters.status = "ALL";
      showToast("Reset filters to all records", "info");
    } else if (curDisc === disc && (gateKey === "ALL" || curGate === gateKey) && tab.localFilters.status === targetStatus) {
      c.discipline = "ALL";
      tab.localFilters.discipline = "ALL";
      tab.localFilters.status = "ALL";
      showToast("Reset filters to all records", "info");
    } else {
      tab.source = nextSource;
      c.source = nextSource;
      c.category = nextCat;
      c.itrGroup = nextItr;
      c.discipline = "ALL";
      tab.localFilters.discipline = disc || "ALL";
      tab.localFilters.status = targetStatus;
      const label = `${disc !== "ALL" ? disc : "All Disc"} • ${gateKey !== "ALL" ? gateKey : curGate}${targetStatus !== "ALL" ? ` • ${targetStatus}` : ""}`;
      showToast(`Filtered detail: ${label}`, "info");
    }
    tab.limit = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
    setTimeout(() => {
      const el = document.getElementById(`detail-table-card-${tabId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  window.resetPunchlistSummaryFilter = function () {
    const f = state.filters.punchlist;
    f.discipline = "ALL";
    f.category = "ALL";
    f.status = "ALL";
    f.page = 1;
    renderTabBar();
    renderTabContent();
    showToast("Reset Punchlist summary filters", "info");
  };

  window.resetChecksheetSummaryFilter = function () {
    const f = state.filters.checksheet;
    f.discipline = "ALL";
    f.itrGroup = "ALL";
    f.status = "ALL";
    f.page = 1;
    renderTabBar();
    renderTabContent();
    showToast("Reset Checksheet summary filters", "info");
  };

  window.filterPunchlistTabFromSummary = function (disc, gateKey, statusPart, isCrossSwitch) {
    // If user clicked an ITR-A or ITR-B column while on Punchlist tab, switch to Checksheet tab!
    if (gateKey === "ITR-A" || gateKey === "ITR-B") {
      const plF = state.filters.punchlist;
      state.filters.checksheet.system = plF.system || "ALL";
      state.filters.checksheet.subSystem = plF.subSystem || "ALL";
      state.activeTab = "checksheet";
      window.filterChecksheetTabFromSummary(disc, gateKey, statusPart, true);
      return;
    }

    const f = state.filters.punchlist;
    const targetDisc = disc || "ALL";
    const targetCat = gateKey && gateKey.startsWith("PUNCH-") ? gateKey.replace("PUNCH-", "") : "ALL";
    const targetStatus = statusPart === "Closed" ? "Closed" : statusPart === "Open" ? "Open" : "ALL";

    if (!isCrossSwitch && targetDisc === "ALL" && targetCat === "ALL" && targetStatus === "ALL") {
      f.discipline = "ALL";
      f.category = "ALL";
      f.status = "ALL";
      showToast("Reset Punchlist filters to all records", "info");
    } else if (!isCrossSwitch && f.discipline === targetDisc && f.category === targetCat && f.status === targetStatus) {
      f.discipline = "ALL";
      f.category = "ALL";
      f.status = "ALL";
      showToast("Reset Punchlist filters to all records", "info");
    } else {
      f.discipline = targetDisc;
      f.category = targetCat;
      f.status = targetStatus;
      const label = `${targetDisc !== "ALL" ? targetDisc : "All Disc"} • ${targetCat !== "ALL" ? `Punch Cat ${targetCat}` : "All Categories"}${targetStatus !== "ALL" ? ` • ${targetStatus}` : ""}`;
      showToast(`Filtered Punchlist: ${label}`, "info");
    }

    f.page = 1;
    renderTabBar();
    renderTabContent();
    setTimeout(() => {
      const el = document.getElementById("punchlist-table-card") || document.getElementById("punchlist-scroll-container");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  window.filterChecksheetTabFromSummary = function (disc, gateKey, statusPart, isCrossSwitch) {
    // If user clicked a PUNCH-A/B/C column while on Checksheet tab, switch to Punchlist tab!
    if (gateKey && gateKey.startsWith("PUNCH-")) {
      const csF = state.filters.checksheet;
      state.filters.punchlist.system = csF.system || "ALL";
      state.filters.punchlist.subSystem = csF.subSystem || "ALL";
      state.activeTab = "punchlist";
      window.filterPunchlistTabFromSummary(disc, gateKey, statusPart, true);
      return;
    }

    const f = state.filters.checksheet;
    const targetDisc = disc || "ALL";
    const targetItr = gateKey === "ITR-A" || gateKey === "ITR-B" ? gateKey : "ALL";
    const targetStatus = statusPart === "Closed" ? "Completed" : statusPart === "Open" ? "Remaining" : "ALL";

    if (!isCrossSwitch && targetDisc === "ALL" && targetItr === "ALL" && targetStatus === "ALL") {
      f.discipline = "ALL";
      f.itrGroup = "ALL";
      f.status = "ALL";
      showToast("Reset Checksheet filters to all records", "info");
    } else if (!isCrossSwitch && f.discipline === targetDisc && f.itrGroup === targetItr && f.status === targetStatus) {
      f.discipline = "ALL";
      f.itrGroup = "ALL";
      f.status = "ALL";
      showToast("Reset Checksheet filters to all records", "info");
    } else {
      f.discipline = targetDisc;
      f.itrGroup = targetItr;
      f.status = targetStatus;
      const label = `${targetDisc !== "ALL" ? targetDisc : "All Disc"} • ${targetItr !== "ALL" ? targetItr : "All ITRs"}${targetStatus !== "ALL" ? ` • ${targetStatus}` : ""}`;
      showToast(`Filtered Checksheets: ${label}`, "info");
    }

    f.page = 1;
    renderTabBar();
    renderTabContent();
    setTimeout(() => {
      const el = document.getElementById("checksheet-table-card") || document.getElementById("checksheet-scroll-container");
      if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 60);
  };

  window.onDisciplineSummaryCellClick = function (ctx, tabId, disc, gateKey, statusPart) {
    if (ctx === "subsystem") {
      filterSubDetailFromSummary(tabId, disc, gateKey, statusPart);
    } else if (ctx === "gateDetail") {
      filterGateDetailFromSummary(tabId, disc, gateKey, statusPart);
    } else if (ctx === "punchlist") {
      filterPunchlistTabFromSummary(disc, gateKey, statusPart);
    } else if (ctx === "checksheet") {
      filterChecksheetTabFromSummary(disc, gateKey, statusPart);
    }
  };

  window.handleSubDetailSectionScroll = function (container, tabId, sec) {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 300) {
      window.loadMoreSubDetailSection(tabId, sec);
    }
  };

  window.loadMoreSubDetailSection = function (tabId, sec) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const subData = getSubDetailCounts(tab);
    const isPl = sec === "punchlist";
    const rows = isPl ? subData.plFiltered : subData.csFiltered;
    const limitKey = isPl ? "limitPl" : "limitCs";
    const cur = tab[limitKey] || BATCH_SIZE;
    if (cur >= rows.length) return;
    const next = Math.min(rows.length, cur + BATCH_SIZE);
    const slice = rows.slice(cur, next);
    tab[limitKey] = next;

    const tbody = document.getElementById(`detail-sub-${isPl ? "pl" : "cs"}-tbody-${tab.id}`);
    if (tbody) tbody.insertAdjacentHTML("beforeend", isPl ? renderPlTableRows(slice, cur) : renderCsTableRows(slice, cur));

    const stEl = document.getElementById(`detail-sub-${isPl ? "pl" : "cs"}-status-${tab.id}`);
    if (stEl) {
      stEl.innerHTML =
        next >= rows.length
          ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${rows.length.toLocaleString()} items loaded</span>`
          : `<span class="text-blue-600 font-medium"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${next.toLocaleString()} of ${rows.length.toLocaleString()} items. Scroll down for more...</span>`;
    }
  };

  window.loadAllSubDetailSection = function (tabId, sec) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const subData = getSubDetailCounts(tab);
    const isPl = sec === "punchlist";
    const rows = isPl ? subData.plFiltered : subData.csFiltered;
    const limitKey = isPl ? "limitPl" : "limitCs";
    const cur = tab[limitKey] || BATCH_SIZE;
    if (cur >= rows.length) return;
    const slice = rows.slice(cur);
    tab[limitKey] = rows.length;

    const tbody = document.getElementById(`detail-sub-${isPl ? "pl" : "cs"}-tbody-${tab.id}`);
    if (tbody) tbody.insertAdjacentHTML("beforeend", isPl ? renderPlTableRows(slice, cur) : renderCsTableRows(slice, cur));

    const stEl = document.getElementById(`detail-sub-${isPl ? "pl" : "cs"}-status-${tab.id}`);
    if (stEl) {
      stEl.innerHTML = `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${rows.length.toLocaleString()} items loaded</span>`;
    }
  };

  window.setDetailStatusFilter = function (tabId, st) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters.status = st;
    tab.limit = BATCH_SIZE;
    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
  };

  window.setDetailFilter = function (tabId, key, val) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters[key] = val;
    tab.limit = BATCH_SIZE;
    tab.limitPl = BATCH_SIZE;
    tab.limitCs = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
  };

  window.debounceDetailFilter = function (tabId, key, val) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters[key] = val;
    clearTimeout(debounceDetailTimer);
    debounceDetailTimer = setTimeout(() => {
      tab.limit = BATCH_SIZE;
      tab.limitPl = BATCH_SIZE;
      tab.limitCs = BATCH_SIZE;
      renderTabContent();
    }, 250);
  };

  let debounceDetailTimer = null;
  window.debounceDetailSearch = function (tabId, val) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters.search = val;
    clearTimeout(debounceDetailTimer);
    debounceDetailTimer = setTimeout(() => {
      if (tab.source === "subsystem") {
        tab.limitPl = BATCH_SIZE;
        tab.limitCs = BATCH_SIZE;
        const subData = getSubDetailCounts(tab);
        const visPl = subData.plFiltered.slice(0, tab.limitPl);
        const visCs = subData.csFiltered.slice(0, tab.limitCs);
        const plTbody = document.getElementById(`detail-sub-pl-tbody-${tab.id}`);
        if (plTbody) plTbody.innerHTML = visPl.length ? renderPlTableRows(visPl, 0) : `<tr><td colspan="12" class="py-8 text-center text-slate-400 text-xs">No matching punchlist items in this SubSystem</td></tr>`;
        const csTbody = document.getElementById(`detail-sub-cs-tbody-${tab.id}`);
        if (csTbody) csTbody.innerHTML = visCs.length ? renderCsTableRows(visCs, 0) : `<tr><td colspan="12" class="py-8 text-center text-slate-400 text-xs">No matching checksheets in this SubSystem</td></tr>`;
        const plStEl = document.getElementById(`detail-sub-pl-status-${tab.id}`);
        if (plStEl) {
          plStEl.innerHTML =
            visPl.length >= subData.plFiltered.length
              ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${subData.plFiltered.length.toLocaleString()} items loaded</span>`
              : `<span class="text-blue-600 font-medium"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${visPl.length.toLocaleString()} of ${subData.plFiltered.length.toLocaleString()} items. Scroll down for more...</span>`;
        }
        const csStEl = document.getElementById(`detail-sub-cs-status-${tab.id}`);
        if (csStEl) {
          csStEl.innerHTML =
            visCs.length >= subData.csFiltered.length
              ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${subData.csFiltered.length.toLocaleString()} items loaded</span>`
              : `<span class="text-blue-600 font-medium"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${visCs.length.toLocaleString()} of ${subData.csFiltered.length.toLocaleString()} items. Scroll down for more...</span>`;
        }
        const plBadge = document.getElementById(`detail-sub-pl-count-${tab.id}`);
        if (plBadge) plBadge.textContent = `${subData.plFiltered.length.toLocaleString()} items`;
        const csBadge = document.getElementById(`detail-sub-cs-count-${tab.id}`);
        if (csBadge) csBadge.textContent = `${subData.csFiltered.length.toLocaleString()} items`;
        const tabBadge = document.getElementById(`detail-tab-badge-${tab.id}`);
        if (tabBadge) tabBadge.textContent = subData.totalFiltered.toLocaleString();
        return;
      }

      const filtered = getDetailFilteredRows(tab);
      tab.limit = Math.min(filtered.length, BATCH_SIZE);
      const visible = filtered.slice(0, tab.limit);
      const isPl = tab.source === "punchlist";

      const tbody = document.getElementById(`detail-tbody-${tab.id}`);
      if (tbody) {
        tbody.innerHTML = isPl ? renderPlTableRows(visible, 0) : renderCsTableRows(visible, 0);
      }
      const badge = document.getElementById(`detail-count-badge-${tab.id}`);
      if (badge) {
        badge.textContent =
          tab.limit >= filtered.length
            ? `(Showing all ${filtered.length.toLocaleString()} items)`
            : `(Showing ${tab.limit.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more)`;
      }
      const tabBadge = document.getElementById(`detail-tab-badge-${tab.id}`);
      if (tabBadge) tabBadge.textContent = filtered.length.toLocaleString();
      const statusEl = document.getElementById(`detail-scroll-status-${tab.id}`);
      if (statusEl) {
        statusEl.innerHTML =
          tab.limit >= filtered.length
            ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`
            : `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${tab.limit.toLocaleString()} of ${filtered.length.toLocaleString()} items. Scroll down to load more continuously...</span>`;
      }
    }, 200);
  };

  window.handleDetailContinuousScroll = function (container, tabId) {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 350) {
      window.loadMoreDetailContinuous(tabId);
    }
  };

  window.loadMoreDetailContinuous = function (tabId) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const filtered = getDetailFilteredRows(tab);
    if (tab.limit >= filtered.length) return;

    const prevLimit = tab.limit;
    const nextLimit = Math.min(filtered.length, prevLimit + BATCH_SIZE);
    const newRows = filtered.slice(prevLimit, nextLimit);
    tab.limit = nextLimit;

    const isPl = tab.source === "punchlist";
    const tbody = document.getElementById(`detail-tbody-${tab.id}`);
    if (tbody) {
      tbody.insertAdjacentHTML("beforeend", isPl ? renderPlTableRows(newRows, prevLimit) : renderCsTableRows(newRows, prevLimit));
    }

    const badge = document.getElementById(`detail-count-badge-${tab.id}`);
    if (badge) {
      badge.textContent =
        nextLimit >= filtered.length
          ? `(Showing all ${filtered.length.toLocaleString()} items)`
          : `(Showing ${nextLimit.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more)`;
    }
    const statusEl = document.getElementById(`detail-scroll-status-${tab.id}`);
    if (statusEl) {
      statusEl.innerHTML =
        nextLimit >= filtered.length
          ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`
          : `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${nextLimit.toLocaleString()} of ${filtered.length.toLocaleString()} items. Scroll down to load more continuously...</span>`;
    }
  };

  window.loadAllDetailContinuous = function (tabId) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    const filtered = getDetailFilteredRows(tab);
    if (tab.limit >= filtered.length) return;

    const prevLimit = tab.limit;
    const newRows = filtered.slice(prevLimit);
    tab.limit = filtered.length;

    const isPl = tab.source === "punchlist";
    const tbody = document.getElementById(`detail-tbody-${tab.id}`);
    if (tbody) {
      tbody.insertAdjacentHTML("beforeend", isPl ? renderPlTableRows(newRows, prevLimit) : renderCsTableRows(newRows, prevLimit));
    }

    const badge = document.getElementById(`detail-count-badge-${tab.id}`);
    if (badge) badge.textContent = `(Showing all ${filtered.length.toLocaleString()} items)`;
    const statusEl = document.getElementById(`detail-scroll-status-${tab.id}`);
    if (statusEl) {
      statusEl.innerHTML = `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`;
    }
    showToast(`Loaded all ${filtered.length.toLocaleString()} items into continuous list!`, "success");
  };

  function renderSubSystemDetailTab(tab, container) {
    const c = tab.criteria;
    const subNo = c.subSystem;
    const subDesc = (state.data.subsystems && state.data.subsystems[subNo]) || "";
    const d = getSubDetailCounts(tab);
    const activeSec = tab.localFilters.section || "ALL";
    const activeGate = tab.localFilters.gate || "ALL";
    const activeSt = tab.localFilters.status || "ALL";
    const activeDisc = tab.localFilters.discipline || "ALL";

    tab.limitPl = Math.min(d.plFiltered.length, Math.max(tab.limitPl || BATCH_SIZE, BATCH_SIZE));
    tab.limitCs = Math.min(d.csFiltered.length, Math.max(tab.limitCs || BATCH_SIZE, BATCH_SIZE));
    const visPl = d.plFiltered.slice(0, tab.limitPl);
    const visCs = d.csFiltered.slice(0, tab.limitCs);

    const gateCards = [
      { k: "ITR-A", title: "ITR-A", bucket: d.itrA, bg: "bg-blue-50 border-blue-200 text-blue-800", act: "bg-blue-600 text-white border-blue-600 shadow" },
      { k: "PUNCH-A", title: "Punch Cat A", bucket: d.punchA, bg: "bg-rose-50 border-rose-200 text-rose-800", act: "bg-rose-600 text-white border-rose-600 shadow" },
      { k: "PUNCH-B", title: "Punch Cat B", bucket: d.punchB, bg: "bg-amber-50 border-amber-200 text-amber-800", act: "bg-amber-600 text-white border-amber-600 shadow" },
      { k: "PUNCH-C", title: "Punch Cat C", bucket: d.punchC, bg: "bg-sky-50 border-sky-200 text-sky-800", act: "bg-sky-600 text-white border-sky-600 shadow" },
      { k: "ITR-B", title: "ITR-B", bucket: d.itrB, bg: "bg-indigo-50 border-indigo-200 text-indigo-800", act: "bg-indigo-600 text-white border-indigo-600 shadow" },
    ];

    const showPunch = (activeSec === "ALL" || activeSec === "punchlist") && !activeGate.startsWith("ITR-");
    const showCheck = (activeSec === "ALL" || activeSec === "checksheet") && !activeGate.startsWith("PUNCH-");
    const isFilteredSub =
      activeGate !== "ALL" ||
      activeDisc !== "ALL" ||
      activeSt !== "ALL" ||
      Boolean((tab.localFilters.search || "").trim()) ||
      activeSec !== "ALL";

    container.innerHTML = `
      <!-- 1. SubSystem Full Dossier Banner -->
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="switchMainTab('overview')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5">
              <i class="fas fa-arrow-left"></i> Back to Overview
            </button>
            <span class="px-2.5 py-1 rounded-lg text-xs font-black bg-teal-100 text-teal-800">
              SUBSYSTEM FULL DETAIL
            </span>
            <h2 class="text-sm sm:text-base font-black text-slate-900 font-mono">${esc(subNo)}</h2>
            ${subDesc ? `<span class="text-xs sm:text-sm font-semibold text-slate-600">— ${esc(subDesc)}</span>` : ""}
            <span class="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-black">
              Overall ${d.overallPct}% (${d.overallClosed.toLocaleString()}/${d.overallTotal.toLocaleString()})
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button
              onclick="window.open('${esc(buildDetailUrl(c))}', '_blank')"
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
              title="Open this SubSystem detail in a new browser tab"
            >
              <i class="fas fa-external-link-alt text-[10px]"></i>
              <span class="hidden sm:inline">Pop Out</span>
            </button>
            <button
              onclick="closeDetailTab('${esc(tab.id)}')"
              class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <i class="fas fa-times"></i> Close Tab
            </button>
          </div>
        </div>

        <!-- 5 Gate Cards (Click any gate to focus) -->
        <div class="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          ${gateCards
            .map((gc) => {
              const isAct = activeGate === gc.k;
              const b = gc.bucket;
              return `
                <button
                  onclick="setSubDetailGate('${esc(tab.id)}', '${gc.k}')"
                  class="p-2.5 rounded-xl border text-left transition-all ${isAct ? gc.act : gc.bg + " hover:opacity-90"}"
                  title="Click to filter ${gc.title} for ${esc(subNo)}"
                >
                  <div class="flex items-center justify-between text-[10px] font-black uppercase">
                    <span>${gc.title}</span>
                    <span>${b.pct}%</span>
                  </div>
                  <div class="mt-1 font-mono text-base font-black">
                    ${b.closed.toLocaleString()} <span class="text-[11px] font-bold opacity-75">/ ${b.total.toLocaleString()}</span>
                  </div>
                  <div class="text-[10px] opacity-80 mt-0.5">Open/Rem: ${b.open.toLocaleString()}</div>
                </button>
              `;
            })
            .join("")}
        </div>

        <!-- Per-Discipline Close/Open Breakdown of ITR-A/B & Punch A/B/C for this SubSystem -->
        ${renderDisciplineSummaryStrip({
          context: "subsystem",
          tabId: tab.id,
          selectedDiscipline: "ALL",
          activeDiscipline: activeDisc,
          activeGate: activeGate,
          activeStatus: activeSt,
          subSystem: subNo,
          plRows: d.plBase,
          csRows: d.csBase,
          scopeLabel: `SubSystem ${subNo}`,
        })}

        <!-- Sub-view Controls: Section + Status + Search -->
        <div id="detail-sub-tables-${esc(tab.id)}" class="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div class="flex flex-wrap items-center gap-1.5">
            ${[
              { k: "ALL", lbl: `All (${d.plBase.length + d.csBase.length})` },
              { k: "punchlist", lbl: `Punchlist (${d.plBase.length})` },
              { k: "checksheet", lbl: `Checksheets (${d.csBase.length})` },
            ]
              .map(
                (s) => `
              <button
                onclick="setSubDetailSection('${esc(tab.id)}', '${s.k}')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSec === s.k ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }"
              >${s.lbl}</button>
            `
              )
              .join("")}

            <span class="mx-1 text-slate-300">|</span>

            ${[
              { k: "ALL", lbl: "All Status" },
              { k: "Closed", lbl: "Closed / Completed" },
              { k: "Open", lbl: "Open / Remaining" },
            ]
              .map(
                (st) => `
              <button
                onclick="setDetailStatusFilter('${esc(tab.id)}', '${st.k}')"
                class="px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  activeSt === st.k ? "bg-blue-600 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }"
              >${st.lbl}</button>
            `
              )
              .join("")}

            ${
              activeGate !== "ALL"
                ? `<button onclick="setSubDetailGate('${esc(tab.id)}', '${activeGate}')" class="px-2.5 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-900 text-xs font-bold transition-colors" title="Click to clear Gate filter"><i class="fas fa-filter mr-1"></i>${activeGate} ×</button>`
                : ""
            }
            ${
              activeDisc !== "ALL"
                ? `<button onclick="setSubDetailDiscipline('${esc(tab.id)}', 'ALL')" class="px-2.5 py-1.5 rounded-lg bg-indigo-100 hover:bg-indigo-200 text-indigo-900 text-xs font-bold transition-colors flex items-center gap-1" title="Click to clear Discipline filter"><i class="fas fa-layer-group text-indigo-600 mr-1"></i>${esc(activeDisc)} ×</button>`
                : ""
            }
            ${
              isFilteredSub
                ? `<button onclick="resetSubDetailFilters('${esc(tab.id)}')" class="px-2.5 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold transition-colors" title="Reset all SubSystem filters"><i class="fas fa-rotate-left mr-1"></i>Reset</button>`
                : ""
            }
          </div>

          <div class="relative w-full sm:w-64">
            <input
              type="text"
              value="${esc(tab.localFilters.search)}"
              oninput="debounceDetailSearch('${esc(tab.id)}', this.value)"
              placeholder="Search Tag, PL No, Defect, ITR..."
              class="w-full pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
            />
            <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          </div>
        </div>
      </div>

      ${
        showPunch
          ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-3 bg-rose-50/70 border-b border-rose-100 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <i class="fas fa-clipboard-list text-rose-600"></i>
              <h4 class="font-extrabold text-xs sm:text-sm text-slate-900 uppercase tracking-wide">
                Punchlist Items (${esc(subNo)}${activeDisc !== "ALL" ? ` • ${esc(activeDisc)}` : ""}${activeGate !== "ALL" ? ` • ${esc(activeGate)}` : ""}${activeSt !== "ALL" ? ` • ${esc(activeSt)}` : ""})
              </h4>
              <span id="detail-sub-pl-count-${esc(tab.id)}" class="px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 text-[11px] font-bold">${d.plFiltered.length.toLocaleString()} items</span>
            </div>
            ${
              d.plFiltered.length > tab.limitPl
                ? `<button onclick="loadAllSubDetailSection('${esc(tab.id)}', 'punchlist')" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold"><i class="fas fa-list-check text-emerald-600 mr-1"></i>Load All (${d.plFiltered.length.toLocaleString()})</button>`
                : ""
            }
          </div>
          <div onscroll="handleSubDetailSectionScroll(this, '${esc(tab.id)}', 'punchlist')" class="overflow-x-auto overflow-y-auto max-h-[520px] bg-white">
            <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
              <thead>
                <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                  <th class="py-2.5 px-3 text-center whitespace-nowrap">#</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">PunchList No</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Raised No.</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">SubSystem</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Tag No</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Tag Description</th>
                  <th class="py-2.5 px-3 text-center whitespace-nowrap">Cat</th>
                  <th class="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Discipline</th>
                  <th class="py-2.5 px-4 whitespace-nowrap">Defect Description</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Target Date</th>
                  <th class="py-2.5 px-4 whitespace-nowrap">Corrective Action</th>
                </tr>
              </thead>
              <tbody id="detail-sub-pl-tbody-${esc(tab.id)}">
                ${visPl.length ? renderPlTableRows(visPl, 0) : `<tr><td colspan="12" class="py-8 text-center text-slate-400 text-xs">No matching punchlist items in this SubSystem</td></tr>`}
              </tbody>
            </table>
            <div id="detail-sub-pl-status-${esc(tab.id)}" class="py-2 px-4 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
              ${
                visPl.length >= d.plFiltered.length
                  ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${d.plFiltered.length.toLocaleString()} items loaded</span>`
                  : `<span class="text-blue-600 font-medium"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${visPl.length.toLocaleString()} of ${d.plFiltered.length.toLocaleString()} items. Scroll down for more...</span>`
              }
            </div>
          </div>
        </div>
      `
          : ""
      }

      ${
        showCheck
          ? `
        <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div class="p-3 bg-blue-50/70 border-b border-blue-100 flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2">
              <i class="fas fa-tasks text-blue-600"></i>
              <h4 class="font-extrabold text-xs sm:text-sm text-slate-900 uppercase tracking-wide">
                Checksheets — ITR-A &amp; ITR-B (${esc(subNo)}${activeDisc !== "ALL" ? ` • ${esc(activeDisc)}` : ""}${activeGate !== "ALL" ? ` • ${esc(activeGate)}` : ""}${activeSt !== "ALL" ? ` • ${esc(activeSt)}` : ""})
              </h4>
              <span id="detail-sub-cs-count-${esc(tab.id)}" class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">${d.csFiltered.length.toLocaleString()} items</span>
            </div>
            ${
              d.csFiltered.length > tab.limitCs
                ? `<button onclick="loadAllSubDetailSection('${esc(tab.id)}', 'checksheet')" class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold"><i class="fas fa-list-check text-emerald-600 mr-1"></i>Load All (${d.csFiltered.length.toLocaleString()})</button>`
                : ""
            }
          </div>
          <div onscroll="handleSubDetailSectionScroll(this, '${esc(tab.id)}', 'checksheet')" class="overflow-x-auto overflow-y-auto max-h-[520px] bg-white">
            <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
              <thead>
                <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                  <th class="py-2.5 px-2 text-center whitespace-nowrap">No</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">SubSystem</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">Tag No</th>
                  <th class="py-2.5 px-3 whitespace-nowrap">Tag Description</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">Discipline</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">CheckSheet Type</th>
                  <th class="py-2.5 px-2 text-center whitespace-nowrap">Status</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">Complete Date</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">Plan Finish</th>
                  <th class="py-2.5 px-2 text-center whitespace-nowrap">Norm</th>
                  <th class="py-2.5 px-2 whitespace-nowrap">SubContractor</th>
                  <th class="py-2.5 px-2 text-center whitespace-nowrap">Phase</th>
                </tr>
              </thead>
              <tbody id="detail-sub-cs-tbody-${esc(tab.id)}">
                ${visCs.length ? renderCsTableRows(visCs, 0) : `<tr><td colspan="12" class="py-8 text-center text-slate-400 text-xs">No matching checksheets in this SubSystem</td></tr>`}
              </tbody>
            </table>
            <div id="detail-sub-cs-status-${esc(tab.id)}" class="py-2 px-4 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
              ${
                visCs.length >= d.csFiltered.length
                  ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${d.csFiltered.length.toLocaleString()} items loaded</span>`
                  : `<span class="text-blue-600 font-medium"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${visCs.length.toLocaleString()} of ${d.csFiltered.length.toLocaleString()} items. Scroll down for more...</span>`
              }
            </div>
          </div>
        </div>
      `
          : ""
      }
    `;
  }

  function renderDetailTab(tab, container) {
    if (tab.source === "subsystem") {
      renderSubSystemDetailTab(tab, container);
      return;
    }
    const isPl = tab.source === "punchlist";
    const c = tab.criteria;
    const baseStats = getDetailBaseStats(tab);
    const filtered = getDetailFilteredRows(tab);
    tab.limit = Math.min(filtered.length, Math.max(tab.limit || BATCH_SIZE, BATCH_SIZE));
    const visibleRows = filtered.slice(0, tab.limit);

    const closedStatusVal = isPl ? "Closed" : "Completed";
    const openStatusVal = isPl ? "Open" : "Remaining";
    const activeSt = tab.localFilters.status || "ALL";

    const chips = [];
    if (c.system !== "ALL") chips.push(`System: ${c.system}`);
    if (c.subSystem !== "ALL") {
      const desc = state.data.subsystems[c.subSystem] ? ` (${state.data.subsystems[c.subSystem]})` : "";
      chips.push(`SubSystem: ${c.subSystem}${desc}`);
    }
    if (c.discipline !== "ALL") chips.push(`Discipline: ${c.discipline}`);
    if (tab.localFilters.discipline && tab.localFilters.discipline !== "ALL") chips.push(`Filtered Discipline: ${tab.localFilters.discipline}`);
    if (isPl && c.category !== "ALL") chips.push(`Punch Cat: ${c.category}`);
    if (!isPl && c.itrGroup !== "ALL") chips.push(`Gate: ${c.itrGroup}`);
    if (activeSt !== "ALL") chips.push(`Status: ${activeSt}`);

    container.innerHTML = `
      <!-- 1. Detail Tab Banner -->
      <div class="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 flex-wrap">
            <button onclick="switchMainTab('overview')" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-colors flex items-center gap-1.5">
              <i class="fas fa-arrow-left"></i> Back to Overview
            </button>
            <span class="px-2.5 py-1 rounded-lg text-xs font-black ${isPl ? "bg-rose-100 text-rose-800" : "bg-blue-100 text-blue-800"}">
              ${isPl ? "PUNCHLIST DETAIL TAB" : "CHECKSHEET DETAIL TAB"}
            </span>
            <h2 class="text-sm sm:text-base font-black text-slate-900">${esc(tab.title)}</h2>
          </div>

          <div class="flex items-center gap-2">
            <button
              onclick="window.open('${esc(buildDetailUrl(c))}', '_blank')"
              class="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1"
              title="Open this filtered view in a new browser tab"
            >
              <i class="fas fa-external-link-alt text-[10px]"></i>
              <span class="hidden sm:inline">Pop Out</span>
            </button>
            <button
              onclick="closeDetailTab('${esc(tab.id)}')"
              class="px-2.5 py-1.5 rounded-xl bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-xs font-bold flex items-center gap-1 transition-colors"
            >
              <i class="fas fa-times"></i> Close Tab
            </button>
          </div>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          ${chips.map((ch) => `<span class="px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold">${esc(ch)}</span>`).join("")}
        </div>

        <!-- Mini KPI Status Switchers + Search -->
        <div class="grid grid-cols-1 sm:grid-cols-2 ${c.system === "ALL" && c.subSystem === "ALL" ? "lg:grid-cols-5" : "lg:grid-cols-4"} gap-3 pt-2 border-t border-slate-100 items-center">
          <button
            onclick="setDetailStatusFilter('${esc(tab.id)}', 'ALL')"
            class="p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeSt === "ALL" ? "bg-slate-900 text-white border-slate-900 shadow" : "bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200"
            }"
          >
            <div>
              <div class="text-[10px] font-bold uppercase opacity-80">Total Scope</div>
              <div class="text-lg font-black">${baseStats.total.toLocaleString()}</div>
            </div>
            <i class="fas fa-list-ul opacity-70"></i>
          </button>

          <button
            onclick="setDetailStatusFilter('${esc(tab.id)}', '${closedStatusVal}')"
            class="p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeSt === closedStatusVal ? "bg-emerald-600 text-white border-emerald-600 shadow" : "bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border-emerald-200"
            }"
          >
            <div>
              <div class="text-[10px] font-bold uppercase opacity-80">${closedStatusVal} (${baseStats.pct}%)</div>
              <div class="text-lg font-black">${baseStats.closed.toLocaleString()}</div>
            </div>
            <i class="fas fa-check-circle opacity-80"></i>
          </button>

          <button
            onclick="setDetailStatusFilter('${esc(tab.id)}', '${openStatusVal}')"
            class="p-2.5 rounded-xl border text-left transition-all flex items-center justify-between ${
              activeSt === openStatusVal ? "bg-rose-600 text-white border-rose-600 shadow" : "bg-rose-50 hover:bg-rose-100 text-rose-900 border-rose-200"
            }"
          >
            <div>
              <div class="text-[10px] font-bold uppercase opacity-80">${openStatusVal}</div>
              <div class="text-lg font-black">${baseStats.open.toLocaleString()}</div>
            </div>
            <i class="fas fa-clock opacity-80"></i>
          </button>

          ${
            c.system === "ALL" && c.subSystem === "ALL"
              ? `
            <div class="relative">
              <input
                type="text"
                list="detail-sys-list-${esc(tab.id)}"
                value="${esc(tab.localFilters.system === "ALL" ? "" : tab.localFilters.system || "")}"
                oninput="debounceDetailFilter('${esc(tab.id)}', 'system', this.value)"
                placeholder="Search System (XXX-YY)..."
                class="w-full pl-8 pr-7 py-2.5 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-layer-group absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              ${
                tab.localFilters.system && tab.localFilters.system !== "ALL"
                  ? `
                <button
                  type="button"
                  onclick="setDetailFilter('${esc(tab.id)}', 'system', 'ALL')"
                  class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1"
                  title="Clear System filter"
                >
                  <i class="fas fa-times-circle"></i>
                </button>
              `
                  : ""
              }
              <datalist id="detail-sys-list-${esc(tab.id)}">
                ${(state.overviewCache ? state.overviewCache.stats.allSystems : []).map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join("")}
              </datalist>
            </div>
          `
              : ""
          }

          <div class="relative">
            <input
              type="text"
              value="${esc(tab.localFilters.search)}"
              oninput="debounceDetailSearch('${esc(tab.id)}', this.value)"
              placeholder="Search Tag, PL No, Defect, ITR..."
              class="w-full pl-8 pr-3 py-2.5 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
            />
            <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
          </div>
        </div>
      </div>

      <!-- 1B. Discipline Summary -->
      ${renderDisciplineSummaryStrip({
        context: "gateDetail",
        tabId: tab.id,
        selectedDiscipline: "ALL",
        activeDiscipline: tab.localFilters.discipline && tab.localFilters.discipline !== "ALL" ? tab.localFilters.discipline : (c.discipline || "ALL"),
        activeGate: isPl ? (c.category !== "ALL" ? `PUNCH-${c.category}` : "ALL") : (c.itrGroup || "ALL"),
        activeStatus: activeSt === "Completed" ? "Closed" : activeSt === "Remaining" ? "Open" : activeSt,
        system: tab.localFilters.system && tab.localFilters.system !== "ALL" ? tab.localFilters.system : c.system,
        subSystem: c.subSystem,
        scopeLabel: c.subSystem !== "ALL" ? `SubSystem: ${c.subSystem}` : c.system !== "ALL" ? `System: ${c.system}` : "All Disciplines & SubSystems",
      })}

      <!-- 2. Detail Continuous List Table -->
      <div id="detail-table-card-${esc(tab.id)}" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              ${isPl ? "Filtered Punchlist Records" : "Filtered Checksheet Records"}
            </h4>
            <span id="detail-count-badge-${esc(tab.id)}" class="text-xs text-slate-500 font-medium">
              (${visibleRows.length >= filtered.length ? `Showing all ${filtered.length.toLocaleString()} items` : `Showing ${visibleRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more`})
            </span>
          </div>
          <button
            onclick="loadAllDetailContinuous('${esc(tab.id)}')"
            class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
          >
            <i class="fas fa-list-check text-[10px] text-emerald-600"></i>
            <span>Load All</span>
          </button>
        </div>

        <div onscroll="handleDetailContinuousScroll(this, '${esc(tab.id)}')" class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-260px)] min-h-[380px] bg-white">
          <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              ${
                isPl
                  ? `<tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                      <th class="py-2.5 px-3 text-center whitespace-nowrap">#</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">PunchList No</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Raised No.</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">SubSystem</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Tag No</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Tag Description</th>
                      <th class="py-2.5 px-3 text-center whitespace-nowrap">Cat</th>
                      <th class="py-2.5 px-3 text-center whitespace-nowrap">Status</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Discipline</th>
                      <th class="py-2.5 px-4 whitespace-nowrap">Defect Description</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Target Date</th>
                      <th class="py-2.5 px-4 whitespace-nowrap">Corrective Action</th>
                    </tr>`
                  : `<tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                      <th class="py-2.5 px-2 text-center whitespace-nowrap">No</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">SubSystem</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">Tag No</th>
                      <th class="py-2.5 px-3 whitespace-nowrap">Tag Description</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">Discipline</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">CheckSheet Type</th>
                      <th class="py-2.5 px-2 text-center whitespace-nowrap">Status</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">Complete Date</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">Plan Finish</th>
                      <th class="py-2.5 px-2 text-center whitespace-nowrap">Norm</th>
                      <th class="py-2.5 px-2 whitespace-nowrap">SubContractor</th>
                      <th class="py-2.5 px-2 text-center whitespace-nowrap">Phase</th>
                    </tr>`
              }
            </thead>
            <tbody id="detail-tbody-${esc(tab.id)}">
              ${isPl ? renderPlTableRows(visibleRows, 0) : renderCsTableRows(visibleRows, 0)}
            </tbody>
          </table>
          <div id="detail-scroll-status-${esc(tab.id)}" class="py-2.5 px-4 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
            ${
              visibleRows.length >= filtered.length
                ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`
                : `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${visibleRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items. Scroll down to load more continuously...</span>`
            }
          </div>
        </div>
      </div>
    `;
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
    const sysQ = (f.system || "ALL").trim().toUpperCase();
    const subQ = f.subSystem;
    const catQ = f.category;
    const statusQ = f.status;
    const discQ = f.discipline;

    return rows.filter((r) => {
      // 0: sys, 1: sub, 2: pl_no, 5: tag_no, 6: tag_desc, 8: cat, 9: status, 15: disc, 16: defect
      if (sysQ !== "ALL" && sysQ !== "") {
        const subNo = pool[r[1]] || "";
        const rowSys = (pool[r[0]] || deriveSystemNo(subNo)).toUpperCase();
        if (rowSys !== sysQ && !rowSys.includes(sysQ)) return false;
      }
      if (subQ !== "ALL" && (pool[r[1]] || "") !== subQ) return false;
      if (catQ !== "ALL" && r[8] !== catQ) return false;
      if (statusQ !== "ALL" && (pool[r[9]] || "") !== statusQ) return false;
      if (discQ !== "ALL" && (pool[r[15]] || "") !== discQ) return false;

      if (tagQ && !(r[5] || "").toLowerCase().includes(tagQ)) return false;

      if (q) {
        const text = `${r[2]} ${pool[r[3]] || ""} ${r[5]} ${pool[r[6]] || ""} ${pool[r[16]] || ""} ${pool[r[1]] || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }

  let debouncePlTimer = null;
  window.debouncePlFilter = function (key, val) {
    state.filters.punchlist[key] = val;
    state.filters.punchlist.page = 1;
    if (key === "system") {
      const clearBtn = document.getElementById("pl-sys-clear-btn");
      if (clearBtn) {
        if (val && val.trim() !== "" && val.trim().toUpperCase() !== "ALL") {
          clearBtn.classList.remove("hidden");
        } else {
          clearBtn.classList.add("hidden");
        }
      }
    }
    clearTimeout(debouncePlTimer);
    debouncePlTimer = setTimeout(() => {
      renderPlTableOnly();
    }, 220);
  };

  // =========================================================================
  // CONTINUOUS SCROLL ENGINE (NO PAGINATION - SEAMLESS LIST SCROLLING)
  // =========================================================================
  const BATCH_SIZE = 100;

  window.handlePlContinuousScroll = function (container) {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 350) {
      window.loadMoreContinuous("punchlist");
    }
  };

  window.handleCsContinuousScroll = function (container) {
    if (container.scrollTop + container.clientHeight >= container.scrollHeight - 350) {
      window.loadMoreContinuous("checksheet");
    }
  };

  window.loadMoreContinuous = function (tabKey) {
    const isPl = tabKey === "punchlist";
    const filtered = isPl ? getFilteredPunchlist() : getFilteredChecksheets();
    const currentLimit = state.limit[tabKey];
    if (currentLimit >= filtered.length) return;

    const nextLimit = Math.min(filtered.length, currentLimit + BATCH_SIZE);
    const newRows = filtered.slice(currentLimit, nextLimit);
    state.limit[tabKey] = nextLimit;

    const tbody = document.getElementById(isPl ? "punchlist-tbody" : "checksheet-tbody");
    if (tbody) {
      const html = isPl ? renderPlTableRows(newRows, currentLimit) : renderCsTableRows(newRows, currentLimit);
      tbody.insertAdjacentHTML("beforeend", html);
    }
    updateContinuousScrollStatus(tabKey, nextLimit, filtered.length);
  };

  window.loadAllContinuous = function (tabKey) {
    const isPl = tabKey === "punchlist";
    const filtered = isPl ? getFilteredPunchlist() : getFilteredChecksheets();
    const currentLimit = state.limit[tabKey];
    if (currentLimit >= filtered.length) return;

    const newRows = filtered.slice(currentLimit);
    state.limit[tabKey] = filtered.length;

    const tbody = document.getElementById(isPl ? "punchlist-tbody" : "checksheet-tbody");
    if (tbody) {
      const html = isPl ? renderPlTableRows(newRows, currentLimit) : renderCsTableRows(newRows, currentLimit);
      tbody.insertAdjacentHTML("beforeend", html);
    }
    updateContinuousScrollStatus(tabKey, filtered.length, filtered.length);
    showToast(`Loaded all ${filtered.length.toLocaleString()} items into continuous list!`, "success");
  };

  function updateContinuousScrollStatus(tabKey, loaded, total) {
    const isPl = tabKey === "punchlist";
    const countBadge = document.getElementById(isPl ? "pl-count-badge" : "cs-count-badge");
    if (countBadge) {
      countBadge.textContent = loaded >= total
        ? `(Showing all ${total.toLocaleString()} items)`
        : `(Showing ${loaded.toLocaleString()} of ${total.toLocaleString()} items — Scroll down for more)`;
    }
    const statusEl = document.getElementById(isPl ? "pl-scroll-status" : "cs-scroll-status");
    if (statusEl) {
      if (loaded >= total) {
        statusEl.innerHTML = `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${total.toLocaleString()} items loaded</span>`;
      } else {
        statusEl.innerHTML = `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${loaded.toLocaleString()} of ${total.toLocaleString()} items. Scroll down to load more continuously...</span>`;
      }
    }
  }

  function renderPlTableRows(pageRows, startIdx) {
    if (pageRows.length === 0) {
      return `<tr><td colspan="12" class="py-12 text-center text-slate-400 text-xs">No matching punchlist records found.</td></tr>`;
    }
    return pageRows
      .map((r, idx) => {
        const sysNo = resolvePl(r, 0);
        const subNo = resolvePl(r, 1);
        const plNo = r[2];
        const raisedNo = resolvePl(r, 3);
        const tagNo = r[5];
        const tagDesc = resolvePl(r, 6);
        const cat = r[8];
        const status = resolvePl(r, 9);
        const disc = resolvePl(r, 15);
        const defect = resolvePl(r, 16);
        const corrective = resolvePl(r, 17) || "-";
        const targetDate = resolvePl(r, 21) || "-";

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
          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs sm:text-sm transition-colors">
            <td class="py-2.5 px-3 text-center text-slate-400 font-mono font-semibold whitespace-nowrap align-top">${startIdx + idx + 1}</td>
            <td class="py-2.5 px-3 font-black text-blue-700 font-mono whitespace-nowrap align-top">
              <button onclick="viewPunchDetail('${esc(plNo)}')" class="hover:underline text-left text-xs sm:text-sm" title="${esc(plNo)}">
                ${esc(plNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 font-mono text-slate-700 font-medium whitespace-nowrap align-top" title="${esc(raisedNo)}">
              ${esc(raisedNo) || "-"}
            </td>
            <td class="py-2.5 px-3 font-bold text-slate-800 font-mono whitespace-nowrap align-top">
              <button onclick="setPlFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600" title="${esc(subNo)}">
                ${esc(subNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 font-mono font-black text-slate-900 whitespace-nowrap align-top">
              <button onclick="setPlFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600" title="${esc(tagNo)}">
                ${esc(tagNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 text-slate-600 font-medium whitespace-nowrap max-w-xs md:max-w-sm truncate align-top" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
            <td class="py-2.5 px-2 text-center whitespace-nowrap align-top">
              <span class="px-2.5 py-0.5 rounded-md font-black text-xs border ${catBadge}">${esc(cat)}</span>
            </td>
            <td class="py-2.5 px-2 text-center whitespace-nowrap align-top">
              <span class="px-2.5 py-0.5 rounded-full font-black text-xs border ${statusBadge}">${esc(status)}</span>
            </td>
            <td class="py-2.5 px-3 text-slate-700 font-semibold whitespace-nowrap align-top" title="${esc(disc)}">${esc(disc)}</td>
            <td class="py-2.5 px-4 text-slate-800 whitespace-normal break-words leading-relaxed min-w-[280px] max-w-xl font-sans text-xs sm:text-sm align-top">
              ${esc(defect)}
            </td>
            <td class="py-2.5 px-3 text-slate-600 font-mono text-xs sm:text-sm whitespace-nowrap align-top">${esc(targetDate)}</td>
            <td class="py-2.5 px-4 text-emerald-800 whitespace-normal break-words leading-relaxed min-w-[240px] max-w-lg font-sans text-xs sm:text-sm align-top">
              ${corrective && corrective !== "-" ? `
                <button
                  onclick="viewPunchDetail('${esc(plNo)}')"
                  class="hover:text-blue-600 hover:underline text-left whitespace-normal break-words leading-relaxed"
                  title="Click to view details"
                >
                  ${esc(corrective)}
                </button>
              ` : `<span class="text-slate-400 font-mono">-</span>`}
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updatePlKpiCards(filtered, totalAll) {
    const pool = state.data.punchlist.pool;
    let catA = 0, catB = 0, catC = 0, open = 0, closed = 0;
    filtered.forEach((r) => {
      const c = r[8];
      if (c === "A") catA++;
      else if (c === "B") catB++;
      else if (c === "C" || c === "c") catC++;

      const st = pool[r[9]] || "";
      if (st === "Closed") closed++;
      else open++;
    });

    const total = filtered.length;
    const pctClosed = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";
    const isFiltered = total !== totalAll;

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setEl("pl-kpi-total", total.toLocaleString());
    setEl("pl-kpi-total-sub", isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} items` : "Total Punchlist Registry");
    setEl("pl-kpi-catA", catA.toLocaleString());
    setEl("pl-kpi-catB", catB.toLocaleString());
    setEl("pl-kpi-catC", catC.toLocaleString());
    setEl("pl-kpi-open", open.toLocaleString());
    setEl("pl-kpi-closed", closed.toLocaleString());
    setEl("pl-kpi-pctClosed", `${pctClosed}%`);
    const cBar = document.getElementById("pl-kpi-closed-bar");
    if (cBar) cBar.style.width = `${pctClosed}%`;

    setEl("pl-btn-catAll-count", `All Cats (${total.toLocaleString()})`);
    setEl("pl-btn-catA-count", `Cat A (${catA.toLocaleString()})`);
    setEl("pl-btn-catB-count", `Cat B (${catB.toLocaleString()})`);
    setEl("pl-btn-catC-count", `Cat C (${catC.toLocaleString()})`);
    setEl("pl-btn-statusAll-count", `All Status (${total.toLocaleString()})`);
    setEl("pl-btn-open-count", `Open (${open.toLocaleString()})`);
    setEl("pl-btn-closed-count", `Closed (${closed.toLocaleString()})`);
  }

  function renderPlTableOnly() {
    const tbody = document.getElementById("punchlist-tbody");
    if (!tbody) {
      renderTabContent();
      return;
    }
    const filtered = getFilteredPunchlist();
    const totalAll = state.data.punchlist.rows.length;

    state.limit.punchlist = Math.min(filtered.length, BATCH_SIZE);
    const visibleRows = filtered.slice(0, state.limit.punchlist);

    tbody.innerHTML = renderPlTableRows(visibleRows, 0);

    const scrollContainer = document.getElementById("punchlist-scroll-container");
    if (scrollContainer) scrollContainer.scrollTop = 0;

    const kpiBadge = document.getElementById("pl-kpi-filter-badge");
    if (kpiBadge) {
      kpiBadge.textContent = `${filtered.length.toLocaleString()} / ${totalAll.toLocaleString()} items`;
    }

    updateContinuousScrollStatus("punchlist", state.limit.punchlist, filtered.length);
    updatePlKpiCards(filtered, totalAll);
    updatePlSubSelectOptions();
    const plDiscWrap = document.getElementById("pl-disc-summary-wrap");
    if (plDiscWrap) plDiscWrap.innerHTML = buildPunchlistTabDisciplineSummary(filtered);
    renderTabBar();
  }

  function updatePlSubSelectOptions() {
    const sel = document.getElementById("pl-subsystem-select");
    if (!sel) return;
    const activeSys = (state.filters.punchlist.system || "ALL").trim().toUpperCase();
    const allRows = state.data.punchlist.rows;
    const pool = state.data.punchlist.pool;
    const allSubSet = new Set();
    allRows.forEach((r) => {
      const s = pool[r[1]] || "";
      if (s) allSubSet.add(s);
    });
    const sortedSubs = Array.from(allSubSet)
      .filter((s) => {
        if (!activeSys || activeSys === "ALL") return true;
        const sys = (deriveSystemNo(s) || "").toUpperCase();
        return sys === activeSys || sys.includes(activeSys);
      })
      .sort();
    const subDescMap = state.data.subsystems || {};
    const curVal = state.filters.punchlist.subSystem;
    sel.innerHTML = `
      <option value="ALL">-- All SubSystems (${sortedSubs.length}) --</option>
      ${sortedSubs
        .map((s) => {
          const desc = subDescMap[s] ? ` - ${subDescMap[s]}` : "";
          return `<option value="${esc(s)}" ${curVal === s ? "selected" : ""}>${esc(s)}${esc(desc)}</option>`;
        })
        .join("")}
    `;
  }

  function renderPunchlistTab(container) {
    const allRows = state.data.punchlist.rows;
    const pool = state.data.punchlist.pool;
    const filtered = getFilteredPunchlist();
    const f = state.filters.punchlist;

    // Compute KPIs FROM FILTERED DATA
    const totalAll = allRows.length;
    const total = filtered.length;
    const isFiltered = total !== totalAll;

    let catA = 0, catB = 0, catC = 0, open = 0, closed = 0;
    filtered.forEach((r) => {
      const c = r[8];
      if (c === "A") catA++;
      else if (c === "B") catB++;
      else if (c === "C" || c === "c") catC++;

      const st = pool[r[9]] || "";
      if (st === "Closed") closed++;
      else open++;
    });

    const pctClosed = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";

    // All available subsystems, systems, and disciplines for dropdown options
    const allSubSet = new Set();
    const allDiscSet = new Set();
    const allSysMap = new Map();
    allRows.forEach((r) => {
      const d = pool[r[15]] || "";
      if (d) allDiscSet.add(d);
      const s = pool[r[1]] || "";
      if (s) {
        allSubSet.add(s);
        const sys = pool[r[0]] || deriveSystemNo(s);
        if (sys) {
          if (!allSysMap.has(sys)) allSysMap.set(sys, new Set());
          allSysMap.get(sys).add(s);
        }
      }
    });

    const sortedSystems = Array.from(allSysMap.keys())
      .sort()
      .map((code) => ({
        code,
        subCount: allSysMap.get(code).size,
      }));

    const activeSys = (f.system || "ALL").trim().toUpperCase();
    const sortedSubs = Array.from(allSubSet)
      .filter((s) => {
        if (!activeSys || activeSys === "ALL") return true;
        const sys = (deriveSystemNo(s) || "").toUpperCase();
        return sys === activeSys || sys.includes(activeSys);
      })
      .sort();
    const subDescMap = state.data.subsystems || {};
    const sortedDiscs = Array.from(allDiscSet).sort();

    // Continuous Scroll (Start with first batch)
    state.limit.punchlist = Math.min(filtered.length, BATCH_SIZE);
    const pageRows = filtered.slice(0, state.limit.punchlist);

    container.innerHTML = `
      <!-- 1. KPI Cards Row (Dynamically Summarizes Filtered Data) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Punch -->
        <div onclick="setPlFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-slate-500">Total Punch</p>
              <h3 id="pl-kpi-total" class="text-2xl sm:text-3xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-clipboard-list"></i>
            </div>
          </div>
          <p id="pl-kpi-total-sub" class="text-xs text-slate-500 font-medium mt-2">${isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} items` : "Total Punchlist Registry"}</p>
        </div>

        <!-- Cat A -->
        <div onclick="setPlFilter('category','A')" class="cursor-pointer bg-white rounded-2xl p-4 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.category === "A" ? "ring-2 ring-rose-500 bg-rose-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-rose-700">Category A</p>
              <h3 id="pl-kpi-catA" class="text-2xl sm:text-3xl font-black text-rose-600 mt-1">${catA.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-skull-crossbones"></i>
            </div>
          </div>
          <p class="text-xs text-rose-700 font-semibold mt-2">Critical Punch (Pre-CC)</p>
        </div>

        <!-- Cat B -->
        <div onclick="setPlFilter('category','B')" class="cursor-pointer bg-white rounded-2xl p-4 border border-amber-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all ${
          f.category === "B" ? "ring-2 ring-amber-500 bg-amber-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-amber-700">Category B</p>
              <h3 id="pl-kpi-catB" class="text-2xl sm:text-3xl font-black text-amber-600 mt-1">${catB.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-triangle-exclamation"></i>
            </div>
          </div>
          <p class="text-xs text-amber-700 font-semibold mt-2">Prior to Handover (Pre-Ready)</p>
        </div>

        <!-- Cat C -->
        <div onclick="setPlFilter('category','C')" class="cursor-pointer bg-white rounded-2xl p-4 border border-blue-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all ${
          f.category === "C" ? "ring-2 ring-blue-500 bg-blue-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-blue-700">Category C</p>
              <h3 id="pl-kpi-catC" class="text-2xl sm:text-3xl font-black text-blue-600 mt-1">${catC.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-circle-info"></i>
            </div>
          </div>
          <p class="text-xs text-blue-700 font-semibold mt-2">Agreed Carryover Punch</p>
        </div>

        <!-- Open Items -->
        <div onclick="setPlFilter('status','Open')" class="cursor-pointer bg-white rounded-2xl p-4 border border-orange-200 shadow-sm hover:shadow-md hover:border-orange-400 transition-all ${
          f.status === "Open" ? "ring-2 ring-orange-500 bg-orange-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-orange-700">Status: Open</p>
              <h3 id="pl-kpi-open" class="text-2xl sm:text-3xl font-black text-orange-600 mt-1">${open.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-hourglass-start"></i>
            </div>
          </div>
          <p class="text-xs text-orange-700 font-semibold mt-2">Pending Punch Clearance</p>
        </div>

        <!-- Closed Items -->
        <div onclick="setPlFilter('status','Closed')" class="cursor-pointer bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Closed" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-emerald-700">Status: Closed</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="pl-kpi-closed" class="text-2xl sm:text-3xl font-black text-emerald-600">${closed.toLocaleString()}</h3>
                <span id="pl-kpi-pctClosed" class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${pctClosed}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-check-double"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div id="pl-kpi-closed-bar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: ${pctClosed}%"></div>
          </div>
        </div>
      </div>

      <!-- 1B. Discipline Summary Strip (Hidden if 1 Discipline selected) -->
      <div id="pl-disc-summary-wrap">
        ${buildPunchlistTabDisciplineSummary(filtered)}
      </div>

      <!-- 2. Interactive Filter & Search Bar -->
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-rose-600"></span>
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
              Punchlist Filters & Search
            </h3>
            <span id="pl-kpi-filter-badge" class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
              ${filtered.length.toLocaleString()} / ${totalAll.toLocaleString()} items
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="resetPlFilters()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1">
              <i class="fas fa-rotate-left text-[10px]"></i> Reset Filters
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <!-- Filter System (XXX-YY) -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-layer-group text-blue-600 mr-1"></i> System (XXX-YY):
            </label>
            <div class="relative">
              <input
                type="text"
                id="pl-system-search"
                list="pl-system-list"
                value="${esc(f.system === "ALL" ? "" : f.system)}"
                oninput="debouncePlFilter('system', this.value)"
                placeholder="Search System (e.g. CPPT-66)..."
                class="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <button
                id="pl-sys-clear-btn"
                type="button"
                onclick="document.getElementById('pl-system-search').value = ''; setPlFilter('system', 'ALL')"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 ${f.system && f.system !== 'ALL' ? '' : 'hidden'}"
                title="Clear System filter"
              >
                <i class="fas fa-times-circle"></i>
              </button>
              <datalist id="pl-system-list">
                ${sortedSystems.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} (${s.subCount} SubSystems)</option>`).join("")}
              </datalist>
            </div>
          </div>

          <!-- Filter SubSystemNo -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-sitemap text-indigo-600 mr-1"></i> SubSystem No:
            </label>
            <select
              id="pl-subsystem-select"
              onchange="setPlFilter('subSystem', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- All SubSystems (${sortedSubs.length}) --</option>
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
                oninput="debouncePlFilter('tag', this.value)"
                placeholder="Enter Tag No (e.g. CPB1-PJB...)"
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>

          <!-- Filter Discipline -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-wrench text-indigo-600 mr-1"></i> Discipline:
            </label>
            <select
              onchange="setPlFilter('discipline', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- All Disciplines --</option>
              ${sortedDiscs
                .map((d) => `<option value="${esc(d)}" ${f.discipline === d ? "selected" : ""}>${esc(d)}</option>`)
                .join("")}
            </select>
          </div>

          <!-- Keyword Search -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-magnifying-glass text-slate-600 mr-1"></i> Keyword Search (PL No, defect, tag...):
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.search)}"
                oninput="debouncePlFilter('search', this.value)"
                placeholder="Search defect description, PL No..."
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-font absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- Quick Filter Pills -->
        <div class="flex flex-wrap items-center gap-2 pt-1 border-t border-slate-100 text-xs">
          <span class="text-slate-400 text-[11px] font-medium">Quick Filters:</span>
          <button id="pl-btn-catAll" onclick="setPlFilter('category','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }"><span id="pl-btn-catAll-count">All Cats (${total.toLocaleString()})</span></button>
          <button id="pl-btn-catA" onclick="setPlFilter('category','A')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "A" ? "bg-rose-600 text-white shadow-sm ring-2 ring-rose-300" : "bg-rose-50 text-rose-700 hover:bg-rose-100"
          }"><span id="pl-btn-catA-count">Cat A (${catA.toLocaleString()})</span></button>
          <button id="pl-btn-catB" onclick="setPlFilter('category','B')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "B" ? "bg-amber-600 text-white shadow-sm ring-2 ring-amber-300" : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          }"><span id="pl-btn-catB-count">Cat B (${catB.toLocaleString()})</span></button>
          <button id="pl-btn-catC" onclick="setPlFilter('category','C')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.category === "C" ? "bg-blue-600 text-white shadow-sm ring-2 ring-blue-300" : "bg-blue-50 text-blue-700 hover:bg-blue-100"
          }"><span id="pl-btn-catC-count">Cat C (${catC.toLocaleString()})</span></button>
          <span class="text-slate-300">|</span>
          <button id="pl-btn-statusAll" onclick="setPlFilter('status','ALL')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "ALL" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          }"><span id="pl-btn-statusAll-count">All Status</span></button>
          <button id="pl-btn-open" onclick="setPlFilter('status','Open')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Open" ? "bg-orange-600 text-white shadow-sm ring-2 ring-orange-300" : "bg-orange-50 text-orange-700 hover:bg-orange-100"
          }"><span id="pl-btn-open-count">Open (${open.toLocaleString()})</span></button>
          <button id="pl-btn-closed" onclick="setPlFilter('status','Closed')" class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
            f.status === "Closed" ? "bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300" : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }"><span id="pl-btn-closed-count">Closed (${closed.toLocaleString()})</span></button>
        </div>
      </div>

      <!-- 3. High-Performance Paginated Data Table with Auto-fit Columns & Fixed Header -->
      <div id="punchlist-table-card" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Detailed Punchlist Registry
            </h4>
            <span id="pl-count-badge" class="text-xs text-slate-500 font-medium">
              (${pageRows.length >= filtered.length ? `Showing all ${filtered.length.toLocaleString()} items` : `Showing ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more`})
            </span>
            ${
              f.discipline !== "ALL" || f.category !== "ALL" || f.status !== "ALL"
                ? `<div class="inline-flex items-center gap-1.5 flex-wrap ml-1">
                    ${f.discipline !== "ALL" ? `<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">Discipline: ${esc(f.discipline)}</span>` : ""}
                    ${f.category !== "ALL" ? `<span class="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[11px] font-bold">Punch Cat ${esc(f.category)}</span>` : ""}
                    ${f.status !== "ALL" ? `<span class="px-2 py-0.5 rounded-full ${f.status === "Closed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"} text-[11px] font-bold">Status: ${esc(f.status)}</span>` : ""}
                    <button
                      type="button"
                      onclick="resetPunchlistSummaryFilter()"
                      class="px-2 py-0.5 rounded-full bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 text-[11px] font-bold transition-colors cursor-pointer"
                    ><i class="fas fa-rotate-left mr-1"></i>Reset Filter</button>
                  </div>`
                : ""
            }
          </div>

          <!-- Toolbar: Auto-fit, Reset & Load All (Continuous Scroll) -->
          <div class="flex items-center gap-2">
            <button
              onclick="toggleAutoFit('punchlist')"
              class="px-2.5 py-1 rounded-lg border text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm ${
                state.colMode.punchlist === 'auto'
                  ? 'border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-300'
                  : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'
              }"
              title="Toggle Auto-fit column widths to content"
            >
              <i class="fas fa-arrows-left-right text-[10px] text-blue-600"></i>
              <span class="hidden sm:inline">${state.colMode.punchlist === 'auto' ? 'Auto-fit: ON' : 'Auto-fit'}</span>
            </button>

            <button
              onclick="resetColWidths('punchlist')"
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Reset column widths to default auto-fit"
            >
              <i class="fas fa-arrows-left-right-to-line text-[10px] text-slate-500"></i>
              <span class="hidden sm:inline">Reset</span>
            </button>

            <button
              onclick="loadAllContinuous('punchlist')"
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Load all remaining items into the continuous list"
            >
              <i class="fas fa-list-check text-[10px] text-emerald-600"></i>
              <span class="hidden sm:inline">Load All</span>
            </button>
          </div>
        </div>

        <div id="punchlist-scroll-container" onscroll="handlePlContinuousScroll(this)" class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-230px)] min-h-[380px] bg-white">
          <table id="punchlist-table" class="min-w-full text-left sqcl-grid-table" style="${state.colMode.punchlist === 'auto' ? 'table-layout: auto; width: 100%;' : 'table-layout: fixed;'}">
            ${state.colMode.punchlist === 'custom' ? `
              <colgroup>
                ${state.colWidths.punchlist.map((w) => `<col style="width: ${w}px;">`).join("")}
              </colgroup>
            ` : `
              <colgroup>
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
                <col style="width: auto;">
              </colgroup>
            `}
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-3 text-center whitespace-nowrap relative"><div class="truncate">#</div><div class="col-resizer" data-col-index="0" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">PunchList No</div><div class="col-resizer" data-col-index="1" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">Raised No.</div><div class="col-resizer" data-col-index="2" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">SubSystem</div><div class="col-resizer" data-col-index="3" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">Tag No</div><div class="col-resizer" data-col-index="4" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">Tag Description</div><div class="col-resizer" data-col-index="5" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap relative"><div class="truncate">Cat</div><div class="col-resizer" data-col-index="6" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap relative"><div class="truncate">Status</div><div class="col-resizer" data-col-index="7" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">Discipline</div><div class="col-resizer" data-col-index="8" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-4 whitespace-nowrap relative"><div class="truncate">Defect Description</div><div class="col-resizer" data-col-index="9" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 whitespace-nowrap relative"><div class="truncate">Target Date</div><div class="col-resizer" data-col-index="10" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-4 whitespace-nowrap relative"><div class="truncate">Corrective Action</div><div class="col-resizer" data-col-index="11" title="Drag to resize column"></div></th>
              </tr>
            </thead>
            <tbody id="punchlist-tbody">
              ${renderPlTableRows(pageRows, 0)}
            </tbody>
          </table>
          <div id="pl-scroll-status" class="py-2.5 px-4 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
            ${pageRows.length >= filtered.length
              ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`
              : `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items. Scroll down to load more continuously...</span>`
            }
          </div>
        </div>
      </div>
    `;

    initColumnResizers("punchlist-table", "punchlist");
  }

  window.setPlFilter = function (key, val) {
    state.filters.punchlist[key] = val;
    state.filters.punchlist.page = 1;
    if (key === "system" && val !== "ALL") {
      const currentSub = state.filters.punchlist.subSystem;
      if (currentSub !== "ALL") {
        const sys = (deriveSystemNo(currentSub) || "").toUpperCase();
        const vUpper = val.trim().toUpperCase();
        if (sys !== vUpper && !sys.includes(vUpper)) {
          state.filters.punchlist.subSystem = "ALL";
        }
      }
    }
    if (state.activeTab !== "punchlist") state.activeTab = "punchlist";
    renderTabBar();
    renderTabContent();
  };

  window.setPlPage = function (p) {
    state.filters.punchlist.page = p;
    renderPlTableOnly();
  };

  window.resetPlFilters = function () {
    state.filters.punchlist = {
      search: "",
      system: "ALL",
      subSystem: "ALL",
      tag: "",
      category: "ALL",
      status: "ALL",
      discipline: "ALL",
      page: 1,
      pageSize: 50,
    };
    renderTabBar();
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
        <div><strong>Raised No:</strong> <span class="font-mono font-bold text-slate-800">${esc(resolvePl(r, 3)) || "-"}</span></div>
        <div><strong>Tag No:</strong> <span class="font-mono font-bold text-emerald-700">${esc(r[5])}</span></div>
        <div><strong>Discipline:</strong> <span class="font-semibold">${esc(resolvePl(r, 15))}</span></div>
        <div class="sm:col-span-2"><strong>Tag Description:</strong> ${esc(resolvePl(r, 6))}</div>
        <div class="sm:col-span-2"><strong>Package:</strong> ${esc(resolvePl(r, 4))}</div>
        <div><strong>Open Date:</strong> ${esc(resolvePl(r, 10)) || "-"}</div>
        <div><strong>Closed Date:</strong> ${esc(resolvePl(r, 11)) || "-"}</div>
        <div><strong>Target Date:</strong> ${esc(resolvePl(r, 21)) || "-"}</div>
        <div><strong>Action By:</strong> <span class="font-bold text-slate-900">${esc(resolvePl(r, 12)) || "-"}</span></div>
        <div><strong>MRIR No:</strong> ${esc(resolvePl(r, 13)) || "-"}</div>
        <div><strong>Drawing No:</strong> ${esc(resolvePl(r, 7)) || "-"}</div>
      </div>

      <div class="space-y-2">
        <label class="block font-bold text-slate-900 text-xs">
          <i class="fas fa-triangle-exclamation text-rose-600 mr-1"></i> Defect Description:
        </label>
        <div class="p-3 bg-rose-50/60 rounded-xl border border-rose-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans font-medium">
          ${esc(resolvePl(r, 16))}
        </div>
      </div>

      <div class="space-y-2">
        <label class="block font-bold text-slate-900 text-xs">
          <i class="fas fa-check-circle text-emerald-600 mr-1"></i> Corrective Action:
        </label>
        <div class="p-3 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-sans font-medium">
          ${esc(resolvePl(r, 17)) || "No corrective action specified"}
        </div>
      </div>
    `;

    f.innerHTML = `
      <div class="text-[11px] text-slate-500">
        Raise By: <strong>${esc(resolvePl(r, 18))}</strong> (${esc(resolvePl(r, 19)) || "-"})
      </div>
      <button onclick="closeItemDetailModal()" class="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs">
        Close
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
    const sysQ = (f.system || "ALL").trim().toUpperCase();
    const subQ = f.subSystem;
    const statusQ = f.status;
    const discQ = f.discipline;
    const typeQ = f.checkType;
    const itrG = f.itrGroup || "ALL";

    return rows.filter((r) => {
      // 0: no, 1: sub, 2: tag_no, 3: tag_desc, 4: disc, 5: cs_type, 6: comp_date, 8: norm
      if (sysQ !== "ALL" && sysQ !== "") {
        const subNo = pool[r[1]] || "";
        const rowSys = (deriveSystemNo(subNo) || "").toUpperCase();
        if (rowSys !== sysQ && !rowSys.includes(sysQ)) return false;
      }
      if (subQ !== "ALL" && (pool[r[1]] || "") !== subQ) return false;
      if (discQ !== "ALL" && (pool[r[4]] || "") !== discQ) return false;
      if (typeQ !== "ALL" && (pool[r[5]] || "") !== typeQ) return false;

      const csType = (pool[r[5]] || "").trim().toUpperCase();
      if (itrG === "ITR-A" && !csType.endsWith("A")) return false;
      if (itrG === "ITR-B" && !csType.endsWith("B")) return false;

      const compDateStr = pool[r[6]] || "";
      const isCompleted = Boolean(compDateStr);
      if (statusQ === "Completed" && !isCompleted) return false;
      if (statusQ === "Remaining" && isCompleted) return false;

      if (tagQ && !(r[2] || "").toLowerCase().includes(tagQ)) return false;

      if (q) {
        const text = `${r[2]} ${pool[r[3]] || ""} ${pool[r[1]] || ""} ${pool[r[5]] || ""} ${pool[r[11]] || ""}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }

  let debounceCsTimer = null;
  window.debounceCsFilter = function (key, val) {
    state.filters.checksheet[key] = val;
    state.filters.checksheet.page = 1;
    if (key === "system") {
      const clearBtn = document.getElementById("cs-sys-clear-btn");
      if (clearBtn) {
        if (val && val.trim() !== "" && val.trim().toUpperCase() !== "ALL") {
          clearBtn.classList.remove("hidden");
        } else {
          clearBtn.classList.add("hidden");
        }
      }
    }
    clearTimeout(debounceCsTimer);
    debounceCsTimer = setTimeout(() => {
      renderCsTableOnly();
    }, 220);
  };

  function renderCsTableRows(pageRows, startIdx) {
    if (pageRows.length === 0) {
      return `<tr><td colspan="12" class="py-12 text-center text-slate-400 text-xs">No matching checksheet records found.</td></tr>`;
    }
    return pageRows
      .map((r, idx) => {
        const no = r[0] || (startIdx + idx + 1);
        const subNo = resolveCs(r, 1);
        const tagNo = r[2];
        const tagDesc = resolveCs(r, 3);
        const disc = resolveCs(r, 4);
        const csType = resolveCs(r, 5);
        const compDate = resolveCs(r, 6);
        const planFinish = resolveCs(r, 7);
        const norm = r[8];
        const phase = resolveCs(r, 9) || "-";
        const contractor = resolveCs(r, 11);
        const isComp = Boolean(compDate);

        const statusBadge = isComp
          ? "bg-emerald-100 text-emerald-800 border-emerald-300"
          : "bg-slate-100 text-slate-700 border-slate-300";

        return `
          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs sm:text-sm transition-colors h-11">
            <td class="py-2.5 px-2.5 text-center text-slate-400 font-mono font-semibold whitespace-nowrap overflow-hidden">${esc(no)}</td>
            <td class="py-2.5 px-2.5 font-bold text-slate-800 font-mono whitespace-nowrap overflow-hidden truncate">
              <button onclick="setCsFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600 truncate" title="${esc(subNo)}">
                ${esc(subNo)}
              </button>
            </td>
            <td class="py-2.5 px-2.5 font-mono font-black text-slate-900 whitespace-nowrap overflow-hidden truncate">
              <button onclick="setCsFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600 truncate" title="${esc(tagNo)}">
                ${esc(tagNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 text-slate-700 whitespace-nowrap overflow-hidden truncate font-medium" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
            <td class="py-2.5 px-2.5 text-slate-700 font-semibold whitespace-nowrap overflow-hidden truncate" title="${esc(disc)}">${esc(disc)}</td>
            <td class="py-2.5 px-2.5 font-mono font-black text-indigo-700 whitespace-nowrap overflow-hidden truncate" title="${esc(csType)}">${esc(csType)}</td>
            <td class="py-2.5 px-2 text-center whitespace-nowrap overflow-hidden">
              <span class="px-2.5 py-0.5 rounded-full font-black text-xs border ${statusBadge}">
                ${isComp ? "Completed" : "Remaining"}
              </span>
            </td>
            <td class="py-2.5 px-2.5 font-mono text-xs sm:text-sm whitespace-nowrap overflow-hidden truncate ${isComp ? "text-emerald-700 font-bold" : "text-slate-400"}">
              ${esc(compDate) || "-"}
            </td>
            <td class="py-2.5 px-2.5 font-mono text-xs sm:text-sm text-slate-500 whitespace-nowrap overflow-hidden truncate">${esc(planFinish) || "-"}</td>
            <td class="py-2.5 px-2 text-center font-black text-slate-800 font-mono whitespace-nowrap overflow-hidden">${esc(norm)}</td>
            <td class="py-2.5 px-2.5 text-slate-600 whitespace-nowrap overflow-hidden truncate" title="${esc(contractor)}">${esc(contractor)}</td>
            <td class="py-2.5 px-2.5 text-slate-700 whitespace-nowrap overflow-hidden truncate font-medium" title="${esc(phase)}">
              <button
                onclick="viewChecksheetDetail('${esc(tagNo)}', '${esc(csType)}')"
                class="hover:text-blue-600 hover:underline text-left truncate w-full"
                title="${esc(phase)}"
              >
                ${esc(phase)}
              </button>
            </td>
          </tr>
        `;
      })
      .join("");
  }

  function updateCsKpiCards(filtered, totalAll) {
    const pool = state.data.checksheet.pool;
    let completed = 0, remaining = 0;
    let totalNorm = 0, compNorm = 0;
    let totalA = 0, compA = 0, totalB = 0, compB = 0;
    const filteredSubSet = new Set();

    filtered.forEach((r) => {
      const isComp = Boolean(pool[r[6]]);
      const norm = Number(r[8] || 0);
      totalNorm += norm;
      if (isComp) {
        completed++;
        compNorm += norm;
      } else {
        remaining++;
      }

      const s = pool[r[1]] || "";
      if (s) filteredSubSet.add(s);

      const t = pool[r[5]] || "";
      if (t) {
        if (t.endsWith("A")) {
          totalA++;
          if (isComp) compA++;
        } else if (t.endsWith("B")) {
          totalB++;
          if (isComp) compB++;
        }
      }
    });

    const total = filtered.length;
    const pctDone = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
    const pctNorm = totalNorm > 0 ? ((compNorm / totalNorm) * 100).toFixed(1) : "0.0";
    const isFiltered = total !== totalAll;

    const setEl = (id, text) => {
      const el = document.getElementById(id);
      if (el) el.textContent = text;
    };

    setEl("cs-kpi-total", total.toLocaleString());
    setEl("cs-kpi-total-sub", isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} records` : "Total Quality Inspection Records (ITR)");
    setEl("cs-kpi-completed", completed.toLocaleString());
    setEl("cs-kpi-pctDone", `${pctDone}%`);
    const doneBar = document.getElementById("cs-kpi-done-bar");
    if (doneBar) doneBar.style.width = `${pctDone}%`;

    setEl("cs-kpi-remaining", remaining.toLocaleString());
    setEl("cs-kpi-norm", totalNorm.toLocaleString());
    setEl("cs-kpi-earned", compNorm.toLocaleString());
    setEl("cs-kpi-pctNorm", `${pctNorm}%`);
    const normBar = document.getElementById("cs-kpi-norm-bar");
    if (normBar) normBar.style.width = `${pctNorm}%`;

    setEl("cs-kpi-subs", filteredSubSet.size.toLocaleString());

    setEl("cs-btn-total-count", `All (${total.toLocaleString()})`);
    setEl("cs-btn-itrA-count", `ITR-A (${totalA.toLocaleString()})`);
    setEl("cs-btn-itrB-count", `ITR-B (${totalB.toLocaleString()})`);
    setEl("cs-btn-comp-count", `Completed (${completed.toLocaleString()})`);
    setEl("cs-btn-rem-count", `Remaining (${remaining.toLocaleString()})`);
  }

  function renderCsTableOnly() {
    const tbody = document.getElementById("checksheet-tbody");
    if (!tbody) {
      renderTabContent();
      return;
    }
    const filtered = getFilteredChecksheets();
    const totalAll = state.data.checksheet.rows.length;

    state.limit.checksheet = Math.min(filtered.length, BATCH_SIZE);
    const visibleRows = filtered.slice(0, state.limit.checksheet);

    tbody.innerHTML = renderCsTableRows(visibleRows, 0);

    const scrollContainer = document.getElementById("checksheet-scroll-container");
    if (scrollContainer) scrollContainer.scrollTop = 0;

    const kpiBadge = document.getElementById("cs-kpi-filter-badge");
    if (kpiBadge) {
      kpiBadge.textContent = `${filtered.length.toLocaleString()} / ${totalAll.toLocaleString()} items`;
    }

    updateContinuousScrollStatus("checksheet", state.limit.checksheet, filtered.length);
    updateCsKpiCards(filtered, totalAll);
    updateCsSubSelectOptions();
    const csDiscWrap = document.getElementById("cs-disc-summary-wrap");
    if (csDiscWrap) csDiscWrap.innerHTML = buildChecksheetTabDisciplineSummary(filtered);
    renderTabBar();
  }

  function updateCsSubSelectOptions() {
    const sel = document.getElementById("cs-subsystem-select");
    if (!sel) return;
    const activeSys = (state.filters.checksheet.system || "ALL").trim().toUpperCase();
    const allRows = state.data.checksheet.rows;
    const pool = state.data.checksheet.pool;
    const allSubSet = new Set();
    allRows.forEach((r) => {
      const s = pool[r[1]] || "";
      if (s) allSubSet.add(s);
    });
    const sortedSubs = Array.from(allSubSet)
      .filter((s) => {
        if (!activeSys || activeSys === "ALL") return true;
        const sys = (deriveSystemNo(s) || "").toUpperCase();
        return sys === activeSys || sys.includes(activeSys);
      })
      .sort();
    const subDescMap = state.data.subsystems || {};
    const curVal = state.filters.checksheet.subSystem;
    sel.innerHTML = `
      <option value="ALL">-- All SubSystems (${sortedSubs.length}) --</option>
      ${sortedSubs
        .map((s) => {
          const desc = subDescMap[s] ? ` - ${subDescMap[s]}` : "";
          return `<option value="${esc(s)}" ${curVal === s ? "selected" : ""}>${esc(s)}${esc(desc)}</option>`;
        })
        .join("")}
    `;
  }

  function renderChecksheetTab(container) {
    const allRows = state.data.checksheet.rows;
    const pool = state.data.checksheet.pool;
    const filtered = getFilteredChecksheets();
    const f = state.filters.checksheet;

    // Compute KPIs FROM FILTERED DATA
    const totalAll = allRows.length;
    const total = filtered.length;
    const isFiltered = total !== totalAll;

    let completed = 0, remaining = 0;
    let totalNorm = 0, compNorm = 0;
    let totalA = 0, compA = 0, totalB = 0, compB = 0;
    const filteredSubSet = new Set();

    filtered.forEach((r) => {
      const isComp = Boolean(pool[r[6]]);
      const norm = Number(r[8] || 0);
      totalNorm += norm;
      if (isComp) {
        completed++;
        compNorm += norm;
      } else {
        remaining++;
      }

      const s = pool[r[1]] || "";
      if (s) filteredSubSet.add(s);

      const t = pool[r[5]] || "";
      if (t) {
        if (t.endsWith("A")) {
          totalA++;
          if (isComp) compA++;
        } else if (t.endsWith("B")) {
          totalB++;
          if (isComp) compB++;
        }
      }
    });

    const pctDone = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
    const pctNorm = totalNorm > 0 ? ((compNorm / totalNorm) * 100).toFixed(1) : "0.0";

    // All available subsystems, systems, and disciplines for dropdown options
    const allSubSet = new Set();
    const allDiscSet = new Set();
    const allTypeSet = new Set();
    const allSysMap = new Map();
    allRows.forEach((r) => {
      const d = pool[r[4]] || "";
      if (d) allDiscSet.add(d);
      const s = pool[r[1]] || "";
      if (s) {
        allSubSet.add(s);
        const sys = deriveSystemNo(s);
        if (sys) {
          if (!allSysMap.has(sys)) allSysMap.set(sys, new Set());
          allSysMap.get(sys).add(s);
        }
      }
      const t = pool[r[5]] || "";
      if (t) allTypeSet.add(t);
    });

    const sortedSystems = Array.from(allSysMap.keys())
      .sort()
      .map((code) => ({
        code,
        subCount: allSysMap.get(code).size,
      }));

    const activeSys = (f.system || "ALL").trim().toUpperCase();
    const sortedSubs = Array.from(allSubSet)
      .filter((s) => {
        if (!activeSys || activeSys === "ALL") return true;
        const sys = (deriveSystemNo(s) || "").toUpperCase();
        return sys === activeSys || sys.includes(activeSys);
      })
      .sort();
    const subDescMap = state.data.subsystems || {};
    const sortedDiscs = Array.from(allDiscSet).sort();

    // Continuous Scroll (Start with first batch)
    state.limit.checksheet = Math.min(filtered.length, BATCH_SIZE);
    const pageRows = filtered.slice(0, state.limit.checksheet);

    container.innerHTML = `
      <!-- 1. KPI Cards Row (Dynamically Summarizes Filtered Data) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Checksheets -->
        <div onclick="setCsFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-4 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-slate-500">Total Checksheet</p>
              <h3 id="cs-kpi-total" class="text-2xl sm:text-3xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-list-check"></i>
            </div>
          </div>
          <p id="cs-kpi-total-sub" class="text-xs text-slate-500 font-medium mt-2">${isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} records` : "Total Quality Inspection Records (ITR)"}</p>
        </div>

        <!-- Completed Checksheets -->
        <div onclick="setCsFilter('status','Completed')" class="cursor-pointer bg-white rounded-2xl p-4 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Completed" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-emerald-700">Completed (Signed-off)</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="cs-kpi-completed" class="text-2xl sm:text-3xl font-black text-emerald-600">${completed.toLocaleString()}</h3>
                <span id="cs-kpi-pctDone" class="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${pctDone}%</span>
              </div>
            </div>
            <div class="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-check-double"></i>
            </div>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div id="cs-kpi-done-bar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: ${pctDone}%"></div>
          </div>
        </div>

        <!-- Remaining Checksheets -->
        <div onclick="setCsFilter('status','Remaining')" class="cursor-pointer bg-white rounded-2xl p-4 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.status === "Remaining" ? "ring-2 ring-rose-500 bg-rose-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-rose-700">Remaining (Pending)</p>
              <h3 id="cs-kpi-remaining" class="text-2xl sm:text-3xl font-black text-rose-600 mt-1">${remaining.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-clock"></i>
            </div>
          </div>
          <p class="text-xs text-rose-700 font-semibold mt-2">Pending Sign-off & Completion</p>
        </div>

        <!-- Total Norm Manhours -->
        <div class="bg-white rounded-2xl p-4 border border-indigo-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-indigo-700">Total Manhours</p>
              <h3 id="cs-kpi-norm" class="text-2xl sm:text-3xl font-black text-indigo-600 mt-1">${totalNorm.toLocaleString()}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-user-gear"></i>
            </div>
          </div>
          <p class="text-xs text-indigo-700 font-semibold mt-2">Total Planned Manhours (Norm)</p>
        </div>

        <!-- Completed Norm Manhours -->
        <div class="bg-white rounded-2xl p-4 border border-teal-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-teal-700">Earned Manhours</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="cs-kpi-earned" class="text-2xl sm:text-3xl font-black text-teal-600">${compNorm.toLocaleString()}</h3>
                <span id="cs-kpi-pctNorm" class="text-xs font-black px-2 py-0.5 rounded-full bg-teal-100 text-teal-800">${pctNorm}%</span>
              </div>
            </div>
            <div class="w-9 h-9 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-chart-pie"></i>
            </div>
          </div>
          <div class="mt-2.5 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
            <div id="cs-kpi-norm-bar" class="bg-teal-500 h-full rounded-full transition-all duration-300" style="width: ${pctNorm}%"></div>
          </div>
        </div>

        <!-- Subsystems Count -->
        <div class="bg-white rounded-2xl p-4 border border-purple-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-xs font-black uppercase tracking-wider text-purple-700">SubSystems</p>
              <h3 id="cs-kpi-subs" class="text-2xl sm:text-3xl font-black text-purple-600 mt-1">${isFiltered ? filteredSubSet.size : sortedSubs.length}</h3>
            </div>
            <div class="w-9 h-9 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-sm">
              <i class="fas fa-network-wired"></i>
            </div>
          </div>
          <p class="text-xs text-purple-700 font-semibold mt-2">${isFiltered ? `${filteredSubSet.size} of ${sortedSubs.length} Active SubSystems` : "CPP Commissioning SubSystems"}</p>
        </div>
      </div>

      <!-- 1B. Discipline Summary Strip (Hidden if 1 Discipline selected) -->
      <div id="cs-disc-summary-wrap">
        ${buildChecksheetTabDisciplineSummary(filtered)}
      </div>

      <!-- 2. Interactive Filter Bar -->
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm space-y-3">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <span class="w-2.5 h-2.5 rounded-full bg-blue-600"></span>
            <h3 class="text-xs sm:text-sm font-black text-slate-800 uppercase tracking-wide">
              Checksheet Filters & Search
            </h3>
            <span id="cs-kpi-filter-badge" class="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-bold text-xs">
              ${filtered.length.toLocaleString()} / ${totalAll.toLocaleString()} items
            </span>
          </div>

          <div class="flex items-center gap-2">
            <button onclick="resetCsFilters()" class="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 text-xs font-bold transition-all flex items-center gap-1">
              <i class="fas fa-rotate-left text-[10px]"></i> Reset Filters
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <!-- Filter System (XXX-YY) -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-layer-group text-blue-600 mr-1"></i> System (XXX-YY):
            </label>
            <div class="relative">
              <input
                type="text"
                id="cs-system-search"
                list="cs-system-list"
                value="${esc(f.system === "ALL" ? "" : f.system)}"
                oninput="debounceCsFilter('system', this.value)"
                placeholder="Search System (e.g. CPPT-66)..."
                class="w-full pl-8 pr-7 py-2 rounded-xl border border-slate-300 text-xs font-mono font-bold focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
              <button
                id="cs-sys-clear-btn"
                type="button"
                onclick="document.getElementById('cs-system-search').value = ''; setCsFilter('system', 'ALL')"
                class="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 ${f.system && f.system !== 'ALL' ? '' : 'hidden'}"
                title="Clear System filter"
              >
                <i class="fas fa-times-circle"></i>
              </button>
              <datalist id="cs-system-list">
                ${sortedSystems.map((s) => `<option value="${esc(s.code)}">${esc(s.code)} (${s.subCount} SubSystems)</option>`).join("")}
              </datalist>
            </div>
          </div>

          <!-- Filter SubSystemNo -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-sitemap text-indigo-600 mr-1"></i> SubSystem No:
            </label>
            <select
              id="cs-subsystem-select"
              onchange="setCsFilter('subSystem', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- All SubSystems (${sortedSubs.length}) --</option>
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
                oninput="debounceCsFilter('tag', this.value)"
                placeholder="Enter Tag No (e.g. CPPT-EBC...)"
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500 font-mono"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>

          <!-- Filter Discipline -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-wrench text-indigo-600 mr-1"></i> Discipline:
            </label>
            <select
              onchange="setCsFilter('discipline', this.value)"
              class="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- All Disciplines --</option>
              ${sortedDiscs
                .map((d) => `<option value="${esc(d)}" ${f.discipline === d ? "selected" : ""}>${esc(d)}</option>`)
                .join("")}
            </select>
          </div>

          <!-- Keyword Search -->
          <div>
            <label class="block text-[11px] font-bold text-slate-700 mb-1">
              <i class="fas fa-magnifying-glass text-slate-600 mr-1"></i> Keyword Search (Form Type, Description...):
            </label>
            <div class="relative">
              <input
                type="text"
                value="${esc(f.search)}"
                oninput="debounceCsFilter('search', this.value)"
                placeholder="Search form type, equipment description..."
                class="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 text-xs focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-font absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- Quick Filter Pills -->
        <div class="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100 text-xs">
          <!-- ITR Group (ITR-A / ITR-B) -->
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="text-slate-500 text-[11px] font-bold">ITR Group:</span>
            <button
              id="cs-btn-total"
              onclick="setCsFilter('itrGroup','ALL')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.itrGroup === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              <span id="cs-btn-total-count">All (${total.toLocaleString()})</span>
            </button>
            <button
              id="cs-btn-itrA"
              onclick="setCsFilter('itrGroup','ITR-A')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.itrGroup === 'ITR-A'
                  ? 'bg-blue-600 text-white shadow-sm ring-2 ring-blue-300'
                  : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
              }"
              title="Filter checksheets ending with A (Construction / Pre-comm)"
            >
              <i class="fas fa-hammer mr-1 text-[10px]"></i> <span id="cs-btn-itrA-count">ITR-A (${totalA.toLocaleString()})</span>
            </button>
            <button
              id="cs-btn-itrB"
              onclick="setCsFilter('itrGroup','ITR-B')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.itrGroup === 'ITR-B'
                  ? 'bg-indigo-600 text-white shadow-sm ring-2 ring-indigo-300'
                  : 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100'
              }"
              title="Filter checksheets ending with B (Commissioning)"
            >
              <i class="fas fa-vial-circle-check mr-1 text-[10px]"></i> <span id="cs-btn-itrB-count">ITR-B (${totalB.toLocaleString()})</span>
            </button>
          </div>

          <!-- Completion Status -->
          <div class="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <span class="text-slate-500 text-[11px] font-bold">Status:</span>
            <button
              id="cs-btn-statusAll"
              onclick="setCsFilter('status','ALL')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.status === 'ALL'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }"
            >
              All
            </button>
            <button
              id="cs-btn-comp"
              onclick="setCsFilter('status','Completed')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.status === 'Completed'
                  ? 'bg-emerald-600 text-white shadow-sm ring-2 ring-emerald-300'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
              }"
            >
              <i class="fas fa-check-double mr-1 text-[10px]"></i> <span id="cs-btn-comp-count">Completed (${completed.toLocaleString()})</span>
            </button>
            <button
              id="cs-btn-rem"
              onclick="setCsFilter('status','Remaining')"
              class="px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                f.status === 'Remaining'
                  ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-300'
                  : 'bg-rose-50 text-rose-700 hover:bg-rose-100'
              }"
            >
              <i class="fas fa-clock mr-1 text-[10px]"></i> <span id="cs-btn-rem-count">Remaining (${remaining.toLocaleString()})</span>
            </button>
          </div>
        </div>
      </div>

      <!-- 3. Paginated Data Table with Resizable Columns & Fixed Header -->
      <div id="checksheet-table-card" class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2 flex-wrap">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Detailed Checksheet Registry
            </h4>
            <span id="cs-count-badge" class="text-xs text-slate-500 font-medium">
              (${pageRows.length >= filtered.length ? `Showing all ${filtered.length.toLocaleString()} items` : `Showing ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more`})
            </span>
            ${
              f.discipline !== "ALL" || f.itrGroup !== "ALL" || f.status !== "ALL"
                ? `<div class="inline-flex items-center gap-1.5 flex-wrap ml-1">
                    ${f.discipline !== "ALL" ? `<span class="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 text-[11px] font-bold">Discipline: ${esc(f.discipline)}</span>` : ""}
                    ${f.itrGroup !== "ALL" ? `<span class="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[11px] font-bold">Gate: ${esc(f.itrGroup)}</span>` : ""}
                    ${f.status !== "ALL" ? `<span class="px-2 py-0.5 rounded-full ${f.status === "Completed" ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"} text-[11px] font-bold">Status: ${esc(f.status)}</span>` : ""}
                    <button
                      type="button"
                      onclick="resetChecksheetSummaryFilter()"
                      class="px-2 py-0.5 rounded-full bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-200 text-[11px] font-bold transition-colors cursor-pointer"
                    ><i class="fas fa-rotate-left mr-1"></i>Reset Filter</button>
                  </div>`
                : ""
            }
          </div>

          <!-- Toolbar: Reset Columns & Load All (Continuous Scroll) -->
          <div class="flex items-center gap-2">
            <button
              onclick="resetColWidths('checksheet')"
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Reset column widths to default"
            >
              <i class="fas fa-arrows-left-right-to-line text-[10px] text-blue-600"></i>
              <span class="hidden sm:inline">Reset Columns</span>
            </button>

            <button
              onclick="loadAllContinuous('checksheet')"
              class="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
              title="Load all remaining items into the continuous list"
            >
              <i class="fas fa-list-check text-[10px] text-emerald-600"></i>
              <span class="hidden sm:inline">Load All</span>
            </button>
          </div>
        </div>

        <div id="checksheet-scroll-container" onscroll="handleCsContinuousScroll(this)" class="overflow-x-auto overflow-y-auto max-h-[calc(100vh-230px)] min-h-[380px] bg-white">
          <table id="checksheet-table" class="w-full text-left sqcl-grid-table" style="table-layout: fixed;">
            <colgroup>
              ${state.colWidths.checksheet.map((w) => `<col style="width: ${w}px;">`).join("")}
            </colgroup>
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-2 text-center relative"><div class="truncate">No</div><div class="col-resizer" data-col-index="0" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">SubSystem</div><div class="col-resizer" data-col-index="1" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">Tag No</div><div class="col-resizer" data-col-index="2" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-3 relative"><div class="truncate">Tag Description</div><div class="col-resizer" data-col-index="3" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">Discipline</div><div class="col-resizer" data-col-index="4" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">CheckSheet Type</div><div class="col-resizer" data-col-index="5" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 text-center relative"><div class="truncate">Status</div><div class="col-resizer" data-col-index="6" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">Complete Date</div><div class="col-resizer" data-col-index="7" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">Plan Finish</div><div class="col-resizer" data-col-index="8" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 text-center relative"><div class="truncate">Norm</div><div class="col-resizer" data-col-index="9" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 relative"><div class="truncate">SubContractor</div><div class="col-resizer" data-col-index="10" title="Drag to resize column"></div></th>
                <th class="py-2.5 px-2 text-center relative"><div class="truncate">Phase</div><div class="col-resizer" data-col-index="11" title="Drag to resize column"></div></th>
              </tr>
            </thead>
            <tbody id="checksheet-tbody">
              ${renderCsTableRows(pageRows, 0)}
            </tbody>
          </table>
          <div id="cs-scroll-status" class="py-2.5 px-4 text-center text-xs text-slate-500 bg-slate-50 border-t border-slate-200">
            ${pageRows.length >= filtered.length
              ? `<span class="text-slate-400 font-medium"><i class="fas fa-check-circle text-emerald-500 mr-1.5"></i>All ${filtered.length.toLocaleString()} items loaded</span>`
              : `<span class="text-blue-600 font-medium animate-pulse"><i class="fas fa-arrow-down mr-1.5"></i>Loaded ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items. Scroll down to load more continuously...</span>`
            }
          </div>
        </div>
      </div>
    `;

    initColumnResizers("checksheet-table", "checksheet");
  }

  window.setCsFilter = function (key, val) {
    state.filters.checksheet[key] = val;
    state.filters.checksheet.page = 1;
    if (key === "system" && val !== "ALL") {
      const currentSub = state.filters.checksheet.subSystem;
      if (currentSub !== "ALL") {
        const sys = (deriveSystemNo(currentSub) || "").toUpperCase();
        const vUpper = val.trim().toUpperCase();
        if (sys !== vUpper && !sys.includes(vUpper)) {
          state.filters.checksheet.subSystem = "ALL";
        }
      }
    }
    if (state.activeTab !== "checksheet") state.activeTab = "checksheet";
    renderTabBar();
    renderTabContent();
  };

  window.setCsPage = function (p) {
    state.filters.checksheet.page = p;
    renderCsTableOnly();
  };

  window.resetCsFilters = function () {
    state.filters.checksheet = {
      search: "",
      system: "ALL",
      subSystem: "ALL",
      tag: "",
      status: "ALL",
      itrGroup: "ALL",
      discipline: "ALL",
      checkType: "ALL",
      page: 1,
      pageSize: 50,
    };
    renderTabBar();
    renderTabContent();
  };

  window.viewChecksheetDetail = function (tagNo, csType) {
    const r = state.data.checksheet.rows.find((x) => x[2] === tagNo && resolveCs(x, 5) === csType);
    if (!r) return;

    const modal = document.getElementById("item-detail-modal");
    const h = document.getElementById("item-detail-header");
    const b = document.getElementById("item-detail-body");
    const f = document.getElementById("item-detail-footer");

    const compDate = resolveCs(r, 6);
    const planFinish = resolveCs(r, 7);
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
        <div><strong>Complete Date:</strong> <span class="font-bold text-emerald-700">${esc(compDate) || "Pending"}</span></div>
        <div><strong>Plan Finish:</strong> ${esc(planFinish) || "-"}</div>
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
        Close
      </button>
    `;

    modal.classList.remove("hidden");
  };

  window.closeItemDetailModal = function () {
    const modal = document.getElementById("item-detail-modal");
    if (modal) modal.classList.add("hidden");
  };

  function mapPunchRowsForExport(rows) {
    return rows.map((r) => ({
      "System No": resolvePl(r, 0),
      "SubSystem No": resolvePl(r, 1),
      "PunchList No": r[2],
      "Raised No": resolvePl(r, 3),
      "Tag No": r[5],
      "Tag Description": resolvePl(r, 6),
      "Category": r[8],
      "Status": resolvePl(r, 9),
      "Open Date": resolvePl(r, 10),
      "Closed Date": resolvePl(r, 11),
      "Discipline": resolvePl(r, 15),
      "Defect Description": resolvePl(r, 16),
      "Corrective Action": resolvePl(r, 17),
      "Target Date": resolvePl(r, 21),
      "Action By": resolvePl(r, 12),
      "MRIR No": resolvePl(r, 13),
    }));
  }

  function mapCsRowsForExport(rows) {
    return rows.map((r) => ({
      "No": r[0],
      "SubSystem No": resolveCs(r, 1),
      "SubSystem Description": state.data.subsystems[resolveCs(r, 1)] || "",
      "Tag No": r[2],
      "Tag Description": resolveCs(r, 3),
      "Discipline": resolveCs(r, 4),
      "CheckSheet Type": resolveCs(r, 5),
      "Status": resolveCs(r, 6) ? "Completed" : "Remaining",
      "Complete Date": resolveCs(r, 6),
      "Plan Finish": resolveCs(r, 7),
      "Norm (Mhrs)": r[8],
      "Phase": resolveCs(r, 9),
      "Location": resolveCs(r, 10),
      "SubContractor": resolveCs(r, 11),
    }));
  }

  // =========================================================================
  // PROFESSIONAL REPORT EXPORT ENGINE (EXCEL & PDF)
  // Vietnam Block B Gas Development Project • EPC#1 CPP TOPSIDE
  // Styled Corporate Output in English (ExcelJS & jsPDF-autoTable)
  // =========================================================================

  function getReportTimestamp() {
    const now = new Date();
    const dateFormatted = now.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
    const timeFormatted = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    const isoDate = now.toISOString().slice(0, 10);
    return {
      dateFormatted,
      timeFormatted,
      fullStr: `${dateFormatted} ${timeFormatted}`,
      isoDate,
    };
  }

  const EXCEL_THEME = {
    headerBg: "FF0F172A",       // Dark Corporate Navy (Slate 900)
    subtitleBg: "FF1E3A8A",     // Deep Blue 900
    metaBg: "FFF1F5F9",         // Light Slate 100
    metaText: "FF334155",       // Slate 700
    tableHeaderBg: "FF1E293B",  // Slate 800
    tableHeaderBorder: "FF475569", // Slate 600
    zebraBg: "FFF8FAFC",        // Subtle Alternating Slate 50
    borderColor: "FFE2E8F0",    // Slate 200
    summaryTotalBg: "FFF1F5F9", // Slate 100 for totals
    // Status badges
    completedBg: "FFDCFCE7",    // Emerald 100
    completedText: "FF15803D",  // Emerald 700
    remainingBg: "FFFEE2E2",    // Rose 100
    remainingText: "FFB91C1C",  // Rose 700
    // Punch categories
    catABg: "FFFEF2F2",
    catAText: "FFDC2626",
    catBBg: "FFFFFBEB",
    catBText: "FFD97706",
    catCBg: "FFEFF6FF",
    catCText: "FF2563EB",
  };

  function getExcelColLetter(idx) {
    let s = "";
    while (idx > 0) {
      const m = (idx - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      idx = Math.floor((idx - m) / 26);
    }
    return s;
  }

  async function downloadExcelWorkbook(wb, filename) {
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function applyExcelReportBanner(ws, { subtitle, metaText, colCount }) {
    const endCol = Math.max(colCount || 10, 8);
    // Row 1: Corporate Title Banner
    ws.mergeCells(1, 1, 1, endCol);
    const c1 = ws.getCell("A1");
    c1.value = "VIETNAM BLOCK B GAS DEVELOPMENT PROJECT • EPC#1 CPP TOPSIDE";
    c1.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.headerBg } };
    c1.font = { name: "Segoe UI", size: 12.5, bold: true, color: { argb: "FFFFFFFF" } };
    c1.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(1).height = 30;

    // Row 2: Report Subtitle
    ws.mergeCells(2, 1, 2, endCol);
    const c2 = ws.getCell("A2");
    c2.value = String(subtitle || "OFFICIAL STATUS & COMPLETION DOSSIER").toUpperCase();
    c2.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.subtitleBg } };
    c2.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
    c2.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(2).height = 24;

    // Row 3: Metadata Bar
    ws.mergeCells(3, 1, 3, endCol);
    const c3 = ws.getCell("A3");
    c3.value = metaText;
    c3.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.metaBg } };
    c3.font = { name: "Segoe UI", size: 9, bold: true, color: { argb: EXCEL_THEME.metaText } };
    c3.alignment = { vertical: "middle", horizontal: "center" };
    ws.getRow(3).height = 22;

    // Row 4: Spacer
    ws.getRow(4).height = 8;

    return 5;
  }

  function styleExcelDataTable(ws, startRow, headers, rows, minColWidths = {}) {
    // Header Row
    const hRow = ws.getRow(startRow);
    hRow.height = 26;
    headers.forEach((h, idx) => {
      const cell = hRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.tableHeaderBg } };
      cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: "FFFFFFFF" } };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin", color: { argb: EXCEL_THEME.tableHeaderBorder } },
        left: { style: "thin", color: { argb: EXCEL_THEME.tableHeaderBorder } },
        bottom: { style: "medium", color: { argb: "FF0F172A" } },
        right: { style: "thin", color: { argb: EXCEL_THEME.tableHeaderBorder } },
      };
    });

    const maxLens = headers.map((h) => String(h || "").length);
    const statusIdx = headers.findIndex((h) => /status/i.test(h));
    const catIdx = headers.findIndex((h) => /category|^cat$/i.test(h));
    const descIndices = new Set(
      headers.map((h, i) => (/description|action|defect|title|remarks/i.test(h) ? i : -1)).filter((i) => i >= 0)
    );

    // Data Rows
    rows.forEach((r, rIdx) => {
      const rowNum = startRow + 1 + rIdx;
      const dRow = ws.getRow(rowNum);
      dRow.height = 20;
      const isEven = rIdx % 2 === 1;

      r.forEach((val, cIdx) => {
        const cell = dRow.getCell(cIdx + 1);
        cell.value = val !== null && val !== undefined ? val : "";
        cell.font = { name: "Segoe UI", size: 9.5, color: { argb: "FF1E293B" } };
        cell.border = {
          top: { style: "thin", color: { argb: EXCEL_THEME.borderColor } },
          left: { style: "thin", color: { argb: EXCEL_THEME.borderColor } },
          bottom: { style: "thin", color: { argb: EXCEL_THEME.borderColor } },
          right: { style: "thin", color: { argb: EXCEL_THEME.borderColor } },
        };

        const isDesc = descIndices.has(cIdx);
        cell.alignment = {
          vertical: "middle",
          horizontal: isDesc ? "left" : "center",
        };

        if (cIdx === statusIdx) {
          const sVal = String(val || "").trim().toLowerCase();
          if (sVal === "completed" || sVal === "closed") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.completedBg } };
            cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: EXCEL_THEME.completedText } };
          } else if (sVal === "remaining" || sVal === "open") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.remainingBg } };
            cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: EXCEL_THEME.remainingText } };
          }
        } else if (cIdx === catIdx) {
          const cVal = String(val || "").trim().toUpperCase();
          if (cVal === "A") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.catABg } };
            cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: EXCEL_THEME.catAText } };
          } else if (cVal === "B") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.catBBg } };
            cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: EXCEL_THEME.catBText } };
          } else if (cVal === "C") {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.catCBg } };
            cell.font = { name: "Segoe UI", size: 9.5, bold: true, color: { argb: EXCEL_THEME.catCText } };
          }
        } else if (isEven) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.zebraBg } };
        }

        const strVal = String(val !== null && val !== undefined ? val : "");
        if (strVal.length > maxLens[cIdx]) {
          maxLens[cIdx] = strVal.length;
        }
      });
    });

    // Auto Column Widths with Minimum Padding
    headers.forEach((h, idx) => {
      const col = ws.getColumn(idx + 1);
      const minW = minColWidths[h] || 12;
      const calculated = Math.min(Math.max(maxLens[idx] + 4, minW), 48);
      col.width = calculated;
    });

    // Auto-filter & Frozen Header Pane
    const lastColLetter = getExcelColLetter(headers.length);
    ws.autoFilter = { from: `A${startRow}`, to: `${lastColLetter}${startRow}` };
    ws.views = [{ state: "frozen", ySplit: startRow, xSplit: 0 }];
  }

  // --- Export to Excel (Client-side via ExcelJS with XLSX Fallback) ---
  window.exportActiveTabToExcel = async function () {
    if (!state.data) {
      alert("Project data is not yet loaded.");
      return;
    }

    const { fullStr: nowStr, isoDate: todayStr } = getReportTimestamp();

    if (!window.ExcelJS) {
      // Graceful fallback to SheetJS if ExcelJS is unavailable
      exportActiveTabToExcelFallback(todayStr);
      return;
    }

    try {
      showToast("Generating professional Excel report...", "info");
      const wb = new ExcelJS.Workbook();
      wb.creator = "Vietnam Block B EPC#1 Topsides Team";
      wb.lastModifiedBy = "PMS Pre-Commissioning System";
      wb.created = new Date();
      wb.modified = new Date();

      if (state.activeTab === "overview") {
        const stats = getOverviewStats();
        const g = stats.global;
        const totAll = g.itrA.total + g.punchA.total + g.punchB.total + g.punchC.total + g.itrB.total;
        const totClosed = g.itrA.closed + g.punchA.closed + g.punchB.closed + g.punchC.closed + g.itrB.closed;
        const totOpen = g.itrA.open + g.punchA.open + g.punchB.open + g.punchC.open + g.itrB.open;
        const totPct = totAll > 0 ? ((totClosed / totAll) * 100).toFixed(1) : "0.0";
        const sysFilter = state.overviewFilters.system || "ALL";

        // 1. Executive Summary Sheet
        const wsExec = wb.addWorksheet("Executive Summary");
        applyExcelReportBanner(wsExec, {
          subtitle: "EXECUTIVE PRE-COMMISSIONING & PUNCHLIST OVERVIEW",
          metaText: `Report Generated: ${nowStr} | Scope: System ${sysFilter} | Overall Progress: ${totPct}% | Total Scope: ${totAll.toLocaleString()} items (${totClosed.toLocaleString()} Closed, ${totOpen.toLocaleString()} Open) | Source: PMS Daily Sync`,
          colCount: 6,
        });

        // Gate Summary Table
        const gateHeaders = ["Gate / Phase", "Scope Description", "Total Scope", "Closed / Completed", "Open / Remaining", "Progress %"];
        const gateRows = [
          ["ITR-A", "Pre-Commissioning Checksheets", g.itrA.total, g.itrA.closed, g.itrA.open, `${g.itrA.pct}%`],
          ["Punch Cat A", "Critical Pre-Commissioning Punch Items", g.punchA.total, g.punchA.closed, g.punchA.open, `${g.punchA.pct}%`],
          ["Punch Cat B", "Commissioning Punch Items", g.punchB.total, g.punchB.closed, g.punchB.open, `${g.punchB.pct}%`],
          ["Punch Cat C", "Post-Commissioning / Minor Punch Items", g.punchC.total, g.punchC.closed, g.punchC.open, `${g.punchC.pct}%`],
          ["ITR-B", "Commissioning Checksheets", g.itrB.total, g.itrB.closed, g.itrB.open, `${g.itrB.pct}%`],
          ["TOTAL PRE-COMM", "Overall Combined Pre-Commissioning & Punch Scope", totAll, totClosed, totOpen, `${totPct}%`],
        ];
        styleExcelDataTable(wsExec, 5, gateHeaders, gateRows, {
          "Gate / Phase": 16,
          "Scope Description": 38,
          "Total Scope": 15,
          "Closed / Completed": 18,
          "Open / Remaining": 18,
          "Progress %": 15,
        });

        // Discipline Closure Table below Gate Table
        const discStartRow = 5 + gateRows.length + 3;
        wsExec.mergeCells(discStartRow - 1, 1, discStartRow - 1, 7);
        const discTitle = wsExec.getCell(`A${discStartRow - 1}`);
        discTitle.value = "DISCIPLINE CLOSURE SUMMARY (ITR-A/B & PUNCH CAT A/B/C)";
        discTitle.fill = { type: "pattern", pattern: "solid", fgColor: { argb: EXCEL_THEME.subtitleBg } };
        discTitle.font = { name: "Segoe UI", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
        discTitle.alignment = { vertical: "middle", horizontal: "center" };
        wsExec.getRow(discStartRow - 1).height = 22;

        const discHeaders = ["Discipline", "ITR-A (Comp / Total)", "Punch A (Cls / Total)", "Punch B (Cls / Total)", "Punch C (Cls / Total)", "ITR-B (Comp / Total)", "Overall Progress %"];
        const discRows = stats.byDiscipline.map((d) => [
          d.discipline,
          `${d.itrA.closed} / ${d.itrA.total} (${d.itrA.pct}%)`,
          `${d.punchA.closed} / ${d.punchA.total} (${d.punchA.pct}%)`,
          `${d.punchB.closed} / ${d.punchB.total} (${d.punchB.pct}%)`,
          `${d.punchC.closed} / ${d.punchC.total} (${d.punchC.pct}%)`,
          `${d.itrB.closed} / ${d.itrB.total} (${d.itrB.pct}%)`,
          `${d.overallPct}% (${d.overallClosed}/${d.overallTotal})`,
        ]);
        styleExcelDataTable(wsExec, discStartRow, discHeaders, discRows, {
          Discipline: 20,
          "ITR-A (Comp / Total)": 24,
          "Punch A (Cls / Total)": 24,
          "Punch B (Cls / Total)": 24,
          "Punch C (Cls / Total)": 24,
          "ITR-B (Comp / Total)": 24,
          "Overall Progress %": 22,
        });

        // 2. By SubSystem Sheet
        const wsSub = wb.addWorksheet("By SubSystem");
        applyExcelReportBanner(wsSub, {
          subtitle: "SUBSYSTEM SUMMARY MATRIX & PROGRESS DOSSIER",
          metaText: `Report Generated: ${nowStr} | Total Subsystems: ${stats.bySubSystem.length} | Scope: System ${sysFilter}`,
          colCount: 9,
        });
        const subHeaders = ["System No", "SubSystem No", "SubSystem Description", "ITR-A (Comp/Total)", "Punch Cat A", "Punch Cat B", "Punch Cat C", "ITR-B (Comp/Total)", "Overall %"];
        const subRows = stats.bySubSystem.map((s) => [
          inferSystemFromSub(s.subSystem),
          s.subSystem,
          s.description || state.data.subsystems[s.subSystem] || "",
          `${s.itrA.closed} / ${s.itrA.total} (${s.itrA.pct}%)`,
          `${s.punchA.closed} / ${s.punchA.total} (${s.punchA.pct}%)`,
          `${s.punchB.closed} / ${s.punchB.total} (${s.punchB.pct}%)`,
          `${s.punchC.closed} / ${s.punchC.total} (${s.punchC.pct}%)`,
          `${s.itrB.closed} / ${s.itrB.total} (${s.itrB.pct}%)`,
          `${s.overallPct}%`,
        ]);
        styleExcelDataTable(wsSub, 5, subHeaders, subRows, {
          "System No": 14,
          "SubSystem No": 18,
          "SubSystem Description": 32,
          "ITR-A (Comp/Total)": 22,
          "Punch Cat A": 18,
          "Punch Cat B": 18,
          "Punch Cat C": 18,
          "ITR-B (Comp/Total)": 22,
          "Overall %": 14,
        });

        // 3. By Discipline Sheet
        const wsDisc = wb.addWorksheet("By Discipline");
        applyExcelReportBanner(wsDisc, {
          subtitle: "DISCIPLINE BREAKDOWN & COMPLETION REGISTER",
          metaText: `Report Generated: ${nowStr} | Total Disciplines: ${stats.byDiscipline.length} | Scope: System ${sysFilter}`,
          colCount: 7,
        });
        styleExcelDataTable(wsDisc, 5, discHeaders, discRows, {
          Discipline: 22,
          "ITR-A (Comp / Total)": 24,
          "Punch A (Cls / Total)": 24,
          "Punch B (Cls / Total)": 24,
          "Punch C (Cls / Total)": 24,
          "ITR-B (Comp / Total)": 24,
          "Overall Progress %": 22,
        });

        // 4. Punchlist Register Sheet
        const plRows = getFilteredPunchlist();
        const wsPl = wb.addWorksheet("Punchlist Register");
        applyExcelReportBanner(wsPl, {
          subtitle: "PUNCHLIST MASTER CLEARANCE REGISTER",
          metaText: `Report Generated: ${nowStr} | Filter Scope: System ${sysFilter} | Total Items: ${plRows.length.toLocaleString()}`,
          colCount: 17,
        });
        const plHeaders = ["No.", "System No", "SubSystem No", "PunchList No", "Raised No", "Tag No", "Tag Description", "Category", "Status", "Open Date", "Closed Date", "Discipline", "Defect Description", "Corrective Action", "Target Date", "Action By", "MRIR No"];
        const plExportRows = plRows.map((r, i) => [
          i + 1,
          resolvePl(r, 0),
          resolvePl(r, 1),
          r[2],
          resolvePl(r, 3) || "-",
          r[5],
          resolvePl(r, 6),
          r[8],
          resolvePl(r, 9) || "Open",
          resolvePl(r, 10) || "-",
          resolvePl(r, 11) || "-",
          resolvePl(r, 15),
          resolvePl(r, 16),
          resolvePl(r, 17),
          resolvePl(r, 21) || "-",
          resolvePl(r, 12) || "-",
          resolvePl(r, 13) || "-",
        ]);
        styleExcelDataTable(wsPl, 5, plHeaders, plExportRows, {
          "No.": 8,
          "System No": 14,
          "SubSystem No": 16,
          "PunchList No": 16,
          "Raised No": 15,
          "Tag No": 18,
          "Tag Description": 28,
          "Category": 10,
          "Status": 12,
          "Open Date": 14,
          "Closed Date": 14,
          "Discipline": 15,
          "Defect Description": 42,
          "Corrective Action": 42,
          "Target Date": 14,
          "Action By": 14,
          "MRIR No": 14,
        });

        // 5. Checksheet Register Sheet
        const csRows = getFilteredChecksheets();
        const wsCs = wb.addWorksheet("Checksheet Register");
        applyExcelReportBanner(wsCs, {
          subtitle: "PRE-COMMISSIONING CHECKSHEET MASTER REGISTER",
          metaText: `Report Generated: ${nowStr} | Filter Scope: System ${sysFilter} | Total Items: ${csRows.length.toLocaleString()}`,
          colCount: 14,
        });
        const csHeaders = ["No.", "SubSystem No", "SubSystem Description", "Tag No", "Tag Description", "Discipline", "CheckSheet Type", "Status", "Complete Date", "Plan Finish", "Norm (Mhrs)", "Phase", "Location", "SubContractor"];
        const csExportRows = csRows.map((r, i) => [
          i + 1,
          resolveCs(r, 1),
          state.data.subsystems[resolveCs(r, 1)] || "",
          r[2],
          resolveCs(r, 3),
          resolveCs(r, 4),
          resolveCs(r, 5),
          resolveCs(r, 6) ? "Completed" : "Remaining",
          resolveCs(r, 6) || "-",
          resolveCs(r, 7) || "-",
          r[8] || "",
          resolveCs(r, 9) || "",
          resolveCs(r, 10) || "",
          resolveCs(r, 11) || "",
        ]);
        styleExcelDataTable(wsCs, 5, csHeaders, csExportRows, {
          "No.": 8,
          "SubSystem No": 16,
          "SubSystem Description": 28,
          "Tag No": 18,
          "Tag Description": 30,
          "Discipline": 15,
          "CheckSheet Type": 16,
          "Status": 14,
          "Complete Date": 15,
          "Plan Finish": 15,
          "Norm (Mhrs)": 12,
          "Phase": 10,
          "Location": 12,
          "SubContractor": 15,
        });

        await downloadExcelWorkbook(wb, `CPP_TOPSIDE_Executive_Report_${todayStr}.xlsx`);
        showToast("Successfully exported Executive Overview Dossier (5 sheets) to Excel!", "success");
        return;
      }

      if (state.activeTab === "punchlist") {
        const rows = getFilteredPunchlist();
        const total = rows.length;
        const closed = rows.filter((r) => (resolvePl(r, 9) || "Open") === "Closed").length;
        const open = total - closed;
        const pct = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";
        const f = state.filters.punchlist;
        const scopeStr = `System: ${f.system || "ALL"} • SubSystem: ${f.subSystem || "ALL"} • Disc: ${f.discipline || "ALL"} • Cat: ${f.category || "ALL"} • Status: ${f.status || "ALL"}`;

        const ws = wb.addWorksheet("Punchlist Register");
        applyExcelReportBanner(ws, {
          subtitle: "PUNCHLIST MASTER CLEARANCE & DEFECT STATUS REGISTER",
          metaText: `Report Generated: ${nowStr} | Scope: ${scopeStr} | Total: ${total.toLocaleString()} | Closed: ${closed.toLocaleString()} (${pct}%) | Open: ${open.toLocaleString()} | Source: PMS Daily Sync`,
          colCount: 17,
        });

        const headers = ["No.", "System No", "SubSystem No", "PunchList No", "Raised No", "Tag No", "Tag Description", "Category", "Status", "Open Date", "Closed Date", "Discipline", "Defect Description", "Corrective Action", "Target Date", "Action By", "MRIR No"];
        const exportRows = rows.map((r, i) => [
          i + 1,
          resolvePl(r, 0),
          resolvePl(r, 1),
          r[2],
          resolvePl(r, 3) || "-",
          r[5],
          resolvePl(r, 6),
          r[8],
          resolvePl(r, 9) || "Open",
          resolvePl(r, 10) || "-",
          resolvePl(r, 11) || "-",
          resolvePl(r, 15),
          resolvePl(r, 16),
          resolvePl(r, 17),
          resolvePl(r, 21) || "-",
          resolvePl(r, 12) || "-",
          resolvePl(r, 13) || "-",
        ]);

        styleExcelDataTable(ws, 5, headers, exportRows, {
          "No.": 8,
          "System No": 14,
          "SubSystem No": 16,
          "PunchList No": 16,
          "Raised No": 15,
          "Tag No": 18,
          "Tag Description": 28,
          "Category": 10,
          "Status": 12,
          "Open Date": 14,
          "Closed Date": 14,
          "Discipline": 15,
          "Defect Description": 42,
          "Corrective Action": 42,
          "Target Date": 14,
          "Action By": 14,
          "MRIR No": 14,
        });

        await downloadExcelWorkbook(wb, `PunchList_CPP_TOPSIDE_Report_${todayStr}.xlsx`);
        showToast(`Successfully exported ${total.toLocaleString()} Punchlist items to Excel!`, "success");
        return;
      }

      if (state.activeTab === "checksheet") {
        const rows = getFilteredChecksheets();
        const total = rows.length;
        const completed = rows.filter((r) => Boolean(resolveCs(r, 6))).length;
        const remaining = total - completed;
        const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
        const f = state.filters.checksheet;
        const scopeStr = `System: ${f.system || "ALL"} • SubSystem: ${f.subSystem || "ALL"} • Disc: ${f.discipline || "ALL"} • Group: ${f.itrGroup || "ALL"} • Status: ${f.status || "ALL"}`;

        const ws = wb.addWorksheet("Checksheet Register");
        applyExcelReportBanner(ws, {
          subtitle: "PRE-COMMISSIONING CHECKSHEET INSPECTION & COMPLETION REGISTER",
          metaText: `Report Generated: ${nowStr} | Scope: ${scopeStr} | Total: ${total.toLocaleString()} | Completed: ${completed.toLocaleString()} (${pct}%) | Remaining: ${remaining.toLocaleString()} | Source: PMS Daily Sync`,
          colCount: 14,
        });

        const headers = ["No.", "SubSystem No", "SubSystem Description", "Tag No", "Tag Description", "Discipline", "CheckSheet Type", "Status", "Complete Date", "Plan Finish", "Norm (Mhrs)", "Phase", "Location", "SubContractor"];
        const exportRows = rows.map((r, i) => [
          i + 1,
          resolveCs(r, 1),
          state.data.subsystems[resolveCs(r, 1)] || "",
          r[2],
          resolveCs(r, 3),
          resolveCs(r, 4),
          resolveCs(r, 5),
          resolveCs(r, 6) ? "Completed" : "Remaining",
          resolveCs(r, 6) || "-",
          resolveCs(r, 7) || "-",
          r[8] || "",
          resolveCs(r, 9) || "",
          resolveCs(r, 10) || "",
          resolveCs(r, 11) || "",
        ]);

        styleExcelDataTable(ws, 5, headers, exportRows, {
          "No.": 8,
          "SubSystem No": 16,
          "SubSystem Description": 28,
          "Tag No": 18,
          "Tag Description": 30,
          "Discipline": 15,
          "CheckSheet Type": 16,
          "Status": 14,
          "Complete Date": 15,
          "Plan Finish": 15,
          "Norm (Mhrs)": 12,
          "Phase": 10,
          "Location": 12,
          "SubContractor": 15,
        });

        await downloadExcelWorkbook(wb, `Checksheet_CPP_TOPSIDE_Report_${todayStr}.xlsx`);
        showToast(`Successfully exported ${total.toLocaleString()} Checksheet items to Excel!`, "success");
        return;
      }

      // Detail Tabs (Subsystem Full Detail or Drilldown Detail)
      const dTab = state.detailTabs.find((t) => t.id === state.activeTab);
      if (!dTab) return;

      if (dTab.source === "subsystem") {
        const subNo = dTab.criteria.subSystem;
        const subDesc = state.data.subsystems[subNo] || "Subsystem Unit";
        const d = getSubDetailCounts(dTab);
        const safeSub = subNo.replace(/[^a-zA-Z0-9_-]/g, "_");

        // Sheet 1: Dossier Summary
        const wsSum = wb.addWorksheet("SubSystem Summary");
        applyExcelReportBanner(wsSum, {
          subtitle: `SUBSYSTEM COMPLETION DOSSIER — ${subNo} : ${subDesc}`,
          metaText: `Report Generated: ${nowStr} | SubSystem: ${subNo} | Overall Progress: ${d.overallPct}% | Total Scope: ${d.overallTotal.toLocaleString()} (${d.overallClosed.toLocaleString()} Closed, ${d.overallTotal - d.overallClosed} Open)`,
          colCount: 5,
        });

        const gateHeaders = ["Gate / Item", "Closed / Completed", "Open / Remaining", "Total Scope", "Progress %"];
        const gateRows = [
          ["ITR-A (Checksheets)", d.itrA.closed, d.itrA.open, d.itrA.total, `${d.itrA.pct}%`],
          ["Punch Cat A", d.punchA.closed, d.punchA.open, d.punchA.total, `${d.punchA.pct}%`],
          ["Punch Cat B", d.punchB.closed, d.punchB.open, d.punchB.total, `${d.punchB.pct}%`],
          ["Punch Cat C", d.punchC.closed, d.punchC.open, d.punchC.total, `${d.punchC.pct}%`],
          ["ITR-B (Checksheets)", d.itrB.closed, d.itrB.open, d.itrB.total, `${d.itrB.pct}%`],
          ["OVERALL TOTAL", d.overallClosed, d.overallTotal - d.overallClosed, d.overallTotal, `${d.overallPct}%`],
        ];
        styleExcelDataTable(wsSum, 5, gateHeaders, gateRows, {
          "Gate / Item": 24,
          "Closed / Completed": 18,
          "Open / Remaining": 18,
          "Total Scope": 16,
          "Progress %": 16,
        });

        // Sheet 2: Checksheets
        const csRows = d.csFiltered || [];
        const wsCs = wb.addWorksheet("Checksheets");
        applyExcelReportBanner(wsCs, {
          subtitle: `SUBSYSTEM ${subNo} — CHECKSHEET REGISTER`,
          metaText: `Report Generated: ${nowStr} | SubSystem: ${subNo} | Total Checksheets: ${csRows.length.toLocaleString()}`,
          colCount: 14,
        });
        const csHeaders = ["No.", "SubSystem No", "SubSystem Description", "Tag No", "Tag Description", "Discipline", "CheckSheet Type", "Status", "Complete Date", "Plan Finish", "Norm (Mhrs)", "Phase", "Location", "SubContractor"];
        const csExportRows = csRows.map((r, i) => [
          i + 1,
          resolveCs(r, 1),
          state.data.subsystems[resolveCs(r, 1)] || "",
          r[2],
          resolveCs(r, 3),
          resolveCs(r, 4),
          resolveCs(r, 5),
          resolveCs(r, 6) ? "Completed" : "Remaining",
          resolveCs(r, 6) || "-",
          resolveCs(r, 7) || "-",
          r[8] || "",
          resolveCs(r, 9) || "",
          resolveCs(r, 10) || "",
          resolveCs(r, 11) || "",
        ]);
        styleExcelDataTable(wsCs, 5, csHeaders, csExportRows, {
          "No.": 8,
          "SubSystem No": 16,
          "SubSystem Description": 28,
          "Tag No": 18,
          "Tag Description": 30,
          "Discipline": 15,
          "CheckSheet Type": 16,
          "Status": 14,
          "Complete Date": 15,
          "Plan Finish": 15,
          "Norm (Mhrs)": 12,
          "Phase": 10,
          "Location": 12,
          "SubContractor": 15,
        });

        // Sheet 3: Punchlist
        const plRows = d.plFiltered || [];
        const wsPl = wb.addWorksheet("Punchlist");
        applyExcelReportBanner(wsPl, {
          subtitle: `SUBSYSTEM ${subNo} — PUNCHLIST REGISTER`,
          metaText: `Report Generated: ${nowStr} | SubSystem: ${subNo} | Total Punch Items: ${plRows.length.toLocaleString()}`,
          colCount: 17,
        });
        const plHeaders = ["No.", "System No", "SubSystem No", "PunchList No", "Raised No", "Tag No", "Tag Description", "Category", "Status", "Open Date", "Closed Date", "Discipline", "Defect Description", "Corrective Action", "Target Date", "Action By", "MRIR No"];
        const plExportRows = plRows.map((r, i) => [
          i + 1,
          resolvePl(r, 0),
          resolvePl(r, 1),
          r[2],
          resolvePl(r, 3) || "-",
          r[5],
          resolvePl(r, 6),
          r[8],
          resolvePl(r, 9) || "Open",
          resolvePl(r, 10) || "-",
          resolvePl(r, 11) || "-",
          resolvePl(r, 15),
          resolvePl(r, 16),
          resolvePl(r, 17),
          resolvePl(r, 21) || "-",
          resolvePl(r, 12) || "-",
          resolvePl(r, 13) || "-",
        ]);
        styleExcelDataTable(wsPl, 5, plHeaders, plExportRows, {
          "No.": 8,
          "System No": 14,
          "SubSystem No": 16,
          "PunchList No": 16,
          "Raised No": 15,
          "Tag No": 18,
          "Tag Description": 28,
          "Category": 10,
          "Status": 12,
          "Open Date": 14,
          "Closed Date": 14,
          "Discipline": 15,
          "Defect Description": 42,
          "Corrective Action": 42,
          "Target Date": 14,
          "Action By": 14,
          "MRIR No": 14,
        });

        await downloadExcelWorkbook(wb, `SubSystem_${safeSub}_Dossier_Report_${todayStr}.xlsx`);
        showToast(`Exported ${subNo} Full Detail Dossier (3 sheets) to Excel!`, "success");
        return;
      }

      // Gate / Generic Detail tab
      const isPl = dTab.source === "punchlist";
      const filtered = getDetailFilteredRows(dTab);
      const safeTitle = dTab.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      const ws = wb.addWorksheet(isPl ? "Punchlist Detail" : "Checksheet Detail");

      applyExcelReportBanner(ws, {
        subtitle: `DETAIL REPORT — ${dTab.title.toUpperCase()}`,
        metaText: `Report Generated: ${nowStr} | Total Filtered: ${filtered.length.toLocaleString()} items | Source: PMS Daily Sync`,
        colCount: isPl ? 17 : 14,
      });

      if (isPl) {
        const headers = ["No.", "System No", "SubSystem No", "PunchList No", "Raised No", "Tag No", "Tag Description", "Category", "Status", "Open Date", "Closed Date", "Discipline", "Defect Description", "Corrective Action", "Target Date", "Action By", "MRIR No"];
        const exportRows = filtered.map((r, i) => [
          i + 1,
          resolvePl(r, 0),
          resolvePl(r, 1),
          r[2],
          resolvePl(r, 3) || "-",
          r[5],
          resolvePl(r, 6),
          r[8],
          resolvePl(r, 9) || "Open",
          resolvePl(r, 10) || "-",
          resolvePl(r, 11) || "-",
          resolvePl(r, 15),
          resolvePl(r, 16),
          resolvePl(r, 17),
          resolvePl(r, 21) || "-",
          resolvePl(r, 12) || "-",
          resolvePl(r, 13) || "-",
        ]);
        styleExcelDataTable(ws, 5, headers, exportRows, {
          "No.": 8,
          "System No": 14,
          "SubSystem No": 16,
          "PunchList No": 16,
          "Raised No": 15,
          "Tag No": 18,
          "Tag Description": 28,
          "Category": 10,
          "Status": 12,
          "Open Date": 14,
          "Closed Date": 14,
          "Discipline": 15,
          "Defect Description": 42,
          "Corrective Action": 42,
          "Target Date": 14,
          "Action By": 14,
          "MRIR No": 14,
        });
      } else {
        const headers = ["No.", "SubSystem No", "SubSystem Description", "Tag No", "Tag Description", "Discipline", "CheckSheet Type", "Status", "Complete Date", "Plan Finish", "Norm (Mhrs)", "Phase", "Location", "SubContractor"];
        const exportRows = filtered.map((r, i) => [
          i + 1,
          resolveCs(r, 1),
          state.data.subsystems[resolveCs(r, 1)] || "",
          r[2],
          resolveCs(r, 3),
          resolveCs(r, 4),
          resolveCs(r, 5),
          resolveCs(r, 6) ? "Completed" : "Remaining",
          resolveCs(r, 6) || "-",
          resolveCs(r, 7) || "-",
          r[8] || "",
          resolveCs(r, 9) || "",
          resolveCs(r, 10) || "",
          resolveCs(r, 11) || "",
        ]);
        styleExcelDataTable(ws, 5, headers, exportRows, {
          "No.": 8,
          "SubSystem No": 16,
          "SubSystem Description": 28,
          "Tag No": 18,
          "Tag Description": 30,
          "Discipline": 15,
          "CheckSheet Type": 16,
          "Status": 14,
          "Complete Date": 15,
          "Plan Finish": 15,
          "Norm (Mhrs)": 12,
          "Phase": 10,
          "Location": 12,
          "SubContractor": 15,
        });
      }

      await downloadExcelWorkbook(wb, `Detail_${safeTitle}_Report_${todayStr}.xlsx`);
      showToast(`Successfully exported ${filtered.length.toLocaleString()} detail items to Excel!`, "success");
    } catch (err) {
      console.error("Excel export error:", err);
      showToast("Error generating styled Excel report. Falling back to basic export.", "error");
      exportActiveTabToExcelFallback(todayStr);
    }
  };

  function exportActiveTabToExcelFallback(todayStr) {
    if (!window.XLSX) {
      alert("Excel export library is loading, please try again in a moment.");
      return;
    }
    const wb = XLSX.utils.book_new();
    let rowsToExport = [];
    let sheetName = "";
    let filename = "";

    if (state.activeTab === "punchlist") {
      rowsToExport = mapPunchRowsForExport(getFilteredPunchlist());
      sheetName = "Punchlist";
      filename = `PunchList_CPP_TOPSIDE_Export_${todayStr}.xlsx`;
    } else if (state.activeTab === "checksheet") {
      rowsToExport = mapCsRowsForExport(getFilteredChecksheets());
      sheetName = "Checksheet";
      filename = `Checksheet_CPP_TOPSIDE_Export_${todayStr}.xlsx`;
    } else {
      const dTab = state.detailTabs.find((t) => t.id === state.activeTab);
      if (!dTab) return;
      const isPl = dTab.source === "punchlist";
      const filtered = getDetailFilteredRows(dTab);
      rowsToExport = isPl ? mapPunchRowsForExport(filtered) : mapCsRowsForExport(filtered);
      sheetName = isPl ? "Punchlist Detail" : "Checksheet Detail";
      const safeTitle = dTab.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      filename = `Detail_${safeTitle}_${todayStr}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    showToast(`Successfully exported ${rowsToExport.length.toLocaleString()} rows to Excel!`, "success");
  }

  // --- Export to PDF (Professional Corporate Report Layout via jsPDF + autoTable) ---
  window.exportActiveTabToPDF = function () {
    if (!window.jspdf || !window.jspdf.jsPDF) {
      alert("PDF library is loading, please try again in a moment.");
      return;
    }
    if (!state.data) {
      alert("Project data is not yet loaded.");
      return;
    }

    const { fullStr: nowStr, isoDate: todayStr } = getReportTimestamp();
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    function drawPdfPageHeader(docRef, title, subtitle) {
      docRef.setFillColor(15, 23, 42); // Corporate Navy
      docRef.rect(14, 10, 269, 17, "F");

      // Gold accent bar
      docRef.setFillColor(217, 119, 6);
      docRef.rect(14, 10, 3, 17, "F");

      docRef.setFont("helvetica", "bold");
      docRef.setFontSize(11);
      docRef.setTextColor(255, 255, 255);
      docRef.text("VIETNAM BLOCK B GAS DEVELOPMENT PROJECT • EPC#1 CPP TOPSIDE", 21, 17);

      docRef.setFont("helvetica", "normal");
      docRef.setFontSize(7.5);
      docRef.setTextColor(203, 213, 225);
      docRef.text(subtitle || "PRE-COMMISSIONING & COMMISSIONING MANAGEMENT SYSTEM • OFFICIAL REPORT", 21, 23);
    }

    function drawPdfMetaBlock(docRef, reportTitle, metaText, stats = null) {
      docRef.setFont("helvetica", "bold");
      docRef.setFontSize(11);
      docRef.setTextColor(15, 23, 42);
      docRef.text(reportTitle, 14, 33);

      docRef.setFont("helvetica", "normal");
      docRef.setFontSize(7.5);
      docRef.setTextColor(100, 116, 139);
      docRef.text(metaText, 14, 38);

      if (stats) {
        const chips = [
          { label: "TOTAL SCOPE", val: stats.total.toLocaleString(), bg: [241, 245, 249], tc: [15, 23, 42] },
          { label: stats.closedLabel || "CLOSED / COMP", val: stats.closed.toLocaleString(), bg: [220, 252, 231], tc: [22, 101, 52] },
          { label: stats.openLabel || "OPEN / REM", val: stats.open.toLocaleString(), bg: [254, 226, 226], tc: [159, 18, 57] },
          { label: "PROGRESS %", val: `${stats.pct}%`, bg: [238, 242, 255], tc: [67, 56, 202] },
        ];
        const startX = 160;
        const chipW = 29;
        chips.forEach((c, i) => {
          const x = startX + i * (chipW + 2);
          docRef.setFillColor(c.bg[0], c.bg[1], c.bg[2]);
          docRef.roundedRect(x, 28.5, chipW, 11.5, 1.5, 1.5, "F");
          docRef.setFont("helvetica", "bold");
          docRef.setFontSize(5.5);
          docRef.setTextColor(c.tc[0], c.tc[1], c.tc[2]);
          docRef.text(c.label, x + chipW / 2, 32.5, { align: "center" });
          docRef.setFontSize(8);
          docRef.text(c.val, x + chipW / 2, 37.5, { align: "center" });
        });
      }
    }

    function applyPdfFootersAndHeaders(docRef, mainTitle) {
      const totalPages = docRef.internal.getNumberOfPages();
      for (let pNum = 1; pNum <= totalPages; pNum++) {
        docRef.setPage(pNum);

        // Header on subsequent pages
        if (pNum > 1) {
          docRef.setFillColor(15, 23, 42);
          docRef.rect(14, 8, 269, 8, "F");
          docRef.setFont("helvetica", "bold");
          docRef.setFontSize(7.5);
          docRef.setTextColor(255, 255, 255);
          docRef.text(`VIETNAM BLOCK B GAS PROJECT • EPC#1 CPP TOPSIDE — ${mainTitle}`, 18, 13.5);
        }

        // Footer dividing line
        docRef.setDrawColor(226, 232, 240);
        docRef.setLineWidth(0.2);
        docRef.line(14, 200, 283, 200);

        // 3-section footer
        docRef.setFont("helvetica", "normal");
        docRef.setFontSize(6.5);
        docRef.setTextColor(148, 163, 184);
        docRef.text("Vietnam Block B Gas Project • EPC#1 • CPP TOPSIDE — Pre-Commissioning & Commissioning Management System", 14, 204);
        docRef.text("CONFIDENTIAL & PROPRIETARY — FOR PROJECT USE ONLY", 148, 204, { align: "center" });
        docRef.text(`Page ${pNum} of ${totalPages} | Generated: ${nowStr}`, 283, 204, { align: "right" });
      }
    }

    if (state.activeTab === "overview") {
      const stats = getOverviewStats();
      const g = stats.global;
      const totAll = g.itrA.total + g.punchA.total + g.punchB.total + g.punchC.total + g.itrB.total;
      const totClosed = g.itrA.closed + g.punchA.closed + g.punchB.closed + g.punchC.closed + g.itrB.closed;
      const totOpen = g.itrA.open + g.punchA.open + g.punchB.open + g.punchC.open + g.itrB.open;
      const totPct = totAll > 0 ? ((totClosed / totAll) * 100).toFixed(1) : "0.0";
      const sysFilter = state.overviewFilters.system || "ALL";

      drawPdfPageHeader(doc, "Overview", "EXECUTIVE PRE-COMMISSIONING & PUNCHLIST STATUS REPORT");
      drawPdfMetaBlock(
        doc,
        "Executive Pre-Commissioning & Punchlist Progress Report",
        `Scope: System ${sysFilter} | Data Source: PMS Daily Sync | Total Scope: ${totAll.toLocaleString()} items`,
        { total: totAll, closed: totClosed, open: totOpen, pct: totPct, closedLabel: "CLOSED/COMP", openLabel: "OPEN/REM" }
      );

      // Gate KPI Table
      const gateBody = [
        ["ITR-A (Checksheets)", g.itrA.closed, g.itrA.open, g.itrA.total, `${g.itrA.pct}%`],
        ["Punch Cat A", g.punchA.closed, g.punchA.open, g.punchA.total, `${g.punchA.pct}%`],
        ["Punch Cat B", g.punchB.closed, g.punchB.open, g.punchB.total, `${g.punchB.pct}%`],
        ["Punch Cat C", g.punchC.closed, g.punchC.open, g.punchC.total, `${g.punchC.pct}%`],
        ["ITR-B (Checksheets)", g.itrB.closed, g.itrB.open, g.itrB.total, `${g.itrB.pct}%`],
        ["TOTAL PRE-COMMISSIONING", totClosed, totOpen, totAll, `${totPct}%`],
      ];

      doc.autoTable({
        startY: 44,
        head: [["Gate / Milestone", "Closed / Completed", "Open / Remaining", "Total Scope", "Progress %"]],
        body: gateBody,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 7, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 7, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "center", fontStyle: "bold", textColor: [22, 101, 52] },
          2: { halign: "center", fontStyle: "bold", textColor: [159, 18, 57] },
          3: { halign: "center", fontStyle: "bold" },
          4: { halign: "center", fontStyle: "bold" },
        },
      });

      const nextY = doc.lastAutoTable.finalY + 8;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(15, 23, 42);
      doc.text("Discipline Closure Summary (ITR-A/B & Punch Cat A/B/C)", 14, nextY);

      const discBody = stats.byDiscipline.map((d) => [
        d.discipline,
        `${d.itrA.closed} / ${d.itrA.total} (${d.itrA.pct}%)`,
        `${d.punchA.closed} / ${d.punchA.total} (${d.punchA.pct}%)`,
        `${d.punchB.closed} / ${d.punchB.total} (${d.punchB.pct}%)`,
        `${d.punchC.closed} / ${d.punchC.total} (${d.punchC.pct}%)`,
        `${d.itrB.closed} / ${d.itrB.total} (${d.itrB.pct}%)`,
        `${d.overallPct}% (${d.overallClosed}/${d.overallTotal})`,
      ]);

      doc.autoTable({
        startY: nextY + 3,
        head: [["Discipline", "ITR-A (Comp/Total)", "Punch A (Cls/Total)", "Punch B (Cls/Total)", "Punch C (Cls/Total)", "ITR-B (Comp/Total)", "Overall Progress %"]],
        body: discBody,
        theme: "grid",
        headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 6.8, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "center" },
          2: { halign: "center" },
          3: { halign: "center" },
          4: { halign: "center" },
          5: { halign: "center" },
          6: { halign: "center", fontStyle: "bold" },
        },
      });

      applyPdfFootersAndHeaders(doc, "Executive Overview");
      doc.save(`CPP_TOPSIDE_Executive_Report_${todayStr}.pdf`);
      showToast("Successfully exported Executive Overview PDF report!", "success");
      return;
    }

    if (state.activeTab === "punchlist") {
      const rows = getFilteredPunchlist();
      const total = rows.length;
      const closed = rows.filter((r) => (resolvePl(r, 9) || "Open") === "Closed").length;
      const open = total - closed;
      const pct = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";
      const f = state.filters.punchlist;
      const scopeStr = `System: ${f.system || "ALL"} • SubSystem: ${f.subSystem || "ALL"} • Disc: ${f.discipline || "ALL"} • Cat: ${f.category || "ALL"} • Status: ${f.status || "ALL"}`;

      drawPdfPageHeader(doc, "Punchlist", "PUNCHLIST MASTER CLEARANCE & DEFECT REGISTER");
      const pdfLimit = 350;
      const isTruncated = total > pdfLimit;
      const noteStr = isTruncated ? ` (Showing top ${pdfLimit} of ${total.toLocaleString()} rows — Export to Excel for full register)` : "";
      drawPdfMetaBlock(
        doc,
        `Punchlist Master Defect Register${noteStr}`,
        `Scope: ${scopeStr} | Source: PMS Daily Sync`,
        { total, closed, open, pct, closedLabel: "CLOSED ITEMS", openLabel: "OPEN ITEMS" }
      );

      const tableRows = rows.slice(0, pdfLimit).map((r, i) => [
        i + 1,
        resolvePl(r, 0),
        resolvePl(r, 1),
        r[2],
        resolvePl(r, 3) || "-",
        r[5],
        r[8],
        resolvePl(r, 9) || "Open",
        resolvePl(r, 15),
        resolvePl(r, 21) || "-",
        (resolvePl(r, 16) || "").slice(0, 55),
      ]);

      doc.autoTable({
        startY: 45,
        head: [["#", "System", "SubSystem", "PL No", "Raised No", "Tag No", "Cat", "Status", "Disc", "Target Date", "Defect Description"]],
        body: tableRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 1.8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 6.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { halign: "center", cellWidth: 16 },
          2: { halign: "center", cellWidth: 18 },
          3: { halign: "center", cellWidth: 18 },
          4: { halign: "center", cellWidth: 18 },
          5: { halign: "center", cellWidth: 24 },
          6: { halign: "center", cellWidth: 10, fontStyle: "bold" },
          7: { halign: "center", cellWidth: 16, fontStyle: "bold" },
          8: { halign: "center", cellWidth: 18 },
          9: { halign: "center", cellWidth: 18 },
          10: { halign: "left" },
        },
        didParseCell: (data) => {
          if (data.section === "body") {
            if (data.column.index === 7) {
              const sVal = String(data.cell.raw || "").trim();
              if (sVal === "Closed") {
                data.cell.styles.fillColor = [220, 252, 231];
                data.cell.styles.textColor = [22, 101, 52];
              } else {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [159, 18, 57];
              }
            } else if (data.column.index === 6) {
              const cVal = String(data.cell.raw || "").trim().toUpperCase();
              if (cVal === "A") data.cell.styles.textColor = [220, 38, 38];
              else if (cVal === "B") data.cell.styles.textColor = [217, 119, 6];
              else if (cVal === "C") data.cell.styles.textColor = [37, 99, 235];
            }
          }
        },
      });

      applyPdfFootersAndHeaders(doc, "Punchlist Register");
      doc.save(`PunchList_CPP_TOPSIDE_Report_${todayStr}.pdf`);
      showToast(`Successfully exported Punchlist PDF report (${tableRows.length.toLocaleString()} rows)!`, "success");
      return;
    }

    if (state.activeTab === "checksheet") {
      const rows = getFilteredChecksheets();
      const total = rows.length;
      const completed = rows.filter((r) => Boolean(resolveCs(r, 6))).length;
      const remaining = total - completed;
      const pct = total > 0 ? ((completed / total) * 100).toFixed(1) : "0.0";
      const f = state.filters.checksheet;
      const scopeStr = `System: ${f.system || "ALL"} • SubSystem: ${f.subSystem || "ALL"} • Disc: ${f.discipline || "ALL"} • Group: ${f.itrGroup || "ALL"} • Status: ${f.status || "ALL"}`;

      drawPdfPageHeader(doc, "Checksheet", "PRE-COMMISSIONING CHECKSHEET MASTER REGISTER");
      const pdfLimit = 350;
      const isTruncated = total > pdfLimit;
      const noteStr = isTruncated ? ` (Showing top ${pdfLimit} of ${total.toLocaleString()} rows — Export to Excel for full register)` : "";
      drawPdfMetaBlock(
        doc,
        `Checksheet Inspection Register${noteStr}`,
        `Scope: ${scopeStr} | Source: PMS Daily Sync`,
        { total, closed: completed, open: remaining, pct, closedLabel: "COMPLETED", openLabel: "REMAINING" }
      );

      const tableRows = rows.slice(0, pdfLimit).map((r, i) => [
        i + 1,
        resolveCs(r, 1),
        (state.data.subsystems[resolveCs(r, 1)] || "").slice(0, 30),
        r[2],
        resolveCs(r, 4),
        resolveCs(r, 5),
        resolveCs(r, 6) ? "Completed" : "Remaining",
        resolveCs(r, 6) || "-",
        resolveCs(r, 7) || "-",
      ]);

      doc.autoTable({
        startY: 45,
        head: [["#", "SubSystem No", "SubSystem Description", "Tag No", "Disc", "Type", "Status", "Complete Date", "Plan Finish"]],
        body: tableRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 1.8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 6.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { halign: "center", cellWidth: 22 },
          2: { halign: "left", cellWidth: 46 },
          3: { halign: "center", cellWidth: 32 },
          4: { halign: "center", cellWidth: 20 },
          5: { halign: "center", cellWidth: 20 },
          6: { halign: "center", cellWidth: 22, fontStyle: "bold" },
          7: { halign: "center", cellWidth: 22 },
          8: { halign: "center", cellWidth: 22 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 6) {
            const sVal = String(data.cell.raw || "").trim();
            if (sVal === "Completed") {
              data.cell.styles.fillColor = [220, 252, 231];
              data.cell.styles.textColor = [22, 101, 52];
            } else {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [159, 18, 57];
            }
          }
        },
      });

      applyPdfFootersAndHeaders(doc, "Checksheet Register");
      doc.save(`Checksheet_CPP_TOPSIDE_Report_${todayStr}.pdf`);
      showToast(`Successfully exported Checksheet PDF report (${tableRows.length.toLocaleString()} rows)!`, "success");
      return;
    }

    // Detail Tabs
    const dTab = state.detailTabs.find((t) => t.id === state.activeTab);
    if (!dTab) return;

    if (dTab.source === "subsystem") {
      const subNo = dTab.criteria.subSystem;
      const subDesc = state.data.subsystems[subNo] || "Subsystem Unit";
      const d = getSubDetailCounts(dTab);
      const safeSub = subNo.replace(/[^a-zA-Z0-9_-]/g, "_");

      drawPdfPageHeader(doc, "SubSystem Detail", `SUBSYSTEM COMPLETION DOSSIER — ${subNo}`);
      drawPdfMetaBlock(
        doc,
        `SubSystem Dossier: ${subNo} — ${subDesc}`,
        `Overall Progress: ${d.overallPct}% | Source: PMS Daily Sync`,
        { total: d.overallTotal, closed: d.overallClosed, open: d.overallTotal - d.overallClosed, pct: d.overallPct, closedLabel: "COMPLETED/CLS", openLabel: "REMAINING/OPN" }
      );

      const gateRows = [
        ["ITR-A (Checksheets)", d.itrA.closed, d.itrA.open, d.itrA.total, `${d.itrA.pct}%`],
        ["Punch Cat A", d.punchA.closed, d.punchA.open, d.punchA.total, `${d.punchA.pct}%`],
        ["Punch Cat B", d.punchB.closed, d.punchB.open, d.punchB.total, `${d.punchB.pct}%`],
        ["Punch Cat C", d.punchC.closed, d.punchC.open, d.punchC.total, `${d.punchC.pct}%`],
        ["ITR-B (Checksheets)", d.itrB.closed, d.itrB.open, d.itrB.total, `${d.itrB.pct}%`],
        ["OVERALL TOTAL", d.overallClosed, d.overallTotal - d.overallClosed, d.overallTotal, `${d.overallPct}%`],
      ];

      doc.autoTable({
        startY: 45,
        head: [["Gate / Milestone", "Closed / Completed", "Open / Remaining", "Total Scope", "Progress %"]],
        body: gateRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 7, cellPadding: 2 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 7, cellPadding: 1.8, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { fontStyle: "bold" },
          1: { halign: "center", fontStyle: "bold", textColor: [22, 101, 52] },
          2: { halign: "center", fontStyle: "bold", textColor: [159, 18, 57] },
          3: { halign: "center", fontStyle: "bold" },
          4: { halign: "center", fontStyle: "bold" },
        },
      });

      // Append top checksheets & punchlist for this subsystem
      const nextY = doc.lastAutoTable.finalY + 8;
      const csRows = (d.csFiltered || []).slice(0, 150).map((r, i) => [
        i + 1,
        r[2],
        resolveCs(r, 4),
        resolveCs(r, 5),
        resolveCs(r, 6) ? "Completed" : "Remaining",
        resolveCs(r, 6) || "-",
        resolveCs(r, 7) || "-",
      ]);

      if (csRows.length > 0) {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(15, 23, 42);
        doc.text(`Checksheets for ${subNo} (${csRows.length} items)`, 14, nextY);

        doc.autoTable({
          startY: nextY + 3,
          head: [["#", "Tag No", "Discipline", "Type", "Status", "Complete Date", "Plan Finish"]],
          body: csRows,
          theme: "grid",
          headStyles: { fillColor: [30, 41, 59], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 1.8 },
          alternateRowStyles: { fillColor: [248, 250, 252] },
          bodyStyles: { textColor: [30, 41, 59], fontSize: 6.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
          columnStyles: {
            0: { halign: "center", cellWidth: 8 },
            1: { halign: "center", cellWidth: 32 },
            2: { halign: "center", cellWidth: 24 },
            3: { halign: "center", cellWidth: 24 },
            4: { halign: "center", cellWidth: 24, fontStyle: "bold" },
            5: { halign: "center", cellWidth: 24 },
            6: { halign: "center", cellWidth: 24 },
          },
          didParseCell: (data) => {
            if (data.section === "body" && data.column.index === 4) {
              const sVal = String(data.cell.raw || "").trim();
              if (sVal === "Completed") {
                data.cell.styles.fillColor = [220, 252, 231];
                data.cell.styles.textColor = [22, 101, 52];
              } else {
                data.cell.styles.fillColor = [254, 226, 226];
                data.cell.styles.textColor = [159, 18, 57];
              }
            }
          },
        });
      }

      applyPdfFootersAndHeaders(doc, `SubSystem ${subNo}`);
      doc.save(`SubSystem_${safeSub}_Report_${todayStr}.pdf`);
      showToast(`Exported ${subNo} Dossier PDF report!`, "success");
      return;
    }

    // Generic Drilldown Detail Tab
    const isPl = dTab.source === "punchlist";
    const filtered = getDetailFilteredRows(dTab);
    const total = filtered.length;
    const closed = isPl
      ? filtered.filter((r) => (resolvePl(r, 9) || "Open") === "Closed").length
      : filtered.filter((r) => Boolean(resolveCs(r, 6))).length;
    const open = total - closed;
    const pct = total > 0 ? ((closed / total) * 100).toFixed(1) : "0.0";
    const safeTitle = dTab.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);

    drawPdfPageHeader(doc, "Detail", `CPP TOPSIDE DETAIL — ${dTab.title.toUpperCase()}`);
    const pdfLimit = 350;
    const isTruncated = total > pdfLimit;
    const noteStr = isTruncated ? ` (Showing top ${pdfLimit} of ${total.toLocaleString()} rows)` : "";
    drawPdfMetaBlock(
      doc,
      `${dTab.title}${noteStr}`,
      `Generated: ${nowStr} | Source: PMS Daily Sync`,
      { total, closed, open, pct, closedLabel: isPl ? "CLOSED ITEMS" : "COMPLETED", openLabel: isPl ? "OPEN ITEMS" : "REMAINING" }
    );

    if (isPl) {
      const tableRows = filtered.slice(0, pdfLimit).map((r, i) => [
        i + 1,
        resolvePl(r, 1),
        r[2],
        r[5],
        r[8],
        resolvePl(r, 9) || "Open",
        resolvePl(r, 15),
        resolvePl(r, 21) || "-",
        (resolvePl(r, 16) || "").slice(0, 60),
      ]);

      doc.autoTable({
        startY: 45,
        head: [["#", "SubSystem", "PL No", "Tag No", "Cat", "Status", "Disc", "Target Date", "Defect Description"]],
        body: tableRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 1.8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 6.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { halign: "center", cellWidth: 20 },
          2: { halign: "center", cellWidth: 20 },
          3: { halign: "center", cellWidth: 28 },
          4: { halign: "center", cellWidth: 10, fontStyle: "bold" },
          5: { halign: "center", cellWidth: 18, fontStyle: "bold" },
          6: { halign: "center", cellWidth: 20 },
          7: { halign: "center", cellWidth: 20 },
          8: { halign: "left" },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 5) {
            const sVal = String(data.cell.raw || "").trim();
            if (sVal === "Closed") {
              data.cell.styles.fillColor = [220, 252, 231];
              data.cell.styles.textColor = [22, 101, 52];
            } else {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [159, 18, 57];
            }
          }
        },
      });
    } else {
      const tableRows = filtered.slice(0, pdfLimit).map((r, i) => [
        i + 1,
        resolveCs(r, 1),
        (state.data.subsystems[resolveCs(r, 1)] || "").slice(0, 30),
        r[2],
        resolveCs(r, 4),
        resolveCs(r, 5),
        resolveCs(r, 6) ? "Completed" : "Remaining",
        resolveCs(r, 6) || "-",
        resolveCs(r, 7) || "-",
      ]);

      doc.autoTable({
        startY: 45,
        head: [["#", "SubSystem No", "SubSystem Description", "Tag No", "Disc", "Type", "Status", "Complete Date", "Plan Finish"]],
        body: tableRows,
        theme: "grid",
        headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold", halign: "center", fontSize: 6.8, cellPadding: 1.8 },
        alternateRowStyles: { fillColor: [248, 250, 252] },
        bodyStyles: { textColor: [30, 41, 59], fontSize: 6.5, cellPadding: 1.5, lineColor: [226, 232, 240], lineWidth: 0.1 },
        columnStyles: {
          0: { halign: "center", cellWidth: 8 },
          1: { halign: "center", cellWidth: 22 },
          2: { halign: "left", cellWidth: 46 },
          3: { halign: "center", cellWidth: 32 },
          4: { halign: "center", cellWidth: 20 },
          5: { halign: "center", cellWidth: 20 },
          6: { halign: "center", cellWidth: 22, fontStyle: "bold" },
          7: { halign: "center", cellWidth: 22 },
          8: { halign: "center", cellWidth: 22 },
        },
        didParseCell: (data) => {
          if (data.section === "body" && data.column.index === 6) {
            const sVal = String(data.cell.raw || "").trim();
            if (sVal === "Completed") {
              data.cell.styles.fillColor = [220, 252, 231];
              data.cell.styles.textColor = [22, 101, 52];
            } else {
              data.cell.styles.fillColor = [254, 226, 226];
              data.cell.styles.textColor = [159, 18, 57];
            }
          }
        },
      });
    }

    applyPdfFootersAndHeaders(doc, dTab.title);
    doc.save(`Detail_${safeTitle}_Report_${todayStr}.pdf`);
    showToast(`Successfully exported PDF report (${filtered.length.toLocaleString()} rows)!`, "success");
  };

  // --- Modals ---
  window.openSourceModal = function () {
    const modal = document.getElementById("source-modal");
    if (!modal) return;
    const metaEl = document.getElementById("modal-source-meta");
    if (metaEl && state.data && state.data.meta) {
      const m = state.data.meta;
      metaEl.innerHTML = `
        <div>• <strong>Punchlist:</strong> ${esc(m.punchlist_file)} (${m.punchlist_count.toLocaleString()} rows, updated: ${m.punchlist_updated})</div>
        <div>• <strong>Checksheet:</strong> ${esc(m.checksheet_file)} (${m.checksheet_count.toLocaleString()} rows, updated: ${m.checksheet_updated})</div>
        <div>• <strong>Data aggregated at:</strong> ${esc(m.last_updated)}</div>
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
      showToast("Dashboard URL copied to clipboard!", "success");
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
        state.overviewCache = null;
        renderAll();
        showToast("Successfully synced latest data!", "success");
      } else {
        showToast("Data is already up to date.", "info");
      }
    } catch (e) {
      showToast("Could not reach Cloud server, using Offline data.", "info");
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
    showToast(`Reading Excel file (${type})...`, "info");
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const data = new Uint8Array(e.target.result);
        const wb = XLSX.read(data, { type: "array" });
        showToast("Excel file imported successfully!", "success");
        closeSourceModal();
      } catch (err) {
        showToast("Failed to read Excel file: " + err.message, "error");
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
