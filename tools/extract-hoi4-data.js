import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultGamePath = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV";
const gamePath = process.argv[2] || process.env.HOI4_PATH || defaultGamePath;
const outDir = path.join(projectRoot, "data", "vanilla");

const statAliases = new Map([
    ["soft_attack", "soft_attack"],
    ["hard_attack", "hard_attack"],
    ["ap_attack", "piercing"],
    ["piercing", "piercing"],
    ["breakthrough", "breakthrough"],
    ["armor_value", "armor_value"],
    ["armor", "armor_value"],
    ["maximum_speed", "maximum_speed"],
    ["max_speed", "maximum_speed"],
    ["reliability", "reliability"],
    ["build_cost_ic", "build_cost_ic"],
    ["fuel_consumption", "fuel_consumption"],
    ["supply_consumption", "supply_consumption"],
    ["air_attack", "air_attack"],
    ["air_defence", "air_defence"],
    ["air_defense", "air_defence"],
    ["agility", "agility"],
    ["range", "range"],
    ["naval_attack", "naval_attack"],
    ["strategic_attack", "strategic_attack"],
    ["light_attack", "light_attack"],
    ["heavy_attack", "heavy_attack"],
    ["torpedo_attack", "torpedo_attack"],
    ["anti_air_attack", "anti_air_attack"],
    ["surface_detection", "surface_detection"],
    ["sub_detection", "sub_detection"],
    ["surface_visibility", "surface_visibility"],
    ["sub_visibility", "sub_visibility"]
]);

const resourceKeys = new Set(["steel", "aluminium", "rubber", "tungsten", "chromium"]);

main();

function main() {
    if (!fs.existsSync(gamePath)) {
        console.error(`HoI4 path not found: ${gamePath}`);
        process.exitCode = 1;
        return;
    }

    const localisation = loadLocalisation(gamePath);
    const equipmentObjects = readHoiObjects(path.join(gamePath, "common", "units", "equipment"));
    const moduleObjects = readHoiObjects(path.join(gamePath, "common", "units", "equipment", "modules"));
    const ideaObjects = readHoiObjects(path.join(gamePath, "common", "ideas"));

    const equipment = normalizeEquipment(equipmentObjects, localisation);
    const modules = normalizeModules(moduleObjects, localisation);
    const modifiers = normalizeModifiers(ideaObjects, localisation);
    const presets = buildGeneratedPresets(equipment, modules);

    fs.mkdirSync(outDir, { recursive: true });
    writeJson("meta", {
        generatedAt: new Date().toISOString(),
        source: "hoi4-game-files",
        gamePath,
        counts: {
            tanks: equipment.tank.length,
            aircraft: equipment.aircraft.length,
            ships: equipment.ship.length,
            tankModules: modules.tank.length,
            aircraftModules: modules.aircraft.length,
            shipModules: modules.ship.length
        },
        notes: [
            "DLC 패키지 병합 전 바닐라 common/localisation 파일 기준입니다.",
            "게임 내부 전용 수식과 hidden modifier는 완전 재현이 어려워 추출 가능한 숫자 스탯을 우선 정규화합니다."
        ]
    });
    writeJson("tanks", { items: equipment.tank });
    writeJson("aircraft", { items: equipment.aircraft });
    writeJson("ships", { items: equipment.ship });
    writeJson("modules", modules);
    writeJson("modifiers", modifiers);
    writeJson("presets", presets);

    console.log(`Extracted HoI4 data to ${outDir}`);
}

function readHoiObjects(root) {
    if (!fs.existsSync(root)) return [];
    const files = listFiles(root).filter((file) => file.endsWith(".txt"));
    const objects = [];

    for (const file of files) {
        const parsed = parseHoiScript(fs.readFileSync(file, "utf8"));
        for (const [id, value] of Object.entries(parsed)) {
            if (isPlainObject(value)) objects.push({ id, value, source: path.relative(gamePath, file) });
        }
    }
    return objects;
}

function listFiles(root) {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    return entries.flatMap((entry) => {
        const fullPath = path.join(root, entry.name);
        return entry.isDirectory() ? listFiles(fullPath) : [fullPath];
    });
}

function normalizeEquipment(objects, localisation) {
    const grouped = { tank: [], aircraft: [], ship: [] };

    for (const object of objects) {
        const domain = classifyDomain(object.id, object.value);
        if (!domain) continue;
        grouped[domain].push({
            id: object.id,
            domain,
            type: normalizeType(object.id, object.value, domain),
            category: object.value.archetype || object.value.type || "equipment",
            year: readYear(object.id, object.value),
            nameKo: localize(object.id, "ko", localisation),
            nameEn: localize(object.id, "en", localisation),
            stats: collectStats(object.value),
            resources: collectResources(object.value),
            source: object.source
        });
    }

    for (const list of Object.values(grouped)) {
        list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.id.localeCompare(b.id));
    }

    return grouped;
}

function normalizeModules(objects, localisation) {
    const grouped = { tank: [], aircraft: [], ship: [] };

    for (const object of objects) {
        const category = String(object.value.module_category || object.value.category || object.id);
        const domain = classifyModuleDomain(object.id, category);
        if (!domain) continue;
        grouped[domain].push({
            id: object.id,
            nameKo: localize(object.id, "ko", localisation),
            nameEn: localize(object.id, "en", localisation),
            slots: inferSlots(domain, object.id, category),
            allowedTypes: inferAllowedTypes(domain, object.id, object.value),
            stats: collectStats(object.value),
            resources: collectResources(object.value),
            source: object.source
        });
    }

    return grouped;
}

function normalizeModifiers(objects, localisation) {
    const designers = [
        { id: "none", nameKo: "설계사 없음", nameEn: "No Designer", domain: null, modifiers: [] }
    ];
    const countries = [
        { id: "none", nameKo: "국가 보너스 없음", nameEn: "No Country Bonus", modifiers: [] }
    ];

    for (const object of objects) {
        const id = object.id;
        if (!/designer|manufacturer|concern|company/i.test(id)) continue;
        const domain = /tank|armor/i.test(id) ? "tank" : /air|plane/i.test(id) ? "aircraft" : /naval|ship/i.test(id) ? "ship" : null;
        designers.push({
            id,
            nameKo: localize(id, "ko", localisation),
            nameEn: localize(id, "en", localisation),
            domain,
            modifiers: statsToModifiers(collectStats(object.value)),
            source: object.source
        });
    }

    return {
        countries,
        designers,
        doctrines: [
            { id: "none", nameKo: "교리 없음", nameEn: "No Doctrine", modifiers: [] }
        ]
    };
}

function buildGeneratedPresets(equipment, modules) {
    return {
        tank: buildPreset("tank", equipment.tank, modules.tank),
        aircraft: buildPreset("aircraft", equipment.aircraft, modules.aircraft),
        ship: buildPreset("ship", equipment.ship, modules.ship)
    };
}

function buildPreset(domain, items, modules) {
    const base = items.find((item) => item.year >= 1936) || items[0];
    if (!base) return [];
    const moduleBySlot = {};
    for (const module of modules) {
        for (const slot of module.slots || []) {
            if (!moduleBySlot[slot]) moduleBySlot[slot] = module.id;
        }
    }
    return [{
        id: `${domain}_generated_balanced_preset`,
        nameKo: `자동 추천 ${base.nameKo}`,
        nameEn: `Generated Balanced ${base.nameEn}`,
        baseId: base.id,
        modulesBySlot: moduleBySlot
    }];
}

function parseHoiScript(text) {
    const tokens = tokenize(text);
    let index = 0;
    const root = {};

    while (index < tokens.length) {
        const key = tokens[index++];
        if (tokens[index] !== "=") continue;
        index++;
        root[key] = parseValue();
    }

    return root;

    function parseValue() {
        if (tokens[index] === "{") return parseBlock();
        return atom(tokens[index++]);
    }

    function parseBlock() {
        index++;
        const values = [];
        const object = {};
        let hasAssignments = false;

        while (index < tokens.length && tokens[index] !== "}") {
            const token = tokens[index++];
            if (tokens[index] === "=") {
                index++;
                hasAssignments = true;
                const value = parseValue();
                if (object[token] === undefined) object[token] = value;
                else if (Array.isArray(object[token])) object[token].push(value);
                else object[token] = [object[token], value];
            } else {
                values.push(atom(token));
            }
        }

        index++;
        if (hasAssignments && values.length) object._values = values;
        return hasAssignments ? object : values;
    }
}

function tokenize(text) {
    const withoutComments = text.replace(/#.*$/gm, "");
    const tokens = [];
    const regex = /"([^"\\]*(?:\\.[^"\\]*)*)"|([{}=])|([^\s{}=]+)/g;
    let match;
    while ((match = regex.exec(withoutComments))) {
        tokens.push(match[1] ?? match[2] ?? match[3]);
    }
    return tokens;
}

function atom(token) {
    if (token === undefined) return "";
    if (/^-?\d+(\.\d+)?$/.test(token)) return Number(token);
    if (token === "yes") return true;
    if (token === "no") return false;
    return token;
}

function loadLocalisation(root) {
    const locRoot = path.join(root, "localisation");
    const result = { ko: {}, en: {} };
    if (!fs.existsSync(locRoot)) return result;

    for (const file of listFiles(locRoot).filter((item) => item.endsWith(".yml"))) {
        const normalized = file.toLowerCase();
        const lang = normalized.includes("korean") ? "ko" : normalized.includes("english") ? "en" : null;
        if (!lang) continue;
        const text = fs.readFileSync(file, "utf8");
        for (const line of text.split(/\r?\n/)) {
            const match = line.match(/^\s*([A-Za-z0-9_.:-]+):\d?\s+"(.*)"\s*$/);
            if (match) result[lang][match[1]] = match[2].replace(/\\"/g, "\"");
        }
    }
    return result;
}

function localize(id, lang, localisation) {
    return localisation[lang][id] || localisation[lang][`${id}_desc`] || id;
}

function classifyDomain(id, value) {
    const haystack = `${id} ${value.type || ""} ${value.archetype || ""}`.toLowerCase();
    if (/tank|armor|armour/.test(haystack)) return "tank";
    if (/plane|airframe|fighter|bomber|cas|cv_nav_bomber|scout_plane|transport_plane/.test(haystack)) return "aircraft";
    if (/ship|destroyer|cruiser|battleship|carrier|submarine/.test(haystack)) return "ship";
    return null;
}

function classifyModuleDomain(id, category) {
    const haystack = `${id} ${category}`.toLowerCase();
    if (haystack.includes("tank")) return "tank";
    if (/air|plane|weapon_slot|engine_type_slot/.test(haystack)) return "aircraft";
    if (/ship|naval|battery|torpedo|sonar/.test(haystack)) return "ship";
    return null;
}

function normalizeType(id, value, domain) {
    const text = `${id} ${value.type || ""} ${value.archetype || ""}`.toLowerCase();
    if (domain === "tank") {
        if (text.includes("modern")) return "modern_tank";
        if (text.includes("super_heavy")) return "super_heavy_tank";
        if (text.includes("heavy")) return "heavy_tank";
        if (text.includes("medium")) return "medium_tank";
        if (text.includes("light")) return "light_tank";
    }
    if (domain === "aircraft") {
        if (text.includes("large")) return "large_airframe";
        if (text.includes("medium")) return "medium_airframe";
        if (text.includes("cv_")) return "carrier_airframe";
        return "small_airframe";
    }
    if (domain === "ship") {
        if (text.includes("submarine")) return "submarine";
        if (text.includes("carrier")) return "carrier";
        if (text.includes("battleship")) return "battleship";
        if (text.includes("heavy_cruiser")) return "heavy_cruiser";
        if (text.includes("cruiser")) return "light_cruiser";
        if (text.includes("destroyer")) return "destroyer";
    }
    return value.type || value.archetype || domain;
}

function readYear(id, value) {
    if (typeof value.year === "number") return value.year;
    const match = id.match(/(19[2-5]\d|gw|basic|improved|advanced|modern)/i);
    if (!match) return null;
    const token = match[1].toLowerCase();
    const aliases = { gw: 1934, basic: 1936, improved: 1940, advanced: 1944, modern: 1945 };
    return aliases[token] || Number(token);
}

function collectStats(value) {
    const stats = {};
    visit(value);
    return stats;

    function visit(node) {
        if (!isPlainObject(node)) return;
        for (const [key, raw] of Object.entries(node)) {
            const mapped = statAliases.get(key);
            if (mapped && typeof raw === "number") stats[mapped] = (stats[mapped] || 0) + raw;
            if (["add_stats", "add_average_stats", "multiply_stats"].includes(key) || isPlainObject(raw)) visit(raw);
        }
    }
}

function collectResources(value) {
    const resources = {};
    const sources = [value.resources, value.lend_lease_cost, value];
    for (const source of sources) {
        if (!isPlainObject(source)) continue;
        for (const [key, raw] of Object.entries(source)) {
            if (resourceKeys.has(key) && typeof raw === "number") resources[key] = (resources[key] || 0) + raw;
        }
    }
    return resources;
}

function inferSlots(domain, id, category) {
    const text = `${id} ${category}`.toLowerCase();
    if (domain === "tank") {
        if (/cannon|gun|flame|howitzer/.test(text)) return ["main_armament"];
        if (text.includes("turret")) return ["turret"];
        if (text.includes("suspension")) return ["suspension"];
        if (text.includes("engine")) return ["engine_type"];
        if (text.includes("armor") || text.includes("armour")) return ["armor_type"];
        return ["special_1", "special_2", "special_3", "special_4"];
    }
    if (domain === "aircraft") {
        if (/engine/.test(text)) return ["engine_type_slot"];
        if (/bomb|torpedo|gun|cannon|mg|weapon/.test(text)) return ["fixed_main_weapon_slot", "fixed_auxiliary_weapon_slot_1", "fixed_auxiliary_weapon_slot_2"];
        return ["special_type_slot_1", "special_type_slot_2", "special_type_slot_3"];
    }
    if (domain === "ship") {
        if (/engine/.test(text)) return ["fixed_ship_engine_slot"];
        if (/armor|armour/.test(text)) return ["fixed_ship_armor_slot"];
        if (/radar/.test(text)) return ["fixed_ship_radar_slot"];
        if (/fire_control/.test(text)) return ["fixed_ship_fire_control_system_slot"];
        if (/anti_air|aa/.test(text)) return ["fixed_ship_anti_air_slot", "mid_1_custom_slot", "mid_2_custom_slot"];
        if (/battery|gun/.test(text)) return ["fixed_ship_battery_slot", "mid_1_custom_slot", "mid_2_custom_slot", "rear_1_custom_slot"];
        return ["mid_1_custom_slot", "mid_2_custom_slot", "rear_1_custom_slot"];
    }
    return [];
}

function inferAllowedTypes(domain, id, value) {
    const text = `${id} ${JSON.stringify(value)}`.toLowerCase();
    if (domain === "tank") {
        const types = [];
        if (text.includes("light")) types.push("light_tank");
        if (text.includes("medium")) types.push("medium_tank");
        if (text.includes("heavy")) types.push("heavy_tank");
        return types;
    }
    if (domain === "aircraft") {
        if (text.includes("large")) return ["large_airframe"];
        if (text.includes("medium")) return ["medium_airframe"];
        return [];
    }
    if (domain === "ship") {
        const types = [];
        for (const type of ["destroyer", "light_cruiser", "heavy_cruiser", "battleship", "carrier", "submarine"]) {
            if (text.includes(type)) types.push(type);
        }
        return types;
    }
    return [];
}

function statsToModifiers(stats) {
    return Object.entries(stats).map(([stat, value]) => ({
        stat,
        mode: Math.abs(value) < 1 ? "multiply" : "add",
        value
    }));
}

function writeJson(name, data) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
