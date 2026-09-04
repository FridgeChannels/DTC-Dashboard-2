import type { MetricEngineInput, ReorderMetricFilter } from "../services/reorder/metric-engine.js";

export interface ReorderMetricRepository {
  loadMetricInput(customerId: number, filter: ReorderMetricFilter): Promise<MetricEngineInput>;
}

export class InMemoryReorderMetricRepository implements ReorderMetricRepository {
  constructor(private readonly input: Omit<MetricEngineInput, "filter">) {}

  async loadMetricInput(_customerId: number, filter: ReorderMetricFilter): Promise<MetricEngineInput> {
    return structuredClone({ ...this.input, filter });
  }
}
