import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  MessageSquare, 
  Search, 
  User, 
  QrCode, 
  Lock, 
  Sparkles, 
  LogOut 
} from 'lucide-react';

import { UserAccount, ChatThread } from './lib/types';
import { SignUpWizard } from './components/Auth/SignUpWizard';
import { SignInModal } from './components/Auth/SignInModal';
import { ChatList } from './components/Chats/ChatList';
import { ChatRoom } from './components/Chats/ChatRoom';
import { UserSearch } from './components/Search/UserSearch';
import { ProfileSection } from './components/Profile/ProfileSection';
import { QRScannerModal } from './components/QR/QRScannerModal';

export default function App() {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [authView, setAuthView] = useState<'signin' | 'signup'>('signin');
  const [activeTab, setActiveTab] = useState<'chats' | 'search' | 'profile'>('chats');
  
  // Selected Chat partner for direct messaging
  const [activePartner, setActivePartner] = useState<{
    userId: string;
    username: string;
    fullName: string;
    avatar: string;
    publicKey?: string;
  } | null>(null);

  // QR Scanner Modal State
  const [showQRScanner, setShowQRScanner] = useState(false);

  // Restore session from localStorage if present
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cipherx_current_user_session');
      if (saved) {
        setCurrentUser(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Session load error:', err);
    }
  }, []);

  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    localStorage.setItem('cipherx_current_user_session', JSON.stringify(user));
  };

  const handleSignOut = () => {
    setCurrentUser(null);
    setActivePartner(null);
    localStorage.removeItem('cipherx_current_user_session');
  };

  const handleConnectUserFromSearchOrQR = (partner: {
    userId: string;
    username: string;
    fullName: string;
    avatar: string;
  }) => {
    setActivePartner(partner);
  };

  return (
    <div className="min-h-screen bg-[#090A0F] text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-slate-950">
      {/* Background Cyber Grid & Glows */}
      <div className="fixed inset-0 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:24px_24px] opacity-20 pointer-events-none" />
      <div className="fixed top-0 left-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="fixed bottom-0 right-1/4 w-[500px] h-[500px] bg-purple-500/10 rounded-full blur-[120px] pointer-events-none" />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-slate-950/80 border-b border-slate-800/80 backdrop-blur-xl px-4 py-3">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          {/* Brand Logo */}
          <a href="/" className="flex items-center gap-2.5 group">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 group-hover:scale-105 transition-transform">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-white via-cyan-200 to-cyan-400 bg-clip-text text-transparent">
                CipherX
              </h1>
            </div>
          </a>

          {/* User Status / Auth Controls */}
          {currentUser ? (
            <div className="flex items-center gap-3">
              <span className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 bg-cyan-500/10 border border-cyan-500/30 rounded-full text-[11px] font-mono text-cyan-400">
                <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
                <span>Zero-Knowledge E2EE</span>
              </span>

              <button
                onClick={() => setShowQRScanner(true)}
                className="p-2 bg-slate-900 hover:bg-slate-800 text-cyan-400 rounded-xl border border-slate-800 transition-colors"
                title="Scan Contact QR Code"
              >
                <QrCode className="w-4 h-4" />
              </button>

              <div className="flex items-center gap-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1">
                <img
                  src={currentUser.avatar}
                  alt={currentUser.fullName}
                  className="w-6 h-6 rounded-full object-cover"
                />
                <span className="text-xs font-mono font-bold text-white hidden sm:inline">
                  @{currentUser.username}
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={() => setAuthView('signin')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  authView === 'signin'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => setAuthView('signup')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                  authView === 'signup'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Create Account
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 flex flex-col justify-center">
        {!currentUser ? (
          <div className="py-8">
            <AnimatePresence mode="wait">
              {authView === 'signin' ? (
                <motion.div key="signin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <SignInModal onSuccess={handleAuthSuccess} onSwitchToSignUp={() => setAuthView('signup')} />
                </motion.div>
              ) : (
                <motion.div key="signup" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
                  <SignUpWizard onSuccess={handleAuthSuccess} onSwitchToSignIn={() => setAuthView('signin')} />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ) : activePartner ? (
          /* Active E2EE Chat Room Screen */
          <ChatRoom
            currentUser={currentUser}
            partner={activePartner}
            onBack={() => setActivePartner(null)}
          />
        ) : (
          /* Main 3 Sections: Chats, Search, Profile */
          <div className="space-y-6">
            <AnimatePresence mode="wait">
              {activeTab === 'chats' && (
                <motion.div key="chats" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  <ChatList
                    currentUserId={currentUser.id}
                    onSelectThread={thread => setActivePartner({
                      userId: thread.partnerId,
                      username: thread.partnerUsername,
                      fullName: thread.partnerFullName,
                      avatar: thread.partnerAvatar,
                    })}
                    onOpenQRScanner={() => setShowQRScanner(true)}
                    onGoToSearch={() => setActiveTab('search')}
                  />
                </motion.div>
              )}

              {activeTab === 'search' && (
                <motion.div key="search" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  <UserSearch
                    currentUserId={currentUser.id}
                    onStartChat={handleConnectUserFromSearchOrQR}
                    onOpenQRScanner={() => setShowQRScanner(true)}
                  />
                </motion.div>
              )}

              {activeTab === 'profile' && (
                <motion.div key="profile" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 10 }}>
                  <ProfileSection
                    user={currentUser}
                    onUpdateUser={updated => {
                      setCurrentUser(updated);
                      localStorage.setItem('cipherx_current_user_session', JSON.stringify(updated));
                    }}
                    onSignOut={handleSignOut}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </main>

      {/* Bottom Sticky Navigation Bar for Logged-In User */}
      {currentUser && !activePartner && (
        <div className="sticky bottom-0 z-40 bg-slate-950/90 border-t border-slate-800/80 backdrop-blur-xl p-2.5">
          <div className="max-w-md mx-auto flex items-center justify-around bg-slate-900/90 border border-slate-800 rounded-2xl p-1.5 shadow-xl">
            {/* Chats Tab */}
            <button
              onClick={() => setActiveTab('chats')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                activeTab === 'chats'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Chats</span>
            </button>

            {/* Search Tab */}
            <button
              onClick={() => setActiveTab('search')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                activeTab === 'search'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Search className="w-4 h-4" />
              <span>Search</span>
            </button>

            {/* Profile Tab */}
            <button
              onClick={() => setActiveTab('profile')}
              className={`flex-1 py-2 rounded-xl text-xs font-bold flex flex-col items-center gap-1 transition-all ${
                activeTab === 'profile'
                  ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <User className="w-4 h-4" />
              <span>Profile</span>
            </button>
          </div>
        </div>
      )}

      {/* QR Scanner Modal */}
      {showQRScanner && (
        <QRScannerModal
          onClose={() => setShowQRScanner(false)}
          onConnectUser={handleConnectUserFromSearchOrQR}
        />
      )}
    </div>
  );
}
