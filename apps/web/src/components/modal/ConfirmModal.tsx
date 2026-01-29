'use client';

import { m, AnimatePresence } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';

type ConfirmModalProps = {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel: () => void;
  danger?: boolean;
};

export function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = '확인',
  cancelText = '취소',
  onConfirm,
  onCancel,
  danger = false
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <m.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <m.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-md rounded-3xl card-glass p-6 shadow-2xl pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {danger && (
                <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-red-200/10 border border-red-200/30 mb-4">
                  <AlertTriangle className="w-6 h-6 text-red-200" strokeWidth={2} />
                </div>
              )}
              <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
              <p className="mt-2 text-sm muted">{message}</p>
              <div className="mt-6 flex items-center gap-3 justify-end">
                <button
                  type="button"
                  className="rounded-xl btn-soft px-4 py-2.5 text-sm font-semibold"
                  onClick={onCancel}
                >
                  {cancelText}
                </button>
                <button
                  type="button"
                  className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${ danger
                      ? 'bg-red-500 text-white hover:bg-red-600 transition'
                      : 'btn-bangul'
                  }`}
                  onClick={onConfirm}
                >
                  {confirmText}
                </button>
              </div>
            </m.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
