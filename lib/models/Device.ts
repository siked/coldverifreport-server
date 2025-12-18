import clientPromise from '../mongodb';
import { toObjectId } from '../utils';

export interface Device {
  _id?: string;
  deviceNumber: string; // 设备编号
  userId: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function createDevice(
  deviceNumber: string,
  userId: string
): Promise<Device> {
  const client = await clientPromise;
  const db = client.db();
  const devices = db.collection<Device>('devices');

  const newDevice: Device = {
    deviceNumber,
    userId,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const result = await devices.insertOne(newDevice);
  return { ...newDevice, _id: result.insertedId.toString() };
}

export async function getDevicesByUser(userId: string): Promise<Device[]> {
  const client = await clientPromise;
  const db = client.db();
  const devices = db.collection<Device>('devices');
  return await devices.find({ userId }).sort({ createdAt: -1 }).toArray();
}

export async function getDeviceById(id: string, userId: string): Promise<Device | null> {
  const client = await clientPromise;
  const db = client.db();
  const devices = db.collection<Device>('devices');
  return await devices.findOne({ _id: toObjectId(id), userId });
}

export async function updateDevice(
  id: string,
  deviceNumber: string,
  userId: string
): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const devices = db.collection<Device>('devices');

  const result = await devices.updateOne(
    { _id: toObjectId(id), userId },
    {
      $set: {
        deviceNumber,
        updatedAt: new Date(),
      },
    }
  );

  return result.modifiedCount > 0;
}

export async function deleteDevice(id: string, userId: string): Promise<boolean> {
  const client = await clientPromise;
  const db = client.db();
  const devices = db.collection<Device>('devices');

  const result = await devices.deleteOne({ _id: toObjectId(id), userId });
  return result.deletedCount > 0;
}

