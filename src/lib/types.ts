export type AccountType = 'public' | 'private';

export interface UserSettings {
  readReceipts: boolean;
  typingIndicators: boolean;
  onlineStatus: boolean;
  defaultEphemeralSeconds: number;
}

export interface UserAccount {
  id: string;
  username: string; // Permanent, lowercase, immutable
  fullName: string;
  avatar: string;
  bio: string;
  accountType: AccountType;
  passwordHash: string;
  passwordSalt: string;
  securityKeyHash: string;
  securityKeySalt: string;
  securityKeyEncrypted: string; // Encrypted with password-derived key
  publicKey: string; // ECDH Public Key JWK/SPKI string
  settings?: UserSettings;
  blockedUserIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublicProfile {
  userId: string;
  username: string;
  fullName: string;
  avatar: string;
  bio: string;
  publicKey: string;
  updatedAt: string;
}

export interface PendingMessageDoc {
  id: string;
  senderId: string;
  senderUsername: string;
  recipientId: string;
  ciphertext: string; // Base64 encoded AES-256-GCM ciphertext
  iv: string; // Base64 encoded IV
  salt: string; // Base64 encoded salt for HKDF
  senderPublicKey: string; // Sender's ECDH public key
  ephemeralSeconds: number; // 0 = Off, -1 = After viewed, 3600 = 1h, 86400 = 24h, 604800 = 7d
  createdAt: string;
}

export interface MessageReaction {
  userId: string;
  emoji: string;
}

export interface DecryptedMessage {
  id: string;
  chatPartnerId: string;
  senderId: string;
  senderUsername: string;
  type: 'text' | 'image';
  content: string; // Text string or Data URL for image
  replyTo?: {
    id: string;
    senderUsername: string;
    content: string;
  };
  reactions?: MessageReaction[];
  timestamp: number;
  ephemeralSeconds: number;
  readAt?: number;
  isViewed?: boolean;
  isEdited?: boolean;
}

export interface ChatThread {
  partnerId: string;
  partnerUsername: string;
  partnerFullName: string;
  partnerAvatar: string;
  partnerPublicKey: string;
  isPinned: boolean;
  isMuted: boolean;
  isArchived: boolean;
  lastMessage?: DecryptedMessage;
  unreadCount: number;
  ephemeralSetting: number;
  updatedAt: number;
}

export interface SignalEventDoc {
  id: string;
  senderId: string;
  recipientId: string;
  type: 'typing' | 'read' | 'online';
  timestamp: number;
}
