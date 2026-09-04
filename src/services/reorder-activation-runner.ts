import { ReorderValidationError } from "../reorder/amazon-url.js";
import { runDueActivationJobs } from "../repositories/reorder-activation-repository.js";

export async function runReorderActivationJobs(value: unknown = 25) {
  const limit = Number(value);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new ReorderValidationError("Activation job limit must be between 1 and 100");
  }
  const jobs = await runDueActivationJobs(limit);
  return {
    processed: jobs.length,
    completed: jobs.filter((job) => job.status === "completed").length,
    failed: jobs.filter((job) => job.status === "failed").length,
    cancelled: jobs.filter((job) => job.status === "cancelled").length,
    jobs: jobs.map((job) => ({ id: job.id, batchId: job.batch_id, status: job.status, attempts: job.attempts, error: job.last_error })),
  };
}

