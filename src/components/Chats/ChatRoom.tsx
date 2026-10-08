import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Send, 
  Flame, 
  Image as ImageIcon, 
  ShieldCheck, 
  Clock, 
  Check, 
  CheckCheck, 
  Trash2, 
  X, 
  Eye, 
  Reply, 
  Smile, 
  Copy, 
  Edit3, 
  MoreHorizontal 
} from 'lucide-react';
import { collection, query, where, onSnapshot, addDoc, deleteDoc, setDoc, doc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { 
  importPrivateKey, 
  importPublicKey, 
  encryptE2EEPayload, 
  decryptE2EEPayload 
} from '../../lib/crypto';
import { 
  getLocalKeyPair, 
  getLocalMessagesFromDB, 
  saveMessageToLocalDB, 
  saveThreadToLocalDB, 
  deleteLocalMessageFromDB 
} from '../../lib/idb';
import { DecryptedMessage, PendingMessageDoc, UserAccount, SignalEventDoc } from '../../lib/types';

interface ChatRoomProps {
  currentUser: UserAccount;
  partner: {
    userId: string;
    username: string;
    fullName: string;
    avatar: string;
    publicKey?: string;
  };
  onBack: () => void;
}

const EPHEMERAL_OPTIONS = [
  { label: 'Off (Permanent)', seconds: 0 },
  { label: 'After viewed 👁️', seconds: -1 },
  { label: '1 Hour ⏳', seconds: 3600 },
  { label: '24 Hours ⌛', seconds: 86400 },
  { label: '7 Days 🗓️', seconds: 604800 },
];

const EMOJI_PRESETS = ['❤️', '🔥', '👍', '😂', '😮', '🙏'];

export const ChatRoom: React.FC<ChatRoomProps> = ({ currentUser, partner, onBack }) => {
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [replyingTo, setReplyingTo] = useState<DecryptedMessage | null>(null);
  const [editingMsg, setEditingMsg] = useState<DecryptedMessage | null>(null);
  
  const [ephemeralTimer, setEphemeralTimer] = useState<number>(
    currentUser.settings?.defaultEphemeralSeconds || 0
  );
  const [showTimerModal, setShowTimerModal] = useState(false);
  const [showImagePreview, setShowImagePreview] = useState<string | null>(null);
  
  // Real-time signals
  const [partnerIsTyping, setPartnerIsTyping] = useState(false);
  const [activeMessageActionId, setActiveMessageActionId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load local chat history from IndexedDB
  const loadLocal = async () => {
    try {
      const list = await getLocalMessagesFromDB(partner.userId);
      setMessages(list);

      // Save summary to thread index
      const last = list.length > 0 ? list[list.length - 1] : undefined;
      await saveThreadToLocalDB({
        partnerId: partner.userId,
        partnerUsername: partner.username,
        partnerFullName: partner.fullName,
        partnerAvatar: partner.avatar,
        partnerPublicKey: partner.publicKey || '',
        isPinned: false,
        isMuted: false,
        isArchived: false,
        lastMessage: last,
        unreadCount: 0,
        ephemeralSetting: ephemeralTimer,
        updatedAt: last ? last.timestamp : Date.now(),
      });
    } catch (err) {
      console.error('Local history load error:', err);
    }
  };

  useEffect(() => {
    loadLocal();

    // Ticker for ephemeral self-destruct cleanup
    const interval = setInterval(() => {
      loadLocal();
    }, 1000);

    return () => clearInterval(interval);
  }, [currentUser.id, partner.userId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Listen for real-time E2EE transit messages from Firestore `/pending_messages`
  useEffect(() => {
    const q = query(
      collection(db, 'pending_messages'),
      where('recipientId', '==', currentUser.id),
      where('senderId', '==', partner.userId)
    );

    const unsubscribe = onSnapshot(
      q,
      async snapshot => {
        const keyPair = await getLocalKeyPair(currentUser.id);
        if (!keyPair) return;

        const recipientPrivKey = await importPrivateKey(keyPair.privateKeyJWK);
        const senderPubKey = await importPublicKey(partner.publicKey || keyPair.publicKeyJWK);

        for (const docSnap of snapshot.docs) {
          const rawData = docSnap.data() as PendingMessageDoc;

          try {
            // Decrypt payload using Web Crypto ECDH + AES-256-GCM
            const decryptedContent = await decryptE2EEPayload(
              rawData.ciphertext,
              rawData.iv,
              rawData.salt,
              recipientPrivKey,
              senderPubKey
            );

            const isImg = decryptedContent.startsWith('data:image/');

            const newDecryptedMsg: DecryptedMessage = {
              id: docSnap.id,
              chatPartnerId: partner.userId,
              senderId: partner.userId,
              senderUsername: partner.username,
              type: isImg ? 'image' : 'text',
              content: decryptedContent,
              timestamp: new Date(rawData.createdAt).getTime() || Date.now(),
              ephemeralSeconds: rawData.ephemeralSeconds,
              readAt: Date.now(),
            };

            // 1. Save decrypted record to local device IndexedDB
            await saveMessageToLocalDB(newDecryptedMsg);

            // 2. Immediately DELETE transient copy from Firebase Store
            await deleteDoc(doc(db, 'pending_messages', docSnap.id));
          } catch (err) {
            console.error('E2EE Decryption Error:', err);
          }
        }
        await loadLocal();
      },
      err => {
        handleFirestoreError(err, OperationType.LIST, 'pending_messages');
      }
    );

    return () => unsubscribe();
  }, [currentUser.id, partner.userId]);

  // Listen for typing signals (if enabled)
  useEffect(() => {
    if (!currentUser.settings?.typingIndicators) return;

    const qSignal = query(
      collection(db, 'signals'),
      where('recipientId', '==', currentUser.id),
      where('senderId', '==', partner.userId)
    );

    const unsubSignal = onSnapshot(qSignal, snapshot => {
      snapshot.docs.forEach(docSnap => {
        const signal = docSnap.data() as SignalEventDoc;
        if (signal.type === 'typing') {
          setPartnerIsTyping(true);
          if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = setTimeout(() => setPartnerIsTyping(false), 3000);
          deleteDoc(doc(db, 'signals', docSnap.id));
        }
      });
    });

    return () => unsubSignal();
  }, [currentUser.id, partner.userId]);

  // Send message handler
  const handleSendMessage = async (type: 'text' | 'image' = 'text', payload = inputText) => {
    if (!payload.trim() && !editingMsg) return;

    if (editingMsg) {
      // Edit local message
      const updated = { ...editingMsg, content: payload, isEdited: true };
      await saveMessageToLocalDB(updated);
      setEditingMsg(null);
      setInputText('');
      loadLocal();
      return;
    }

    const currentEphemeral = ephemeralTimer;
    setInputText('');
    setReplyingTo(null);

    try {
      const keyPair = await getLocalKeyPair(currentUser.id);
      if (!keyPair) throw new Error('Local E2EE identity keypair missing.');

      const senderPrivKey = await importPrivateKey(keyPair.privateKeyJWK);
      const recipientPubKey = await importPublicKey(partner.publicKey || keyPair.publicKeyJWK);

      // Encrypt payload with Web Crypto ECDH + AES-256-GCM
      const encryptedObj = await encryptE2EEPayload(payload, senderPrivKey, recipientPubKey);

      const msgId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // 1. Dispatch encrypted payload to Firebase `/pending_messages` in transit
      await addDoc(collection(db, 'pending_messages'), {
        id: msgId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        recipientId: partner.userId,
        ciphertext: encryptedObj.ciphertext,
        iv: encryptedObj.iv,
        salt: encryptedObj.salt,
        senderPublicKey: keyPair.publicKeyJWK,
        ephemeralSeconds: currentEphemeral,
        createdAt: new Date().toISOString(),
      });

      // 2. Save decrypted record to sender's own IndexedDB local vault
      const localMsg: DecryptedMessage = {
        id: msgId,
        chatPartnerId: partner.userId,
        senderId: currentUser.id,
        senderUsername: currentUser.username,
        type,
        content: payload,
        replyTo: replyingTo ? {
          id: replyingTo.id,
          senderUsername: replyingTo.senderUsername,
          content: replyingTo.content.substring(0, 50),
        } : undefined,
        timestamp: Date.now(),
        ephemeralSeconds: currentEphemeral,
        readAt: Date.now(),
      };

      await saveMessageToLocalDB(localMsg);
      await loadLocal();
    } catch (err: any) {
      console.error('Failed to send encrypted message:', err);
      alert('Encryption error: ' + err.message);
    }
  };

  const handleTypingEvent = () => {
    if (!currentUser.settings?.typingIndicators) return;
    addDoc(collection(db, 'signals'), {
      id: `sig_${Date.now()}`,
      senderId: currentUser.id,
      recipientId: partner.userId,
      type: 'typing',
      timestamp: Date.now(),
    }).catch(() => {});
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Image exceeds 2MB size limit.');
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        handleSendMessage('image', base64);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddReaction = async (msg: DecryptedMessage, emoji: string) => {
    const reactions = msg.reactions || [];
    const updatedReactions = [...reactions.filter(r => r.userId !== currentUser.id), { userId: currentUser.id, emoji }];
    const updated = { ...msg, reactions: updatedReactions };
    await saveMessageToLocalDB(updated);
    setActiveMessageActionId(null);
    loadLocal();
  };

  const handleDeleteLocalMessage = async (msgId: string) => {
    await deleteLocalMessageFromDB(msgId);
    setActiveMessageActionId(null);
    loadLocal();
  };

  return (
    <div className="w-full max-w-2xl mx-auto h-[85vh] flex flex-col bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl relative overflow-hidden text-white">
      {/* Top Navigation Header */}
      <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onBack}
            className="p-2 text-slate-400 hover:text-white hover:bg-slate-900 rounded-xl transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <img
            src={partner.avatar}
            alt={partner.fullName}
            className="w-10 h-10 rounded-full object-cover border border-slate-700 shrink-0"
          />

          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white truncate">{partner.fullName}</h3>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-cyan-400 font-mono">@{partner.username}</span>
              <span className="text-slate-600">·</span>
              <span className="text-emerald-400 flex items-center gap-1 font-mono text-[10px]">
                <ShieldCheck className="w-3 h-3" /> E2EE ECDH P-256
              </span>
            </div>
          </div>
        </div>

        {/* Ephemeral Timer Selector */}
        <button
          onClick={() => setShowTimerModal(true)}
          className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all ${
            ephemeralTimer !== 0
              ? 'bg-amber-500/10 border-amber-500/40 text-amber-400'
              : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
          }`}
        >
          <Flame className={`w-3.5 h-3.5 ${ephemeralTimer !== 0 ? 'text-amber-400 animate-pulse' : ''}`} />
          <span>
            {ephemeralTimer === 0 ? 'Timer: Off' : `${EPHEMERAL_OPTIONS.find(o => o.seconds === ephemeralTimer)?.label}`}
          </span>
        </button>
      </div>

      {/* Disappearing Message Timer Selector Modal */}
      {showTimerModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-xs bg-slate-900 border border-slate-800 rounded-2xl p-5 text-white space-y-3"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
                <Flame className="w-4 h-4" />
                <span>Disappearing Messages</span>
              </div>
              <button onClick={() => setShowTimerModal(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed">
              New messages self-destruct locally on both devices after the selected duration.
            </p>

            <div className="space-y-1.5 pt-1">
              {EPHEMERAL_OPTIONS.map(opt => (
                <button
                  key={opt.seconds}
                  onClick={() => {
                    setEphemeralTimer(opt.seconds);
                    setShowTimerModal(false);
                  }}
                  className={`w-full text-left px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center justify-between transition-colors ${
                    ephemeralTimer === opt.seconds
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'bg-slate-950 hover:bg-slate-800 text-slate-300'
                  }`}
                >
                  <span>{opt.label}</span>
                  {ephemeralTimer === opt.seconds && <Flame className="w-3.5 h-3.5 text-amber-400" />}
                </button>
              ))}
            </div>
          </motion.div>
        </div>
      )}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-950/60">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-2 text-slate-500">
            <ShieldCheck className="w-12 h-12 text-cyan-400/30" />
            <h4 className="text-sm font-semibold text-slate-300">End-to-End Encrypted Session</h4>
            <p className="text-xs max-w-xs text-slate-500">
              Messages are encrypted locally on device before delivery and stored temporarily on Firebase only until received.
            </p>
          </div>
        ) : (
          messages.map(msg => {
            const isMe = msg.senderId === currentUser.id;

            let remainingPercent = 100;
            let remainingSecs = 0;
            if (msg.ephemeralSeconds > 0 && msg.readAt) {
              const expiresAt = msg.readAt + msg.ephemeralSeconds * 1000;
              const left = Math.max(0, expiresAt - Date.now());
              remainingSecs = Math.ceil(left / 1000);
              remainingPercent = (left / (msg.ephemeralSeconds * 1000)) * 100;
            }

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMe ? 'items-end' : 'items-start'} relative group`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl p-3 relative shadow-md ${
                    isMe
                      ? 'bg-cyan-500/10 border border-cyan-500/30 text-white rounded-br-none'
                      : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-bl-none'
                  }`}
                >
                  {/* Reply Quote Block */}
                  {msg.replyTo && (
                    <div className="mb-2 p-2 bg-slate-950/60 border-l-2 border-cyan-400 rounded-r-lg text-[11px] text-slate-400">
                      <span className="font-bold text-cyan-400 block">@{msg.replyTo.senderUsername}</span>
                      <span className="truncate block">{msg.replyTo.content}</span>
                    </div>
                  )}

                  {/* Message Content */}
                  {msg.type === 'image' ? (
                    <div className="rounded-xl overflow-hidden cursor-pointer" onClick={() => setShowImagePreview(msg.content)}>
                      <img src={msg.content} alt="Encrypted image" className="max-h-60 rounded-xl object-cover" />
                    </div>
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                  )}

                  {msg.isEdited && (
                    <span className="text-[10px] text-slate-500 italic block mt-0.5">(edited)</span>
                  )}

                  {/* Reaction Badges */}
                  {msg.reactions && msg.reactions.length > 0 && (
                    <div className="flex gap-1 mt-1.5">
                      {msg.reactions.map((r, i) => (
                        <span key={i} className="text-xs bg-slate-950/80 px-1.5 py-0.5 rounded-full border border-slate-800">
                          {r.emoji}
                        </span>
                      ))}
                    </div>
                  )}

                  {/* Ephemeral Progress Bar */}
                  {msg.ephemeralSeconds > 0 && (
                    <div className="mt-2 pt-1 border-t border-white/10 flex items-center justify-between text-[10px] font-mono text-amber-300">
                      <span className="flex items-center gap-1">
                        <Flame className="w-3 h-3 text-amber-400 animate-pulse" />
                        <span>Self-destruct in {remainingSecs}s</span>
                      </span>
                      <div className="w-16 bg-slate-950 h-1 rounded-full overflow-hidden">
                        <div
                          className="bg-amber-400 h-full transition-all duration-1000"
                          style={{ width: `${remainingPercent}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Footer Timestamp & Delivery Status */}
                  <div className="mt-1 flex items-center justify-end gap-1 text-[9px] font-mono text-slate-500">
                    <span>{new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    {isMe && <CheckCheck className="w-3 h-3 text-cyan-400" />}
                  </div>

                  {/* Action Menu Trigger */}
                  <button
                    onClick={() => setActiveMessageActionId(activeMessageActionId === msg.id ? null : msg.id)}
                    className="absolute top-1 right-1 opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white bg-slate-950/80 rounded-lg transition-opacity"
                  >
                    <MoreHorizontal className="w-3.5 h-3.5" />
                  </button>

                  {/* Action Dropdown Menu */}
                  {activeMessageActionId === msg.id && (
                    <div className="absolute right-0 top-7 z-30 bg-slate-950 border border-slate-800 rounded-xl p-2 shadow-2xl space-y-2 text-xs w-48">
                      {/* Emoji Reactions */}
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-800">
                        {EMOJI_PRESETS.map(emoji => (
                          <button
                            key={emoji}
                            onClick={() => handleAddReaction(msg, emoji)}
                            className="hover:scale-125 transition-transform"
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => {
                          setReplyingTo(msg);
                          setActiveMessageActionId(null);
                        }}
                        className="w-full text-left px-2 py-1 hover:bg-slate-900 rounded-lg flex items-center gap-2 text-slate-300"
                      >
                        <Reply className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Reply</span>
                      </button>

                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(msg.content);
                          setActiveMessageActionId(null);
                        }}
                        className="w-full text-left px-2 py-1 hover:bg-slate-900 rounded-lg flex items-center gap-2 text-slate-300"
                      >
                        <Copy className="w-3.5 h-3.5 text-purple-400" />
                        <span>Copy Text</span>
                      </button>

                      {isMe && msg.type === 'text' && (
                        <button
                          onClick={() => {
                            setEditingMsg(msg);
                            setInputText(msg.content);
                            setActiveMessageActionId(null);
                          }}
                          className="w-full text-left px-2 py-1 hover:bg-slate-900 rounded-lg flex items-center gap-2 text-slate-300"
                        >
                          <Edit3 className="w-3.5 h-3.5 text-amber-400" />
                          <span>Edit Message</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleDeleteLocalMessage(msg.id)}
                        className="w-full text-left px-2 py-1 hover:bg-rose-500/10 rounded-lg flex items-center gap-2 text-rose-400"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Locally</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}

        {/* Partner Typing Indicator */}
        {partnerIsTyping && (
          <div className="text-[11px] text-cyan-400 font-mono italic animate-pulse flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
            <span>@{partner.username} is typing encrypted message...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Reply Banner */}
      {replyingTo && (
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-slate-300">
          <div className="flex items-center gap-2 min-w-0">
            <Reply className="w-4 h-4 text-cyan-400 shrink-0" />
            <span className="truncate">Replying to @{replyingTo.senderUsername}: "{replyingTo.content}"</span>
          </div>
          <button onClick={() => setReplyingTo(null)} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Edit Banner */}
      {editingMsg && (
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 flex items-center justify-between text-xs text-amber-300">
          <div className="flex items-center gap-2 min-w-0">
            <Edit3 className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="truncate">Editing message...</span>
          </div>
          <button onClick={() => { setEditingMsg(null); setInputText(''); }} className="text-slate-500 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Composer Bar */}
      <div className="p-3 bg-slate-950 border-t border-slate-800 shrink-0">
        <form
          onSubmit={e => {
            e.preventDefault();
            handleSendMessage('text', inputText);
          }}
          className="flex items-center gap-2"
        >
          <input
            type="file"
            ref={fileInputRef}
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-900 rounded-xl transition-colors shrink-0"
            title="Attach Encrypted Image"
          >
            <ImageIcon className="w-5 h-5" />
          </button>

          <input
            type="text"
            value={inputText}
            onChange={e => {
              setInputText(e.target.value);
              handleTypingEvent();
            }}
            placeholder="Type end-to-end encrypted message..."
            className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400"
          />

          <button
            type="submit"
            disabled={!inputText.trim() && !editingMsg}
            className="p-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl font-bold transition-all disabled:opacity-40 shrink-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

      {/* Full-Screen Image Viewer */}
      {showImagePreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md" onClick={() => setShowImagePreview(null)}>
          <div className="relative max-w-lg max-h-[80vh]">
            <img src={showImagePreview} alt="Full view" className="max-w-full max-h-[80vh] rounded-2xl object-contain shadow-2xl" />
            <button
              onClick={() => setShowImagePreview(null)}
              className="absolute top-2 right-2 p-2 bg-slate-900 text-white rounded-full hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
