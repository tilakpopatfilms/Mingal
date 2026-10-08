import React, { useState } from 'react';
import { ShieldCheck, Key, Lock, AtSign, ArrowRight, AlertTriangle } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureAuthSession } from '../../firebase';
import { hashWithSalt, normalizeSecurityKey, generateIdentityKeyPair } from '../../lib/crypto';
import { getLocalKeyPair, saveLocalKeyPair } from '../../lib/idb';
import { UserAccount } from '../../lib/types';

interface SignInModalProps {
  onSuccess: (user: UserAccount) => void;
  onSwitchToSignUp: () => void;
}

export const SignInModal: React.FC<SignInModalProps> = ({ onSuccess, onSwitchToSignUp }) => {
  const [authMethod, setAuthMethod] = useState<'password' | 'securityKey'>('password');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [securityKey, setSecurityKey] = useState('');
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanUsername = username.trim().toLowerCase();
    if (!cleanUsername) {
      setError('Please enter your username.');
      return;
    }

    setIsLoading(true);

    try {
      await ensureAuthSession();
      // Query account document
      const q = query(collection(db, 'users'), where('username', '==', cleanUsername));
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        setError('No account found with this username.');
        setIsLoading(false);
        return;
      }

      const userDoc = querySnapshot.docs[0];
      const userData = userDoc.data() as UserAccount;

      if (authMethod === 'password') {
        if (!password) {
          setError('Please enter your password.');
          setIsLoading(false);
          return;
        }

        const computedHash = await hashWithSalt(password, userData.passwordSalt);
        if (computedHash !== userData.passwordHash) {
          setError('Incorrect password.');
          setIsLoading(false);
          return;
        }
      } else {
        // Option B: Security Key Authentication
        if (!securityKey.trim()) {
          setError('Please enter your 12-character Security Key.');
          setIsLoading(false);
          return;
        }

        const normalizedInput = normalizeSecurityKey(securityKey);
        const computedHash = await hashWithSalt(normalizedInput, userData.securityKeySalt);

        if (computedHash !== userData.securityKeyHash) {
          setError('Invalid Security Key. Format: ABCD-EFGH-IJKL');
          setIsLoading(false);
          return;
        }
      }

      // Ensure local device keypair exists in IndexedDB
      let existingKeyPair = await getLocalKeyPair(userData.id);
      if (!existingKeyPair) {
        // If logging in on a new device, generate device keypair and associate
        const { keyPairJWK } = await generateIdentityKeyPair();
        await saveLocalKeyPair({
          userId: userData.id,
          publicKeyJWK: keyPairJWK.publicKeyJWK,
          privateKeyJWK: keyPairJWK.privateKeyJWK,
        });
      }

      onSuccess(userData);
    } catch (err: any) {
      console.error('Sign in error:', err);
      handleFirestoreError(err, OperationType.LIST, 'users');
      setError('Authentication failed. Please verify credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative text-slate-100">
      {/* Header */}
      <div className="text-center space-y-2 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400">
          <ShieldCheck className="w-6 h-6" />
        </div>
        <h2 className="text-2xl font-bold text-white">CipherX Authentication</h2>
        <p className="text-xs text-slate-400">Private by design. End-to-end encrypted.</p>
      </div>

      {/* Option A vs Option B Selector */}
      <div className="flex bg-slate-950 p-1 rounded-2xl border border-slate-800 mb-6">
        <button
          type="button"
          onClick={() => {
            setAuthMethod('password');
            setError(null);
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            authMethod === 'password'
              ? 'bg-slate-800 text-cyan-400 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Lock className="w-3.5 h-3.5" />
          <span>Option A: Password</span>
        </button>

        <button
          type="button"
          onClick={() => {
            setAuthMethod('securityKey');
            setError(null);
          }}
          className={`flex-1 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
            authMethod === 'securityKey'
              ? 'bg-slate-800 text-purple-400 shadow-sm'
              : 'text-slate-400 hover:text-white'
          }`}
        >
          <Key className="w-3.5 h-3.5" />
          <span>Option B: Key</span>
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSignIn} className="space-y-4">
        {/* Username */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <AtSign className="w-3.5 h-3.5 text-cyan-400" />
            Username
          </label>
          <input
            type="text"
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
            placeholder="alex_mercer"
            required
            className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
          />
        </div>

        {/* Option A: Password */}
        {authMethod === 'password' ? (
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
            />
          </div>
        ) : (
          /* Option B: Security Key */
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-purple-400" />
              12-Character Security Key
            </label>
            <input
              type="text"
              value={securityKey}
              onChange={e => setSecurityKey(e.target.value)}
              placeholder="ABCD-EFGH-IJKL"
              required
              className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono tracking-wider text-white placeholder-slate-600 focus:outline-none focus:border-purple-400 uppercase"
            />
            <p className="text-[10px] text-slate-500">
              Format: ABCD-EFGH-IJKL
            </p>
          </div>
        )}

        <button
          type="submit"
          disabled={isLoading}
          className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all mt-2"
        >
          {isLoading ? (
            <span className="flex items-center gap-2 text-xs">
              <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              Verifying Hash...
            </span>
          ) : (
            <>
              <span className="text-xs">Authenticate Vault</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      <div className="mt-6 pt-4 border-t border-slate-800 text-center">
        <p className="text-xs text-slate-400">
          Need a CipherX keypair?{' '}
          <button
            onClick={onSwitchToSignUp}
            className="text-cyan-400 hover:text-cyan-300 font-bold underline ml-1"
          >
            Create Account (6 Steps)
          </button>
        </p>
      </div>
    </div>
  );
};
