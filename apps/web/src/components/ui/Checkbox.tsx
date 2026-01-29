'use client';

import { Check } from 'lucide-react';

type CheckboxProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: string;
  disabled?: boolean;
};

export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={`flex items-center gap-2 ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}>
      <button
        type="button"
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        className={`
          relative w-6 h-6 rounded border-2 transition-all flex items-center justify-center shrink-0
          ${checked 
            ? 'bg-[#5865F2] border-[#5865F2] shadow-sm' 
            : 'bg-[color:var(--card)] border-[color:var(--border)] hover:border-[#5865F2]/50 hover:bg-[color:var(--chip)]'
          }
          ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
        `}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!disabled) {
            onChange(!checked);
          }
        }}
      >
        {checked && (
          <Check 
            className="w-4 h-4 text-white" 
            strokeWidth={4}
          />
        )}
      </button>
      {label && <span className="text-xs muted select-none">{label}</span>}
    </label>
  );
}
