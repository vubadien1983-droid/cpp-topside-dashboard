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
    activeTab: "punchlist", // 'punchlist' or 'checksheet'
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

    const totalPl = state.data.punchlist.rows.length;
    const filteredPl = getFilteredPunchlist();
    const plCount = filteredPl.length;
    const isPlFiltered = plCount !== totalPl;

    const totalCs = state.data.checksheet.rows.length;
    const filteredCs = getFilteredChecksheets();
    const csCount = filteredCs.length;
    const isCsFiltered = csCount !== totalCs;

    const isPl = state.activeTab === "punchlist";
    const isCs = state.activeTab === "checksheet";

    const allSubs = Object.keys(state.data.subsystems || {});
    const totalSubsCount = allSubs.length;

    let activeSubsCount = totalSubsCount;
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
          class="px-4 py-2 rounded-xl text-xs sm:text-sm font-extrabold flex items-center gap-2.5 transition-all shadow-sm ${
            isCs
              ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-md ring-2 ring-white/20"
              : "bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white"
          }"
        >
          <i class="fas fa-tasks text-sm"></i>
          <span>2. Checksheet Overview</span>
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
      </div>

      <div class="hidden md:flex items-center gap-2 text-xs text-slate-400 pr-2">
        <span class="inline-flex items-center gap-1.5"><i class="fas fa-server text-blue-400"></i> CPP TOPSIDE</span>
        <span>•</span>
        <span id="header-subs-summary" class="${currentTabFiltered ? "text-amber-300 font-bold" : ""}">
          ${currentTabFiltered ? `${activeSubsCount} / ${totalSubsCount} SubSystems (Filtered)` : `${totalSubsCount} SubSystems`}
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

  // --- Export to Excel (Client-side via SheetJS) ---
  window.exportActiveTabToExcel = function () {
    if (!window.XLSX || !state.data) {
      alert("Excel library is loading, please try again in a moment.");
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
        "Status": resolveCs(r, 6) ? "Completed" : "Remaining",
        "Complete Date": resolveCs(r, 6),
        "Plan Finish": resolveCs(r, 7),
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
    showToast(`Successfully exported ${dataToExport.length.toLocaleString()} rows to Excel!`, "success");
  };

  // --- Export to PDF ---
  window.exportActiveTabToPDF = function () {
    if (!window.jspdf) {
      alert("PDF library is loading, please try again in a moment.");
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
      const rows = getFilteredChecksheets().slice(0, 100).map((r, i) => [
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
