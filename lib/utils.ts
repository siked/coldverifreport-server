import { ObjectId } from 'mongodb';

export function toObjectId(id: string): ObjectId {
  return new ObjectId(id);
}

export function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id);
}


