import { randomUUID } from 'crypto';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

let client;

export function isS3Configured() {
  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

  return Boolean(accessKeyId && secretAccessKey && process.env.S3_BUCKET);
}

function getS3Client() {
  if (client) return client;

  const accessKeyId =
    process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey =
    process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_ACCESS_KEY;

  client = new S3Client({
    region:
      process.env.AWS_DEFAULT_REGION || process.env.S3_REGION || 'us-east-1',
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    ...(process.env.S3_ENDPOINT_URL
      ? { endpoint: process.env.S3_ENDPOINT_URL }
      : {}),
  });

  return client;
}

export async function uploadToS3(buffer, { mimeType, folder, extension }) {
  if (!isS3Configured()) {
    throw new Error('S3 未配置，请设置 AWS_ACCESS_KEY_ID、AWS_SECRET_ACCESS_KEY、S3_BUCKET');
  }

  const bucket = process.env.S3_BUCKET;
  const prefix = (process.env.S3_KEY_PREFIX || 'brand-colors').replace(/\/$/, '');
  const key = `${prefix}/${folder}/${randomUUID()}.${extension}`;

  await getS3Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    })
  );

  return buildPublicUrl(bucket, key);
}

function buildPublicUrl(bucket, key) {
  if (process.env.S3_CUSTOM_DOMAIN) {
    return `${process.env.S3_CUSTOM_DOMAIN.replace(/\/$/, '')}/${key}`;
  }

  const region =
    process.env.AWS_DEFAULT_REGION || process.env.S3_REGION || 'us-east-1';

  return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
}
