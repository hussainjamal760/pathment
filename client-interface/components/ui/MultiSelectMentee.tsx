'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';

interface MultiSelectMenteeProps {
  options: { value: string; label: string }[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}

export function MultiSelectMentee({ 
  options, 
  selectedIds, 
  onChange, 
  placeholder = "Choose mentees..." 
}: MultiSelectMenteeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter(i => i !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const selectedText = selectedIds.length === 0 
    ? placeholder 
    : selectedIds.length === 1 
      ? options.find(o => o.value === selectedIds[0])?.label 
      : `${selectedIds.length} mentees selected`;

  return (
    <div className="relative" ref={containerRef}>
      <div 
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent flex justify-between items-center bg-white cursor-pointer transition-colors hover:border-slate-300"
      >
        <span className={selectedIds.length === 0 ? "text-slate-500" : "text-slate-900"}>{selectedText}</span>
        <ChevronDown className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      
      {isOpen && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto outline-none">
          {options.length === 0 ? (
            <div className="px-4 py-3 text-slate-500 text-sm">No mentees available</div>
          ) : (
            options.map(option => {
              const isSelected = selectedIds.includes(option.value);
              return (
                <div 
                  key={option.value}
                  onClick={() => toggleOption(option.value)}
                  className={`flex items-center justify-between px-4 py-3 cursor-pointer transition-colors ${
                    isSelected 
                      ? 'bg-green-50 text-green-700' 
                      : 'hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="text-sm font-medium">{option.label}</span>
                  {isSelected && <Check className="w-4 h-4 text-green-600" />}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
