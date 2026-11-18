import { Readable } from 'node:stream';
import mongoose, { isValidObjectId, Types } from 'mongoose';
import type { Response } from 'express';
import { requireTenantId } from '../db/tenantContext';
import { AppError, badRequest, notFound } from './errors';

/**
 * Image uploads stored in MongoDB GridFS (bucket "media"), so stores work with just Atlas.
 * Swap for S3/Cloudinary later by keeping the same `/media/<id>` URLs (plan §3.2 "Media").
 *
 * Safety: only JPEG/PNG/WebP/GIF, detected from the file bytes (not the client's type),
 * max 3 MB; SVG is refused (it can carry scripts). Files are tagged with the tenant.
 */
export const MAX_BYTES = 3 * 1024 * 1024;
const MAX_FILES_PER_TENANT = 2000;

function sniff(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') return 'image/webp';
  if (buf.subarray(0, 6).toString('ascii') === 'GIF87a' || buf.subarray(0, 6).toString('ascii') === 'GIF89a') return 'image/gif';
  return null;
}

function bucket() {
  const db = mongoose.connection.db;
  if (!db) throw new AppError(503, 'DB_UNAVAILABLE', 'Database not connected');
  return new mongoose.mongo.GridFSBucket(db, { bucketName: 'media' });
}

export async function uploadImage(body: unknown, filename = 'image') {
  const tenantId = requireTenantId();
  if (!Buffer.isBuffer(body) || body.length === 0) throw badRequest('Choose an image to upload');
  if (body.length > MAX_BYTES) throw badRequest('Images must be 3 MB or smaller');
  const contentType = sniff(body);
  if (!contentType) throw badRequest('Use a JPG, PNG, WebP or GIF image');
  const files = mongoose.connection.db!.collection('media.files');
  if ((await files.countDocuments({ 'metadata.tenantId': tenantId })) >= MAX_FILES_PER_TENANT) {
    throw new AppError(402, 'PLAN_LIMIT', 'Image library is full. Delete unused images first.');
  }
  const safeName = filename.replace(/[^\w.-]/g, '_').slice(0, 80) || 'image';
  const id = new Types.ObjectId();
  await new Promise<void>((resolve, reject) => {
    Readable.from(body)
      .pipe(bucket().openUploadStreamWithId(id, safeName, { metadata: { tenantId, contentType } }))
      .on('finish', () => resolve())
      .on('error', reject);
  });
  return { id: String(id), url: `/media/${id}`, contentType, size: body.length };
}

export async function listImages() {
  const tenantId = requireTenantId();
  const files = await mongoose.connection.db!
    .collection('media.files')
    .find({ 'metadata.tenantId': tenantId })
    .sort({ uploadDate: -1 })
    .limit(200)
    .project({ filename: 1, length: 1, uploadDate: 1 })
    .toArray();
  return files.map((f) => ({ id: String(f._id), url: `/media/${f._id}`, name: f.filename, size: f.length, uploadedAt: f.uploadDate }));
}

export async function deleteImage(id: string) {
  const tenantId = requireTenantId();
  if (!isValidObjectId(id)) throw notFound('Image');
  const _id = new Types.ObjectId(id);
  const file = await mongoose.connection.db!.collection('media.files').findOne({ _id, 'metadata.tenantId': tenantId });
  if (!file) throw notFound('Image');
  await bucket().delete(_id);
  return { deleted: true };
}

/** Public read (images on a store are public). Long cache: files are immutable by id. */
export async function streamImage(id: string, res: Response) {
  if (!isValidObjectId(id)) throw notFound('Image');
  const _id = new Types.ObjectId(id);
  const file = await mongoose.connection.db!.collection('media.files').findOne({ _id });
  if (!file) throw notFound('Image');
  res.setHeader('Content-Type', file.metadata?.contentType ?? 'application/octet-stream');
  res.setHeader('Content-Length', String(file.length));
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'");
  await new Promise<void>((resolve, reject) => {
    bucket().openDownloadStream(_id).on('error', reject).pipe(res).on('finish', () => resolve());
  });
}
