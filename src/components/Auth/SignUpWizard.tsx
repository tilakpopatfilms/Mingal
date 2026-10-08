import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, 
  Lock, 
  User, 
  AtSign, 
  Globe, 
  Key, 
  ArrowRight, 
  ArrowLeft, 
  Check, 
  Copy, 
  AlertTriangle,
  Camera,
  Eye,
  EyeOff
} from 'lucide-react';
import { collection, doc, setDoc, getDocs, query, where } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType, ensureAuthSession } from '../../firebase';
import { 
  generateSalt, 
  generateSecurityKey, 
  hashWithSalt, 
  encryptTextLocal, 
  normalizeSecurityKey,
  generateIdentityKeyPair 
} from '../../lib/crypto';
import { saveLocalKeyPair } from '../../lib/idb';
import { AccountType, UserAccount } from '../../lib/types';

interface SignUpWizardProps {
  onSuccess: (user: UserAccount, rawSecurityKey: string) => void;
  onSwitchToSignIn: () => void;
}

const AVATAR_PRESETS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
  'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
];

export const SignUpWizard: React.FC<SignUpWizardProps> = ({ onSuccess, onSwitchToSignIn }) => {
  const [step, setStep] = useState<number>(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [avatar, setAvatar] = useState<string>(AVATAR_PRESETS[0]);
  const [customAvatarUrl, setCustomAvatarUrl] = useState<string>('');
  const [fullName, setFullName] = useState<string>('');
  const [username, setUsername] = useState<string>('');
  const [accountType, setAccountType] = useState<AccountType>('public');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  
  const [showPassword, setShowPassword] = useState(false);
  const [generatedKeyResult, setGeneratedKeyResult] = useState<{ rawKey: string; user: UserAccount } | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  const canAdvanceStep = (): boolean => {
    switch (step) {
      case 1:
        return true; // Profile picture is optional
      case 2:
        return fullName.trim().length >= 2;
      case 3:
        return /^[a-zA-Z0-9_]{3,20}$/.test(username.trim());
      case 4:
        return true; // Account type public/private selected
      case 5:
        return password.length >= 6;
      case 6:
        return password.length >= 6 && password === confirmPassword;
      default:
        return false;
    }
  };

  const checkUsernameAvailable = async (rawUsername: string): Promise<boolean> => {
    try {
      await ensureAuthSession();
      const clean = rawUsername.trim().toLowerCase();
      const q = query(collection(db, 'users'), where('username', '==', clean));
      const snap = await getDocs(q);
      return snap.empty;
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, 'users');
      return false;
    }
  };

  const handleNext = async () => {
    setError(null);
    if (!canAdvanceStep()) return;

    if (step === 3) {
      setIsLoading(true);
      const isAvailable = await checkUsernameAvailable(username);
      setIsLoading(false);
      if (!isAvailable) {
        setError('Username is already taken. Please choose a unique handle.');
        return;
      }
    }

    if (step < 6) {
      setStep(prev => prev + 1);
    } else {
      await handleCompleteSignUp();
    }
  };

  const handleCompleteSignUp = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const cleanUsername = username.trim().toLowerCase();
      const finalAvatar = customAvatarUrl.trim() || avatar;
      
      // 1. Generate 12-char Security Key formatted "ABCD-EFGH-IJKL"
      const rawSecurityKey = generateSecurityKey();
      const normalizedKey = normalizeSecurityKey(rawSecurityKey);

      // 2. Generate Web Crypto ECDH P-256 Identity KeyPair for E2EE
      const { keyPairJWK } = await generateIdentityKeyPair();

      // 3. Generate cryptographic salts & hashes
      const passSalt = generateSalt(16);
      const keySalt = generateSalt(16);

      const passwordHash = await hashWithSalt(password, passSalt);
      const securityKeyHash = await hashWithSalt(normalizedKey, keySalt);

      // 4. Encrypt raw Security Key locally with password key for review later
      const keyEncryptedObj = await encryptTextLocal(normalizedKey, password, passSalt);
      const securityKeyEncrypted = `${keyEncryptedObj.ciphertext}::${keyEncryptedObj.iv}`;

      // Generate UID
      const userId = `usr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      // Save Private ECDH Key locally in device IndexedDB (NEVER uploaded to server!)
      await saveLocalKeyPair({
        userId,
        publicKeyJWK: keyPairJWK.publicKeyJWK,
        privateKeyJWK: keyPairJWK.privateKeyJWK,
      });

      const newUser: UserAccount = {
        id: userId,
        username: cleanUsername,
        fullName: fullName.trim(),
        avatar: finalAvatar,
        bio: 'Private by design',
        accountType,
        passwordHash,
        passwordSalt: passSalt,
        securityKeyHash,
        securityKeySalt: keySalt,
        securityKeyEncrypted,
        publicKey: keyPairJWK.publicKeyJWK, // Publish Public Key
        settings: {
          readReceipts: true,
          typingIndicators: true,
          onlineStatus: true,
          defaultEphemeralSeconds: 0,
        },
        blockedUserIds: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // 5. Write account record to Firestore
      await setDoc(doc(db, 'users', userId), newUser);

      // 6. If Public, publish to public directory
      if (accountType === 'public') {
        await setDoc(doc(db, 'public_profiles', userId), {
          userId,
          username: cleanUsername,
          fullName: fullName.trim(),
          avatar: finalAvatar,
          bio: newUser.bio,
          publicKey: newUser.publicKey,
          updatedAt: newUser.updatedAt,
        });
      }

      setGeneratedKeyResult({ rawKey: rawSecurityKey, user: newUser });
    } catch (err: any) {
      setError(err.message || 'Failed to create account. Please try again.');
      console.error('Registration error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (!generatedKeyResult) return;
    navigator.clipboard.writeText(generatedKeyResult.rawKey);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  };

  return (
    <div className="w-full max-w-lg mx-auto bg-slate-900 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl relative overflow-hidden text-slate-100">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Create CipherX Account</h1>
            <p className="text-xs text-slate-400">Step {generatedKeyResult ? '6/6' : `${step} of 6`}</p>
          </div>
        </div>
        <button
          onClick={onSwitchToSignIn}
          className="text-xs text-cyan-400 hover:text-cyan-300 font-medium underline"
        >
          Sign In
        </button>
      </div>

      {/* Progress Indicator */}
      {!generatedKeyResult && (
        <div className="w-full bg-slate-800 h-1.5 rounded-full mb-6 overflow-hidden">
          <motion.div
            className="h-full bg-cyan-400 rounded-full"
            initial={{ width: '16.6%' }}
            animate={{ width: `${(step / 6) * 100}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
      )}

      {/* SECURITY KEY RESULT DISPLAY */}
      {generatedKeyResult ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="space-y-6"
        >
          <div className="text-center space-y-2">
            <div className="w-12 h-12 bg-emerald-500/20 border border-emerald-500/40 rounded-full flex items-center justify-center mx-auto text-emerald-400 mb-2">
              <Check className="w-6 h-6" />
            </div>
            <h2 className="text-xl font-bold text-white">Identity Credentials Created!</h2>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Your account has been configured with an E2EE key pair and permanent Security Key.
            </p>
          </div>

          <div className="bg-slate-950 border border-cyan-500/30 rounded-2xl p-4 text-center relative">
            <span className="text-[10px] text-cyan-400 uppercase tracking-widest font-mono block mb-1">
              Your Permanent Security Key
            </span>
            <div className="text-2xl font-mono font-bold tracking-widest text-white my-2 select-all bg-slate-900 py-2.5 rounded-xl border border-slate-800">
              {generatedKeyResult.rawKey}
            </div>
            <button
              onClick={handleCopyKey}
              className="mt-2 w-full py-2 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all"
            >
              {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
              {copiedKey ? 'Copied to Clipboard!' : 'Copy Security Key'}
            </button>
          </div>

          <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex items-start gap-3 text-xs text-amber-300">
            <AlertTriangle className="w-5 h-5 shrink-0 text-amber-400 mt-0.5" />
            <div>
              <p className="font-semibold mb-0.5">Critical Security Rules:</p>
              <p className="text-amber-300/80 leading-relaxed">
                Save this key in a password manager. It cannot be deleted or regenerated. You can use it to sign in or recover access, and review it from Profile by entering your password.
              </p>
            </div>
          </div>

          <button
            onClick={() => onSuccess(generatedKeyResult.user, generatedKeyResult.rawKey)}
            className="w-full py-3 bg-cyan-400 hover:bg-cyan-300 text-slate-950 font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 transition-all"
          >
            <span>Enter Encrypted Messaging Vault</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </motion.div>
      ) : (
        /* STEP WIZARD CONTENT */
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 15 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -15 }}
            transition={{ duration: 0.2 }}
            className="space-y-5"
          >
            {error && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* STEP 1: Profile Picture (Optional) */}
            {step === 1 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Camera className="w-4 h-4 text-cyan-400" />
                    Step 1: Profile Picture (Optional)
                  </h3>
                  <p className="text-xs text-slate-400">Select an avatar or paste a custom avatar URL.</p>
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {AVATAR_PRESETS.map((url, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        setAvatar(url);
                        setCustomAvatarUrl('');
                      }}
                      className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all ${
                        avatar === url && !customAvatarUrl
                          ? 'border-cyan-400 scale-105 shadow-md ring-2 ring-cyan-400/20'
                          : 'border-slate-800 hover:border-slate-700 opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={url} alt={`Avatar ${idx + 1}`} className="w-full h-full object-cover" />
                      {avatar === url && !customAvatarUrl && (
                        <div className="absolute top-1 right-1 bg-cyan-400 text-slate-950 rounded-full p-0.5">
                          <Check className="w-3 h-3 stroke-[3]" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <div className="space-y-1 pt-1">
                  <label className="text-xs text-slate-400">Custom Avatar Image URL:</label>
                  <input
                    type="url"
                    value={customAvatarUrl}
                    onChange={e => setCustomAvatarUrl(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                  />
                </div>
              </div>
            )}

            {/* STEP 2: Full Name */}
            {step === 2 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <User className="w-4 h-4 text-cyan-400" />
                    Step 2: Full Name
                  </h3>
                  <p className="text-xs text-slate-400">Your display name for direct conversations.</p>
                </div>

                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="e.g. Alex Mercer"
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {/* STEP 3: Username */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <AtSign className="w-4 h-4 text-cyan-400" />
                    Step 3: Permanent Username
                  </h3>
                  <p className="text-xs text-slate-400">3-20 letters or numbers. This handle cannot be changed later!</p>
                </div>

                <div className="relative">
                  <span className="absolute left-3.5 top-3 text-slate-500 font-mono text-sm">@</span>
                  <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="alex_mercer"
                    autoFocus
                    className="w-full pl-8 pr-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <p className="text-[11px] text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  Usernames are locked and permanent upon creation.
                </p>
              </div>
            )}

            {/* STEP 4: Account Type */}
            {step === 4 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Globe className="w-4 h-4 text-cyan-400" />
                    Step 4: Account Visibility
                  </h3>
                  <p className="text-xs text-slate-400">Control if your username is discoverable in public search.</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setAccountType('public')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      accountType === 'public'
                        ? 'bg-cyan-500/10 border-cyan-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Globe className="w-5 h-5 text-cyan-400" />
                      {accountType === 'public' && <Check className="w-4 h-4 text-cyan-400" />}
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Public Account</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Searchable by handle in public username directory.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setAccountType('private')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                      accountType === 'private'
                        ? 'bg-purple-500/10 border-purple-400 text-white'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <Lock className="w-5 h-5 text-purple-400" />
                      {accountType === 'private' && <Check className="w-4 h-4 text-purple-400" />}
                    </div>
                    <h4 className="text-sm font-bold text-white mb-1">Private Account</h4>
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      Hidden from search! Connect strictly via direct QR scan.
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* STEP 5: Password */}
            {step === 5 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <Key className="w-4 h-4 text-cyan-400" />
                    Step 5: Password
                  </h3>
                  <p className="text-xs text-slate-400">Must be at least 6 characters long.</p>
                </div>

                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoFocus
                    className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:border-cyan-400 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-3.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 6: Confirm Password */}
            {step === 6 && (
              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-cyan-400" />
                    Step 6: Confirm Password
                  </h3>
                  <p className="text-xs text-slate-400">Re-enter your master password to verify.</p>
                </div>

                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoFocus
                  className={`w-full px-4 py-3 bg-slate-950 border rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none ${
                    confirmPassword && confirmPassword !== password
                      ? 'border-rose-500'
                      : 'border-slate-800 focus:border-cyan-400'
                  }`}
                />
                {confirmPassword && confirmPassword !== password && (
                  <p className="text-xs text-rose-400">Passwords do not match.</p>
                )}
              </div>
            )}

            {/* Navigation buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(prev => prev - 1)}
                  disabled={isLoading}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back</span>
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvanceStep() || isLoading}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  canAdvanceStep() && !isLoading
                    ? 'bg-cyan-400 hover:bg-cyan-300 text-slate-950 shadow-md'
                    : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                }`}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-3.5 h-3.5 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
                    Generating E2EE KeyPair...
                  </span>
                ) : (
                  <>
                    <span>{step === 6 ? 'Create Encrypted Account' : 'Continue'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
};
