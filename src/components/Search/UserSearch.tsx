import React, { useState } from 'react';
import { Search, UserPlus, Shield, Lock, ArrowRight, UserCheck } from 'lucide-react';
import { collection, query, where, getDocs, limit } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { PublicProfile } from '../../lib/types';

interface UserSearchProps {
  currentUserId: string;
  onStartChat: (partner: { userId: string; username: string; fullName: string; avatar: string }) => void;
  onOpenQRScanner: () => void;
}

export const UserSearch: React.FC<UserSearchProps> = ({ currentUserId, onStartChat, onOpenQRScanner }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState<PublicProfile[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = searchTerm.trim().toLowerCase().replace('@', '');
    if (!clean) return;

    setIsLoading(true);
    setHasSearched(true);

    try {
      // Query public directory ONLY (Private accounts are excluded from public_profiles!)
      const q = query(
        collection(db, 'public_profiles'),
        where('username', '>=', clean),
        where('username', '<=', clean + '\uf8ff'),
        limit(15)
      );

      const snapshot = await getDocs(q);
      const profiles: PublicProfile[] = [];

      snapshot.forEach(docSnap => {
        const data = docSnap.data() as PublicProfile;
        if (data.userId !== currentUserId) {
          profiles.push(data);
        }
      });

      setResults(profiles);
    } catch (err: any) {
      console.error('Search error:', err);
      handleFirestoreError(err, OperationType.LIST, 'public_profiles');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <Search className="w-5 h-5 text-cyan-400" />
              Public Directory Search
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Find public CipherX accounts by handle. Private accounts remain untraceable.
            </p>
          </div>

          <button
            onClick={onOpenQRScanner}
            className="px-4 py-2.5 bg-gradient-to-r from-purple-500/20 to-cyan-500/20 border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-sm"
          >
            <Lock className="w-4 h-4 text-purple-400" />
            <span>Connect via QR Code</span>
          </button>
        </div>

        {/* Search Input Bar */}
        <form onSubmit={handleSearch} className="mt-5 flex gap-2">
          <div className="relative flex-1">
            <span className="absolute left-3.5 top-3 text-slate-500 font-mono text-sm">@</span>
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by username (e.g. alex_mercer)"
              className="w-full pl-8 pr-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <button
            type="submit"
            disabled={!searchTerm.trim() || isLoading}
            className="px-5 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {isLoading ? (
              <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
            ) : (
              <>
                <Search className="w-4 h-4" />
                <span>Search</span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Results List */}
      <div className="space-y-3">
        {hasSearched && results.length === 0 && !isLoading && (
          <div className="bg-slate-900/50 border border-slate-800/80 rounded-2xl p-8 text-center space-y-2">
            <Shield className="w-8 h-8 text-slate-600 mx-auto" />
            <h3 className="text-sm font-semibold text-slate-300">No Public Accounts Found</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Private accounts are hidden from directory searches. Ask them to share their encrypted QR code to connect directly.
            </p>
          </div>
        )}

        {results.map(profile => (
          <div
            key={profile.userId}
            className="bg-slate-900/90 border border-slate-800/80 hover:border-cyan-500/40 rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:bg-slate-900 shadow-md group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-800 border border-slate-700/60 shrink-0">
                <img src={profile.avatar} alt={profile.fullName} className="w-full h-full object-cover" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-bold text-white truncate">{profile.fullName}</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-medium">
                    Public
                  </span>
                </div>
                <p className="text-xs font-mono text-cyan-400 truncate">@{profile.username}</p>
                {profile.bio && <p className="text-xs text-slate-400 truncate mt-0.5">{profile.bio}</p>}
              </div>
            </div>

            <button
              onClick={() => onStartChat({
                userId: profile.userId,
                username: profile.username,
                fullName: profile.fullName,
                avatar: profile.avatar,
              })}
              className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500 text-cyan-400 hover:text-slate-950 border border-cyan-500/30 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-all shrink-0 group-hover:scale-105"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Start E2EE Chat</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
