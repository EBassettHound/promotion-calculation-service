import { PoolClient } from "pg";
import { CalculationResult } from "../domain/types";
import { pool } from "./pool";

export class AuditRepository {
  async saveCalculation(customerId: string, result: CalculationResult): Promise<void> {
    const client: PoolClient = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO calculation_requests
         (id, customer_id, cart_subtotal_cents, total_discount_cents, final_total_cents)
         VALUES ($1, $2, $3, $4, $5)`,
        [result.calculationId, customerId, result.cartSubtotalCents, result.totalDiscountCents, result.finalTotalCents]
      );

      for (const evaluation of result.evaluations) {
        await client.query(
          `INSERT INTO promotion_evaluations
           (calculation_id, promotion_id, promotion_name, outcome, discount_amount_cents, reason, priority, target_sku)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [result.calculationId, evaluation.promotionId, evaluation.promotionName, evaluation.outcome,
            evaluation.discountAmountCents, evaluation.reason, evaluation.priority, evaluation.targetSku ?? null]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
