import { loadDataset } from "./data-loader.js";
import { DOMAIN_CONFIG, getStatValue, matchSearch, STAT_LABELS } from "./calculators/common.js";
import { renderCatalogTable, renderCompareTable } from "./renderers/table.js";
import { renderDesigner } from "./renderers/designer.js";

const state = {
    dataset: "vanilla",
    domain: "tank",
    data: null,
    search: "",
    sortField: "year",
    sortDir: "asc",
    yearFilter: "all",
    typeFilter: "all",
    selectedBaseId: null,
    selectedModules: {},
    variantLevels: {},
    compare: [],
    countryId: "none",
    designerId: "none",
    doctrineId: "none",
    designName: ""
};

const els = {
    dataset: document.querySelector("#dataset"),
    dataStatus: document.querySelector("#data-status"),
    search: document.querySelector("#search"),
    sortField: document.querySelector("#sort-field"),
    sortDir: document.querySelector("#sort-dir"),
    yearFilter: document.querySelector("#year-filter"),
    typeFilter: document.querySelector("#type-filter"),
    country: document.querySelector("#country"),
    designer: document.querySelector("#designer-bonus"),
    doctrine: document.querySelector("#doctrine"),
    catalogTitle: document.querySelector("#catalog-title"),
    catalogSubtitle: document.querySelector("#catalog-subtitle"),
    catalogTable: document.querySelector("#catalog-table"),
    designerPanel: document.querySelector("#designer"),
    compareTable: document.querySelector("#compare-table"),
    clearCompare: document.querySelector("#clear-compare"),
    refreshData: document.querySelector("#refresh-data"),
    toggleDataset: document.querySelector("#toggle-dataset")
};

init();

async function init() {
    bindEvents();
    await loadAndRender();
}

function bindEvents() {
    document.querySelectorAll(".tab").forEach((tab) => {
        tab.addEventListener("click", () => {
            document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
            tab.classList.add("active");
            state.domain = tab.dataset.domain;
            state.selectedBaseId = null;
            state.selectedModules = {};
            state.variantLevels = {};
            state.yearFilter = "all";
            state.typeFilter = "all";
            state.sortField = "year";
            state.sortDir = "asc";
            els.sortDir.value = state.sortDir;
            render();
        });
    });

    els.dataset.addEventListener("change", async () => {
        state.dataset = els.dataset.value;
        await loadAndRender();
    });
    els.toggleDataset.addEventListener("click", toggleDataset);
    document.addEventListener("keydown", (event) => {
        if (event.key.toLowerCase() !== "c") return;
        if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
        toggleDataset();
    });
    els.refreshData.addEventListener("click", loadAndRender);
    els.search.addEventListener("input", () => {
        state.search = els.search.value;
        renderCatalog();
    });
    els.sortField.addEventListener("change", () => {
        state.sortField = els.sortField.value;
        renderCatalog();
    });
    els.sortDir.addEventListener("change", () => {
        state.sortDir = els.sortDir.value;
        renderCatalog();
    });
    els.yearFilter.addEventListener("change", () => {
        state.yearFilter = els.yearFilter.value;
        renderCatalog();
    });
    els.typeFilter.addEventListener("change", () => {
        state.typeFilter = els.typeFilter.value;
        renderCatalog();
    });
    els.country.addEventListener("change", () => {
        state.countryId = els.country.value;
        state.designerId = "none";
        renderControls();
        renderDesignerPanel();
    });
    els.designer.addEventListener("change", () => {
        state.designerId = els.designer.value;
        renderDesignerPanel();
    });
    els.doctrine.addEventListener("change", () => {
        state.doctrineId = els.doctrine.value;
        renderDesignerPanel();
    });
    els.clearCompare.addEventListener("click", () => {
        state.compare = [];
        renderCompare();
    });
}

async function toggleDataset() {
    state.dataset = state.dataset === "vanilla" ? "dlc" : "vanilla";
    els.dataset.value = state.dataset;
    state.selectedBaseId = null;
    state.selectedModules = {};
    state.variantLevels = {};
    state.yearFilter = "all";
    state.typeFilter = "all";
    await loadAndRender();
}

async function loadAndRender() {
    els.dataStatus.textContent = "데이터 로딩 중...";
    state.data = await loadDataset(state.dataset);
    state.countryId = "none";
    state.designerId = "none";
    state.doctrineId = "none";
    state.variantLevels = {};
    const generatedAt = state.data.meta.generatedAt ? new Date(state.data.meta.generatedAt).toLocaleString("ko-KR") : "샘플/미생성 데이터";
    els.dataStatus.textContent = `${state.data.meta.source || "unknown"} · ${generatedAt}`;
    render();
}

function render() {
    renderControls();
    renderCatalog();
    renderDesignerPanel();
    renderCompare();
}

function renderControls() {
    const config = DOMAIN_CONFIG[state.domain];
    els.sortField.innerHTML = config.sortStats.map((key) => `<option value="${key}" ${key === state.sortField ? "selected" : ""}>${STAT_LABELS[key] || key}</option>`).join("");
    const domainItems = state.data.equipment[state.domain] || [];
    const years = [...new Set(domainItems.map((item) => item.year).filter(Boolean))].sort((a, b) => a - b);
    els.yearFilter.innerHTML = `<option value="all">전체 연도</option>${years.map((year) => `<option value="${year}" ${String(year) === state.yearFilter ? "selected" : ""}>${year}</option>`).join("")}`;
    const types = [...new Set(domainItems.map((item) => item.type).filter(Boolean))].sort();
    els.typeFilter.innerHTML = `<option value="all">전체 분류</option>${types.map((type) => `<option value="${type}" ${type === state.typeFilter ? "selected" : ""}>${type}</option>`).join("")}`;

    const countries = state.data.modifiers.countries || [];
    els.country.innerHTML = countries.map((item) => `<option value="${item.id}" ${item.id === state.countryId ? "selected" : ""}>${item.nameKo || item.id} / ${item.nameEn || item.id}</option>`).join("");

    const designers = (state.data.modifiers.designers || []).filter((item) => {
        const countryMatches = !item.country || item.country === state.countryId || item.id === "none";
        const domainMatches = !item.domain || item.domain === state.domain || item.id === "none";
        return countryMatches && domainMatches;
    });
    if (!designers.some((item) => item.id === state.designerId)) state.designerId = "none";
    els.designer.innerHTML = designers.map((item) => `<option value="${item.id}" ${item.id === state.designerId ? "selected" : ""}>${item.nameKo || item.id} / ${item.nameEn || item.id}</option>`).join("");

    const doctrines = (state.data.modifiers.doctrines || []).filter((item) => !item.domain || item.domain === state.domain || item.id === "none");
    if (!doctrines.some((item) => item.id === state.doctrineId)) state.doctrineId = "none";
    els.doctrine.innerHTML = doctrines.map((item) => `<option value="${item.id}" ${item.id === state.doctrineId ? "selected" : ""}>${item.nameKo || item.id} / ${item.nameEn || item.id}</option>`).join("");
}

function renderCatalog() {
    const config = DOMAIN_CONFIG[state.domain];
    const items = (state.data.equipment[state.domain] || [])
        .filter((item) => matchSearch(item, state.search))
        .filter((item) => state.yearFilter === "all" || String(item.year) === state.yearFilter)
        .filter((item) => state.typeFilter === "all" || item.type === state.typeFilter)
        .sort((a, b) => {
            const aValue = getStatValue(a, state.sortField);
            const bValue = getStatValue(b, state.sortField);
            return state.sortDir === "asc" ? aValue - bValue : bValue - aValue;
        });

    els.catalogTitle.textContent = `${config.label} 도감`;
    els.catalogSubtitle.textContent = `${items.length}개 항목 · ${config.itemLabel} 기준`;
    renderCatalogTable(els.catalogTable, items, config.primaryStats, addToCompare, { domain: state.domain });
}

function renderDesignerPanel() {
    renderDesigner(els.designerPanel, state, DOMAIN_CONFIG[state.domain], addToCompare);
}

function renderCompare() {
    const statKeys = DOMAIN_CONFIG[state.domain].primaryStats;
    const filtered = state.compare.filter((item) => item.domain === state.domain);
    renderCompareTable(els.compareTable, filtered, statKeys);
}

function addToCompare(item) {
    const copy = {
        ...item,
        id: `${item.id}-${Date.now()}`,
        domain: item.domain || state.domain
    };
    state.compare.push(copy);
    renderCompare();
}
