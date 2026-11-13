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
      chartMetric: "ALL_GATES", // 'ALL_GATES', 'ITR-A', 'PUNCH-A', 'PUNCH-B', 'PUNCH-C', 'ITR-B'
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
      if (upEl) {
        upEl.textContent = `Updated: ${state.data.meta.last_updated || "Today"}`;
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
        srcKey === "checksheet"
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
      },
      limit: BATCH_SIZE,
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
        const rowsCount = getDetailFilteredRows(t).length;
        const isDetPl = t.source === "punchlist";
        return `
          <div
            onclick="switchMainTab('${esc(t.id)}')"
            class="group cursor-pointer px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-2 transition-all shadow-sm shrink-0 border ${
              active
                ? isDetPl
                  ? "bg-rose-600 text-white border-rose-500 shadow-md ring-2 ring-white/20"
                  : "bg-indigo-600 text-white border-indigo-500 shadow-md ring-2 ring-white/20"
                : "bg-slate-800/90 text-slate-300 border-slate-700 hover:bg-slate-700 hover:text-white"
            }"
            title="${esc(t.title)}"
          >
            <span class="px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
              isDetPl ? "bg-rose-900/50 text-rose-100" : "bg-blue-900/50 text-blue-100"
            }">${isDetPl ? "PL" : "ITR"}</span>
            <span class="max-w-[160px] truncate">${esc(t.title)}</span>
            <span id="detail-tab-badge-${esc(t.id)}" class="px-1.5 py-0.5 rounded-full text-[10px] font-black ${
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
          class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all shadow-sm shrink-0 ${
            isOv
              ? "bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-chart-pie text-sm"></i>
          <span>Overview</span>
          <span class="px-2 py-0.5 rounded-full text-[10px] font-black ${
            isOv ? "bg-white/20 text-white" : "bg-slate-700 text-emerald-300"
          }" title="Overall Gate Completion %">
            ${ovPct}%
          </span>
        </button>

        <button
          onclick="switchMainTab('punchlist')"
          class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all shadow-sm shrink-0 ${
            isPl
              ? "bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-clipboard-list text-sm"></i>
          <span>Punchlist</span>
          <span id="tab-pl-badge" class="px-2 py-0.5 rounded-full text-[10px] font-black transition-all ${
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
          class="px-3.5 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2 transition-all shadow-sm shrink-0 ${
            isCs
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-tasks text-sm"></i>
          <span>Checksheet</span>
          <span id="tab-cs-badge" class="px-2 py-0.5 rounded-full text-[10px] font-black transition-all ${
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

  function getOverviewStats() {
    const sysFilter = state.overviewFilters.system || "ALL";
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
      if (sysFilter !== "ALL" && sysNo !== sysFilter) continue;

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
      if (sysFilter !== "ALL" && sysNo !== sysFilter) continue;

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

    const allJson = esc(JSON.stringify(allCriteria));
    const openJson = esc(JSON.stringify(openCriteria));

    return `
      <td class="py-2 px-2.5 text-xs">
        <div
          onclick="openDetailTab(${allJson})"
          class="cursor-pointer rounded-lg p-1.5 hover:bg-blue-50/70 transition-colors border border-transparent hover:border-blue-200"
          title="Click to view all ${bucket.total.toLocaleString()} items"
        >
          <div class="flex items-center justify-between gap-1.5 whitespace-nowrap">
            <span class="font-mono text-[11px]">
              <strong class="text-slate-900">${bucket.closed.toLocaleString()}</strong><span class="text-slate-400">/${bucket.total.toLocaleString()}</span>
            </span>
            <span class="px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${pctBadgeClass}">
              ${bucket.pct}%
            </span>
          </div>
          <div class="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
            <div class="h-full rounded-full ${barColor}" style="width: ${bucket.pct}%"></div>
          </div>
          <div class="mt-1 flex items-center justify-between">
            ${
              bucket.open > 0
                ? `<button
                    onclick="event.stopPropagation(); openDetailTab(${openJson})"
                    class="px-1.5 py-0.5 rounded text-[10px] font-bold border ${openColorClass} transition-colors"
                    title="Click to inspect ${bucket.open.toLocaleString()} open/remaining items"
                  >
                    Open: ${bucket.open.toLocaleString()}
                  </button>`
                : `<span class="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5"><i class="fas fa-check-circle text-[9px]"></i> Complete</span>`
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
        const itrAllCrit = esc(JSON.stringify({ source: "checksheet", system: sys, subSystem: sub, itrGroup: "ALL", status: "ALL", title: `${sub} • All ITRs` }));
        const plAllCrit = esc(JSON.stringify({ source: "punchlist", system: sys, subSystem: sub, category: "ALL", status: "ALL", title: `${sub} • All Punch` }));

        return `
          <tr class="hover:bg-blue-50/30 border-b border-slate-100 text-xs transition-colors">
            <td class="py-2.5 px-2.5 text-center text-slate-400 font-mono whitespace-nowrap">${idx + 1}</td>
            <td class="py-2.5 px-3 min-w-[210px]">
              <div class="font-mono font-extrabold text-slate-900 text-xs">${esc(sub)}</div>
              ${s.description ? `<div class="text-[11px] text-slate-500 truncate max-w-[240px]" title="${esc(s.description)}">${esc(s.description)}</div>` : ""}
              <div class="flex items-center gap-1.5 mt-1">
                <button onclick="openDetailTab(${itrAllCrit})" class="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-[10px] font-bold transition-colors">All ITRs</button>
                <button onclick="openDetailTab(${plAllCrit})" class="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-[10px] font-bold transition-colors">All Punch</button>
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
            <td class="py-2.5 px-3 min-w-[125px]">
              <div class="flex items-center justify-between text-xs font-extrabold text-slate-800">
                <span>${s.overallPct}%</span>
                <span class="text-[10px] font-mono text-slate-500">${s.overallClosed}/${s.overallTotal}</span>
              </div>
              <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                <div class="h-full rounded-full ${s.overallPct >= 100 ? "bg-emerald-500" : "bg-teal-500"}" style="width: ${s.overallPct}%"></div>
              </div>
              <div class="text-[10px] text-slate-500 mt-1 font-mono">ITR: ${s.itrPct}% | PL: ${s.punchPct}%</div>
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

  window.setOvSystem = function (sysVal) {
    state.overviewFilters.system = sysVal || "ALL";
    state.overviewCache = null;
    renderTabContent();
  };

  window.setOvSubQuickFilter = function (qf) {
    state.overviewFilters.subQuickFilter = qf;
    renderTabContent();
  };

  window.setOvChartMetric = function (metric) {
    state.overviewFilters.chartMetric = metric;
    const stats = getOverviewStats();
    requestAnimationFrame(() => {
      if (state.activeTab === "overview") renderOverviewCharts(stats);
    });
    const pills = document.querySelectorAll("[data-ov-chart-btn]");
    pills.forEach((btn) => {
      const active = btn.getAttribute("data-ov-chart-btn") === metric;
      btn.className = `px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
        active ? "bg-slate-900 text-white shadow-sm" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`;
    });
  };

  function renderOverviewCharts(stats) {
    if (!window.Chart) return;
    const sys = state.overviewFilters.system || "ALL";
    const metric = state.overviewFilters.chartMetric || "ALL_GATES";

    // Chart 1: Discipline Stacked Progress
    const ctxDisc = document.getElementById("chart-ov-disciplines");
    if (ctxDisc) {
      if (state.charts.ovDisc) state.charts.ovDisc.destroy();
      const discList = stats.byDiscipline;
      const labels = discList.map((d) => d.discipline);

      const getBucketForMetric = (d) => {
        if (metric === "ITR-A") return d.itrA;
        if (metric === "ITR-B") return d.itrB;
        if (metric === "PUNCH-A") return d.punchA;
        if (metric === "PUNCH-B") return d.punchB;
        if (metric === "PUNCH-C") return d.punchC;
        return {
          closed: d.overallClosed,
          open: Math.max(0, d.overallTotal - d.overallClosed),
          total: d.overallTotal,
          pct: d.overallPct,
        };
      };

      const closedData = discList.map((d) => getBucketForMetric(d).closed);
      const openData = discList.map((d) => getBucketForMetric(d).open);

      state.charts.ovDisc = new Chart(ctxDisc, {
        type: "bar",
        data: {
          labels,
          datasets: [
            {
              label: "Closed / Completed",
              data: closedData,
              backgroundColor: "#10B981",
              borderRadius: 4,
            },
            {
              label: "Open / Remaining",
              data: openData,
              backgroundColor: "#F43F5E",
              borderRadius: 4,
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const idx = elements[0].index;
              const dObj = discList[idx];
              if (!dObj) return;
              const dsIdx = elements[0].datasetIndex;
              const isClickOpen = dsIdx === 1;
              if (metric === "ITR-A" || metric === "ITR-B") {
                openDetailTab({
                  source: "checksheet",
                  system: sys,
                  discipline: dObj.discipline,
                  itrGroup: metric,
                  status: isClickOpen ? "Remaining" : "ALL",
                  title: `${dObj.discipline} • ${metric}${isClickOpen ? " (Remaining)" : ""}`,
                });
              } else if (metric.startsWith("PUNCH-")) {
                const cat = metric.split("-")[1];
                openDetailTab({
                  source: "punchlist",
                  system: sys,
                  discipline: dObj.discipline,
                  category: cat,
                  status: isClickOpen ? "Open" : "ALL",
                  title: `${dObj.discipline} • Punch Cat ${cat}${isClickOpen ? " (Open)" : ""}`,
                });
              } else {
                openDetailTab({
                  source: "checksheet",
                  system: sys,
                  discipline: dObj.discipline,
                  itrGroup: "ALL",
                  status: isClickOpen ? "Remaining" : "ALL",
                  title: `${dObj.discipline} • Checksheets`,
                });
              }
            }
          },
          plugins: {
            legend: { position: "top", labels: { boxWidth: 12, font: { size: 11 } } },
            tooltip: {
              callbacks: {
                afterBody: (items) => {
                  if (!items.length) return "";
                  const dObj = discList[items[0].dataIndex];
                  const b = getBucketForMetric(dObj);
                  return `Completion: ${b.closed.toLocaleString()} / ${b.total.toLocaleString()} (${b.pct}%)`;
                },
              },
            },
          },
          scales: {
            x: { stacked: true, ticks: { font: { size: 10 } } },
            y: { stacked: true, beginAtZero: true },
          },
        },
      });
    }

    // Chart 2: 5-Gate Completion % Comparison
    const ctxGates = document.getElementById("chart-ov-gates");
    if (ctxGates) {
      if (state.charts.ovGates) state.charts.ovGates.destroy();
      const g = stats.global;
      const gateSpecs = [
        { label: "ITR-A", bucket: g.itrA, color: "#2563EB", crit: { source: "checksheet", system: sys, itrGroup: "ITR-A", status: "ALL", title: "ITR-A • All Checksheets" } },
        { label: "Punch Cat A", bucket: g.punchA, color: "#E11D48", crit: { source: "punchlist", system: sys, category: "A", status: "ALL", title: "Punch Cat A • All" } },
        { label: "Punch Cat B", bucket: g.punchB, color: "#D97706", crit: { source: "punchlist", system: sys, category: "B", status: "ALL", title: "Punch Cat B • All" } },
        { label: "Punch Cat C", bucket: g.punchC, color: "#0284C7", crit: { source: "punchlist", system: sys, category: "C", status: "ALL", title: "Punch Cat C • All" } },
        { label: "ITR-B", bucket: g.itrB, color: "#4F46E5", crit: { source: "checksheet", system: sys, itrGroup: "ITR-B", status: "ALL", title: "ITR-B • All Checksheets" } },
      ];

      state.charts.ovGates = new Chart(ctxGates, {
        type: "bar",
        data: {
          labels: gateSpecs.map((x) => `${x.label} (${x.bucket.pct}%)`),
          datasets: [
            {
              label: "% Closed / Completed",
              data: gateSpecs.map((x) => x.bucket.pct),
              backgroundColor: gateSpecs.map((x) => x.color),
              borderRadius: 6,
            },
          ],
        },
        options: {
          indexAxis: "y",
          responsive: true,
          maintainAspectRatio: false,
          onClick: (evt, elements) => {
            if (elements && elements.length > 0) {
              const spec = gateSpecs[elements[0].index];
              if (spec) openDetailTab(spec.crit);
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              callbacks: {
                label: (ctx) => {
                  const spec = gateSpecs[ctx.dataIndex];
                  const b = spec.bucket;
                  return `${b.closed.toLocaleString()} / ${b.total.toLocaleString()} (${b.pct}%) — Open: ${b.open.toLocaleString()}`;
                },
              },
            },
          },
          scales: {
            x: { min: 0, max: 100, ticks: { callback: (v) => v + "%", font: { size: 10 } } },
            y: { ticks: { font: { size: 11, weight: "bold" } } },
          },
        },
      });
    }
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
      <div class="bg-white rounded-2xl p-4 border border-slate-200 shadow-sm flex flex-wrap items-center justify-between gap-3">
        <div>
          <div class="flex items-center gap-2 flex-wrap">
            <span class="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-black uppercase tracking-wider">Executive Summary</span>
            <h2 class="text-sm sm:text-base font-black text-slate-900">
              CPP TOPSIDE — Pre-Commissioning & Punchlist Closure Overview
            </h2>
          </div>
          <p class="text-[11px] text-slate-500 mt-1">
            Closed / Completed vs Total across <strong>ITR-A, Punch A, B, C, ITR-B</strong>. Click any card, chart bar, or table cell to open a Detail Tab.
          </p>
        </div>

        <div class="flex flex-wrap items-center gap-2">
          <div class="flex items-center gap-1.5">
            <label class="text-[11px] font-bold text-slate-600"><i class="fas fa-filter text-blue-600 mr-1"></i>System:</label>
            <select
              onchange="setOvSystem(this.value)"
              class="px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold bg-white text-slate-800 focus:outline-none focus:border-blue-500"
            >
              <option value="ALL">-- All Systems (${stats.allSystems.length}) --</option>
              ${stats.allSystems
                .map((s) => `<option value="${esc(s)}" ${sys === s ? "selected" : ""}>${esc(s)}</option>`)
                .join("")}
            </select>
          </div>
        </div>
      </div>

      <!-- 1. Top 5 Gate KPI Cards (ITR-A, Punch A, Punch B, Punch C, ITR-B) -->
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        ${kpiCards
          .map((c) => {
            const b = c.bucket;
            const allJson = esc(JSON.stringify(c.allCrit));
            const openJson = esc(JSON.stringify(c.openCrit));
            return `
              <div
                onclick="openDetailTab(${allJson})"
                class="group cursor-pointer bg-white rounded-2xl p-4 border ${c.border} shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <div>
                      <p class="text-[11px] font-extrabold uppercase tracking-wider ${c.titleColor}">${esc(c.title)}</p>
                      <p class="text-[10px] text-slate-400 font-medium">${esc(c.sub)}</p>
                    </div>
                    <div class="flex items-center gap-1">
                      <button
                        onclick="event.stopPropagation(); openDetailTab(${allJson}, true)"
                        class="w-6 h-6 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 flex items-center justify-center text-[10px]"
                        title="Open in new browser window"
                      >
                        <i class="fas fa-external-link-alt"></i>
                      </button>
                      <div class="w-8 h-8 rounded-xl ${c.iconBg} flex items-center justify-center transition-colors">
                        <i class="fas ${c.icon} text-xs"></i>
                      </div>
                    </div>
                  </div>

                  <div class="mt-2.5 flex items-baseline justify-between gap-2">
                    <div class="font-mono">
                      <span class="text-xl sm:text-2xl font-black ${c.valColor}">${b.closed.toLocaleString()}</span>
                      <span class="text-xs font-bold text-slate-400">/ ${b.total.toLocaleString()}</span>
                    </div>
                    <span class="text-xs font-black px-2 py-0.5 rounded-full ${c.pillBg}">${b.pct}%</span>
                  </div>

                  <div class="mt-2 w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div class="${c.barColor} h-full rounded-full transition-all duration-300" style="width: ${b.pct}%"></div>
                  </div>
                </div>

                <div class="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                  <button
                    onclick="event.stopPropagation(); openDetailTab(${openJson})"
                    class="font-bold text-rose-600 hover:underline"
                    title="Click to inspect ${c.openLabel.toLowerCase()} items"
                  >
                    ${c.openLabel}: ${b.open.toLocaleString()}
                  </button>
                  <span class="${c.titleColor} font-bold group-hover:translate-x-0.5 transition-transform">
                    Details <i class="fas fa-arrow-right text-[10px]"></i>
                  </span>
                </div>
              </div>
            `;
          })
          .join("")}
      </div>

      <!-- 2. Interactive Progress Charts -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <!-- Chart 1: Progress by Discipline -->
        <div class="lg:col-span-2 min-w-0 overflow-hidden bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div class="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 class="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2">
                <i class="fas fa-chart-bar text-emerald-600"></i>
                Completion & Closure Progress by Discipline
              </h3>
              <p class="text-[11px] text-slate-500">Click any bar to inspect records for that Discipline in a Detail Tab</p>
            </div>
            <div class="flex flex-wrap items-center gap-1">
              ${[
                { k: "ALL_GATES", lbl: "All Gates" },
                { k: "ITR-A", lbl: "ITR-A" },
                { k: "PUNCH-A", lbl: "Punch A" },
                { k: "PUNCH-B", lbl: "Punch B" },
                { k: "PUNCH-C", lbl: "Punch C" },
                { k: "ITR-B", lbl: "ITR-B" },
              ]
                .map(
                  (m) => `
                <button
                  data-ov-chart-btn="${m.k}"
                  onclick="setOvChartMetric('${m.k}')"
                  class="px-2 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    state.overviewFilters.chartMetric === m.k
                      ? "bg-slate-900 text-white shadow-sm"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }"
                >${m.lbl}</button>
              `
                )
                .join("")}
            </div>
          </div>
          <div class="h-64 sm:h-72 mt-3 relative w-full" style="height:288px;">
            <canvas id="chart-ov-disciplines" class="w-full h-full"></canvas>
          </div>
        </div>

        <!-- Chart 2: 5-Gate Completion % Comparison -->
        <div class="min-w-0 overflow-hidden bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
          <div class="pb-3 border-b border-slate-100">
            <h3 class="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide flex items-center gap-2">
              <i class="fas fa-percent text-blue-600"></i>
              Gate Completion Rate (%)
            </h3>
            <p class="text-[11px] text-slate-500">Click any gate bar to open all items in a Detail Tab</p>
          </div>
          <div class="h-64 sm:h-72 mt-3 relative w-full" style="height:288px;">
            <canvas id="chart-ov-gates" class="w-full h-full"></canvas>
          </div>
        </div>
      </div>

      <!-- 3. Table 1: Summary Matrix by Discipline -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <i class="fas fa-layer-group text-indigo-600"></i>
            <h3 class="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide">
              1. Summary Matrix by Discipline (ITR-A, Punch A/B/C, ITR-B)
            </h3>
            <span class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
              ${stats.byDiscipline.length} Disciplines
            </span>
          </div>
          <span class="text-[11px] text-slate-500">
            <i class="fas fa-mouse-pointer mr-1 text-blue-500"></i> Click any cell to open Detail Tab
          </span>
        </div>

        <div class="overflow-x-auto">
          <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-3 whitespace-nowrap">Discipline</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-A (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat A (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat B (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat C (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-B (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Overall %</th>
              </tr>
            </thead>
            <tbody>
              ${stats.byDiscipline
                .map((d) => {
                  const theme = DISC_THEMES[d.discipline] || DISC_THEMES.Unassigned;
                  const discItrCrit = esc(JSON.stringify({ source: "checksheet", system: sys, discipline: d.discipline, itrGroup: "ALL", status: "ALL", title: `${d.discipline} • All ITRs` }));
                  const discPlCrit = esc(JSON.stringify({ source: "punchlist", system: sys, discipline: d.discipline, category: "ALL", status: "ALL", title: `${d.discipline} • All Punch` }));
                  return `
                    <tr class="hover:bg-blue-50/30 border-b border-slate-100 text-xs transition-colors">
                      <td class="py-2.5 px-3 min-w-[160px]">
                        <div class="flex items-center gap-2">
                          <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${theme.bar}"></span>
                          <span class="font-extrabold text-slate-900 text-xs sm:text-sm">${esc(d.discipline)}</span>
                        </div>
                        <div class="flex items-center gap-1.5 mt-1 pl-4">
                          <button onclick="openDetailTab(${discItrCrit})" class="px-1.5 py-0.5 rounded bg-blue-50 hover:bg-blue-600 text-blue-700 hover:text-white text-[10px] font-bold transition-colors">All ITRs</button>
                          <button onclick="openDetailTab(${discPlCrit})" class="px-1.5 py-0.5 rounded bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white text-[10px] font-bold transition-colors">All Punch</button>
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
                      <td class="py-2.5 px-3 min-w-[130px]">
                        <div class="flex items-center justify-between text-xs font-extrabold text-slate-800">
                          <span>${d.overallPct}%</span>
                          <span class="text-[10px] font-mono text-slate-500">${d.overallClosed.toLocaleString()}/${d.overallTotal.toLocaleString()}</span>
                        </div>
                        <div class="w-full h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
                          <div class="h-full rounded-full" style="width:${d.overallPct}%; background:${theme.bar}"></div>
                        </div>
                        <div class="text-[10px] text-slate-500 mt-1 font-mono">ITR: ${d.itrPct}% | PL: ${d.punchPct}%</div>
                      </td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr class="bg-slate-100 border-t-2 border-slate-300 font-bold text-xs">
                <td class="py-3 px-3 font-black text-slate-900 uppercase">TOTAL (${sys === "ALL" ? "CPP TOPSIDE" : esc(sys)})</td>
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
                <td class="py-3 px-3">
                  <div class="flex items-center justify-between text-xs font-black text-slate-900">
                    <span>${totPct}%</span>
                    <span class="text-[10px] font-mono text-slate-600">${totClosed.toLocaleString()}/${totAll.toLocaleString()}</span>
                  </div>
                  <div class="w-full h-2 bg-slate-200 rounded-full overflow-hidden mt-1">
                    <div class="h-full rounded-full bg-emerald-600" style="width:${totPct}%"></div>
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      <!-- 4. Table 2: Summary Matrix by SubSystem -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3.5 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <i class="fas fa-sitemap text-teal-600"></i>
            <h3 class="text-xs sm:text-sm font-extrabold text-slate-800 uppercase tracking-wide">
              2. Summary Matrix by SubSystem (ITR-A, Punch A/B/C, ITR-B)
            </h3>
            <span id="ov-sub-count-badge" class="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold">
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
                class="w-56 sm:w-64 pl-8 pr-3 py-1.5 rounded-xl border border-slate-300 text-xs bg-white focus:outline-none focus:border-blue-500"
              />
              <i class="fas fa-search absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs"></i>
            </div>
          </div>
        </div>

        <!-- SubSystem Quick Filter Pills -->
        <div class="px-3.5 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
          <span class="text-[11px] font-bold text-slate-400 mr-1">Focus:</span>
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
              class="px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                state.overviewFilters.subQuickFilter === f.k
                  ? "bg-slate-900 text-white shadow-sm"
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }"
            >${f.lbl}</button>
          `
            )
            .join("")}
        </div>

        <div class="overflow-x-auto overflow-y-auto max-h-[600px] bg-white">
          <table class="min-w-full text-left sqcl-grid-table" style="table-layout: auto; width: 100%;">
            <thead>
              <tr class="bg-slate-900 text-white text-[11px] uppercase font-bold tracking-wider">
                <th class="py-2.5 px-2.5 text-center whitespace-nowrap">#</th>
                <th class="py-2.5 px-3 whitespace-nowrap">SubSystem No & Description</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-A (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat A (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat B (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Punch Cat C (Closed / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">ITR-B (Comp / Total)</th>
                <th class="py-2.5 px-3 text-center whitespace-nowrap">Overall %</th>
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
      if (state.activeTab === "overview") renderOverviewCharts(stats);
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
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) return false;
        if (c.discipline !== "ALL" && disc !== c.discipline) return false;
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
        if (c.subSystem !== "ALL" && subNo !== c.subSystem) return false;
        if (c.discipline !== "ALL" && disc !== c.discipline) return false;
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

  window.setDetailStatusFilter = function (tabId, st) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters.status = st;
    tab.limit = BATCH_SIZE;
    renderTabBar();
    renderTabContent();
  };

  let debounceDetailTimer = null;
  window.debounceDetailSearch = function (tabId, val) {
    const tab = state.detailTabs.find((t) => t.id === tabId);
    if (!tab) return;
    tab.localFilters.search = val;
    clearTimeout(debounceDetailTimer);
    debounceDetailTimer = setTimeout(() => {
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

  function renderDetailTab(tab, container) {
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
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-3 pt-2 border-t border-slate-100 items-center">
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

      <!-- 2. Detail Continuous List Table -->
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
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
          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs transition-colors">
            <td class="py-2.5 px-3 text-center text-slate-400 font-mono whitespace-nowrap align-top">${startIdx + idx + 1}</td>
            <td class="py-2.5 px-3 font-extrabold text-blue-700 font-mono whitespace-nowrap align-top">
              <button onclick="viewPunchDetail('${esc(plNo)}')" class="hover:underline text-left" title="${esc(plNo)}">
                ${esc(plNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap align-top" title="${esc(raisedNo)}">
              ${esc(raisedNo) || "-"}
            </td>
            <td class="py-2.5 px-3 font-semibold text-slate-800 font-mono whitespace-nowrap align-top">
              <button onclick="setPlFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600" title="${esc(subNo)}">
                ${esc(subNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 font-mono font-bold text-slate-900 whitespace-nowrap align-top">
              <button onclick="setPlFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600" title="${esc(tagNo)}">
                ${esc(tagNo)}
              </button>
            </td>
            <td class="py-2.5 px-3 text-slate-600 whitespace-nowrap max-w-xs md:max-w-sm truncate align-top" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
            <td class="py-2.5 px-2 text-center whitespace-nowrap align-top">
              <span class="px-2 py-0.5 rounded font-black text-[10px] border ${catBadge}">${esc(cat)}</span>
            </td>
            <td class="py-2.5 px-2 text-center whitespace-nowrap align-top">
              <span class="px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusBadge}">${esc(status)}</span>
            </td>
            <td class="py-2.5 px-3 text-slate-700 font-medium whitespace-nowrap align-top" title="${esc(disc)}">${esc(disc)}</td>
            <td class="py-2.5 px-4 text-slate-800 whitespace-normal break-words leading-relaxed min-w-[280px] max-w-xl font-sans text-xs align-top">
              ${esc(defect)}
            </td>
            <td class="py-2.5 px-3 text-slate-600 font-mono text-[11px] whitespace-nowrap align-top">${esc(targetDate)}</td>
            <td class="py-2.5 px-4 text-emerald-700 whitespace-normal break-words leading-relaxed min-w-[240px] max-w-lg font-sans text-xs align-top">
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
    renderTabBar();
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

    // All available subsystems and disciplines for dropdown options
    const allSubSet = new Set();
    const allDiscSet = new Set();
    allRows.forEach((r) => {
      const d = pool[r[15]] || "";
      if (d) allDiscSet.add(d);
      const s = pool[r[1]] || "";
      if (s) allSubSet.add(s);
    });

    const sortedSubs = Array.from(allSubSet).sort();
    const subDescMap = state.data.subsystems || {};
    const sortedDiscs = Array.from(allDiscSet).sort();

    // Continuous Scroll (Start with first batch)
    state.limit.punchlist = Math.min(filtered.length, BATCH_SIZE);
    const pageRows = filtered.slice(0, state.limit.punchlist);

    container.innerHTML = `
      <!-- 1. KPI Cards Row (Dynamically Summarizes Filtered Data) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Punch -->
        <div onclick="setPlFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Punch</p>
              <h3 id="pl-kpi-total" class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-clipboard-list"></i>
            </div>
          </div>
          <p id="pl-kpi-total-sub" class="text-[10px] text-slate-500 mt-2">${isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} items` : "Total Punchlist Registry"}</p>
        </div>

        <!-- Cat A -->
        <div onclick="setPlFilter('category','A')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.category === "A" ? "ring-2 ring-rose-500 bg-rose-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-rose-700">Category A</p>
              <h3 id="pl-kpi-catA" class="text-xl sm:text-2xl font-black text-rose-600 mt-1">${catA.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-skull-crossbones"></i>
            </div>
          </div>
          <p class="text-[10px] text-rose-700 font-semibold mt-2">Critical Punch (Pre-CC)</p>
        </div>

        <!-- Cat B -->
        <div onclick="setPlFilter('category','B')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-amber-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all ${
          f.category === "B" ? "ring-2 ring-amber-500 bg-amber-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-amber-700">Category B</p>
              <h3 id="pl-kpi-catB" class="text-xl sm:text-2xl font-black text-amber-600 mt-1">${catB.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-triangle-exclamation"></i>
            </div>
          </div>
          <p class="text-[10px] text-amber-700 font-semibold mt-2">Prior to Handover (Pre-Ready)</p>
        </div>

        <!-- Cat C -->
        <div onclick="setPlFilter('category','C')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-blue-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all ${
          f.category === "C" ? "ring-2 ring-blue-500 bg-blue-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-blue-700">Category C</p>
              <h3 id="pl-kpi-catC" class="text-xl sm:text-2xl font-black text-blue-600 mt-1">${catC.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-circle-info"></i>
            </div>
          </div>
          <p class="text-[10px] text-blue-700 font-semibold mt-2">Agreed Carryover Punch</p>
        </div>

        <!-- Open Items -->
        <div onclick="setPlFilter('status','Open')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-orange-200 shadow-sm hover:shadow-md hover:border-orange-400 transition-all ${
          f.status === "Open" ? "ring-2 ring-orange-500 bg-orange-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-orange-700">Status: Open</p>
              <h3 id="pl-kpi-open" class="text-xl sm:text-2xl font-black text-orange-600 mt-1">${open.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-orange-100 text-orange-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-hourglass-start"></i>
            </div>
          </div>
          <p class="text-[10px] text-orange-700 font-semibold mt-2">Pending Punch Clearance</p>
        </div>

        <!-- Closed Items -->
        <div onclick="setPlFilter('status','Closed')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Closed" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Status: Closed</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="pl-kpi-closed" class="text-xl sm:text-2xl font-black text-emerald-600">${closed.toLocaleString()}</h3>
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
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Detailed Punchlist Registry
            </h4>
            <span id="pl-count-badge" class="text-xs text-slate-500 font-medium">
              (${pageRows.length >= filtered.length ? `Showing all ${filtered.length.toLocaleString()} items` : `Showing ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more`})
            </span>
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
    const subQ = f.subSystem;
    const statusQ = f.status;
    const discQ = f.discipline;
    const typeQ = f.checkType;
    const itrG = f.itrGroup || "ALL";

    return rows.filter((r) => {
      // 0: no, 1: sub, 2: tag_no, 3: tag_desc, 4: disc, 5: cs_type, 6: comp_date, 8: norm
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
          <tr class="hover:bg-blue-50/40 border-b border-slate-100 text-xs transition-colors h-10">
            <td class="py-2 px-2 text-center text-slate-400 font-mono whitespace-nowrap overflow-hidden">${esc(no)}</td>
            <td class="py-2 px-2 font-semibold text-slate-800 font-mono whitespace-nowrap overflow-hidden truncate">
              <button onclick="setCsFilter('subSystem', '${esc(subNo)}')" class="hover:text-blue-600 truncate" title="${esc(subNo)}">
                ${esc(subNo)}
              </button>
            </td>
            <td class="py-2 px-2 font-mono font-bold text-slate-900 whitespace-nowrap overflow-hidden truncate">
              <button onclick="setCsFilter('tag', '${esc(tagNo)}')" class="hover:text-emerald-600 truncate" title="${esc(tagNo)}">
                ${esc(tagNo)}
              </button>
            </td>
            <td class="py-2 px-3 text-slate-700 whitespace-nowrap overflow-hidden truncate font-medium" title="${esc(tagDesc)}">${esc(tagDesc)}</td>
            <td class="py-2 px-2 text-slate-700 font-medium whitespace-nowrap overflow-hidden truncate" title="${esc(disc)}">${esc(disc)}</td>
            <td class="py-2 px-2 font-mono font-bold text-indigo-700 whitespace-nowrap overflow-hidden truncate" title="${esc(csType)}">${esc(csType)}</td>
            <td class="py-2 px-1 text-center whitespace-nowrap overflow-hidden">
              <span class="px-2 py-0.5 rounded-full font-bold text-[10px] border ${statusBadge}">
                ${isComp ? "Completed" : "Remaining"}
              </span>
            </td>
            <td class="py-2 px-2 font-mono text-[11px] whitespace-nowrap overflow-hidden truncate ${isComp ? "text-emerald-700 font-semibold" : "text-slate-400"}">
              ${esc(compDate) || "-"}
            </td>
            <td class="py-2 px-2 font-mono text-[11px] text-slate-500 whitespace-nowrap overflow-hidden truncate">${esc(planFinish) || "-"}</td>
            <td class="py-2 px-1 text-center font-bold text-slate-700 font-mono whitespace-nowrap overflow-hidden">${esc(norm)}</td>
            <td class="py-2 px-2 text-slate-600 whitespace-nowrap overflow-hidden truncate" title="${esc(contractor)}">${esc(contractor)}</td>
            <td class="py-2 px-2 text-slate-700 whitespace-nowrap overflow-hidden truncate font-medium" title="${esc(phase)}">
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
    renderTabBar();
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

    // All available subsystems and disciplines for dropdown options
    const allSubSet = new Set();
    const allDiscSet = new Set();
    const allTypeSet = new Set();
    allRows.forEach((r) => {
      const d = pool[r[4]] || "";
      if (d) allDiscSet.add(d);
      const s = pool[r[1]] || "";
      if (s) allSubSet.add(s);
      const t = pool[r[5]] || "";
      if (t) allTypeSet.add(t);
    });

    const sortedSubs = Array.from(allSubSet).sort();
    const subDescMap = state.data.subsystems || {};
    const sortedDiscs = Array.from(allDiscSet).sort();

    // Continuous Scroll (Start with first batch)
    state.limit.checksheet = Math.min(filtered.length, BATCH_SIZE);
    const pageRows = filtered.slice(0, state.limit.checksheet);

    container.innerHTML = `
      <!-- 1. KPI Cards Row (Dynamically Summarizes Filtered Data) -->
      <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <!-- Total Checksheets -->
        <div onclick="setCsFilter('status','ALL')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-slate-200 shadow-sm hover:shadow-md transition-all">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-slate-500">Total Checksheet</p>
              <h3 id="cs-kpi-total" class="text-xl sm:text-2xl font-black text-slate-900 mt-1">${total.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-list-check"></i>
            </div>
          </div>
          <p id="cs-kpi-total-sub" class="text-[10px] text-slate-500 mt-2">${isFiltered ? `Filtered: ${total.toLocaleString()} of ${totalAll.toLocaleString()} records` : "Total Quality Inspection Records (ITR)"}</p>
        </div>

        <!-- Completed Checksheets -->
        <div onclick="setCsFilter('status','Completed')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-emerald-200 shadow-sm hover:shadow-md hover:border-emerald-400 transition-all ${
          f.status === "Completed" ? "ring-2 ring-emerald-500 bg-emerald-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-700">Completed (Signed-off)</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="cs-kpi-completed" class="text-xl sm:text-2xl font-black text-emerald-600">${completed.toLocaleString()}</h3>
                <span id="cs-kpi-pctDone" class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">${pctDone}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-check-double"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div id="cs-kpi-done-bar" class="bg-emerald-500 h-full rounded-full transition-all duration-300" style="width: ${pctDone}%"></div>
          </div>
        </div>

        <!-- Remaining Checksheets -->
        <div onclick="setCsFilter('status','Remaining')" class="cursor-pointer bg-white rounded-2xl p-3.5 border border-rose-200 shadow-sm hover:shadow-md hover:border-rose-400 transition-all ${
          f.status === "Remaining" ? "ring-2 ring-rose-500 bg-rose-50/20" : ""
        }">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-rose-700">Remaining (Pending)</p>
              <h3 id="cs-kpi-remaining" class="text-xl sm:text-2xl font-black text-rose-600 mt-1">${remaining.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-clock"></i>
            </div>
          </div>
          <p class="text-[10px] text-rose-700 font-semibold mt-2">Pending Sign-off & Completion</p>
        </div>

        <!-- Total Norm Manhours -->
        <div class="bg-white rounded-2xl p-3.5 border border-indigo-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-indigo-700">Total Manhours</p>
              <h3 id="cs-kpi-norm" class="text-xl sm:text-2xl font-black text-indigo-600 mt-1">${totalNorm.toLocaleString()}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-user-gear"></i>
            </div>
          </div>
          <p class="text-[10px] text-indigo-700 font-semibold mt-2">Total Planned Manhours (Norm)</p>
        </div>

        <!-- Completed Norm Manhours -->
        <div class="bg-white rounded-2xl p-3.5 border border-teal-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-teal-700">Earned Manhours</p>
              <div class="flex items-baseline gap-1.5 mt-1">
                <h3 id="cs-kpi-earned" class="text-xl sm:text-2xl font-black text-teal-600">${compNorm.toLocaleString()}</h3>
                <span id="cs-kpi-pctNorm" class="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-800">${pctNorm}%</span>
              </div>
            </div>
            <div class="w-8 h-8 rounded-xl bg-teal-100 text-teal-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-chart-pie"></i>
            </div>
          </div>
          <div class="mt-2 w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
            <div id="cs-kpi-norm-bar" class="bg-teal-500 h-full rounded-full transition-all duration-300" style="width: ${pctNorm}%"></div>
          </div>
        </div>

        <!-- Subsystems Count -->
        <div class="bg-white rounded-2xl p-3.5 border border-purple-200 shadow-sm">
          <div class="flex items-start justify-between">
            <div>
              <p class="text-[11px] font-bold uppercase tracking-wider text-purple-700">SubSystems</p>
              <h3 id="cs-kpi-subs" class="text-xl sm:text-2xl font-black text-purple-600 mt-1">${isFiltered ? filteredSubSet.size : sortedSubs.length}</h3>
            </div>
            <div class="w-8 h-8 rounded-xl bg-purple-100 text-purple-600 flex items-center justify-center font-bold text-xs">
              <i class="fas fa-network-wired"></i>
            </div>
          </div>
          <p class="text-[10px] text-purple-700 font-semibold mt-2">${isFiltered ? `${filteredSubSet.size} of ${sortedSubs.length} Active SubSystems` : "CPP Commissioning SubSystems"}</p>
        </div>
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
      <div class="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div class="p-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div class="flex items-center gap-2">
            <h4 class="font-bold text-xs sm:text-sm text-slate-800">
              Detailed Checksheet Registry
            </h4>
            <span id="cs-count-badge" class="text-xs text-slate-500 font-medium">
              (${pageRows.length >= filtered.length ? `Showing all ${filtered.length.toLocaleString()} items` : `Showing ${pageRows.length.toLocaleString()} of ${filtered.length.toLocaleString()} items — Scroll down for more`})
            </span>
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

  // --- Export to Excel (Client-side via SheetJS) ---
  window.exportActiveTabToExcel = function () {
    if (!window.XLSX || !state.data) {
      alert("Excel library is loading, please try again in a moment.");
      return;
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const wb = XLSX.utils.book_new();

    if (state.activeTab === "overview") {
      const stats = getOverviewStats();
      const g = stats.global;
      const execRows = [
        { Gate: "ITR-A (Checksheets)", "Closed / Completed": g.itrA.closed, "Open / Remaining": g.itrA.open, Total: g.itrA.total, "% Complete": `${g.itrA.pct}%` },
        { Gate: "Punch Cat A", "Closed / Completed": g.punchA.closed, "Open / Remaining": g.punchA.open, Total: g.punchA.total, "% Complete": `${g.punchA.pct}%` },
        { Gate: "Punch Cat B", "Closed / Completed": g.punchB.closed, "Open / Remaining": g.punchB.open, Total: g.punchB.total, "% Complete": `${g.punchB.pct}%` },
        { Gate: "Punch Cat C", "Closed / Completed": g.punchC.closed, "Open / Remaining": g.punchC.open, Total: g.punchC.total, "% Complete": `${g.punchC.pct}%` },
        { Gate: "ITR-B (Checksheets)", "Closed / Completed": g.itrB.closed, "Open / Remaining": g.itrB.open, Total: g.itrB.total, "% Complete": `${g.itrB.pct}%` },
      ];
      const discRows = stats.byDiscipline.map((d) => ({
        Discipline: d.discipline,
        "ITR-A": `${d.itrA.closed}/${d.itrA.total} (${d.itrA.pct}%)`,
        "Punch Cat A": `${d.punchA.closed}/${d.punchA.total} (${d.punchA.pct}%)`,
        "Punch Cat B": `${d.punchB.closed}/${d.punchB.total} (${d.punchB.pct}%)`,
        "Punch Cat C": `${d.punchC.closed}/${d.punchC.total} (${d.punchC.pct}%)`,
        "ITR-B": `${d.itrB.closed}/${d.itrB.total} (${d.itrB.pct}%)`,
        "Overall %": `${d.overallPct}%`,
      }));
      const subRows = stats.bySubSystem.map((s) => ({
        SubSystem: s.subSystem,
        Description: s.description,
        "ITR-A": `${s.itrA.closed}/${s.itrA.total} (${s.itrA.pct}%)`,
        "Punch Cat A": `${s.punchA.closed}/${s.punchA.total} (${s.punchA.pct}%)`,
        "Punch Cat B": `${s.punchB.closed}/${s.punchB.total} (${s.punchB.pct}%)`,
        "Punch Cat C": `${s.punchC.closed}/${s.punchC.total} (${s.punchC.pct}%)`,
        "ITR-B": `${s.itrB.closed}/${s.itrB.total} (${s.itrB.pct}%)`,
        "Overall %": `${s.overallPct}%`,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), "Executive Summary");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(discRows), "By Discipline");
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(subRows), "By SubSystem");
      XLSX.writeFile(wb, `CPP_TOPSIDE_Overview_Summary_${todayStr}.xlsx`);
      showToast("Successfully exported Overview Summary (3 sheets) to Excel!", "success");
      return;
    }

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
      const filtered = getDetailFilteredRows(dTab);
      const isPl = dTab.source === "punchlist";
      rowsToExport = isPl ? mapPunchRowsForExport(filtered) : mapCsRowsForExport(filtered);
      sheetName = isPl ? "Punchlist Detail" : "Checksheet Detail";
      const safeTitle = dTab.title.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 40);
      filename = `Detail_${safeTitle}_${todayStr}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(rowsToExport);
    XLSX.utils.book_append_sheet(wb, ws, sheetName);
    XLSX.writeFile(wb, filename);
    showToast(`Successfully exported ${rowsToExport.length.toLocaleString()} rows to Excel!`, "success");
  };

  // --- Export to PDF ---
  window.exportActiveTabToPDF = function () {
    if (!window.jspdf) {
      alert("PDF library is loading, please try again in a moment.");
      return;
    }
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF("l", "mm", "a4");

    if (state.activeTab === "overview") {
      const stats = getOverviewStats();
      doc.setFontSize(14);
      doc.text("CPP TOPSIDE - Executive Pre-Commissioning & Punchlist Overview", 14, 15);
      doc.setFontSize(9);
      doc.text(`Export Date: ${new Date().toLocaleString()} | Scope: ${state.overviewFilters.system}`, 14, 21);

      const discBody = stats.byDiscipline.map((d) => [
        d.discipline,
        `${d.itrA.closed}/${d.itrA.total} (${d.itrA.pct}%)`,
        `${d.punchA.closed}/${d.punchA.total} (${d.punchA.pct}%)`,
        `${d.punchB.closed}/${d.punchB.total} (${d.punchB.pct}%)`,
        `${d.punchC.closed}/${d.punchC.total} (${d.punchC.pct}%)`,
        `${d.itrB.closed}/${d.itrB.total} (${d.itrB.pct}%)`,
        `${d.overallPct}%`,
      ]);
      doc.autoTable({
        startY: 26,
        head: [["Discipline", "ITR-A", "Punch Cat A", "Punch Cat B", "Punch Cat C", "ITR-B", "Overall %"]],
        body: discBody,
        styles: { fontSize: 8 },
      });
      doc.save("CPP_TOPSIDE_Overview_Report.pdf");
      showToast("Successfully exported Overview PDF report!", "success");
      return;
    }

    let isPl = state.activeTab === "punchlist";
    let filtered = [];
    let reportTitle = "";

    if (state.activeTab === "punchlist") {
      filtered = getFilteredPunchlist();
      reportTitle = "CPP TOPSIDE - Punchlist Overview";
    } else if (state.activeTab === "checksheet") {
      filtered = getFilteredChecksheets();
      reportTitle = "CPP TOPSIDE - Checksheet Overview";
    } else {
      const dTab = state.detailTabs.find((t) => t.id === state.activeTab);
      if (!dTab) return;
      isPl = dTab.source === "punchlist";
      filtered = getDetailFilteredRows(dTab);
      reportTitle = `CPP TOPSIDE Detail - ${dTab.title}`;
    }

    doc.setFontSize(14);
    doc.text(reportTitle, 14, 15);
    doc.setFontSize(9);
    doc.text(`Export Date: ${new Date().toLocaleString()} | Total items: ${filtered.length}`, 14, 21);

    if (isPl) {
      const rows = filtered.slice(0, 100).map((r, i) => [
        i + 1,
        r[2],
        resolvePl(r, 3) || "-",
        resolvePl(r, 1),
        r[5],
        r[8],
        resolvePl(r, 9),
        resolvePl(r, 15),
        (resolvePl(r, 16) || "").slice(0, 50),
      ]);
      doc.autoTable({
        startY: 25,
        head: [["#", "PL No", "Raised No", "SubSystem", "Tag No", "Cat", "Status", "Disc", "Defect"]],
        body: rows,
        styles: { fontSize: 8 },
      });
    } else {
      const rows = filtered.slice(0, 100).map((r, i) => [
        i + 1,
        resolveCs(r, 1),
        r[2],
        resolveCs(r, 4),
        resolveCs(r, 5),
        resolveCs(r, 6) ? "Completed" : "Remaining",
        resolveCs(r, 6) || "-",
      ]);
      doc.autoTable({
        startY: 25,
        head: [["#", "SubSystem", "Tag No", "Disc", "Type", "Status", "Complete Date"]],
        body: rows,
        styles: { fontSize: 8 },
      });
    }

    doc.save(`${isPl ? "Punchlist" : "Checksheet"}_CPP_TOPSIDE_Report.pdf`);
    showToast("Successfully exported PDF report (first 100 rows)!", "success");
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
