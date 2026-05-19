import { calculateEquipment } from "./common.js";

export function calculateTank(baseItem, modules, context) {
    return calculateEquipment(baseItem, modules, {
        ...context,
        id: context.id || `${baseItem.id}-tank-design`,
        name: context.name || `${baseItem.nameKo || baseItem.id} 설계`
    });
}
