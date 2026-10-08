import React, { useState } from 'react';
import { motion } from 'motion/react';
import { 
  User, 
  Lock, 
  Key, 
  Globe, 
  Copy, 
  Check, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertTriangle, 
  LogOut, 
  Trash2, 
  Save, 
  Edit3, 
  Sliders, 
  Smartphone, 
  UserX, 
  Flame 
} from 'lucide-react';
import { doc, updateDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../../firebase';
import { 
  hashWithSalt, 
  decryptTextLocal, 
  generateSalt, 
  encryptTextLocal, 
  normalizeSecurityKey 
} from '../../lib/crypto';
import { purgeEntireLocalVaultDB } from '../../lib/idb';
import { AccountType, UserAccount, UserSettings } from '../../lib/types';
import { QRDisplayCard } from '../QR/QRDisplayCard';

interface ProfileSectionProps {
  user: UserAccount;
  onUpdateUser: (updatedUser: UserAccount) => void;
  onSignOut: () => void;
}

export const ProfileSection: React.FC<ProfileSectionProps> = ({ user, onUpdateUser, onSignOut }) => {
  // Profile inputs
  const [fullName, setFullName] = useState(user.fullName);
  const [bio, setBio] = useState(user.bio || '');
  const [avatar, setAvatar] = useState(user.avatar);
  const [accountType, setAccountType] = useState<AccountType>(user.accountType);

  // Settings inputs
  const [readReceipts, setReadReceipts] = useState(user.settings?.readReceipts ?? true);
  const [typingIndicators, setTypingIndicators] = useState(user.settings?.typingIndicators ?? true);
  const [onlineStatus, setOnlineStatus] = useState(user.settings?.onlineStatus ?? true);
  const [defaultEphemeral, setDefaultEphemeral] = useState(user.settings?.defaultEphemeralSeconds ?? 0);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Security Key Review Modal
  const [showKeyModal, setShowKeyModal] = useState(false);
  const [keyPasswordInput, setKeyPasswordInput] = useState('');
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Password Change Modal
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [verifyType, setVerifyType] = useState<'password' | 'securityKey'>('password');
  const [currentVerificationInput, setCurrentVerificationInput] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [isPasswordSaving, setIsPasswordSaving] = useState(false);

  // Active Sessions
  const [activeSessions] = useState([
    { device: 'Current Browser Session', location: 'Local Web Client', active: true, id: 'sess_cur' },
  ]);

  // Save Profile & Privacy Settings
  const handleSaveProfile = async () => {
    setIsSaving(true);
    setSaveSuccess(false);

    try {
      const updatedSettings: UserSettings = {
        readReceipts,
        typingIndicators,
        onlineStatus,
        defaultEphemeralSeconds: defaultEphemeral,
      };

      const updatedFields = {
        fullName: fullName.trim(),
        bio: bio.trim(),
        avatar: avatar.trim(),
        accountType,
        settings: updatedSettings,
        updatedAt: new Date().toISOString(),
      };

      // 1. Update /users/{uid}
      await updateDoc(doc(db, 'users', user.id), updatedFields);

      // 2. Sync with /public_profiles/{uid}
      if (accountType === 'public') {
        await setDoc(doc(db, 'public_profiles', user.id), {
          userId: user.id,
          username: user.username,
          fullName: fullName.trim(),
          avatar: avatar.trim(),
          bio: bio.trim(),
          publicKey: user.publicKey,
          updatedAt: updatedFields.updatedAt,
        });
      } else {
        // If Private, remove from public directory search
        try {
          await deleteDoc(doc(db, 'public_profiles', user.id));
        } catch (_) {}
      }

      onUpdateUser({ ...user, ...updatedFields });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err: any) {
      console.error('Failed to update profile:', err);
      handleFirestoreError(err, OperationType.UPDATE, `users/${user.id}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Reveal Security Key Modal Handler
  const handleRevealSecurityKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setKeyError(null);

    try {
      const verifyHash = await hashWithSalt(keyPasswordInput, user.passwordSalt);
      if (verifyHash !== user.passwordHash) {
        setKeyError('Incorrect master password.');
        return;
      }

      const parts = user.securityKeyEncrypted.split('::');
      if (parts.length !== 2) {
        setKeyError('Security key decryption payload missing.');
        return;
      }

      const rawKey = await decryptTextLocal(parts[0], parts[1], keyPasswordInput, user.passwordSalt);
      setRevealedKey(rawKey);
    } catch (err: any) {
      console.error('Key reveal error:', err);
      setKeyError('Decryption failed. Please check credentials.');
    }
  };

  // Change Password Handler with Double Verification
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setPasswordError('Double verification failed: New passwords do not match.');
      return;
    }

    setIsPasswordSaving(true);

    try {
      if (verifyType === 'password') {
        const verifyHash = await hashWithSalt(currentVerificationInput, user.passwordSalt);
        if (verifyHash !== user.passwordHash) {
          setPasswordError('Incorrect current password.');
          setIsPasswordSaving(false);
          return;
        }
      } else {
        const normalizedInput = normalizeSecurityKey(currentVerificationInput);
        const verifyHash = await hashWithSalt(normalizedInput, user.securityKeySalt);
        if (verifyHash !== user.securityKeyHash) {
          setPasswordError('Invalid Security Key.');
          setIsPasswordSaving(false);
          return;
        }
      }

      // Re-encrypt Security Key with new password
      let rawKey = revealedKey;
      if (!rawKey) {
        const parts = user.securityKeyEncrypted.split('::');
        rawKey = await decryptTextLocal(parts[0], parts[1], currentVerificationInput, user.passwordSalt);
      }

      const newPassSalt = generateSalt(16);
      const newPasswordHash = await hashWithSalt(newPassword, newPassSalt);

      const reEncryptedObj = await encryptTextLocal(rawKey, newPassword, newPassSalt);
      const newSecurityKeyEncrypted = `${reEncryptedObj.ciphertext}::${reEncryptedObj.iv}`;

      const updatedFields = {
        passwordHash: newPasswordHash,
        passwordSalt: newPassSalt,
        securityKeyEncrypted: newSecurityKeyEncrypted,
        updatedAt: new Date().toISOString(),
      };

      await updateDoc(doc(db, 'users', user.id), updatedFields);

      onUpdateUser({ ...user, ...updatedFields });

      setPasswordSuccess(true);
      setTimeout(() => {
        setShowPasswordModal(false);
        setPasswordSuccess(false);
        setCurrentVerificationInput('');
        setNewPassword('');
        setConfirmNewPassword('');
      }, 2000);
    } catch (err: any) {
      console.error('Password update error:', err);
      setPasswordError('Failed to change password: ' + err.message);
    } finally {
      setIsPasswordSaving(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6 pb-12">
      {/* Overview Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 relative overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center gap-5 border-b border-slate-800 pb-6">
          <img
            src={avatar}
            alt={fullName}
            className="w-20 h-20 rounded-full object-cover border-2 border-cyan-400 shadow-xl"
          />

          <div className="text-center sm:text-left min-w-0 flex-1">
            <div className="flex items-center justify-center sm:justify-start gap-2">
              <h2 className="text-xl font-bold text-white truncate">{fullName}</h2>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-semibold uppercase ${
                accountType === 'public' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
              }`}>
                {accountType}
              </span>
            </div>

            <p className="text-sm font-mono text-cyan-400 mt-0.5">@{user.username}</p>
            <p className="text-xs text-slate-400 mt-1">{bio || 'Private by design'}</p>
          </div>
        </div>

        {/* Profile Inputs */}
        <div className="mt-6 space-y-4">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
            Profile Details
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium">Full Name</label>
              <input
                type="text"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs text-slate-400 font-medium flex items-center justify-between">
                <span>Username (Handle)</span>
                <span className="text-[10px] text-amber-400">Permanent Lock</span>
              </label>
              <input
                type="text"
                value={`@${user.username}`}
                disabled
                className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800/60 rounded-xl text-xs font-mono text-slate-500 cursor-not-allowed"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Bio</label>
            <textarea
              value={bio}
              onChange={e => setBio(e.target.value)}
              rows={2}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400 resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs text-slate-400 font-medium">Avatar Image URL</label>
            <input
              type="text"
              value={avatar}
              onChange={e => setAvatar(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
            />
          </div>

          {/* Visibility Toggle */}
          <div className="space-y-1.5 pt-1">
            <label className="text-xs text-slate-400 font-medium">Account Type</label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setAccountType('public')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  accountType === 'public'
                    ? 'bg-cyan-500/10 border-cyan-400 text-cyan-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Public (Searchable)</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountType('private')}
                className={`py-2.5 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  accountType === 'private'
                    ? 'bg-purple-500/10 border-purple-400 text-purple-400'
                    : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Private (QR Only)</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Privacy Controls Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span>Privacy & Signaling Controls</span>
        </h3>

        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <div>
              <p className="font-semibold text-white">Read Receipts</p>
              <p className="text-[11px] text-slate-500">Send double checkmarks when you read messages</p>
            </div>
            <input
              type="checkbox"
              checked={readReceipts}
              onChange={e => setReadReceipts(e.target.checked)}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <div>
              <p className="font-semibold text-white">Typing Indicators</p>
              <p className="text-[11px] text-slate-500">Signal when you are typing a response</p>
            </div>
            <input
              type="checkbox"
              checked={typingIndicators}
              onChange={e => setTypingIndicators(e.target.checked)}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>

          <div className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <div>
              <p className="font-semibold text-white">Online Status</p>
              <p className="text-[11px] text-slate-500">Show online presence indicator</p>
            </div>
            <input
              type="checkbox"
              checked={onlineStatus}
              onChange={e => setOnlineStatus(e.target.checked)}
              className="w-4 h-4 accent-cyan-400 cursor-pointer"
            />
          </div>
        </div>

        <button
          type="button"
          onClick={handleSaveProfile}
          disabled={isSaving}
          className="w-full py-2.5 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold rounded-xl shadow-md flex items-center justify-center gap-2 transition-all mt-2"
        >
          {isSaving ? (
            <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
          ) : saveSuccess ? (
            <>
              <Check className="w-4 h-4" />
              <span>Saved Settings & Profile!</span>
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              <span>Save Profile & Privacy Settings</span>
            </>
          )}
        </button>
      </div>

      {/* Security Credentials */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-4">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono">
          Security Credentials
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => {
              setShowKeyModal(true);
              setKeyPasswordInput('');
              setRevealedKey(null);
              setKeyError(null);
            }}
            className="p-4 bg-slate-950 border border-purple-500/30 hover:border-purple-400 rounded-2xl text-left transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <Key className="w-5 h-5 text-purple-400" />
              <Eye className="w-4 h-4 text-slate-500 group-hover:text-purple-400" />
            </div>
            <h4 className="text-xs font-bold text-white">Review Security Key</h4>
            <p className="text-[11px] text-slate-400 mt-1">
              Reveal your permanent key in "ABCD-EFGH-IJKL" format via password verification.
            </p>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowPasswordModal(true);
              setPasswordError(null);
            }}
            className="p-4 bg-slate-950 border border-cyan-500/30 hover:border-cyan-400 rounded-2xl text-left transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <Lock className="w-5 h-5 text-cyan-400" />
              <Edit3 className="w-4 h-4 text-slate-500 group-hover:text-cyan-400" />
            </div>
            <h4 className="text-xs font-bold text-white">Change Master Password</h4>
            <p className="text-[11px] text-slate-400 mt-1">
              Double verification change flow preserving E2EE encryption key access.
            </p>
          </button>
        </div>
      </div>

      {/* Active Sessions */}
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 space-y-3">
        <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider font-mono flex items-center gap-2">
          <Smartphone className="w-4 h-4 text-cyan-400" />
          <span>Active Sessions & Devices</span>
        </h3>

        {activeSessions.map(sess => (
          <div key={sess.id} className="flex items-center justify-between p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs">
            <div>
              <p className="font-bold text-white flex items-center gap-2">
                <span>{sess.device}</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              </p>
              <p className="text-[11px] text-slate-500">{sess.location}</p>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 uppercase bg-cyan-500/10 px-2 py-0.5 rounded-full">
              Active Now
            </span>
          </div>
        ))}
      </div>

      {/* Personal QR Display */}
      <QRDisplayCard user={user} />

      {/* Vault Management */}
      <div className="bg-slate-900 border border-rose-500/20 rounded-3xl p-6 space-y-3">
        <h3 className="text-xs font-bold text-rose-400 uppercase tracking-wider font-mono">
          Session & Vault Controls
        </h3>

        <div className="flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onSignOut}
            className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Sign Out Session</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              if (confirm('Wipe all local IndexedDB decrypted conversations and private keys from this device?')) {
                await purgeEntireLocalVaultDB();
                onSignOut();
              }
            }}
            className="flex-1 py-2.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-colors"
          >
            <Trash2 className="w-4 h-4 text-rose-400" />
            <span>Wipe Local Device Vault</span>
          </button>
        </div>
      </div>

      {/* MODAL 1: REVEAL SECURITY KEY */}
      {showKeyModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-4"
          >
            <h3 className="text-base font-bold flex items-center gap-2 text-purple-400">
              <Key className="w-5 h-5" />
              <span>Review Permanent Security Key</span>
            </h3>

            {keyError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {keyError}
              </div>
            )}

            {!revealedKey ? (
              <form onSubmit={handleRevealSecurityKey} className="space-y-4">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Verify identity by entering your master password to decrypt your 12-character Security Key.
                </p>
                <input
                  type="password"
                  value={keyPasswordInput}
                  onChange={e => setKeyPasswordInput(e.target.value)}
                  placeholder="Enter master password..."
                  required
                  autoFocus
                  className="w-full px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-purple-400"
                />
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    onClick={() => setShowKeyModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-purple-500 hover:bg-purple-400 text-slate-950 text-xs font-bold rounded-xl"
                  >
                    Verify & Decrypt
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-950 p-4 rounded-2xl border border-purple-500/40 text-center">
                  <span className="text-[10px] uppercase font-mono text-purple-400">Permanent Security Key</span>
                  <div className="text-2xl font-mono font-bold tracking-widest text-white my-2 select-all">
                    {revealedKey}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(revealedKey);
                    setCopiedKey(true);
                    setTimeout(() => setCopiedKey(false), 2000);
                  }}
                  className="w-full py-2.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2"
                >
                  {copiedKey ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedKey ? 'Copied Security Key!' : 'Copy Key'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowKeyModal(false)}
                  className="w-full py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Close Window
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* MODAL 2: CHANGE PASSWORD WITH DOUBLE VERIFICATION */}
      {showPasswordModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 text-white space-y-4"
          >
            <h3 className="text-base font-bold flex items-center gap-2 text-cyan-400">
              <Lock className="w-5 h-5" />
              <span>Change Master Password</span>
            </h3>

            {passwordError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300">
                {passwordError}
              </div>
            )}

            {passwordSuccess ? (
              <div className="p-4 bg-emerald-500/20 border border-emerald-500/40 rounded-xl text-center text-emerald-300 text-xs font-bold">
                Password updated successfully!
              </div>
            ) : (
              <form onSubmit={handleChangePassword} className="space-y-3">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400 font-medium">Verify Identity Using:</label>
                  <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    <button
                      type="button"
                      onClick={() => setVerifyType('password')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                        verifyType === 'password' ? 'bg-slate-800 text-cyan-400' : 'text-slate-500'
                      }`}
                    >
                      Current Password
                    </button>
                    <button
                      type="button"
                      onClick={() => setVerifyType('securityKey')}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-semibold ${
                        verifyType === 'securityKey' ? 'bg-slate-800 text-purple-400' : 'text-slate-500'
                      }`}
                    >
                      Security Key
                    </button>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">
                    {verifyType === 'password' ? '1. Current Password' : '1. Security Key (ABCD-EFGH-IJKL)'}
                  </label>
                  <input
                    type={verifyType === 'password' ? 'password' : 'text'}
                    value={currentVerificationInput}
                    onChange={e => setCurrentVerificationInput(e.target.value)}
                    required
                    placeholder={verifyType === 'password' ? 'Current password...' : 'ABCD-EFGH-IJKL'}
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">2. New Password</label>
                  <input
                    type="password"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    required
                    placeholder="New password..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs text-slate-400">3. Confirm New Password (Again)</label>
                  <input
                    type="password"
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                    required
                    placeholder="Re-enter new password..."
                    className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-cyan-400"
                  />
                </div>

                <div className="flex gap-2 justify-end pt-3">
                  <button
                    type="button"
                    onClick={() => setShowPasswordModal(false)}
                    className="px-4 py-2 bg-slate-800 text-slate-300 text-xs font-bold rounded-xl"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isPasswordSaving}
                    className="px-4 py-2 bg-cyan-400 hover:bg-cyan-300 text-slate-950 text-xs font-bold rounded-xl"
                  >
                    {isPasswordSaving ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            )}
          </motion.div>
        </div>
      )}
    </div>
  );
};
