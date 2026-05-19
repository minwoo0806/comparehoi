import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");
const defaultGamePath = "C:\\Program Files (x86)\\Steam\\steamapps\\common\\Hearts of Iron IV";
const gamePath = process.argv[2] || process.env.HOI4_PATH || defaultGamePath;
const vanillaOutDir = path.join(projectRoot, "data", "vanilla");
const dlcOutDir = path.join(projectRoot, "data", "dlc");

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
    ["air_agility", "agility"],
    ["range", "range"],
    ["air_range", "range"],
    ["naval_attack", "naval_attack"],
    ["naval_strike_attack", "naval_attack"],
    ["naval_strike_targetting", "naval_targeting"],
    ["strategic_attack", "strategic_attack"],
    ["air_bombing", "strategic_attack"],
    ["air_ground_attack", "soft_attack"],
    ["light_attack", "light_attack"],
    ["lg_attack", "light_attack"],
    ["heavy_attack", "heavy_attack"],
    ["hg_attack", "heavy_attack"],
    ["torpedo_attack", "torpedo_attack"],
    ["anti_air_attack", "anti_air_attack"],
    ["naval_speed", "maximum_speed"],
    ["max_strength", "max_strength"],
    ["carrier_size", "carrier_size"],
    ["surface_detection", "surface_detection"],
    ["sub_detection", "sub_detection"],
    ["sub_attack", "sub_attack"],
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

    const sourceRoots = sourceRootsFor(gamePath);
    const localisation = mergeLocalisations(sourceRoots.map(loadLocalisation));
    const equipmentObjects = sourceRoots.flatMap((root) => readHoiObjects(path.join(root, "common", "units", "equipment"), ["equipments"]));
    const moduleObjects = sourceRoots.flatMap((root) => readHoiObjects(path.join(root, "common", "units", "equipment", "modules"), ["equipment_modules"]));
    const ideaObjects = sourceRoots.flatMap((root) => readHoiObjects(path.join(root, "common", "ideas"), ["ideas"], true));

    const equipment = normalizeEquipment(equipmentObjects, localisation);
    const modules = normalizeModules(moduleObjects, localisation);
    applyDefaultModuleStats(equipment, modules);
    const modifiers = normalizeModifiers(ideaObjects, localisation);
    const presets = buildGeneratedPresets(equipment, modules);

    const vanillaEquipment = filterVanillaEquipment(equipment);
    const vanillaModules = { tank: [], aircraft: [], ship: [] };
    const vanillaPresets = { tank: [], aircraft: [], ship: [] };

    writeDataset(vanillaOutDir, {
        meta: metaFor("hoi4-game-files-vanilla", "variant", vanillaEquipment, vanillaModules, [
            "설치된 HoI4 파일에서 DLC 설계기 차체/모듈을 제외한 바닐라 장비만 추출했습니다.",
            "무료 DLC 폴더형 common/localisation 파일은 함께 읽되, No Step Back/By Blood Alone/Man the Guns 설계 모듈은 Vanilla 데이터셋에서 제외합니다."
        ]),
        equipment: vanillaEquipment,
        modules: vanillaModules,
        modifiers,
        presets: vanillaPresets
    });

    writeDataset(dlcOutDir, {
        meta: metaFor("hoi4-game-files-full-dlc", "module", equipment, modules, [
            "설치 폴더와 폴더형 DLC의 common/localisation 파일 기준입니다.",
            "게임 내부 전용 수식과 hidden modifier는 완전 재현이 어려워 추출 가능한 숫자 스탯을 우선 정규화합니다."
        ]),
        equipment,
        modules,
        modifiers,
        presets
    });

    console.log(`Extracted HoI4 data to ${vanillaOutDir} and ${dlcOutDir}`);
}

function metaFor(source, designerMode, equipment, modules, notes) {
    return {
        generatedAt: new Date().toISOString(),
        source,
        gamePath,
        designerMode,
        counts: {
            tanks: equipment.tank.length,
            aircraft: equipment.aircraft.length,
            ships: equipment.ship.length,
            tankModules: modules.tank.length,
            aircraftModules: modules.aircraft.length,
            shipModules: modules.ship.length
        },
        notes
    };
}

function writeDataset(outDir, dataset) {
    fs.mkdirSync(outDir, { recursive: true });
    writeJson(outDir, "meta", dataset.meta);
    writeJson(outDir, "tanks", { items: dataset.equipment.tank });
    writeJson(outDir, "aircraft", { items: dataset.equipment.aircraft });
    writeJson(outDir, "ships", { items: dataset.equipment.ship });
    writeJson(outDir, "modules", dataset.modules);
    writeJson(outDir, "modifiers", dataset.modifiers);
    writeJson(outDir, "presets", dataset.presets);
}

function sourceRootsFor(root) {
    const roots = [root];
    const dlcRoot = path.join(root, "dlc");
    if (!fs.existsSync(dlcRoot)) return roots;
    for (const entry of fs.readdirSync(dlcRoot, { withFileTypes: true })) {
        const dlcPath = path.join(dlcRoot, entry.name);
        if (entry.isDirectory() && fs.existsSync(path.join(dlcPath, "common"))) roots.push(dlcPath);
    }
    return roots;
}

function readHoiObjects(root, wrappers = [], deep = false) {
    if (!fs.existsSync(root)) return [];
    const files = listFiles(root).filter((file) => file.endsWith(".txt"));
    const objects = [];

    for (const file of files) {
        const parsed = parseHoiScript(fs.readFileSync(file, "utf8"));
        const source = path.relative(gamePath, file);
        const containers = wrappers.length
            ? wrappers.flatMap((wrapper) => Array.isArray(parsed[wrapper]) ? parsed[wrapper] : [parsed[wrapper]]).filter(isPlainObject)
            : [parsed];
        for (const container of containers) {
            if (deep) collectDeepObjects(container, source, objects);
            else {
                for (const [id, value] of Object.entries(container)) {
                    if (isPlainObject(value)) objects.push({ id, value, source });
                }
            }
        }
    }
    return objects;
}

function collectDeepObjects(node, source, objects) {
    for (const [id, value] of Object.entries(node || {})) {
        if (!isPlainObject(value)) continue;
        objects.push({ id, value, source });
        collectDeepObjects(value, source, objects);
    }
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
            parentId: object.value.parent || object.value.archetype || null,
            defaultModules: collectDefaultModules(object.value),
            year: readYear(object.id, object.value),
            nameKo: localize(object.id, "ko", localisation),
            nameEn: localize(object.id, "en", localisation),
            stats: collectStats(object.value),
            resources: collectResources(object.value),
            source: object.source
        });
    }

    for (const list of Object.values(grouped)) {
        inheritEquipmentStats(list);
        list.sort((a, b) => (a.year || 9999) - (b.year || 9999) || a.id.localeCompare(b.id));
    }

    return grouped;
}

function collectDefaultModules(value) {
    const slots = value.default_modules || value.module_slots;
    if (!isPlainObject(slots)) return [];
    const modules = [];
    visit(slots);
    return [...new Set(modules)];

    function visit(node) {
        if (typeof node === "string") {
            if (!["empty", "inherit"].includes(node) && !node.endsWith("_slot")) modules.push(node);
            return;
        }
        if (Array.isArray(node)) {
            for (const value of node) visit(value);
            return;
        }
        if (isPlainObject(node)) {
            for (const value of Object.values(node)) visit(value);
        }
    }
}

function applyDefaultModuleStats(equipment, modules) {
    for (const domain of Object.keys(equipment)) {
        const moduleById = new Map((modules[domain] || []).map((module) => [module.id, module]));
        for (const item of equipment[domain]) {
            for (const moduleId of item.defaultModules || []) {
                const module = moduleById.get(moduleId);
                if (!module) continue;
                mergeNumberStats(item.stats, module.stats);
                for (const modifier of module.modifiers || []) {
                    const current = Number(item.stats[modifier.stat]) || 0;
                    item.stats[modifier.stat] = modifier.mode === "multiply"
                        ? current * (1 + Number(modifier.value || 0))
                        : current + Number(modifier.value || 0);
                }
                item.resources = mergeNumberStats({ ...(item.resources || {}) }, module.resources);
            }
        }
    }
}

function mergeNumberStats(target, addition = {}) {
    for (const [key, value] of Object.entries(addition || {})) {
        if (typeof value === "number") target[key] = (Number(target[key]) || 0) + value;
    }
    return target;
}

function inheritEquipmentStats(list) {
    const byId = new Map(list.map((item) => [item.id, item]));
    const resolving = new Set();

    for (const item of list) resolve(item);

    function resolve(item) {
        if (!item || item._resolved) return item;
        if (resolving.has(item.id)) return item;
        resolving.add(item.id);

        const parent = byId.get(item.parentId) || byId.get(item.category);
        if (parent && parent !== item) {
            resolve(parent);
            item.stats = { ...(parent.stats || {}), ...(item.stats || {}) };
            item.resources = { ...(parent.resources || {}), ...(item.resources || {}) };
            item.year ||= parent.year;
        }

        item._resolved = true;
        delete item._resolved;
        resolving.delete(item.id);
        return item;
    }
}

function filterVanillaEquipment(equipment) {
    return {
        tank: equipment.tank.filter((item) => isVanillaTankEquipment(item) && hasStats(item)),
        aircraft: equipment.aircraft.filter((item) => isVanillaAircraftEquipment(item) && hasStats(item)),
        ship: equipment.ship.filter((item) => isVanillaShipEquipment(item) && hasStats(item))
    };
}

function hasStats(item) {
    return Object.keys(item.stats || {}).length > 0;
}

function isVanillaTankEquipment(item) {
    const id = item.id || "";
    if (id.includes("_chassis")) return false;
    if (id === "gw_tank_equipment") return true;
    if (/^(light|medium|heavy)_tank_equipment_\d+$/.test(id)) return true;
    if (/^(light|medium|heavy)_tank_(aa|artillery|destroyer)_equipment_\d+$/.test(id)) return true;
    if (/^modern_tank_(aa_|artillery_|destroyer_)?equipment_1$/.test(id)) return true;
    if (/^super_heavy_tank_(aa_|artillery_|destroyer_)?equipment_1$/.test(id)) return true;
    if (/^amphibious_tank_equipment_\d+$/.test(id)) return true;
    if (/^armored_car(_at)?_equipment(_\d+)?$/.test(id) || /^gw_armored_car_equipment$/.test(id)) return true;
    return false;
}

function isVanillaAircraftEquipment(item) {
    const id = item.id || "";
    if (id.includes("airframe")) return false;
    return /(fighter|cv_fighter|heavy_fighter|cas|cv_CAS|nav_bomber|cv_nav_bomber|tac_bomber|strat_bomber|jet|rocket_interceptor|scout_plane|transport_plane|guided_missile)/i.test(id);
}

function isVanillaShipEquipment(item) {
    const id = item.id || "";
    if (id.includes("ship_hull")) return false;
    return /^(destroyer|light_cruiser|heavy_cruiser|battleship|battle_cruiser|carrier|submarine|SH_battleship)_\d+$/.test(id);
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
            stats: collectStats(object.value.add_stats || object.value.add_average_stats || object.value),
            modifiers: statsToMultipliers(object.value.multiply_stats),
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
    const countries = countryList();

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
        designers: mergeDesigners(designers, curatedDesigners()),
        doctrines: doctrineList()
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
        const value = parseValue();
        if (root[key] === undefined) root[key] = value;
        else if (Array.isArray(root[key])) root[key].push(value);
        else root[key] = [root[key], value];
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

function mergeLocalisations(localisations) {
    return localisations.reduce((merged, current) => ({
        ko: { ...merged.ko, ...current.ko },
        en: { ...merged.en, ...current.en }
    }), { ko: {}, en: {} });
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
    if (/plane|air|fighter|cas|nav_bomber|bomber|weapon_slot|engine_type_slot/.test(haystack)) return "aircraft";
    if (/ship|naval|battery|torpedo|sonar/.test(haystack)) return "ship";
    if (haystack.includes("tank")) return "tank";
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
            if (["add_stats", "add_average_stats"].includes(key)) visit(raw);
        }
    }
}

function statsToMultipliers(value) {
    if (!isPlainObject(value)) return [];
    return Object.entries(value)
        .map(([stat, raw]) => [statAliases.get(stat) || stat, raw])
        .filter(([, raw]) => typeof raw === "number")
        .map(([stat, raw]) => ({ stat, mode: "multiply", value: raw }));
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
        if (/bomb|torpedo|gun|cannon|mg|weapon/.test(text)) return ["fixed_main_weapon_slot", "fixed_auxiliary_weapon_slot_1", "fixed_auxiliary_weapon_slot_2", "fixed_auxiliary_weapon_slot_3", "fixed_auxiliary_weapon_slot_4", "fixed_auxiliary_weapon_slot_5"];
        return ["special_type_slot_1", "special_type_slot_2", "special_type_slot_3", "special_type_slot_4", "special_type_slot_5"];
    }
    if (domain === "ship") {
        if (/engine/.test(text)) return ["fixed_ship_engine_slot"];
        if (/armor|armour/.test(text)) return ["fixed_ship_armor_slot"];
        if (/radar/.test(text)) return ["fixed_ship_radar_slot"];
        if (/fire_control/.test(text)) return ["fixed_ship_fire_control_system_slot"];
        if (/torpedo/.test(text)) return ["fixed_ship_torpedo_slot", "front_1_custom_slot", "front_2_custom_slot", "mid_1_custom_slot", "mid_2_custom_slot", "mid_3_custom_slot", "rear_1_custom_slot", "rear_2_custom_slot"];
        if (/anti_air|aa/.test(text)) return ["fixed_ship_anti_air_slot", "front_1_custom_slot", "front_2_custom_slot", "mid_1_custom_slot", "mid_2_custom_slot", "mid_3_custom_slot", "rear_1_custom_slot", "rear_2_custom_slot"];
        if (/battery|gun|depth_charge|mine|catapult|hangar/.test(text)) return ["fixed_ship_battery_slot", "front_1_custom_slot", "front_2_custom_slot", "mid_1_custom_slot", "mid_2_custom_slot", "mid_3_custom_slot", "rear_1_custom_slot", "rear_2_custom_slot"];
        return ["front_1_custom_slot", "front_2_custom_slot", "mid_1_custom_slot", "mid_2_custom_slot", "mid_3_custom_slot", "rear_1_custom_slot", "rear_2_custom_slot"];
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

function countryList() {
    return [
        { id: "none", nameKo: "국가 선택", nameEn: "Select Country", modifiers: [] },
        { id: "USA", nameKo: "미합중국", nameEn: "United States", modifiers: [] },
        { id: "GER", nameKo: "독일", nameEn: "Germany", modifiers: [] },
        { id: "SOV", nameKo: "소련", nameEn: "Soviet Union", modifiers: [] },
        { id: "ENG", nameKo: "영국", nameEn: "United Kingdom", modifiers: [] },
        { id: "FRA", nameKo: "프랑스", nameEn: "France", modifiers: [] },
        { id: "ITA", nameKo: "이탈리아", nameEn: "Italy", modifiers: [] },
        { id: "JAP", nameKo: "일본", nameEn: "Japan", modifiers: [] }
    ];
}

function doctrineList() {
    return [
        { id: "none", nameKo: "교리 없음", nameEn: "No Doctrine", modifiers: [] },
        { id: "mobile_warfare", domain: "tank", nameKo: "기동전", nameEn: "Mobile Warfare", modifiers: [{ stat: "breakthrough", mode: "multiply", value: 0.1 }] },
        { id: "superior_firepower", domain: "tank", nameKo: "화력 우세", nameEn: "Superior Firepower", modifiers: [{ stat: "soft_attack", mode: "multiply", value: 0.08 }] },
        { id: "battlefield_support", domain: "aircraft", nameKo: "전장지원", nameEn: "Battlefield Support", modifiers: [{ stat: "soft_attack", mode: "multiply", value: 0.08 }] },
        { id: "operational_integrity", domain: "aircraft", nameKo: "작전상의 무결성", nameEn: "Operational Integrity", modifiers: [{ stat: "air_attack", mode: "multiply", value: 0.05 }] },
        { id: "fleet_in_being", domain: "ship", nameKo: "현존함대", nameEn: "Fleet in Being", modifiers: [{ stat: "heavy_attack", mode: "multiply", value: 0.05 }] },
        { id: "trade_interdiction", domain: "ship", nameKo: "무역 차단", nameEn: "Trade Interdiction", modifiers: [{ stat: "sub_visibility", mode: "multiply", value: -0.05 }] }
    ];
}

function mergeDesigners(extracted, curated) {
    const byId = new Map();
    for (const designer of [...extracted, ...curated]) byId.set(designer.id, designer);
    return [...byId.values()];
}

function curatedDesigners() {
    const rows = [
        ["usa_chrysler", "USA", "크라이슬러", "Chrysler", "tank", [{ stat: "reliability", mode: "add", value: 0.05 }]],
        ["usa_ford", "USA", "포드 자동차", "Ford Motor Company", "tank", [{ stat: "build_cost_ic", mode: "multiply", value: -0.04 }]],
        ["usa_buick", "USA", "뷰익", "Buick", "tank", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["usa_north_american", "USA", "노스 아메리칸", "North American Aviation", "aircraft", [{ stat: "range", mode: "multiply", value: 0.1 }]],
        ["usa_grumman", "USA", "그루먼", "Grumman", "aircraft", [{ stat: "air_defence", mode: "multiply", value: 0.05 }, { stat: "reliability", mode: "add", value: 0.02 }]],
        ["usa_lockheed", "USA", "록히드", "Lockheed", "aircraft", [{ stat: "maximum_speed", mode: "multiply", value: 0.05 }]],
        ["usa_norfolk", "USA", "노퍽 해군 조선소", "Norfolk Naval Yard", "ship", [{ stat: "reliability", mode: "add", value: 0.04 }]],
        ["usa_newport_news", "USA", "뉴포트 뉴스 조선", "Newport News Shipbuilding", "ship", [{ stat: "armor_value", mode: "multiply", value: 0.04 }]],
        ["usa_electric_boat", "USA", "일렉트릭 보트", "Electric Boat", "ship", [{ stat: "sub_visibility", mode: "multiply", value: -0.05 }]],
        ["ger_henschel", "GER", "헨셸", "Henschel", "tank", [{ stat: "breakthrough", mode: "multiply", value: 0.05 }]],
        ["ger_man", "GER", "MAN", "MAN", "tank", [{ stat: "maximum_speed", mode: "multiply", value: 0.05 }]],
        ["ger_porsche", "GER", "포르셰", "Porsche", "tank", [{ stat: "armor_value", mode: "multiply", value: 0.05 }, { stat: "reliability", mode: "add", value: -0.02 }]],
        ["ger_messerschmitt", "GER", "메서슈미트", "Messerschmitt", "aircraft", [{ stat: "air_attack", mode: "multiply", value: 0.05 }]],
        ["ger_focke_wulf", "GER", "포케불프", "Focke-Wulf", "aircraft", [{ stat: "agility", mode: "multiply", value: 0.05 }]],
        ["ger_junkers", "GER", "융커스", "Junkers", "aircraft", [{ stat: "soft_attack", mode: "multiply", value: 0.06 }, { stat: "strategic_attack", mode: "multiply", value: 0.04 }]],
        ["ger_blohm_voss", "GER", "블롬 운트 포스", "Blohm & Voss", "ship", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["ger_germaniawerft", "GER", "게르마니아베르프트", "Germaniawerft", "ship", [{ stat: "sub_visibility", mode: "multiply", value: -0.05 }]],
        ["ger_deutsche_werke", "GER", "도이체 베르케", "Deutsche Werke", "ship", [{ stat: "heavy_attack", mode: "multiply", value: 0.05 }]],
        ["sov_morozov", "SOV", "모로조프 설계국", "Morozov Design Bureau", "tank", [{ stat: "build_cost_ic", mode: "multiply", value: -0.04 }]],
        ["sov_kharkiv", "SOV", "하르코프 기관차 공장", "Kharkiv Locomotive Factory", "tank", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["sov_kirov", "SOV", "키로프 공장", "Kirov Plant", "tank", [{ stat: "armor_value", mode: "multiply", value: 0.05 }]],
        ["sov_ilyushin", "SOV", "일류신", "Ilyushin", "aircraft", [{ stat: "soft_attack", mode: "multiply", value: 0.05 }]],
        ["sov_yakovlev", "SOV", "야코블레프", "Yakovlev", "aircraft", [{ stat: "agility", mode: "multiply", value: 0.05 }]],
        ["sov_mikoyan", "SOV", "미코얀-구레비치", "Mikoyan-Gurevich", "aircraft", [{ stat: "maximum_speed", mode: "multiply", value: 0.05 }]],
        ["sov_rubin", "SOV", "루빈 설계국", "Rubin Design Bureau", "ship", [{ stat: "sub_visibility", mode: "multiply", value: -0.05 }]],
        ["sov_black_sea_shipyard", "SOV", "흑해 조선소", "Black Sea Shipyard", "ship", [{ stat: "build_cost_ic", mode: "multiply", value: -0.03 }]],
        ["eng_vickers", "ENG", "비커스-암스트롱", "Vickers-Armstrong", "tank", [{ stat: "armor_value", mode: "multiply", value: 0.04 }]],
        ["eng_leyland", "ENG", "레일랜드", "Leyland", "tank", [{ stat: "build_cost_ic", mode: "multiply", value: -0.03 }]],
        ["eng_supermarine", "ENG", "슈퍼마린", "Supermarine", "aircraft", [{ stat: "agility", mode: "multiply", value: 0.05 }]],
        ["eng_de_havilland", "ENG", "드 하빌랜드", "de Havilland", "aircraft", [{ stat: "range", mode: "multiply", value: 0.08 }]],
        ["eng_avro", "ENG", "아브로", "Avro", "aircraft", [{ stat: "strategic_attack", mode: "multiply", value: 0.06 }]],
        ["eng_john_brown", "ENG", "존 브라운", "John Brown & Company", "ship", [{ stat: "armor_value", mode: "multiply", value: 0.05 }]],
        ["eng_cammell_laird", "ENG", "카멜 레어드", "Cammell Laird", "ship", [{ stat: "anti_air_attack", mode: "multiply", value: 0.05 }]],
        ["fra_renault", "FRA", "르노", "Renault", "tank", [{ stat: "build_cost_ic", mode: "multiply", value: -0.03 }]],
        ["fra_amx", "FRA", "AMX", "AMX", "tank", [{ stat: "armor_value", mode: "multiply", value: 0.04 }]],
        ["fra_hotchkiss", "FRA", "오치키스", "Hotchkiss", "tank", [{ stat: "reliability", mode: "add", value: 0.04 }]],
        ["fra_bloch", "FRA", "블로크", "Bloch", "aircraft", [{ stat: "air_defence", mode: "multiply", value: 0.05 }]],
        ["fra_dewoitine", "FRA", "드부아틴", "Dewoitine", "aircraft", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["fra_breguet", "FRA", "브레게", "Breguet", "aircraft", [{ stat: "range", mode: "multiply", value: 0.08 }]],
        ["fra_acl", "FRA", "루아르 조선소", "Ateliers et Chantiers de la Loire", "ship", [{ stat: "surface_detection", mode: "multiply", value: 0.05 }]],
        ["fra_brest", "FRA", "브레스트 조선소", "Brest Naval Yard", "ship", [{ stat: "heavy_attack", mode: "multiply", value: 0.04 }]],
        ["ita_fiat", "ITA", "피아트", "Fiat", "tank", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["ita_lancia", "ITA", "란치아", "Lancia", "tank", [{ stat: "reliability", mode: "add", value: 0.04 }]],
        ["ita_macchi", "ITA", "마키", "Macchi", "aircraft", [{ stat: "maximum_speed", mode: "multiply", value: 0.05 }]],
        ["ita_reggiane", "ITA", "레자네", "Reggiane", "aircraft", [{ stat: "agility", mode: "multiply", value: 0.05 }]],
        ["ita_savoia_marchetti", "ITA", "사보이아-마르케티", "Savoia-Marchetti", "aircraft", [{ stat: "range", mode: "multiply", value: 0.08 }]],
        ["ita_ansaldo", "ITA", "안살도", "Ansaldo", "ship", [{ stat: "light_attack", mode: "multiply", value: 0.05 }]],
        ["ita_crda", "ITA", "CRDA", "CRDA", "ship", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]],
        ["jap_nissan", "JAP", "닛산", "Nissan", "tank", [{ stat: "reliability", mode: "add", value: 0.04 }]],
        ["jap_osaka", "JAP", "오사카 육군 조병창", "Osaka Army Arsenal", "tank", [{ stat: "build_cost_ic", mode: "multiply", value: -0.03 }]],
        ["jap_mitsubishi", "JAP", "미쓰비시", "Mitsubishi", "aircraft", [{ stat: "naval_attack", mode: "multiply", value: 0.05 }]],
        ["jap_nakajima", "JAP", "나카지마", "Nakajima", "aircraft", [{ stat: "agility", mode: "multiply", value: 0.05 }]],
        ["jap_yokosuka", "JAP", "요코스카 항공기술창", "Yokosuka Naval Air Technical Arsenal", "aircraft", [{ stat: "air_defence", mode: "multiply", value: 0.05 }]],
        ["jap_kure", "JAP", "구레 해군 공창", "Kure Naval Arsenal", "ship", [{ stat: "torpedo_attack", mode: "multiply", value: 0.05 }]],
        ["jap_maizuru", "JAP", "마이즈루 해군 공창", "Maizuru Naval Arsenal", "ship", [{ stat: "maximum_speed", mode: "multiply", value: 0.04 }]]
    ];
    return rows.map(([id, country, nameKo, nameEn, domain, modifiers]) => ({ id, country, nameKo, nameEn, domain, modifiers }));
}

function writeJson(outDir, name, data) {
    fs.writeFileSync(path.join(outDir, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
