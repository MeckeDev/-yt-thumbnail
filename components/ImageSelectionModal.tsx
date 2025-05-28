
import React, { useState, useEffect } from 'react';
import { ScreenshotInfo } from '../types';
import { CORS_PROXY_PREFIX } from '../constants';

interface ImageSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  images: ScreenshotInfo[];
  onImageSelect: (imageIndex: number) => void;
  gameName: string;
  currentImageFullUrl: string;
  onLoadMore: () => void; // For "Load More Images"
  isLoadingMore: boolean; // True if "Load More Images" is in progress
  hasMoreImages: boolean; // True if "Load More Images" button should be shown
}

const ImageSelectionModal: React.FC<ImageSelectionModalProps> = ({
  isOpen,
  onClose,
  images,
  onImageSelect,
  gameName,
  currentImageFullUrl,
  onLoadMore,
  isLoadingMore,
  hasMoreImages,
}) => {
  const [erroredThumbnails, setErroredThumbnails] = useState<Set<string>>(new Set());
  const [directAttemptedThumbnails, setDirectAttemptedThumbnails] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Reset errored state when the list of images changes
    setErroredThumbnails(new Set());
    setDirectAttemptedThumbnails(new Set());
  }, [images]);

  if (!isOpen) return null;

  const fallbackSrc = 'https://via.placeholder.com/150/4A5568/FFFFFF?Text=Thumb+Error';

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4"
      onClick={onClose} // Close on overlay click
      role="dialog"
      aria-modal="true"
      aria-labelledby="imageSelectionModalTitle"
    >
      <div 
        className="bg-slate-800 p-6 rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col" // Changed to flex flex-col
        onClick={(e) => e.stopPropagation()} // Prevent close when clicking inside modal
      >
        <div className="flex justify-between items-center mb-6">
          <h2 id="imageSelectionModalTitle" className="text-2xl font-semibold text-purple-400">Select Image for {gameName}</h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-gray-200 transition-colors"
            aria-label="Close image selection modal"
          >
            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-8 h-8">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="overflow-y-auto custom-scrollbar flex-grow mb-4"> {/* Scrollable content area */}
          {images.length === 0 && !isLoadingMore ? (
            <p className="text-slate-400 text-center py-4">No images available for this game.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {images.map((img, index) => (
                <button
                  key={img.id ? `${img.id}-${img.fullUrl}` : `${index}-${img.fullUrl}`} // More robust key
                  onClick={() => onImageSelect(index)}
                  className={`relative rounded-lg overflow-hidden border-2 transition-all duration-150 ease-in-out focus:outline-none focus:ring-4 focus:ring-purple-500 focus:ring-opacity-75
                              ${img.fullUrl === currentImageFullUrl ? 'border-purple-500 shadow-lg scale-105' : 'border-slate-700 hover:border-purple-400 hover:scale-105'}`}
                  aria-label={`Select image ${index + 1} for ${gameName}`}
                >
                  <img 
                    src={img.thumbnailUrl} 
                    alt={`Thumbnail ${index + 1} for ${gameName}`} 
                    className="w-full h-32 object-cover bg-slate-700" 
                    loading="lazy"
                    onError={(e) => {
                        const target = e.target as HTMLImageElement;
                        const attemptedUrl = target.src; // The URL that actually failed to load
                        const configuredUrl = img.thumbnailUrl; // The URL initially set in props

                        // Scenario 1: Proxied URL failed, try direct if not already attempted
                        if (
                          configuredUrl.startsWith(CORS_PROXY_PREFIX) &&
                          attemptedUrl === configuredUrl && // Check if the failure was for the configured proxied URL
                          !directAttemptedThumbnails.has(configuredUrl)
                        ) {
                          const directUrl = configuredUrl.substring(CORS_PROXY_PREFIX.length);
                          if (directUrl.startsWith('http')) { // Ensure it's a full URL
                            console.warn(`[ImageSelectionModal] Proxy failed for ${configuredUrl}. Attempting direct load: ${directUrl}`);
                            setDirectAttemptedThumbnails(prev => new Set(prev).add(configuredUrl));
                            target.src = directUrl; // Attempt to load the direct URL
                            return; // Exit, new load will trigger onload or onerror
                          }
                        }

                        // Scenario 2: Any URL (original, or direct attempt) failed, and it's time to log and set fallback
                        // Log error only once per *configured* URL to avoid spam if direct attempt also fails on re-render
                        if (!erroredThumbnails.has(configuredUrl)) {
                          let errorMsg = `[ImageSelectionModal] Error loading thumbnail ${index + 1} for ${gameName}. Failed URL: ${attemptedUrl}.`;
                          if (attemptedUrl !== configuredUrl) {
                            errorMsg += ` Original configured URL was: ${configuredUrl}.`;
                          }
                          
                          if (attemptedUrl.includes('via.placeholder.com')) {
                              errorMsg += "\nThis is a placeholder image URL. Please check:\n1. Your internet connection.\n2. If any browser extensions (e.g., ad blockers) might be blocking 'via.placeholder.com'.\n3. If 'via.placeholder.com' is temporarily down.";
                          } else if (attemptedUrl.includes(CORS_PROXY_PREFIX)) { // Failure on a proxied URL
                              errorMsg += `\nThis thumbnail was loaded via a CORS proxy (${CORS_PROXY_PREFIX}). The proxy might be down, rate-limiting, or the original resource is inaccessible. This can be intermittent.`;
                          } else if (configuredUrl.startsWith(CORS_PROXY_PREFIX) && attemptedUrl !== configuredUrl) { // This means a direct attempt (after proxy failure) also failed
                              errorMsg += `\nDirect attempt for ${attemptedUrl} (after proxy failure for ${configuredUrl}) also failed. This is likely due to the target server's CORS policy or a network issue.`;
                          } else { // Original URL was not proxied, or some other case
                              errorMsg += "\nThis thumbnail might be from Steam's CDN directly or another source. Check for network issues or if the CDN/server requires CORS headers not provided for direct client-side access.";
                          }
                          console.error(errorMsg);
                          setErroredThumbnails(prev => new Set(prev).add(configuredUrl));
                        }
                        
                        // Set fallback image if not already set
                        if (target.src !== fallbackSrc) {
                            target.src = fallbackSrc;
                            target.alt = `Error loading thumbnail ${index + 1}`;
                        }
                      }}
                  />
                  {img.fullUrl === currentImageFullUrl && (
                    <div className="absolute inset-0 bg-purple-500 bg-opacity-30 flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="white" className="w-8 h-8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        
        <div className="mt-auto pt-4 border-t border-slate-700 flex flex-col sm:flex-row justify-center items-center space-y-3 sm:space-y-0 sm:space-x-4"> {/* Footer area */}
            {hasMoreImages && (
              <button
                onClick={onLoadMore}
                disabled={isLoadingMore}
                className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-6 rounded-lg shadow-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"
              >
                {isLoadingMore ? 'Loading More...' : 'Load More Images'}
              </button>
            )}
            <button
                onClick={onClose}
                className="bg-slate-600 hover:bg-slate-500 text-white font-medium py-2 px-6 rounded-lg shadow-md transition-colors w-full sm:w-auto"
            >
                Done
            </button>
        </div>
      </div>
    </div>
  );
};

export default ImageSelectionModal;
