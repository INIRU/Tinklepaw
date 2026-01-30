import { createPortal } from 'react-dom';
import { CheckCircle, XCircle } from 'lucide-react';

type FeedbackState = {
  open: boolean;
  title: string;
  message: string;
  kind: 'success' | 'error';
};

export default function FeedbackModal({ feedback }: { feedback: FeedbackState }) {
  if (!feedback.open || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex h-screen w-screen items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-sm rounded-[32px] border border-[color:var(--border)] bg-[color:var(--card)] p-8 text-center shadow-2xl">
        <div
          className={`mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-3xl border shadow-[0_0_40px_rgba(16,185,129,0.15)] ${
            feedback.kind === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-500'
              : 'bg-rose-500/10 border-rose-500/20 text-rose-500'
          }`}
        >
          {feedback.kind === 'success' ? (
            <CheckCircle className="h-10 w-10" strokeWidth={1.5} />
          ) : (
            <XCircle className="h-10 w-10" strokeWidth={1.5} />
          )}
        </div>
        <h2 className="text-2xl font-bold font-bangul text-[color:var(--fg)] mb-2">{feedback.title}</h2>
        <p className="text-sm text-[color:var(--muted)] leading-relaxed">{feedback.message}</p>
      </div>
    </div>,
    document.body
  );
}
