'use client';

import { useState, useRef, useEffect } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { m, AnimatePresence } from 'framer-motion';

type Option = {
  value: string;
  label: string;
};

type CustomSelectProps = {
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  label?: string;
  disabled?: boolean;
};

export function CustomSelect({ value, onChange, options, placeholder = '선택하세요', label, disabled }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={containerRef} className="relative">
      {label && <label className="block text-xs font-medium muted mb-1.5">{label}</label>}
      <button
        type="button"
        disabled={disabled}
        className={`w-full flex items-center justify-between gap-2 rounded-xl border border-[color:var(--border)] bg-[color:var(--chip)] px-3 py-2 text-sm text-left transition ${
          disabled ? 'opacity-50 cursor-not-allowed' : 'hover:border-[color:var(--fg)]/40 cursor-pointer'
        }`}
        onClick={() => !disabled && setIsOpen(!isOpen)}
      >
        <span className={selectedOption ? 'text-[color:var(--fg)]' : 'text-[color:var(--muted-2)]'}>
          {selectedOption?.label || placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 text-[color:var(--muted-2)] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          strokeWidth={2}
        />
      </button>

      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 mt-2 w-full rounded-2xl border border-[color:var(--border)] bg-[color:var(--card)] shadow-2xl overflow-hidden"
          >
            <div className="max-h-60 overflow-auto p-1">
              {options.map((option) => {
                const isSelected = option.value === value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-sm text-left transition cursor-pointer ${
                      isSelected
                        ? 'bg-[color:var(--chip)] text-[color:var(--fg)] font-medium'
                        : 'text-[color:var(--fg)] hover:bg-[color:var(--chip)]/50'
                    }`}
                    onClick={() => {
                      onChange(option.value);
                      setIsOpen(false);
                    }}
                  >
                    <span>{option.label}</span>
                    {isSelected && <Check className="h-4 w-4" strokeWidth={2.5} />}
                  </button>
                );
              })}
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
