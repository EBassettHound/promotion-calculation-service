import { Promotion } from "./types";

/**
 * Declarative examples required by the assessment.
 * In production these would be loaded from a versioned configuration store.
 */
export const configuredPromotions: Promotion[] = [
  {
    id: "PROMO-BOOT-B3G1",
    name: "Buy 3 boots, get 1 boot free",
    type: "BUY_X_GET_Y_FREE",
    triggerSku: "SKU-BOOT-01",
    triggerQuantity: 3,
    rewardSku: "SKU-BOOT-01",
    priority: 100,
    enabled: true
  },
  {
    id: "PROMO-JACKET-SCARF-GLOVE",
    name: "Buy jacket and scarf, get gloves free",
    type: "BUY_X_AND_Y_GET_Z_FREE",
    triggerSkuX: "SKU-JACKET-02",
    triggerSkuY: "SKU-SCARF-05",
    rewardSku: "SKU-GLOVE-03",
    priority: 90,
    enabled: true
  },
  {
    id: "PROMO-SHOE-SOCK-30",
    name: "Buy 2 shoes, get 30% off socks",
    type: "BUY_X_GET_DISCOUNT_ON_Y",
    triggerSku: "SKU-SHOE-07",
    triggerQuantity: 2,
    targetSku: "SKU-SOCK-12",
    discount: { kind: "PERCENTAGE", value: 30 },
    priority: 80,
    enabled: true
  },
  {
    id: "PROMO-CAMERA-BAG-40",
    name: "Buy camera and lens, get $40 off camera bag",
    type: "BUY_X_AND_Y_GET_DISCOUNT_ON_Z",
    triggerSkuX: "SKU-CAMERA-01",
    triggerSkuY: "SKU-LENS-04",
    targetSku: "SKU-BAG-09",
    discount: { kind: "FIXED", valueCents: 4000 },
    priority: 70,
    enabled: true
  }
];
