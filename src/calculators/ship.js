import { calculateEquipment } from "./common.js";

export function calculateShip(baseItem, modules, context) {
    return calculateEquipment(baseItem, modules, {
        ...context,
        id: context.id || `${baseItem.id}-ship-design`,
        name: context.name || `${baseItem.nameKo || baseItem.id} 설계`
    });
}
