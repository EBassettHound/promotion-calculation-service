import Ajv, { JSONSchemaType } from "ajv";
import { CalculateRequest } from "../domain/types";

const ajv = new Ajv({ allErrors: true, strict: true });

const calculateRequestSchema: JSONSchemaType<CalculateRequest> = {
  type: "object",
  additionalProperties: false,
  properties: {
    customer: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "string", minLength: 1, maxLength: 100 },
        tier: { type: "string", nullable: true, maxLength: 50 },
        attributes: {
  type: "object",
  nullable: true,
  required: [],
  additionalProperties: {
    anyOf: [
      { type: "string" },
      { type: "number" },
      { type: "boolean" }
    ]
  }
}
      },
      required: ["id"]
    },
    items: {
      type: "array",
      minItems: 1,
      maxItems: 200,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          sku: { type: "string", minLength: 1, maxLength: 100 },
          quantity: { type: "integer", minimum: 1, maximum: 10000 },
          unitPriceCents: { type: "integer", minimum: 0, maximum: 100000000 },
          category: { type: "string", nullable: true, maxLength: 100 }
        },
        required: ["sku", "quantity", "unitPriceCents"]
      }
    },
    cartSubtotalCents: { type: "integer", minimum: 0, maximum: 1000000000 }
  },
  required: ["customer", "items", "cartSubtotalCents"]
};

export const validateCalculateRequest = ajv.compile(calculateRequestSchema);
