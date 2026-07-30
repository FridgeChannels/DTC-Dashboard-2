import { getSupabase } from "../clients/supabase.client.js";

export interface ActiveCustomerPackage {
  packageId: string;
  code: string;
  name: string;
}

type CustomerPackageRow = {
  package_id: string;
  packages: { code: string; name: string } | { code: string; name: string }[] | null;
};

function mapRow(row: CustomerPackageRow): ActiveCustomerPackage {
  const pkg = Array.isArray(row.packages) ? row.packages[0] : row.packages;
  if (!pkg?.code) {
    throw new Error("Active customer package is missing package metadata");
  }
  return {
    packageId: row.package_id,
    code: pkg.code,
    name: pkg.name,
  };
}

export async function getActivePackageByCustomerId(
  customerId: number,
): Promise<ActiveCustomerPackage | null> {
  const { data, error } = await getSupabase()
    .from("customer_packages")
    .select("package_id, packages!inner(code, name)")
    .eq("customer_id", customerId)
    .eq("is_active", true)
    .or("ends_at.is.null,ends_at.gt.now()")
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  const row = data as CustomerPackageRow;
  if (!row.packages) return null;

  return mapRow(row);
}
