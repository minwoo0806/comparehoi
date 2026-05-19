import { availableModules, equipmentRole, formatNumber, roleLabel, STAT_LABELS } from "../calculators/common.js";
import { calculateTank } from "../calculators/tank.js";
import { calculateAircraft } from "../calculators/aircraft.js";
import { calculateShip } from "../calculators/ship.js";
import { escapeHtml } from "./table.js";

const CALCULATORS = {
    tank: calculateTank,
    aircraft: calculateAircraft,
    ship: calculateShip
};

export function renderDesigner(container, state, config, onCompare) {
    const items = state.data.equipment[state.domain] || [];
    if (!items.length) {
        container.innerHTML = `<div class="empty">설계할 ${config.itemLabel} 데이터가 없습니다.</div>`;
        return;
    }

    const selectedBase = items.find((item) => item.id === state.selectedBaseId) || items[0];
    state.selectedBaseId = selectedBase.id;
    const selectedModules = selectedModuleObjects(state, config, selectedBase);
    const result = calculateCurrent(state, selectedBase, selectedModules);
    const moduleMode = state.data.meta.designerMode === "module";

    container.innerHTML = `
        <div class="designer-form">
            <div class="mode-note">
                ${moduleMode
                    ? "Full DLC 모드: 차체/프레임/선체에 실제 설계 모듈을 조합합니다."
                    : "Vanilla 모드: DLC 설계 모듈 없이 기본 장비와 변형 개량 수치만 비교합니다."}
            </div>
            <div class="variant-grid">
                ${renderContextSelect("design-country", "국가", state.countryId, state.data.modifiers.countries)}
                ${renderContextSelect("design-designer", "설계사", state.designerId, filteredDesigners(state))}
                ${renderContextSelect("design-doctrine", "교리", state.doctrineId, filteredDoctrines(state))}
            </div>
            <div class="effect-panel">
                <strong>선택 보너스 효과</strong>
                ${renderEffectSummary([
                    selectedById(state.data.modifiers.countries, state.countryId),
                    selectedById(state.data.modifiers.designers, state.designerId),
                    selectedById(state.data.modifiers.doctrines, state.doctrineId)
                ])}
            </div>
            <div>
                <label for="base-item">${config.itemLabel} 선택</label>
                <select id="base-item">
                    ${renderBaseOptions(state.domain, items, selectedBase.id)}
                </select>
            </div>
            ${moduleMode ? `<div class="module-slots">${config.moduleSlots.map((slot) => renderModuleSlot(state, selectedBase, slot)).join("")}</div>` : renderVariantControls(state)}
            ${moduleMode ? `<div class="effect-panel"><strong>선택 모듈 효과</strong>${renderEffectSummary(selectedModules)}</div>` : ""}
            <div>
                <label for="design-name">설계 이름</label>
                <input id="design-name" value="${escapeHtml(state.designName || `${selectedBase.nameKo || selectedBase.id} 커스텀`)}">
            </div>
            <button id="add-current-design">현재 설계 비교에 추가</button>
            <h3>최종 스펙</h3>
            <div class="result-grid">
                ${config.primaryStats.map((key) => renderStatCard(key, result.stats?.[key])).join("")}
            </div>
            ${moduleMode ? `<h3>추천 프리셋</h3><div class="preset-list">${renderPresets(state)}</div>` : ""}
        </div>
    `;

    container.querySelector("#base-item").addEventListener("change", (event) => {
        state.selectedBaseId = event.target.value;
        state.selectedModules = {};
        renderDesigner(container, state, config, onCompare);
    });

    container.querySelector("#design-country").addEventListener("change", (event) => {
        state.countryId = event.target.value;
        state.designerId = "none";
        renderDesigner(container, state, config, onCompare);
    });

    container.querySelector("#design-designer").addEventListener("change", (event) => {
        state.designerId = event.target.value;
        renderDesigner(container, state, config, onCompare);
    });

    container.querySelector("#design-doctrine").addEventListener("change", (event) => {
        state.doctrineId = event.target.value;
        renderDesigner(container, state, config, onCompare);
    });

    container.querySelectorAll("[data-module-slot]").forEach((select) => {
        select.addEventListener("change", () => {
            state.selectedModules[select.dataset.moduleSlot] = select.value;
            renderDesigner(container, state, config, onCompare);
        });
    });

    container.querySelectorAll("[data-variant-level]").forEach((input) => {
        input.addEventListener("input", () => {
            state.variantLevels[input.dataset.variantLevel] = Number(input.value) || 0;
            renderDesigner(container, state, config, onCompare);
        });
    });

    container.querySelector("#design-name").addEventListener("input", (event) => {
        state.designName = event.target.value;
    });

    container.querySelector("#add-current-design").addEventListener("click", () => {
        const designName = container.querySelector("#design-name").value.trim();
        const current = calculateCurrent(state, selectedBase, selectedModuleObjects(state, config, selectedBase), designName);
        onCompare(current);
    });

    container.querySelectorAll("[data-preset-id]").forEach((button) => {
        button.addEventListener("click", () => {
            const preset = (state.data.presets[state.domain] || []).find((candidate) => candidate.id === button.dataset.presetId);
            if (!preset) return;
            state.selectedBaseId = preset.baseId || selectedBase.id;
            state.selectedModules = { ...(preset.modulesBySlot || {}) };
            state.designName = preset.nameKo || preset.nameEn || preset.id;
            renderDesigner(container, state, config, onCompare);
        });
    });
}

function calculateCurrent(state, baseItem, modules, designName) {
    const calculator = CALCULATORS[state.domain];
    const country = state.data.modifiers.countries.find((item) => item.id === state.countryId);
    const designer = state.data.modifiers.designers.find((item) => item.id === state.designerId);
    const doctrine = state.data.modifiers.doctrines.find((item) => item.id === state.doctrineId);
    return calculator(baseItem, modules, {
        country,
        designer,
        doctrine,
        variantLevels: state.data.meta.designerMode === "module" ? {} : state.variantLevels,
        name: designName || state.designName,
        nameKo: designName || state.designName,
        nameEn: baseItem.nameEn
    });
}

function renderVariantControls(state) {
    state.variantLevels ||= {};
    const controls = [
        ["weapon", "무장 개량", "공격/관통 +5%/레벨"],
        ["engine", "엔진 개량", "속도 +5%/레벨"],
        ["reliability", "신뢰도 개량", "신뢰도 +5%/레벨"],
        ["armor", "장갑 개량", "전차 장갑 +5%, 속도 -2%/레벨"]
    ];
    return `
        <div class="variant-grid">
            ${controls.map(([id, label, hint]) => `
                <div>
                    <label>${label} <span class="muted">${hint}</span></label>
                    <input type="number" min="0" max="5" value="${Number(state.variantLevels[id] || 0)}" data-variant-level="${id}">
                </div>
            `).join("")}
        </div>
    `;
}

function selectedModuleObjects(state, config, selectedBase) {
    return config.moduleSlots.map((slot) => {
        const moduleId = state.selectedModules[slot];
        if (!moduleId) return null;
        const options = availableModules(state.data.modules, state.domain, slot, selectedBase);
        return options.find((module) => module.id === moduleId) || null;
    });
}

function renderModuleSlot(state, selectedBase, slot) {
    const options = availableModules(state.data.modules, state.domain, slot, selectedBase);
    if (!options.length) return "";
    const selected = state.selectedModules[slot] || "";
    return `
        <div>
            <label>${escapeHtml(slot)}</label>
            <select data-module-slot="${escapeHtml(slot)}">
                <option value="" ${selected === "" ? "selected" : ""}>선택 안 함 / None · 효과 없음</option>
                ${options.map((module) => `<option value="${escapeHtml(module.id)}" ${module.id === selected ? "selected" : ""}>${escapeHtml(module.nameKo || module.id)} / ${escapeHtml(module.nameEn || module.id)} · ${escapeHtml(formatEffects(module))}</option>`).join("")}
            </select>
        </div>
    `;
}

function renderBaseOptions(domain, items, selectedId) {
    const grouped = new Map();
    for (const item of items) {
        const role = equipmentRole(domain, item);
        if (!grouped.has(role)) grouped.set(role, []);
        grouped.get(role).push(item);
    }

    const roleOrder = domain === "tank"
        ? ["tank", "tank_destroyer", "self_propelled_artillery", "self_propelled_anti_air", "armored_car", "support"]
        : domain === "aircraft"
            ? ["small_airframe", "carrier_airframe", "medium_airframe", "large_airframe", "other"]
            : ["destroyer", "light_cruiser", "heavy_cruiser", "battleship", "carrier", "submarine", "support"];

    return roleOrder
        .filter((role) => grouped.has(role))
        .map((role) => `
            <optgroup label="${escapeHtml(roleLabel(domain, role))}">
                ${grouped.get(role)
                    .sort((a, b) => (a.year || 9999) - (b.year || 9999) || String(a.nameKo || a.id).localeCompare(String(b.nameKo || b.id)))
                    .map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === selectedId ? "selected" : ""}>${escapeHtml(item.nameKo || item.id)} / ${escapeHtml(item.nameEn || item.id)} (${item.year || "-"})</option>`)
                    .join("")}
            </optgroup>
        `).join("");
}

function renderContextSelect(id, label, selectedId, options) {
    return `
        <div>
            <label for="${id}">${label}</label>
            <select id="${id}">
                ${options.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === selectedId ? "selected" : ""}>${escapeHtml(option.nameKo || option.id)} / ${escapeHtml(option.nameEn || option.id)}${option.id !== "none" ? ` · ${escapeHtml(formatEffects(option))}` : ""}</option>`).join("")}
            </select>
        </div>
    `;
}

function filteredDesigners(state) {
    return (state.data.modifiers.designers || []).filter((item) => {
        const countryMatches = item.id === "none" || (state.countryId !== "none" && item.country === state.countryId);
        const domainMatches = item.id === "none" || !item.domain || item.domain === state.domain;
        return countryMatches && domainMatches;
    });
}

function filteredDoctrines(state) {
    return (state.data.modifiers.doctrines || []).filter((item) => !item.domain || item.domain === state.domain || item.id === "none");
}

function selectedById(items, id) {
    return (items || []).find((item) => item.id === id);
}

function renderEffectSummary(items) {
    const effects = items.filter(Boolean).flatMap((item) => effectParts(item).map((effect) => ({ ...effect, source: item.nameKo || item.id })));
    if (!effects.length) return `<div class="muted">적용되는 추가 효과가 없습니다.</div>`;
    return `
        <div class="effect-list">
            ${effects.map((effect) => `
                <span class="${effect.value >= 0 ? "effect-up" : "effect-down"}">
                    ${escapeHtml(effect.source)}: ${escapeHtml(effect.label)} ${effect.text}
                </span>
            `).join("")}
        </div>
    `;
}

function formatEffects(item) {
    const parts = effectParts(item);
    return parts.length ? parts.map((part) => `${part.label} ${part.text}`).join(", ") : "효과 없음";
}

function effectParts(item) {
    const stats = Object.entries(item?.stats || {}).map(([stat, value]) => ({
        label: STAT_LABELS[stat] || stat,
        value,
        text: signedNumber(value)
    }));
    const modifiers = (item?.modifiers || []).map((modifier) => ({
        label: STAT_LABELS[modifier.stat] || modifier.stat,
        value: Number(modifier.value) || 0,
        text: modifier.mode === "multiply" ? signedPercent(modifier.value) : signedNumber(modifier.value)
    }));
    return [...stats, ...modifiers].filter((part) => Number(part.value) !== 0);
}

function signedNumber(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? "+" : ""}${formatNumber(number)}`;
}

function signedPercent(value) {
    const number = Number(value) || 0;
    return `${number > 0 ? "+" : ""}${formatNumber(number * 100)}%`;
}

function renderStatCard(key, value) {
    return `
        <div class="stat-card">
            <span>${STAT_LABELS[key] || key}</span>
            <strong>${formatNumber(value)}</strong>
        </div>
    `;
}

function renderPresets(state) {
    const presets = state.data.presets[state.domain] || [];
    if (!presets.length) return `<div class="empty">추천 프리셋 데이터가 없습니다.</div>`;
    return presets.map((preset) => `
        <button type="button" class="secondary" data-preset-id="${escapeHtml(preset.id)}">
            <strong>${escapeHtml(preset.nameKo || preset.id)}</strong><br>
            <span class="muted">${escapeHtml(preset.nameEn || "")}</span>
        </button>
    `).join("");
}
