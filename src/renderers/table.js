import { formatNumber, getStatValue, STAT_LABELS } from "../calculators/common.js";

export function renderCatalogTable(container, items, statKeys, onAddCompare, options = {}) {
    if (!items.length) {
        container.innerHTML = `<div class="empty">표시할 데이터가 없습니다. 파서를 실행해 최신 게임 데이터를 생성해 주세요.</div>`;
        return;
    }

    const headers = ["이름", "영문", "종류", "연도", ...statKeys.map((key) => STAT_LABELS[key] || key), "출처", "비교"];
    let currentGroup = "";
    const rows = items.map((item) => {
        const group = options.domain === "tank" ? `${item.year || "연도 미상"} · ${typeLabel(item.type)}` : "";
        const groupRow = group && group !== currentGroup
            ? `<tr class="group-row"><td colspan="${headers.length}">${escapeHtml(group)}</td></tr>`
            : "";
        if (group) currentGroup = group;
        const statCells = statKeys.map((key) => `<td>${formatNumber(getStatValue(item, key))}</td>`).join("");
        const source = item.sourceUrl ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noreferrer">Wiki</a>` : escapeHtml(item.source || "-");
        const image = item.image ? `<img class="equipment-icon" src="${escapeHtml(item.image)}" alt="">` : "";
        return `${groupRow}
            <tr>
                <td><div class="equipment-name">${image}<strong>${escapeHtml(item.nameKo || item.id)}</strong></div></td>
                <td>${escapeHtml(item.nameEn || item.id)}</td>
                <td><span class="pill">${escapeHtml(item.type || "-")}</span></td>
                <td>${item.year || "-"}</td>
                ${statCells}
                <td>${source}</td>
                <td><button class="secondary" data-compare-base="${escapeHtml(item.id)}">추가</button></td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;

    container.querySelectorAll("[data-compare-base]").forEach((button) => {
        button.addEventListener("click", () => {
            const item = items.find((candidate) => candidate.id === button.dataset.compareBase);
            if (item) onAddCompare(item);
        });
    });
}

function typeLabel(type) {
    const labels = {
        light_tank: "경전차 차체",
        medium_tank: "중형전차 차체",
        heavy_tank: "중전차 차체",
        super_heavy_tank: "초중전차 차체",
        modern_tank: "현대전차 차체"
    };
    return labels[type] || type || "차체 미상";
}

export function renderCompareTable(container, items, statKeys) {
    if (!items.length) {
        container.innerHTML = `<div class="empty">비교 목록이 비어 있습니다. 도감 또는 설계 계산기에서 설계를 추가하세요.</div>`;
        return;
    }

    const headers = ["설계", "종류", "연도", ...statKeys.map((key) => STAT_LABELS[key] || key)];
    const rows = items.map((item) => `
        <tr>
            <td><strong>${escapeHtml(item.nameKo || item.name || item.id)}</strong><br><span class="muted">${escapeHtml(item.nameEn || item.baseId || "")}</span></td>
            <td>${escapeHtml(item.type || "-")}</td>
            <td>${item.year || "-"}</td>
            ${statKeys.map((key) => `<td>${formatNumber(getStatValue(item, key))}</td>`).join("")}
        </tr>
    `).join("");

    container.innerHTML = `
        <table>
            <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
            <tbody>${rows}</tbody>
        </table>
    `;
}

export function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll("\"", "&quot;")
        .replaceAll("'", "&#039;");
}
