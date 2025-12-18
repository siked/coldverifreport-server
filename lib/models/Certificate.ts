import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface Certificate {
  _id?: string;
  certificateNumber: string; // 证书编号
  deviceId: string; // 设备ID
  issueDate: string; // 签发日期 (YYYY-MM-DD)
  expiryDate: string; // 到期时间 (YYYY-MM-DD)
  pdfUrl?: string; // PDF文件URL
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createCertificate(
  certificateNumber: string,
  deviceId: string,
  issueDate: string,
  expiryDate: string,
  userId: string,
  pdfUrl?: string
): Promise<Certificate> {
  const client = await clientPromise;
  const db = client.db();
  const certificates = db.collection<Certificate>('certificates');

  const newCertificate: Certificate = {
    certificateNumber,
    deviceId,
    issueDate,
    expiryDate,
    pdfUrl,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await certificates.insertOne(newCertificate);
  return { ...newCertificate, _id: result.insertedId.toString() };
}

export async function getCertificatesByDevice(deviceId: string, userId: string): Promise<Certificate[]> {
  const client = await clientPromise;
  const db = client.db();
  const certificates = db.collection<Certificate>('certificates');
  return await certificates.find({ deviceId, userId }).sort({ createdAt: -1 }).toArray();
}

export async function getCertificateById(id: string, userId: string): Promise<Certificate | null> {
  const client = await clientPromise;
  const db = client.db();
  const certificates = db.collection<Certificate>('certificates');
  return await certificates.findOne({ _id: toObjectId(id), userId });
}

export async function updateCertificate(
  id: string,
  certificateNumber: string,
  issueDate: string,
  expiryDate: string,
  userId: string,
  pdfUrl?: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const certificates = db.collection<Certificate>('certificates');

  const updateData: any = {
    certificateNumber,
    issueDate,
    expiryDate,
    updatedAt: new Date(),
  };

  if (pdfUrl !== undefined) {
    updateData.pdfUrl = pdfUrl;
  }

  const result = await certificates.updateOne(
    { _id: toObjectId(id), userId },
    {
      $set: updateData,
    }
  );

  return result.modifiedCount > 0;
}

export async function deleteCertificate(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const certificates = db.collection<Certificate>('certificates');

  const result = await certificates.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}

