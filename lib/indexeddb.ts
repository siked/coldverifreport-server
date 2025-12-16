/**
 * IndexedDB 工具类
 * 用于管理本地数据库存储
 */

const DB_NAME = 'ColdVerifReportCache';
const META_STORE_NAME = 'taskMeta';

/**
 * 获取任务的 objectStore 名称
 * 格式：taskData_任务ID
 */
export function getTaskStoreName(taskId: string): string {
  return `taskData_${taskId}`;
}

interface DBInstance {
  db: IDBDatabase;
  version: number;
}

let dbInstance: DBInstance | null = null;
let knownStores = new Set<string>(); // 记录已存在的 objectStore，避免重复创建

/**
 * 打开数据库
 */
let indexedDBDisabled = false;

export function isIndexedDBAvailable(): boolean {
  return (
    !indexedDBDisabled &&
    typeof window !== 'undefined' &&
    typeof indexedDB !== 'undefined'
  );
}

export function openDB(version?: number): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!isIndexedDBAvailable()) {
      reject(new Error('IndexedDB 不可用（仅在浏览器环境支持）'));
      return;
    }

    if (version === undefined && dbInstance?.db) {
      resolve(dbInstance.db);
      return;
    }

    const request = version
      ? indexedDB.open(DB_NAME, version)
      : indexedDB.open(DB_NAME);

    request.onerror = () => {
      indexedDBDisabled = true;
      const error = request.error;
      reject(error || new Error('打开数据库失败'));
    };

    request.onsuccess = () => {
      const db = request.result;

      // 记录所有已存在的 objectStore，方便后续判断
      knownStores = new Set<string>();
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        knownStores.add(db.objectStoreNames[i]);
      }

      if (version === undefined) {
        dbInstance = { db, version: db.version };
      }
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      const oldVersion = event.oldVersion;

      // 如果是从旧版本升级，删除旧的统一 objectStore
      if (oldVersion < 3 && db.objectStoreNames.contains('taskData')) {
        db.deleteObjectStore('taskData');
      }

      // 创建元数据存储对象
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        const metaStore = db.createObjectStore(META_STORE_NAME, { keyPath: 'taskId' });
      }
    };
  });
}

/**
 * 确保元数据 ObjectStore 存在（用于兼容旧版本数据库）
 */
async function ensureMetaStore(): Promise<IDBDatabase> {
  // 先尝试直接打开，若已存在则直接返回
  const db = await openDB();
  if (db.objectStoreNames.contains(META_STORE_NAME)) {
    return db;
  }

  // 需要通过升级版本来创建 META_STORE_NAME
  return new Promise((resolve, reject) => {
    try {
      if (dbInstance?.db) {
        dbInstance.db.close();
        dbInstance = null;
      }

      const versionRequest = indexedDB.open(DB_NAME);

      versionRequest.onerror = () => {
        reject(new Error('获取数据库版本失败（元数据初始化）'));
      };

      versionRequest.onsuccess = () => {
        const tempDb = versionRequest.result;
        const currentVersion = tempDb.version;
        tempDb.close();

        const newVersion = currentVersion + 1;
        const upgradeRequest = indexedDB.open(DB_NAME, newVersion);

        upgradeRequest.onerror = () => {
          reject(new Error('升级数据库失败（元数据初始化）'));
        };

        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDb = (event.target as IDBOpenDBRequest).result;
          // 创建元数据存储对象
          if (!upgradeDb.objectStoreNames.contains(META_STORE_NAME)) {
            upgradeDb.createObjectStore(META_STORE_NAME, { keyPath: 'taskId' });
          }
        };

        upgradeRequest.onsuccess = () => {
          const newDb = upgradeRequest.result;

          // 记录所有已存在的 objectStore
          knownStores = new Set<string>();
          for (let i = 0; i < newDb.objectStoreNames.length; i++) {
            knownStores.add(newDb.objectStoreNames[i]);
          }

          dbInstance = { db: newDb, version: newDb.version };
          resolve(newDb);
        };
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 确保任务的 objectStore 存在，如果不存在则创建
 */
export async function ensureTaskStore(taskId: string): Promise<IDBDatabase> {
  const storeName = getTaskStoreName(taskId);
  
  // 如果已经知道存在，直接返回
  if (knownStores.has(storeName)) {
    const db = await openDB();
    if (db.objectStoreNames.contains(storeName)) {
      return db;
    }
  }

  // 需要创建新的 objectStore，需要升级数据库版本
  return new Promise((resolve, reject) => {
    // 先关闭现有连接
    if (dbInstance?.db) {
      dbInstance.db.close();
      dbInstance = null;
    }

    // 获取当前版本并升级
    const versionRequest = indexedDB.open(DB_NAME);
    versionRequest.onsuccess = () => {
      const tempDb = versionRequest.result;
      const currentVersion = tempDb.version;
      tempDb.close(); // 关闭临时连接，避免阻塞升级
      const newVersion = currentVersion + 1;

      // 使用新版本打开数据库
      const upgradeRequest = indexedDB.open(DB_NAME, newVersion);

      upgradeRequest.onerror = () => {
        reject(new Error('升级数据库失败'));
      };

      upgradeRequest.onsuccess = () => {
        const db = upgradeRequest.result;

        // 更新 objectStore 列表
        knownStores = new Set<string>();
        for (let i = 0; i < db.objectStoreNames.length; i++) {
          knownStores.add(db.objectStoreNames[i]);
        }

        dbInstance = { db, version: db.version };
        resolve(db);
      };

      upgradeRequest.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // 创建任务的 objectStore（如果不存在）
        if (!db.objectStoreNames.contains(storeName)) {
          // 不设置 keyPath，后续 put 时显式传入 deviceId 作为 key
          db.createObjectStore(storeName);
        }
      };
    };

    versionRequest.onerror = () => {
      reject(new Error('获取数据库版本失败'));
    };
  });
}

/**
 * 保存数据到 IndexedDB
 * 每个任务使用独立的 objectStore: taskData_任务ID
 * key 就是设备ID (deviceId)
 */
export function saveToIndexedDB(key: string, value: string, taskId: string, deviceId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const storeName = getTaskStoreName(taskId);
      const db = await ensureTaskStore(taskId);
      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const record = {
        value,
        updatedAt: Date.now(),
      };

      // 直接使用 deviceId 作为 key，value 中不再冗余存储 deviceId
      const request = store.put(record, deviceId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('保存数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 从 IndexedDB 读取数据
 * taskId: 任务ID
 * deviceId: 设备ID（作为 key）
 */
export function loadFromIndexedDB(key: string, taskId: string, deviceId: string): Promise<string | null> {
  return new Promise(async (resolve, reject) => {
    try {
      const storeName = getTaskStoreName(taskId);
      const db = await openDB();
      
      // 检查 objectStore 是否存在
      if (!db.objectStoreNames.contains(storeName)) {
        resolve(null);
        return;
      }

      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);

      const request = store.get(deviceId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.value : null);
      };

      request.onerror = () => {
        reject(new Error('读取数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 删除 IndexedDB 中的数据
 * taskId: 任务ID
 * deviceId: 设备ID（作为 key）
 */
export function deleteFromIndexedDB(key: string, taskId: string, deviceId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const storeName = getTaskStoreName(taskId);
      const db = await openDB();
      
      // 检查 objectStore 是否存在
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }

      const transaction = db.transaction([storeName], 'readwrite');
      const store = transaction.objectStore(storeName);

      const request = store.delete(deviceId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 获取任务的所有设备ID列表
 * 直接遍历任务的 objectStore，返回所有设备ID
 */
export function getTaskDeviceIds(taskId: string): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const storeName = getTaskStoreName(taskId);
      const db = await openDB();
      
      // 检查 objectStore 是否存在
      if (!db.objectStoreNames.contains(storeName)) {
        resolve([]);
        return;
      }

      const transaction = db.transaction([storeName], 'readonly');
      const store = transaction.objectStore(storeName);

      const request = store.openCursor();
      const deviceIds: string[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
        if (cursor) {
          deviceIds.push(cursor.key as string);
          cursor.continue();
        } else {
          resolve(deviceIds);
        }
      };

      request.onerror = () => {
        reject(new Error('获取设备ID列表失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 删除任务的所有数据
 * 直接删除整个 taskData_任务ID 的 objectStore
 */
export function deleteTaskData(taskId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const storeName = getTaskStoreName(taskId);
      const db = await openDB();
      
      // 检查 objectStore 是否存在
      if (!db.objectStoreNames.contains(storeName)) {
        resolve();
        return;
      }

      // 需要升级数据库版本来删除 objectStore
      if (dbInstance?.db) {
        dbInstance.db.close();
        dbInstance = null;
      }

      const versionRequest = indexedDB.open(DB_NAME);
      versionRequest.onsuccess = () => {
        const tempDb = versionRequest.result;
        const currentVersion = tempDb.version;
        tempDb.close();
        const newVersion = currentVersion + 1;

        const upgradeRequest = indexedDB.open(DB_NAME, newVersion);

        upgradeRequest.onerror = () => {
          reject(new Error('删除任务数据失败'));
        };

        upgradeRequest.onsuccess = () => {
          const newDb = upgradeRequest.result;

          // 更新 objectStore 列表
          knownStores = new Set<string>();
          for (let i = 0; i < newDb.objectStoreNames.length; i++) {
            knownStores.add(newDb.objectStoreNames[i]);
          }

          dbInstance = { db: newDb, version: newDb.version };
          resolve();
        };

        upgradeRequest.onupgradeneeded = (event) => {
          const upgradeDb = (event.target as IDBOpenDBRequest).result;
          if (upgradeDb.objectStoreNames.contains(storeName)) {
            upgradeDb.deleteObjectStore(storeName);
          }
        };
      };

      versionRequest.onerror = () => {
        reject(new Error('删除任务数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 保存元数据
 */
export function saveMetaToIndexedDB(taskId: string, meta: Record<string, any>): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await ensureMetaStore();
      const transaction = db.transaction([META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(META_STORE_NAME);

      const data = {
        taskId,
        meta,
        updatedAt: Date.now(),
      };

      const request = store.put(data);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('保存元数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 读取元数据
 */
export function loadMetaFromIndexedDB(taskId: string): Promise<Record<string, any> | null> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await ensureMetaStore();
      const transaction = db.transaction([META_STORE_NAME], 'readonly');
      const store = transaction.objectStore(META_STORE_NAME);

      const request = store.get(taskId);

      request.onsuccess = () => {
        const result = request.result;
        resolve(result ? result.meta : null);
      };

      request.onerror = () => {
        reject(new Error('读取元数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 删除元数据
 */
export function deleteMetaFromIndexedDB(taskId: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await ensureMetaStore();
      const transaction = db.transaction([META_STORE_NAME], 'readwrite');
      const store = transaction.objectStore(META_STORE_NAME);

      const request = store.delete(taskId);

      request.onsuccess = () => {
        resolve();
      };

      request.onerror = () => {
        reject(new Error('删除元数据失败'));
      };
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 获取所有任务ID
 * 从所有 objectStore 名称中提取任务ID（格式：taskData_任务ID）
 */
export function getAllTaskIds(): Promise<string[]> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const taskIds: string[] = [];
      const prefix = 'taskData_';

      // 遍历所有 objectStore，找出所有任务相关的
      for (let i = 0; i < db.objectStoreNames.length; i++) {
        const storeName = db.objectStoreNames[i];
        if (storeName.startsWith(prefix)) {
          const taskId = storeName.substring(prefix.length);
          if (taskId) {
            taskIds.push(taskId);
          }
        }
      }

      resolve(taskIds);
    } catch (error) {
      reject(error);
    }
  });
}

/**
 * 估算数据库大小（近似值）
 * 遍历所有任务的 objectStore 计算总大小
 */
export async function estimateDBSize(): Promise<number> {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await openDB();
      const taskIds = await getAllTaskIds();
      let totalSize = 0;

      // 遍历所有任务的 objectStore
      for (const taskId of taskIds) {
        const storeName = getTaskStoreName(taskId);
        if (!db.objectStoreNames.contains(storeName)) {
          continue;
        }

        const transaction = db.transaction([storeName], 'readonly');
        const store = transaction.objectStore(storeName);
        const request = store.getAll();

        await new Promise<void>((resolveStore, rejectStore) => {
          request.onsuccess = () => {
            const result = request.result;
            for (const item of result) {
              if (item.value) {
                totalSize += new Blob([item.value]).size;
              }
            }
            resolveStore();
          };

          request.onerror = () => {
            rejectStore(new Error(`估算任务 ${taskId} 数据大小失败`));
          };
        });
      }

      resolve(totalSize);
    } catch (error) {
      reject(error);
    }
  });
}

