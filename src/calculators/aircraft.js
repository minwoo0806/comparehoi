import { calculateEquipment } from "./common.js";

export function calculateAircraft(baseItem, modules, context) {
    return calculateEquipment(baseItem, modules, {
        ...context,
        id: context.id || `${baseItem.id}-aircraft-design`,
        name: context.name || `${baseItem.nameKo || baseItem.id} 설계`
    });
}
