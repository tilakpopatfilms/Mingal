import { DecryptedMessage, ChatThread } from './types';

const STORAGE_PREFIX = 'cipherx_local_v1_';

export function getLocalUserKey(currentUserId: string): string {
  return `${STORAGE_PREFIX}user_${currentUserId}`;
}

export function getLocalMessagesKey(currentUserId: string, partnerId: string): string {
  return `${STORAGE_PREFIX}msgs_${currentUserId}_${partnerId}`;
}

export function getLocalThreadsKey(currentUserId: string): string {
  return `${STORAGE_PREFIX}threads_${currentUserId}`;
}

// Get all threads for current user
export function getLocalThreads(currentUserId: string): ChatThread[] {
  try {
    const raw = localStorage.getItem(getLocalThreadsKey(currentUserId));
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to load local threads:', err);
    return [];
  }
}

// Save or update a chat thread
export function saveLocalThread(currentUserId: string, thread: ChatThread): void {
  try {
    const threads = getLocalThreads(currentUserId);
    const existingIndex = threads.findIndex(t => t.partnerId === thread.partnerId);
    
    if (existingIndex >= 0) {
      threads[existingIndex] = {
        ...threads[existingIndex],
        ...thread,
        updatedAt: thread.updatedAt || Date.now(),
      };
    } else {
      threads.push({
        ...thread,
        isPinned: thread.isPinned || false,
        unreadCount: thread.unreadCount || 0,
        ephemeralSetting: thread.ephemeralSetting || 0,
        updatedAt: thread.updatedAt || Date.now(),
      });
    }

    // Sort: Pinned first, then newest updated
    threads.sort((a, b) => {
      if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
      return b.updatedAt - a.updatedAt;
    });

    localStorage.setItem(getLocalThreadsKey(currentUserId), JSON.stringify(threads));
  } catch (err) {
    console.error('Failed to save local thread:', err);
  }
}

// Toggle pinned status of thread
export function togglePinThread(currentUserId: string, partnerId: string): boolean {
  const threads = getLocalThreads(currentUserId);
  const thread = threads.find(t => t.partnerId === partnerId);
  if (!thread) return false;
  
  thread.isPinned = !thread.isPinned;
  threads.sort((a, b) => {
    if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
    return b.updatedAt - a.updatedAt;
  });

  localStorage.setItem(getLocalThreadsKey(currentUserId), JSON.stringify(threads));
  return thread.isPinned;
}

// Delete local thread and messages
export function deleteLocalThread(currentUserId: string, partnerId: string): void {
  const threads = getLocalThreads(currentUserId).filter(t => t.partnerId !== partnerId);
  localStorage.setItem(getLocalThreadsKey(currentUserId), JSON.stringify(threads));
  localStorage.removeItem(getLocalMessagesKey(currentUserId, partnerId));
}

// Get decrypted messages for a partner
export function getLocalMessages(currentUserId: string, partnerId: string): DecryptedMessage[] {
  try {
    const raw = localStorage.getItem(getLocalMessagesKey(currentUserId, partnerId));
    if (!raw) return [];
    const messages: DecryptedMessage[] = JSON.parse(raw);

    // Filter out expired ephemeral messages!
    const now = Date.now();
    const validMessages = messages.filter(msg => {
      if (msg.ephemeralSeconds > 0 && msg.readAt) {
        const expiresAt = msg.readAt + (msg.ephemeralSeconds * 1000);
        if (now >= expiresAt) {
          return false; // Self-destructed!
        }
      }
      return true;
    });

    if (validMessages.length !== messages.length) {
      localStorage.setItem(getLocalMessagesKey(currentUserId, partnerId), JSON.stringify(validMessages));
    }

    return validMessages;
  } catch (err) {
    console.error('Failed to load local messages:', err);
    return [];
  }
}

// Save message to local device storage
export function saveLocalMessage(currentUserId: string, message: DecryptedMessage): void {
  try {
    const partnerId = message.chatPartnerId;
    const messages = getLocalMessages(currentUserId, partnerId);
    
    // Avoid duplicate
    if (!messages.some(m => m.id === message.id)) {
      messages.push(message);
      messages.sort((a, b) => a.timestamp - b.timestamp);
      localStorage.setItem(getLocalMessagesKey(currentUserId, partnerId), JSON.stringify(messages));
    }

    // Update thread summary
    const threads = getLocalThreads(currentUserId);
    const existingThread = threads.find(t => t.partnerId === partnerId);
    if (existingThread) {
      existingThread.lastMessage = message;
      existingThread.updatedAt = Math.max(existingThread.updatedAt, message.timestamp);
      saveLocalThread(currentUserId, existingThread);
    }
  } catch (err) {
    console.error('Failed to save local message:', err);
  }
}

// Mark messages in thread as read
export function markThreadAsRead(currentUserId: string, partnerId: string): void {
  const messages = getLocalMessages(currentUserId, partnerId);
  let updated = false;
  const now = Date.now();

  messages.forEach(msg => {
    if (!msg.readAt && msg.senderId !== currentUserId) {
      msg.readAt = now;
      updated = true;
    }
  });

  if (updated) {
    localStorage.setItem(getLocalMessagesKey(currentUserId, partnerId), JSON.stringify(messages));
  }

  // Clear unread count on thread
  const threads = getLocalThreads(currentUserId);
  const thread = threads.find(t => t.partnerId === partnerId);
  if (thread) {
    thread.unreadCount = 0;
    saveLocalThread(currentUserId, thread);
  }
}

// Clear entire local device vault
export function clearAllLocalData(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(k => localStorage.removeItem(k));
}
