import { getSupabase } from "../clients/supabase.client.js";
import type { ReorderBatchRow } from "./reorder-fulfillment.repo.js";
import type { ReorderFcUnitRow } from "./reorder-consumer.repo.js";

function throwIfError(error: unknown) { if (error) throw error; }

export async function createBatch(input: { customerId: number; allocationId: string; batchCode: string; label: string; quantity: number; shipTo: string | null }) {
  const { data, error } = await getSupabase().rpc("create_reorder_fc_batch", {
    p_customer_id: input.customerId, p_product_allocation_id: input.allocationId,
    p_batch_code: input.batchCode, p_label: input.label, p_quantity: input.quantity, p_ship_to: input.shipTo,
  });
  throwIfError(error); return data as ReorderBatchRow;
}

export async function assignFcUnits(input: { customerId: number; batchId: string; fcIds: string[]; source: "generated" | "imported"; importKey: string }) {
  const { data, error } = await getSupabase().rpc("assign_reorder_fc_units", {
    p_customer_id: input.customerId, p_batch_id: input.batchId, p_fc_ids: input.fcIds,
    p_source: input.source, p_import_key: input.importKey,
  });
  throwIfError(error); return (data ?? []) as ReorderFcUnitRow[];
}

export async function updateProduction(input: { customerId: number; batchId: string; status: string; qaStatus: string | null; nfcWriteStatus: string | null }) {
  const { data, error } = await getSupabase().rpc("update_reorder_batch_production", {
    p_customer_id: input.customerId, p_batch_id: input.batchId, p_status: input.status,
    p_qa_status: input.qaStatus, p_nfc_write_status: input.nfcWriteStatus,
  });
  throwIfError(error); return data as ReorderBatchRow;
}

export async function updateShipment(input: { customerId: number; batchId: string; status: string; quantityShipped: number; shipTo: string | null; carrier: string | null; trackingReference: string | null; shippedAt: string | null; deliveredAt: string | null }) {
  const { data, error } = await getSupabase().rpc("update_reorder_batch_shipment", {
    p_customer_id: input.customerId, p_batch_id: input.batchId, p_status: input.status,
    p_quantity_shipped: input.quantityShipped, p_ship_to: input.shipTo, p_carrier: input.carrier,
    p_tracking_reference: input.trackingReference, p_shipped_at: input.shippedAt, p_delivered_at: input.deliveredAt,
  });
  throwIfError(error); return data as ReorderBatchRow;
}

