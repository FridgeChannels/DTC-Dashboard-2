import { getSupabase } from './supabase.js';
import { uploadImage } from './storage.js';

const BRAND_PARAM_SELECT =
  'id, magnet_sn, magnet_id, brand_name, brand_logo, primary_color, secondary_color, website, store_website';

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

async function updateMagnetBrandParamRows(updatePayload) {
  if (!Object.keys(updatePayload).length) {
    throw new Error('没有可更新的字段');
  }

  const supabase = getSupabase();

  const { data: rows, error: selectError } = await supabase
    .from('magnet_brand_param')
    .select('id, magnet_sn, magnet_id');

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

  return updateMagnetBrandParamRows(updatePayload);
}

export async function updateMagnetBrandParamStoreWebsite(storeWebsite) {
  return updateMagnetBrandParamRows(
    buildUpdatePayload({ storeWebsite })
  );
}

function mapBrandParamRow(row) {
  return {
    id: row.id,
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

export async function getCurrentBrandConfig() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('magnet_brand_param')
    .select(BRAND_PARAM_SELECT)
    .not('brand_name', 'is', null)
    .neq('brand_name', '')
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
