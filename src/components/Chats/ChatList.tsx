import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Pin, 
  Search, 
  QrCode, 
  Plus, 
  ShieldCheck, 
  Flame, 
  Trash2, 
  BellOff, 
  Archive, 
  MessageSquare,
  MoreVertical,
  CheckCheck
} from 'lucide-react';
import { ChatThread } from '../../lib/types';
import { getLocalThreadsFromDB, saveThreadToLocalDB, deleteThreadFromDB } from '../../lib/idb';

interface ChatListProps {
  currentUserId: string;
  onSelectThread: (thread: ChatThread) => void;
  onOpenQRScanner: () => void;
  onGoToSearch: () => void;
}

export const ChatList: React.FC<ChatListProps> = ({
  currentUserId,
  onSelectThread,
  onOpenQRScanner,
  onGoToSearch,
}) => {
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [filterTab, setFilterTab] = useState<'all' | 'pinned' | 'archived'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  const loadThreads = async () => {
    try {
      const list = await getLocalThreadsFromDB();
      setThreads(list);
    } catch (err) {
      console.error('Failed to load local threads:', err);
    }
  };

  useEffect(() => {
    loadThreads();
    const interval = setInterval(loadThreads, 2000);
    return () => clearInterval(interval);
  }, [currentUserId]);

  const handleTogglePin = async (e: React.MouseEvent, thread: ChatThread) => {
    e.stopPropagation();
    const updated = { ...thread, isPinned: !thread.isPinned };
    await saveThreadToLocalDB(updated);
    setActiveMenuId(null);
    loadThreads();
  };

  const handleToggleMute = async (e: React.MouseEvent, thread: ChatThread) => {
    e.stopPropagation();
    const updated = { ...thread, isMuted: !thread.isMuted };
    await saveThreadToLocalDB(updated);
    setActiveMenuId(null);
    loadThreads();
  };

  const handleToggleArchive = async (e: React.MouseEvent, thread: ChatThread) => {
    e.stopPropagation();
    const updated = { ...thread, isArchived: !thread.isArchived };
    await saveThreadToLocalDB(updated);
    setActiveMenuId(null);
    loadThreads();
  };

  const handleDelete = async (e: React.MouseEvent, partnerId: string) => {
    e.stopPropagation();
    if (confirm('Delete local conversation history? This removes decrypted copies from this device.')) {
      await deleteThreadFromDB(partnerId);
      setActiveMenuId(null);
      loadThreads();
    }
  };

  const filteredThreads = threads.filter(t => {
    // Search query filter
    const matchesSearch = 
      t.partnerFullName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.partnerUsername.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;

    if (filterTab === 'pinned') return t.isPinned && !t.isArchived;
    if (filterTab === 'archived') return t.isArchived;
    return !t.isArchived;
  });

  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      {/* Top Bar Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-4 space-y-3 shadow-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <h2 className="text-lg font-bold text-white">End-to-End Encrypted Chats</h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onOpenQRScanner}
              className="p-2.5 bg-slate-950 hover:bg-slate-800 text-cyan-400 rounded-xl border border-slate-800 transition-colors"
              title="Scan QR Code"
            >
              <QrCode className="w-4 h-4" />
            </button>

            <button
              onClick={onGoToSearch}
              className="px-3.5 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md"
            >
              <Plus className="w-4 h-4" />
              <span>New Chat</span>
            </button>
          </div>
        </div>

        {/* Filter Bar & Tabs */}
        <div className="flex items-center gap-2 pt-1">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Filter local conversations..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
            />
          </div>

          <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setFilterTab('all')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'all' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilterTab('pinned')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'pinned' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Pinned
            </button>
            <button
              onClick={() => setFilterTab('archived')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                filterTab === 'archived' ? 'bg-slate-800 text-amber-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Archived
            </button>
          </div>
        </div>
      </div>

      {/* Threads List */}
      <div className="space-y-2.5">
        {filteredThreads.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 text-center space-y-3">
            <MessageSquare className="w-10 h-10 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">
              {filterTab === 'archived' ? 'No Archived Conversations' : 'No Active Conversations'}
            </h3>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              Search for public accounts or scan a friend's QR code to initiate a secure E2EE messaging session.
            </p>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={onGoToSearch}
                className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-bold transition-all"
              >
                Find Handle
              </button>
              <button
                onClick={onOpenQRScanner}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Scan QR Code
              </button>
            </div>
          </div>
        ) : (
          filteredThreads.map(thread => (
            <div
              key={thread.partnerId}
              onClick={() => onSelectThread(thread)}
              className={`p-4 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 relative group ${
                thread.isPinned
                  ? 'bg-slate-900 border-cyan-500/40 shadow-md'
                  : 'bg-slate-900/80 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative">
                  <img
                    src={thread.partnerAvatar}
                    alt={thread.partnerFullName}
                    className="w-12 h-12 rounded-full object-cover border border-slate-700 shrink-0"
                  />
                  {thread.ephemeralSetting > 0 && (
                    <div className="absolute -bottom-1 -right-1 bg-amber-500 text-slate-950 rounded-full p-1 border border-slate-950">
                      <Flame className="w-3 h-3 stroke-[2.5]" />
                    </div>
                  )}
                </div>

                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white truncate">{thread.partnerFullName}</h4>
                    {thread.isPinned && <Pin className="w-3 h-3 text-cyan-400 fill-cyan-400 shrink-0" />}
                    {thread.isMuted && <BellOff className="w-3 h-3 text-slate-500 shrink-0" />}
                  </div>
                  <p className="text-xs font-mono text-cyan-400 truncate">@{thread.partnerUsername}</p>
                  {thread.lastMessage ? (
                    <p className="text-xs text-slate-400 truncate mt-0.5 flex items-center gap-1">
                      {thread.lastMessage.type === 'image' ? '📷 Encrypted Image' : thread.lastMessage.content}
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500 italic mt-0.5">Empty conversation session</p>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {thread.lastMessage && (
                  <span className="text-[10px] text-slate-500 font-mono">
                    {new Date(thread.lastMessage.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}

                {/* Dropdown Action Menu */}
                <div className="relative" onClick={e => e.stopPropagation()}>
                  <button
                    onClick={() => setActiveMenuId(activeMenuId === thread.partnerId ? null : thread.partnerId)}
                    className="p-1.5 text-slate-500 hover:text-white rounded-lg transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {activeMenuId === thread.partnerId && (
                    <div className="absolute right-0 top-8 z-30 w-44 bg-slate-950 border border-slate-800 rounded-xl p-1.5 shadow-2xl space-y-1">
                      <button
                        onClick={e => handleTogglePin(e, thread)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-900 flex items-center gap-2"
                      >
                        <Pin className="w-3.5 h-3.5 text-cyan-400" />
                        <span>{thread.isPinned ? 'Unpin Chat' : 'Pin Chat'}</span>
                      </button>

                      <button
                        onClick={e => handleToggleMute(e, thread)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-900 flex items-center gap-2"
                      >
                        <BellOff className="w-3.5 h-3.5 text-purple-400" />
                        <span>{thread.isMuted ? 'Unmute Chat' : 'Mute Notifications'}</span>
                      </button>

                      <button
                        onClick={e => handleToggleArchive(e, thread)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-slate-300 hover:bg-slate-900 flex items-center gap-2"
                      >
                        <Archive className="w-3.5 h-3.5 text-amber-400" />
                        <span>{thread.isArchived ? 'Unarchive' : 'Archive Chat'}</span>
                      </button>

                      <button
                        onClick={e => handleDelete(e, thread.partnerId)}
                        className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-medium text-rose-400 hover:bg-rose-500/10 flex items-center gap-2"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete Local History</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
