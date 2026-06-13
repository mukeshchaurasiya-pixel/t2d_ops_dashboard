import React, { useMemo } from 'react';

interface MultiSelectDropdownProps {
  label: string;
  options: string[];
  selectedString: string;
  onChange: (val: string) => void;
  placeholder: string;
  showBlank?: boolean;
  isActive: boolean;
  isOpen: boolean;
  onToggle: () => void;
  optionLabels?: Record<string, string>;
}

export default function MultiSelectDropdown({
  label,
  options,
  selectedString,
  onChange,
  placeholder,
  showBlank = false,
  isActive,
  isOpen,
  onToggle,
  optionLabels
}: MultiSelectDropdownProps) {
  const totalOptionsTrimmed = useMemo(() => {
    const list = options.map(o => o.trim());
    if (showBlank) {
      list.push('Blank');
    }
    return list;
  }, [options, showBlank]);

  const effectiveSelectedList = useMemo(() => {
    if (selectedString === 'All') return totalOptionsTrimmed;
    if (!selectedString) return [];
    return selectedString.split('|||').map(s => s.trim()).filter(Boolean);
  }, [selectedString, totalOptionsTrimmed]);

  const handleToggleOption = (val: string) => {
    const trimmedVal = val.trim();
    let newList: string[];
    if (effectiveSelectedList.includes(trimmedVal)) {
      newList = effectiveSelectedList.filter(v => v !== trimmedVal);
    } else {
      newList = [...effectiveSelectedList, trimmedVal];
    }
    
    if (newList.length === totalOptionsTrimmed.length) {
      onChange('All');
    } else if (newList.length === 0) {
      onChange('');
    } else {
      onChange(newList.join('|||'));
    }
  };

  const handleSelectAll = () => {
    onChange('All');
  };

  const handleClear = () => {
    onChange('');
  };

  const displayText = useMemo(() => {
    if (selectedString === 'All') return placeholder;
    if (!selectedString) return 'None Selected';
    const parts = selectedString.split('|||').map(s => s.trim()).filter(Boolean);
    const getLabel = (val: string) => {
      if (val === 'Blank') return 'Blank / Empty';
      if (optionLabels && optionLabels[val]) return optionLabels[val];
      return val;
    };
    if (parts.length === 1) {
      return getLabel(parts[0]);
    }
    return `${getLabel(parts[0])} (+${parts.length - 1})`;
  }, [selectedString, placeholder, optionLabels]);

  return (
    <div className="relative">
      <label className={`block text-[10px] uppercase font-bold tracking-wider mb-1 transition-all duration-200 ${
        isActive ? 'text-brand-orange font-extrabold' : 'text-slate-400'
      }`}>
        {label}
      </label>
      
      <button
        type="button"
        onClick={onToggle}
        className={`w-full text-xs p-2 px-3 border rounded-xl cursor-pointer transition-all duration-200 flex items-center justify-between gap-1.5 focus:outline-none focus:ring-1 focus:ring-brand-orange/20 ${
          isActive 
            ? 'border-brand-orange bg-orange-50/20 text-brand-orange font-semibold ring-1 ring-brand-orange/30 shadow-sm' 
            : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100/50'
        }`}
      >
        <span className="truncate max-w-[120px]">{displayText}</span>
        <span className="text-[10px] text-slate-400">▼</span>
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-20 cursor-default" onClick={onToggle} />
          
          <div className="absolute left-0 mt-1.5 w-56 max-h-60 bg-white border border-slate-150 rounded-xl shadow-lg z-30 flex flex-col overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
            <div className="p-2 border-b border-slate-100 flex items-center justify-between text-[10px] font-bold text-slate-500 bg-slate-50/50">
              <button 
                type="button" 
                onClick={handleSelectAll} 
                className="hover:text-slate-800 cursor-pointer"
              >
                Select All
              </button>
              <button 
                type="button" 
                onClick={handleClear} 
                className="hover:text-slate-800 cursor-pointer"
              >
                Clear
              </button>
            </div>
            
            <div className="overflow-y-auto p-1.5 space-y-0.5 max-h-48 text-slate-700 text-xs">
              {showBlank && (
                <label className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer font-sans select-none">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedList.includes('Blank')}
                    onChange={() => handleToggleOption('Blank')}
                    className="rounded text-brand-orange focus:ring-brand-orange/20 w-3.5 h-3.5"
                  />
                  <span>Blank / Empty</span>
                </label>
              )}
              {options.map(opt => (
                <label key={opt} className="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-50 cursor-pointer font-sans select-none">
                  <input
                    type="checkbox"
                    checked={effectiveSelectedList.includes(opt.trim())}
                    onChange={() => handleToggleOption(opt)}
                    className="rounded text-brand-orange focus:ring-brand-orange/20 w-3.5 h-3.5"
                  />
                  <span className="truncate">{optionLabels?.[opt] || opt}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
