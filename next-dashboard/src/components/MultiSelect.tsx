'use client';

import { useState, useRef, useEffect } from 'react';

interface MultiSelectProps {
    label: string;
    options: string[];
    selectedValues: string[];
    onChange: (values: string[]) => void;
    maxDisplayLength?: number;
}

export function MultiSelect({ label, options, selectedValues, onChange, maxDisplayLength = 25 }: MultiSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [searchText, setSearchText] = useState('');

    // Sort options: Ascending (A->Z, 1->9)
    const sortedOptions = [...options].sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));

    // Filter options based on search text
    const filteredOptions = sortedOptions.filter(option =>
        String(option).toLowerCase().includes(searchText.toLowerCase())
    );

    // Close dropdown when clicking outside
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
                setSearchText(''); // Reset search on close
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleToggle = (value: string) => {
        if (selectedValues.includes(value)) {
            onChange(selectedValues.filter(v => v !== value));
        } else {
            onChange([...selectedValues, value]);
        }
    };

    // Select All Logic for Filtered Options
    const isAllFilteredSelected = filteredOptions.length > 0 && filteredOptions.every(opt => selectedValues.includes(opt));

    const handleSelectAll = () => {
        if (isAllFilteredSelected) {
            // Unselect all filtered options
            onChange(selectedValues.filter(v => !filteredOptions.includes(v)));
        } else {
            // Select all filtered options (merge with existing selections)
            const newSelected = new Set([...selectedValues, ...filteredOptions]);
            onChange(Array.from(newSelected));
        }
    };

    const displayText = selectedValues.length === 0
        ? 'All'
        : selectedValues.length === 1
            ? String(selectedValues[0]).substring(0, maxDisplayLength)
            : `${selectedValues.length}件選択中`;

    return (
        <div className="flex flex-col gap-1" ref={containerRef}>
            <span className="text-[10px] font-bold text-gray-500 tracking-wide">{label}</span>
            <div className="relative">
                <button
                    type="button"
                    onClick={() => setIsOpen(!isOpen)}
                    className="filter-select text-xs px-2 w-full truncate text-left flex items-center justify-between"
                    title={selectedValues.length === 0 ? 'All' : selectedValues.join(', ')}
                >
                    <span className="truncate">{displayText}</span>
                    <svg
                        className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>

                {isOpen && (
                    <div className="absolute z-[100] top-full left-0 mt-1 w-full min-w-[200px] max-h-80 overflow-hidden bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col">
                        {/* Search Box */}
                        <div className="p-2 border-b border-gray-100 bg-gray-50">
                            <input
                                type="text"
                                value={searchText}
                                onChange={(e) => setSearchText(e.target.value)}
                                placeholder="検索..."
                                className="w-full text-xs px-2 py-1.5 border border-gray-300 rounded focus:outline-none focus:border-blue-500"
                                autoFocus
                            />
                        </div>

                        {/* Select All */}
                        <div className="border-b border-gray-100">
                            <label className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={isAllFilteredSelected}
                                    onChange={handleSelectAll}
                                    className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                <span className="text-xs font-medium text-gray-700">
                                    {isAllFilteredSelected ? '選択解除' : '全て選択'}
                                </span>
                            </label>
                        </div>

                        {/* Options List */}
                        <div className="overflow-auto max-h-60">
                            {filteredOptions.length > 0 ? (
                                filteredOptions.map(option => (
                                    <label
                                        key={String(option)}
                                        className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer border-b border-gray-50 last:border-0"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={selectedValues.includes(option)}
                                            onChange={() => handleToggle(option)}
                                            className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                        <span className="text-xs text-gray-600 truncate" title={String(option)}>
                                            {String(option)}
                                        </span>
                                    </label>
                                ))
                            ) : (
                                <div className="px-3 py-4 text-xs text-gray-400 text-center">
                                    一致する項目がありません
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
