import { randomUUID } from 'crypto';
import { uploadToS3, isS3Configured } from './s3.js';
import { getSupabase } from './supabase.js';
import { productLog } from './productDebug.js';

const SUPABASE_IMAGE_BUCKET = 'product-images';

export function isImageStorageConfigured() {
  return isS3Configured() || Boolean(process.env.SUPABASE_URL);
}

export async function uploadImage(imageUrl, folder = 'images') {
  const value = imageUrl?.trim();
  if (!value) return null;
  if (!value.startsWith('data:image/')) {
    productLog('1/3 跳过上传（已是 URL）', { imageUrl: value });
    return value;
  }

  const match = value.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('图片格式无效');
  }

  const [, mimeType, base64Data] = match;
  const extension = mimeType.split('/')[1]?.replace('svg+xml', 'svg') || 'png';
  const buffer = Buffer.from(base64Data, 'base64');

  if (isS3Configured()) {
    productLog('1/3 上传到 S3', { folder, sizeBytes: buffer.length, mimeType });
    const url = await uploadToS3(buffer, { mimeType, folder, extension });
    productLog('1/3 S3 上传成功', { url });
    return url;
  }

  productLog('1/3 上传到 Supabase Storage', { sizeBytes: buffer.length, mimeType });
  const url = await uploadImageToSupabase(buffer, mimeType, extension);
  productLog('1/3 Supabase Storage 上传成功', { url });
  return url;
}

async function uploadImageToSupabase(buffer, mimeType, extension) {
  const filePath = `${randomUUID()}.${extension}`;

  const supabase = getSupabase();
  const { error: uploadError } = await supabase.storage
    .from(SUPABASE_IMAGE_BUCKET)
    .upload(filePath, buffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`图片上传失败: ${uploadError.message}`);
  }

  const { data } = supabase.storage
    .from(SUPABASE_IMAGE_BUCKET)
    .getPublicUrl(filePath);
  return data.publicUrl;
}
