import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SearchResultApp } from '../types';
import { searchSteamGames } from '../services/steamService';

interface GameSelectorProps {
  id: string;
  label: string;
  onGameSelect: (game: SearchResultApp | null) => void;
  selectedGameName: string | null;
}

const GameSelector: React.FC<GameSelectorProps> = ({ id, label, onGameSelect, selectedGameName }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [suggestions, setSuggestions] = useState<SearchResultApp[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (selectedGameName) {
      setSearchTerm(selectedGameName);
    } else {
      setSearchTerm('');
    }
  }, [selectedGameName]);

  const fetchSuggestions = useCallback(async (query: string) => {
    if (!query.trim()) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    console.log(`[GameSelector] Fetching suggestions for query: "${query}"`);

    let steamResults: SearchResultApp[] = [];
    try {
      const rawSteamResults = await searchSteamGames(query);
      steamResults = rawSteamResults.map(steamGame => ({
        appid: steamGame.appid,
        name: steamGame.name,
        source: 'steam', // Source is always 'steam' now
      }));
      console.log(`[GameSelector] Steam API results for "${query}":`, steamResults.map(r => r.name));
    } catch (error) {
      console.error(`[GameSelector] Error fetching from Steam API for "${query}":`, error);
    }
    
    console.log(`[GameSelector] Combined suggestions for "${query}":`, steamResults.map(r => `${r.name} (Source: ${r.source})`));
    setSuggestions(steamResults.slice(0, 20)); // Steam results are already deduplicated by service if needed
    setIsLoading(false);
    setIsDropdownOpen(steamResults.length > 0 || query.length > 0);
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const debouncedFetchSuggestions = useCallback(
    debounce(fetchSuggestions, 350)
  , [fetchSuggestions]);

  useEffect(() => {
    debouncedFetchSuggestions(searchTerm);
  }, [searchTerm, debouncedFetchSuggestions]);

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    if (!event.target.value.trim()) {
      onGameSelect(null); // Clear selection if input is cleared
    }
  };

  const handleSuggestionClick = (game: SearchResultApp) => {
    setSearchTerm(game.name);
    onGameSelect(game);
    setIsDropdownOpen(false);
    setSuggestions([]);
  };
  
  const handleClearSelection = () => {
    setSearchTerm('');
    onGameSelect(null);
    setIsDropdownOpen(false);
    setSuggestions([]);
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [wrapperRef]);


  return (
    <div className="relative w-full" ref={wrapperRef}> {/* Removed md:w-1/3, let App.tsx handle layout */}
      <label htmlFor={id} className="block text-sm font-medium text-gray-300 mb-1">{label}</label>
      <div className="relative">
        <input
          type="text"
          id={id}
          value={searchTerm}
          onChange={handleInputChange}
          onFocus={() => setIsDropdownOpen(searchTerm.length > 0 || suggestions.length > 0)}
          placeholder="Type game name..."
          className="w-full p-3 bg-slate-700 border border-slate-600 rounded-md shadow-sm focus:ring-purple-500 focus:border-purple-500 text-gray-100 placeholder-gray-400"
        />
        {searchTerm && (
            <button 
                onClick={handleClearSelection}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
                aria-label="Clear selection"
            >
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
        )}
      </div>
      {isDropdownOpen && (searchTerm.length > 0 || suggestions.length > 0) && (
        <ul className="absolute z-10 w-full mt-1 bg-slate-700 border border-slate-600 rounded-md shadow-lg max-h-60 overflow-y-auto custom-scrollbar">
          {isLoading && <li className="px-4 py-2 text-gray-400">Loading...</li>}
          {!isLoading && suggestions.length === 0 && searchTerm.trim() !== '' && (
            <li className="px-4 py-2 text-gray-400">No games found. Try broader terms.</li>
          )}
          {!isLoading && suggestions.map((game, idx) => (
            <li
              key={`${game.appid}-${game.source || 'steam'}-${idx}`}
              onClick={() => handleSuggestionClick(game)}
              className="px-4 py-2 hover:bg-slate-600 cursor-pointer text-gray-200"
            >
              {game.name} {/* Source display removed as it's always Steam now from search */}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

function debounce<F extends (...args: any[]) => any>(func: F, waitFor: number) {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  const debounced = (...args: Parameters<F>) => {
    if (timeout !== null) {
      clearTimeout(timeout);
    }
    timeout = setTimeout(() => func(...args), waitFor);
  };
  return debounced as (...args: Parameters<F>) => void;
}

export default GameSelector;