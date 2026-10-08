import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Download, Share2, Check, QrCode } from 'lucide-react';
import { UserAccount } from '../../lib/types';

interface QRDisplayCardProps {
  user: UserAccount;
}

export const QRDisplayCard: React.FC<QRDisplayCardProps> = ({ user }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  const qrPayload = `cipherx://user/${user.username}`;

  useEffect(() => {
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        qrPayload,
        {
          width: 220,
          margin: 2,
          color: {
            dark: '#00F2FE',
            light: '#090A0F',
          },
        },
        err => {
          if (err) console.error('QR rendering error:', err);
        }
      );
    }
  }, [user.username, qrPayload]);

  const handleDownload = () => {
    if (!canvasRef.current) return;
    const url = canvasRef.current.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `CipherX_QR_${user.username}.png`;
    a.click();
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(qrPayload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 text-center space-y-4 backdrop-blur-xl relative overflow-hidden">
      {/* Ambient Glow */}
      <div className="absolute -top-12 -right-12 w-32 h-32 bg-cyan-500/15 rounded-full blur-2xl pointer-events-none" />

      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <QrCode className="w-4 h-4 text-cyan-400" />
          <h3 className="text-sm font-bold text-white">E2EE Contact QR Code</h3>
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${
          user.accountType === 'public' ? 'bg-cyan-500/10 text-cyan-400 border border-cyan-500/20' : 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
        }`}>
          {user.accountType}
        </span>
      </div>

      {/* Canvas Wrapper */}
      <div className="bg-slate-950 p-4 rounded-xl border border-slate-800/80 inline-block shadow-xl relative group">
        <canvas ref={canvasRef} className="mx-auto rounded-lg" />
        <div className="mt-3 flex items-center justify-center gap-2 text-xs font-mono text-cyan-400">
          <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>@{user.username}</span>
        </div>
      </div>

      <p className="text-xs text-slate-400 max-w-xs mx-auto">
        Scan this QR code with any CipherX client to instantly establish an end-to-end encrypted connection.
      </p>

      {/* Buttons */}
      <div className="flex items-center gap-2 justify-center pt-2">
        <button
          onClick={handleDownload}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          <Download className="w-3.5 h-3.5 text-cyan-400" />
          <span>Download</span>
        </button>

        <button
          onClick={handleCopyLink}
          className="px-4 py-2 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Share2 className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied Link' : 'Copy Contact Link'}</span>
        </button>
      </div>
    </div>
  );
};
