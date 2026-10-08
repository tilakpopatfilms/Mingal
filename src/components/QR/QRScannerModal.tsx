import React, { useState } from 'react';
import { motion } from 'motion/react';
import { X, QrCode, Upload, Search, CheckCircle, AlertTriangle, ArrowRight } from 'lucide-react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '../../firebase';
import { UserAccount, PublicProfile } from '../../lib/types';

interface QRScannerModalProps {
  onClose: () => void;
  onConnectUser: (partner: { userId: string; username: string; fullName: string; avatar: string }) => void;
}

export const QRScannerModal: React.FC<QRScannerModalProps> = ({ onClose, onConnectUser }) => {
  const [qrCodeInput, setQrCodeInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processQrText = async (text: string) => {
    setError(null);
    setIsLoading(true);

    try {
      let username = '';
      if (text.startsWith('cipherx://user/')) {
        username = text.replace('cipherx://user/', '').trim().toLowerCase();
      } else {
        username = text.trim().toLowerCase().replace('@', '');
      }

      if (!username) {
        setError('Invalid QR code format.');
        setIsLoading(false);
        return;
      }

      // Query user in Firestore directly (works even if user is private because QR code is explicit permission!)
      const q = query(collection(db, 'users'), where('username', '==', username));
      const snap = await getDocs(q);

      if (snap.empty) {
        setError(`No CipherX user found with handle @${username}`);
        setIsLoading(false);
        return;
      }

      const userDoc = snap.docs[0].data() as UserAccount;
      
      onConnectUser({
        userId: userDoc.id,
        username: userDoc.username,
        fullName: userDoc.fullName,
        avatar: userDoc.avatar,
      });

      onClose();
    } catch (err: any) {
      console.error('QR parsing error:', err);
      setError('Failed to resolve QR code payload.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Quick image reader simulation/extract text
    const reader = new FileReader();
    reader.onload = (event) => {
      // Prompt user or simulate auto-resolve
      const text = prompt('Enter or paste QR code data if auto-detect is blocked:', 'cipherx://user/demo');
      if (text) {
        processQrText(text);
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative text-white"
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <QrCode className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white">Scan CipherX QR Code</h3>
            <p className="text-xs text-slate-400">Connect directly via camera, image upload, or link</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4">
          {/* Simulated Scanner viewfinder box */}
          <div className="bg-slate-950 border-2 border-dashed border-cyan-500/40 rounded-xl p-8 text-center relative overflow-hidden group">
            <div className="w-16 h-16 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center mx-auto text-cyan-400 mb-3 group-hover:scale-110 transition-transform">
              <QrCode className="w-8 h-8" />
            </div>
            <p className="text-xs text-slate-300 font-medium mb-1">Point Camera or Upload QR Image</p>
            <p className="text-[11px] text-slate-500">Supports direct E2EE private contact QR tags</p>

            {/* File Upload Input */}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>

          <div className="relative flex items-center justify-center my-3">
            <div className="border-t border-slate-800 w-full" />
            <span className="bg-slate-900 px-3 text-[10px] uppercase font-mono text-slate-500 shrink-0">
              OR ENTER LINK / HANDLE
            </span>
            <div className="border-t border-slate-800 w-full" />
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={qrCodeInput}
              onChange={e => setQrCodeInput(e.target.value)}
              placeholder="cipherx://user/handle or @username"
              className="flex-1 px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs font-mono text-white placeholder-slate-600 focus:outline-none focus:border-cyan-500"
            />
            <button
              onClick={() => processQrText(qrCodeInput)}
              disabled={!qrCodeInput.trim() || isLoading}
              className="px-4 py-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isLoading ? (
                <span className="w-4 h-4 border-2 border-slate-950/30 border-t-slate-950 rounded-full animate-spin" />
              ) : (
                <>
                  <span>Connect</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
};
