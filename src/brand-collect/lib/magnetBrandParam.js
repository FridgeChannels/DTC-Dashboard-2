import { getSupabase } from './supabase.js';
import { uploadImage } from './storage.js';

const BRAND_PARAM_SELECT =
  'id, customer_id, magnet_sn, magnet_id, brand_name, brand_logo, primary_color, secondary_color, website, store_website';

/** Brand Info 页面保存时仅更新这两条 magnet 的品牌参数 */
export const BRAND_INFO_MAGNET_SNS = ['DA9V3EG9QG', 'E2V5TQGYE8'];

function buildUpdatePayload(fields) {
  const payload = {};

  if (fields.brandName !== undefined) {
    if (!fields.brandName?.trim()) {
      throw new Error('品牌名称不能为空');
    }
    payload.brand_name = fields.brandName.trim();
  }

  if (fields.website !== undefined) {
    payload.website = fields.website?.trim() || null;
  }

  if (fields.storeWebsite !== undefined) {
    payload.store_website = fields.storeWebsite?.trim() || null;
  }

  if (fields.primaryColor !== undefined) {
    payload.primary_color = fields.primaryColor?.trim() || null;
  }

  if (fields.secondaryColor !== undefined) {
    payload.secondary_color = fields.secondaryColor?.trim() || null;
  }

  return payload;
}

async function getMagnetIdsForCustomer(customerId) {
  if (!customerId) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('magnet')
    .select('id')
    .eq('customer_id', customerId);

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => row.id);
}

async function updateMagnetBrandParamRows(updatePayload, options = {}) {
  const { customerId, magnetSns } = options;

  if (!Object.keys(updatePayload).length) {
    throw new Error('没有可更新的字段');
  }

  const supabase = getSupabase();
  const magnetIds = await getMagnetIdsForCustomer(customerId);

  let selectQuery = supabase
    .from('magnet_brand_param')
    .select('id, magnet_sn, magnet_id');

  if (magnetSns?.length) {
    selectQuery = selectQuery.in('magnet_sn', magnetSns);
    if (magnetIds) {
      if (!magnetIds.length) {
        return { updatedCount: 0, records: [] };
      }
      selectQuery = selectQuery.in('magnet_id', magnetIds);
    }
  } else if (magnetIds) {
    if (!magnetIds.length) {
      return { updatedCount: 0, records: [] };
    }
    selectQuery = selectQuery.in('magnet_id', magnetIds);
  }

  const { data: rows, error: selectError } = await selectQuery;

  if (selectError) {
    throw new Error(selectError.message);
  }

  if (!rows?.length) {
    return { updatedCount: 0, records: [] };
  }

  const { data, error: updateError } = await supabase
    .from('magnet_brand_param')
    .update(updatePayload)
    .in(
      'id',
      rows.map((row) => row.id)
    )
    .select(BRAND_PARAM_SELECT);

  if (updateError) {
    throw new Error(updateError.message);
  }

  return {
    updatedCount: data?.length ?? 0,
    records: (data ?? []).map(mapBrandParamRow),
  };
}

export async function updateAllMagnetBrandParams(input) {
  const {
    brandName,
    website,
    brandLogo,
    primaryColor,
    secondaryColor,
    storeWebsite,
    customerId,
  } = input;

  const updatePayload = buildUpdatePayload({
    brandName,
    website,
    primaryColor,
    secondaryColor,
    storeWebsite,
  });

  if (brandLogo !== undefined) {
    updatePayload.brand_logo = await uploadImage(brandLogo, 'logos');
  }

  return updateMagnetBrandParamRows(updatePayload, { customerId });
}

export async function updateCustomerBrandInfoMagnetBrandParams(input) {
  const {
    brandName,
    website,
    brandLogo,
    primaryColor,
    secondaryColor,
    storeWebsite,
    customerId,
  } = input;

  if (!customerId) {
    return { updatedCount: 0, records: [] };
  }

  const updatePayload = buildUpdatePayload({
    brandName,
    website,
    primaryColor,
    secondaryColor,
    storeWebsite,
  });

  if (brandLogo !== undefined) {
    updatePayload.brand_logo = await uploadImage(brandLogo, 'logos');
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('magnet_brand_param')
    .update(updatePayload)
    .eq('customer_id', customerId)
    .select(BRAND_PARAM_SELECT);

  if (error) {
    throw new Error(error.message);
  }

  return {
    updatedCount: data?.length ?? 0,
    records: (data ?? []).map(mapBrandParamRow),
  };
}

export async function updateBrandInfoMagnetBrandParams(input) {
  const {
    brandName,
    website,
    brandLogo,
    primaryColor,
    secondaryColor,
    storeWebsite,
    customerId,
  } = input;

  const updatePayload = buildUpdatePayload({
    brandName,
    website,
    primaryColor,
    secondaryColor,
    storeWebsite,
  });

  if (brandLogo !== undefined) {
    updatePayload.brand_logo = await uploadImage(brandLogo, 'logos');
  }

  const preferredMagnets = await updateMagnetBrandParamRows(updatePayload, {
    customerId,
    magnetSns: BRAND_INFO_MAGNET_SNS,
  });
  // New tenants may not yet have the two legacy Brand Info magnets. Persist to
  // their available magnets instead of reporting a misleading zero-row save.
  if (preferredMagnets.updatedCount > 0) return preferredMagnets;
  return updateMagnetBrandParamRows(updatePayload, { customerId });
}

export async function updateMagnetBrandParamStoreWebsite(storeWebsite, customerId) {
  return updateMagnetBrandParamRows(
    buildUpdatePayload({ storeWebsite }),
    { customerId }
  );
}

function mapBrandParamRow(row) {
  return {
    id: row.id,
    customerId: row.customer_id,
    magnetSn: row.magnet_sn,
    magnetId: row.magnet_id,
    brandName: row.brand_name,
    brandLogo: row.brand_logo,
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color,
    website: row.website,
    storeWebsite: row.store_website,
  };
}

export async function getCurrentBrandConfig(customerId) {
  const supabase = getSupabase();
  const magnetIds = await getMagnetIdsForCustomer(customerId);

  let query = supabase
    .from('magnet_brand_param')
    .select(BRAND_PARAM_SELECT)
    .not('brand_name', 'is', null)
    .neq('brand_name', '');

  if (magnetIds) {
    if (!magnetIds.length) {
      return null;
    }
    query = query.in('magnet_id', magnetIds);
  }

  const { data, error } = await query
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.brand_name) {
    return null;
  }

  return mapBrandParamRow(data);
}

export async function getFirstBrandConfigByCustomerId(customerId) {
  if (!customerId) return null;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('magnet_brand_param')
    .select(BRAND_PARAM_SELECT)
    .eq('customer_id', customerId)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data ? mapBrandParamRow(data) : null;
}
