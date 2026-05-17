const DATASET_ROOTS = {
    vanilla: "data/vanilla",
    dlc: "data/dlc"
};

const FILES = [
    "meta",
    "tanks",
    "aircraft",
    "ships",
    "modules",
    "modifiers",
    "presets"
];

export async function loadDataset(dataset = "vanilla") {
    const root = DATASET_ROOTS[dataset] || DATASET_ROOTS.vanilla;
    const entries = await Promise.all(
        FILES.map(async (name) => [name, await fetchJson(`${root}/${name}.json`, fallbackFor(name))])
    );
    const data = Object.fromEntries(entries);
    return normalizeDataset(data, dataset);
}

async function fetchJson(path, fallback) {
    try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
        return await response.json();
    } catch (error) {
        console.warn(`Using fallback for ${path}:`, error);
        return fallback;
    }
}

function normalizeDataset(data, dataset) {
    return {
        dataset,
        meta: data.meta,
        equipment: {
            tank: data.tanks.items || [],
            aircraft: data.aircraft.items || [],
            ship: data.ships.items || []
        },
        modules: data.modules,
        modifiers: data.modifiers,
        presets: data.presets
    };
}

function fallbackFor(name) {
    const fallbacks = {
        meta: {
            generatedAt: null,
            source: "fallback",
            gamePath: null,
            warning: "파서 데이터가 없어서 내장 샘플을 사용 중입니다."
        },
        tanks: { items: [] },
        aircraft: { items: [] },
        ships: { items: [] },
        modules: { tank: [], aircraft: [], ship: [] },
        modifiers: { countries: [], designers: [], doctrines: [] },
        presets: { tank: [], aircraft: [], ship: [] }
    };
    return fallbacks[name];
}
