export const STAT_LABELS = {
    year: "연도",
    reliability: "신뢰도",
    build_cost_ic: "생산 비용",
    resources: "자원",
    fuel_consumption: "연료",
    supply_consumption: "보급",
    maximum_speed: "속도",
    max_speed: "속도",
    armor_value: "장갑",
    breakthrough: "돌파",
    defense: "방어",
    soft_attack: "대인 공격",
    hard_attack: "대물 공격",
    piercing: "관통",
    air_attack: "공중 공격",
    air_defence: "공중 방어",
    agility: "기동성",
    range: "항속거리",
    naval_attack: "해상 공격",
    strategic_attack: "전략 폭격",
    light_attack: "경포 공격",
    heavy_attack: "중포 공격",
    torpedo_attack: "어뢰 공격",
    anti_air_attack: "대공",
    surface_detection: "수상 탐지",
    sub_detection: "잠수함 탐지",
    surface_visibility: "수상 피탐지",
    sub_visibility: "잠수함 피탐지"
};

export const DOMAIN_CONFIG = {
    tank: {
        label: "전차 / Tank",
        itemLabel: "차체",
        moduleSlots: ["main_armament", "turret", "suspension", "engine_type", "armor_type", "special_1", "special_2", "special_3", "special_4"],
        primaryStats: ["soft_attack", "hard_attack", "piercing", "breakthrough", "armor_value", "maximum_speed", "reliability", "build_cost_ic", "fuel_consumption", "supply_consumption"],
        sortStats: ["year", "build_cost_ic", "soft_attack", "hard_attack", "piercing", "breakthrough", "armor_value", "maximum_speed", "reliability"]
    },
    aircraft: {
        label: "항공기 / Aircraft",
        itemLabel: "프레임",
        moduleSlots: ["fixed_main_weapon_slot", "fixed_auxiliary_weapon_slot_1", "fixed_auxiliary_weapon_slot_2", "engine_type_slot", "special_type_slot_1", "special_type_slot_2", "special_type_slot_3"],
        primaryStats: ["air_attack", "air_defence", "agility", "maximum_speed", "range", "soft_attack", "naval_attack", "strategic_attack", "reliability", "build_cost_ic"],
        sortStats: ["year", "build_cost_ic", "air_attack", "air_defence", "agility", "maximum_speed", "range", "reliability"]
    },
    ship: {
        label: "함선 / Ship",
        itemLabel: "선체",
        moduleSlots: ["fixed_ship_battery_slot", "fixed_ship_anti_air_slot", "fixed_ship_fire_control_system_slot", "fixed_ship_radar_slot", "fixed_ship_engine_slot", "fixed_ship_armor_slot", "mid_1_custom_slot", "mid_2_custom_slot", "rear_1_custom_slot"],
        primaryStats: ["light_attack", "heavy_attack", "torpedo_attack", "anti_air_attack", "armor_value", "maximum_speed", "surface_detection", "sub_detection", "reliability", "build_cost_ic"],
        sortStats: ["year", "build_cost_ic", "light_attack", "heavy_attack", "torpedo_attack", "anti_air_attack", "maximum_speed", "reliability"]
    }
};

export function calculateEquipment(baseItem, selectedModules, context = {}) {
    const stats = deepClone(baseItem.stats || {});
    const resources = { ...(baseItem.resources || {}) };
    let reliabilityAdd = 0;
    let costAdd = 0;

    for (const module of selectedModules.filter(Boolean)) {
        addStats(stats, module.stats || {});
        mergeResources(resources, module.resources || {});
        reliabilityAdd += Number(module.reliabilityAdd || 0);
        costAdd += Number(module.costAdd || module.stats?.build_cost_ic || 0);
    }

    if (costAdd && stats.build_cost_ic === undefined) stats.build_cost_ic = 0;
    if (costAdd) stats.build_cost_ic = number(stats.build_cost_ic) + costAdd;
    if (reliabilityAdd) stats.reliability = number(stats.reliability, 1) + reliabilityAdd;

    applyModifierList(stats, context.doctrine?.modifiers);
    applyModifierList(stats, context.designer?.modifiers);
    applyModifierList(stats, context.country?.modifiers);
    applyVariantLevels(stats, context.variantLevels, baseItem.domain);

    stats.reliability = clamp(number(stats.reliability, 1), 0, 1.5);
    stats.resources = formatResources(resources);

    return {
        id: context.id || `${baseItem.id}-custom`,
        name: context.name || `${baseItem.nameKo || baseItem.id} 커스텀`,
        nameKo: context.nameKo || baseItem.nameKo || baseItem.id,
        nameEn: context.nameEn || baseItem.nameEn || baseItem.id,
        type: baseItem.type,
        year: baseItem.year,
        domain: baseItem.domain,
        baseId: baseItem.id,
        modules: selectedModules.map((module) => module?.id).filter(Boolean),
        stats
    };
}

export function applyVariantLevels(stats, levels = {}, domain) {
    const reliability = number(levels.reliability);
    const engine = number(levels.engine);
    const weapon = number(levels.weapon);
    const armor = number(levels.armor);

    if (reliability) stats.reliability = number(stats.reliability, 0.8) + reliability * 0.05;
    if (engine) {
        stats.maximum_speed = number(stats.maximum_speed) * (1 + engine * 0.05);
        if (domain === "aircraft") stats.agility = number(stats.agility) * (1 + engine * 0.03);
    }
    if (weapon) {
        for (const key of ["soft_attack", "hard_attack", "piercing", "air_attack", "naval_attack", "strategic_attack", "light_attack", "heavy_attack", "torpedo_attack", "anti_air_attack"]) {
            if (stats[key] !== undefined) stats[key] = number(stats[key]) * (1 + weapon * 0.05);
        }
    }
    if (armor && domain === "tank") {
        stats.armor_value = number(stats.armor_value) * (1 + armor * 0.05);
        stats.maximum_speed = number(stats.maximum_speed) * Math.max(0.5, 1 - armor * 0.02);
    }
}

export function addStats(target, addition) {
    for (const [key, value] of Object.entries(addition || {})) {
        if (typeof value !== "number") continue;
        target[key] = number(target[key]) + value;
    }
}

export function applyModifierList(stats, modifiers = []) {
    for (const modifier of modifiers || []) {
        const key = modifier.stat;
        if (!key) continue;
        const current = number(stats[key]);
        if (modifier.mode === "multiply") {
            stats[key] = current * (1 + number(modifier.value));
        } else {
            stats[key] = current + number(modifier.value);
        }
    }
}

export function availableModules(allModules, domain, slot, baseItem) {
    return (allModules[domain] || []).filter((module) => {
        const slots = module.slots || [];
        const types = module.allowedTypes || [];
        return (!slot || slots.includes(slot)) && (!types.length || types.includes(baseItem.type));
    });
}

export function getStatValue(item, key) {
    if (key === "year") return item.year || 0;
    return number(item.stats?.[key]);
}

export function formatNumber(value) {
    if (value === undefined || value === null || value === "") return "-";
    if (typeof value === "string") return value;
    if (Number.isInteger(value)) return String(value);
    return value.toFixed(2).replace(/\.?0+$/, "");
}

export function formatResources(resources) {
    const entries = Object.entries(resources || {}).filter(([, value]) => Number(value) !== 0);
    if (!entries.length) return "-";
    return entries.map(([key, value]) => `${key} ${formatNumber(value)}`).join(", ");
}

export function matchSearch(item, query) {
    if (!query) return true;
    const haystack = [
        item.id,
        item.nameKo,
        item.nameEn,
        item.type,
        item.year,
        item.category
    ].join(" ").toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
}

export function number(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function mergeResources(target, addition) {
    for (const [key, value] of Object.entries(addition || {})) {
        target[key] = number(target[key]) + number(value);
    }
}

function deepClone(value) {
    return JSON.parse(JSON.stringify(value || {}));
}
