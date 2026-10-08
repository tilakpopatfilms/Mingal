/**
 * Local-First IndexedDB Database for CipherX E2EE Messenger
 * Provides fast, offline-first local encrypted storage for identity keys,
 * decrypted conversation history, local settings, and attachments.
 */

import { DecryptedMessage, ChatThread } from './types';

const DB_NAME = 'CipherX_LocalVault_DB';
const DB_VERSION = 1;

export interface StoredKeyPair {
  userId: string;
  publicKeyJWK: string;
  privateKeyJWK: string;
}

export interface LocalChatSettings {
  partnerId: string;
  isMuted: boolean;
  isPinned: boolean;
  isArchived: boolean;
  ephemeralSeconds: number;
}

export function openLocalDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      // Keypair store
      if (!db.objectStoreNames.contains('keys')) {
        db.createObjectStore('keys', { keyPath: 'userId' });
      }

      // Threads store
      if (!db.objectStoreNames.contains('threads')) {
        const threadStore = db.createObjectStore('threads', { keyPath: 'partnerId' });
        threadStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        threadStore.createIndex('isPinned', 'isPinned', { unique: false });
      }

      // Messages store
      if (!db.objectStoreNames.contains('messages')) {
        const msgStore = db.createObjectStore('messages', { keyPath: 'id' });
        msgStore.createIndex('chatPartnerId', 'chatPartnerId', { unique: false });
        msgStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // Local Settings store
      if (!db.objectStoreNames.contains('chat_settings')) {
        db.createObjectStore('chat_settings', { keyPath: 'partnerId' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// 1. Identity Keypair Local Persistence
export async function saveLocalKeyPair(keyPair: StoredKeyPair): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readwrite');
    const store = tx.objectStore('keys');
    const req = store.put(keyPair);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalKeyPair(userId: string): Promise<StoredKeyPair | null> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('keys', 'readonly');
    const store = tx.objectStore('keys');
    const req = store.get(userId);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

// 2. Local Messages Management
export async function saveMessageToLocalDB(message: DecryptedMessage): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const req = store.put(message);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalMessagesFromDB(partnerId: string): Promise<DecryptedMessage[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readonly');
    const store = tx.objectStore('messages');
    const index = store.index('chatPartnerId');
    const req = index.getAll(partnerId);

    req.onsuccess = () => {
      const allMsgs: DecryptedMessage[] = req.result || [];
      const now = Date.now();

      // Expire ephemeral messages
      const validMsgs = allMsgs.filter(msg => {
        if (msg.ephemeralSeconds > 0 && msg.readAt) {
          const expiresAt = msg.readAt + msg.ephemeralSeconds * 1000;
          if (now >= expiresAt) return false; // Ephemeral expired
        }
        return true;
      });

      // Sort by timestamp asc
      validMsgs.sort((a, b) => a.timestamp - b.timestamp);
      resolve(validMsgs);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteLocalMessageFromDB(msgId: string): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('messages', 'readwrite');
    const store = tx.objectStore('messages');
    const req = store.delete(msgId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function clearLocalChatHistoryFromDB(partnerId: string): Promise<void> {
  const msgs = await getLocalMessagesFromDB(partnerId);
  const db = await openLocalDB();
  const tx = db.transaction('messages', 'readwrite');
  const store = tx.objectStore('messages');
  msgs.forEach(m => store.delete(m.id));
}

// 3. Local Thread Summary Management
export async function saveThreadToLocalDB(thread: ChatThread): Promise<void> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('threads', 'readwrite');
    const store = tx.objectStore('threads');
    const req = store.put(thread);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function getLocalThreadsFromDB(): Promise<ChatThread[]> {
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('threads', 'readonly');
    const store = tx.objectStore('threads');
    const req = store.getAll();

    req.onsuccess = () => {
      const threads: ChatThread[] = req.result || [];
      threads.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
      resolve(threads);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteThreadFromDB(partnerId: string): Promise<void> {
  await clearLocalChatHistoryFromDB(partnerId);
  const db = await openLocalDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('threads', 'readwrite');
    const store = tx.objectStore('threads');
    const req = store.delete(partnerId);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// 4. Clear Entire Local Vault
export async function purgeEntireLocalVaultDB(): Promise<void> {
  const db = await openLocalDB();
  const tx = db.transaction(['keys', 'threads', 'messages', 'chat_settings'], 'readwrite');
  tx.objectStore('keys').clear();
  tx.objectStore('threads').clear();
  tx.objectStore('messages').clear();
  tx.objectStore('chat_settings').clear();
}
