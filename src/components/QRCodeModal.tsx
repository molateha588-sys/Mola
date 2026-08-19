import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X, Copy, Check, ExternalLink, Smartphone, Share2 } from 'lucide-react';

interface QRCodeModalProps {
  isOpen: boolean;
  onClose: () => void;
  shareUrl: string;
}

export const QRCodeModal: React.FC<QRCodeModalProps> = ({ isOpen, onClose, shareUrl }) => {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-fade-in select-none">
      <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full p-6 sm:p-7 border border-slate-200 relative">
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
          aria-label="Close dialog"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3.5 mb-5">
          <div className="w-11 h-11 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
            <Smartphone className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-slate-900 tracking-tight">Mobile GPS Client Pairing</h3>
            <p className="text-xs text-slate-500">Scan to broadcast coordinates from your smartphone</p>
          </div>
        </div>

        <div className="flex flex-col items-center justify-center p-6 bg-slate-50 border border-slate-200/80 rounded-2xl mb-5">
          <div className="bg-white p-3.5 rounded-xl shadow-xs border border-slate-100">
            <QRCodeSVG value={shareUrl} size={190} level="M" />
          </div>
          <span className="text-xs text-slate-500 mt-3.5 font-semibold flex items-center gap-1.5">
            <Share2 className="w-3.5 h-3.5 text-blue-600" />
            Point phone camera at this QR code
          </span>
        </div>

        <div className="space-y-3.5">
          <div>
            <label className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5 block">Direct Tunnel Link</label>
            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={shareUrl}
                className="w-full px-3.5 py-2.5 text-xs text-slate-700 bg-slate-100/80 rounded-xl border border-slate-200 focus:outline-none select-all font-mono"
              />
              <button
                onClick={handleCopy}
                className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors shrink-0 shadow-xs cursor-pointer"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="pt-2 flex justify-end gap-2.5">
            <a
              href={shareUrl}
              target="_blank"
              rel="noreferrer"
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open Tab
            </a>
            <button
              onClick={onClose}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
