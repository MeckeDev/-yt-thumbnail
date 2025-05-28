
import React, { useState, useCallback } from 'react';
import GameSelector from './components/GameSelector';
import ThumbnailCanvas from './components/ThumbnailCanvas';
import { SearchResultApp, SelectedGameDisplayInfo, SteamAppDetailsData, ScreenshotInfo } from './types';
import { STEAM_IMAGE_URL_TEMPLATE } from './constants';
import { fetchGameDetails, convertToScreenshotInfo as convertSteamScreenshots } from './services/steamService';
// Removed SteamGridDB imports
import { searchWebForImages } from './services/imageSearchService';
import ImageSelectionModal from './components/ImageSelectionModal';

const App: React.FC = () => {
  const [selectedGame1, setSelectedGame1] = useState<SelectedGameDisplayInfo | null>(null);
  const [selectedGame2, setSelectedGame2] = useState<SelectedGameDisplayInfo | null>(null);
  const [selectedGame3, setSelectedGame3] = useState<SelectedGameDisplayInfo | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalGameIndex, setModalGameIndex] = useState<number | null>(null);
  const [isLoadingMoreModalImages, setIsLoadingMoreModalImages] = useState(false);

  const getSelectedGameForSlot = (slot: number): SelectedGameDisplayInfo | null => {
    if (slot === 0) return selectedGame1;
    if (slot === 1) return selectedGame2;
    if (slot === 2) return selectedGame3;
    return null;
  };

  const setSelectedGameForSlot = useCallback((slot: number, gameInfo: SelectedGameDisplayInfo | null) => {
    if (slot === 0) setSelectedGame1(gameInfo);
    else if (slot === 1) setSelectedGame2(gameInfo);
    else setSelectedGame3(gameInfo);
  }, []); 

  const handleGameSelect = useCallback(async (slot: number, game: SearchResultApp | null) => {
    if (!game) {
      setSelectedGameForSlot(slot, null);
      return;
    }

    const initialDisplayInfo: SelectedGameDisplayInfo = {
      appId: game.appid,
      name: game.name,
      headerImageUrl: STEAM_IMAGE_URL_TEMPLATE(game.appid),
      availableImages: [],
      currentImageIndex: 0,
      source: 'steam', 
      currentPage: 1,
      hasMoreImagesToLoad: true,
    };
    setSelectedGameForSlot(slot, initialDisplayInfo); 
    
    const headerImageUrl = STEAM_IMAGE_URL_TEMPLATE(game.appid);
    const details: SteamAppDetailsData | null = await fetchGameDetails(game.appid);
    const steamImages = await convertSteamScreenshots(details, headerImageUrl, game.name, 1);
    
    const finalGameInfo: SelectedGameDisplayInfo = {
      ...initialDisplayInfo,
      headerImageUrl: headerImageUrl, 
      availableImages: steamImages.length > 0 ? steamImages : [{ id: `header_${game.appid}`, thumbnailUrl: headerImageUrl, fullUrl: headerImageUrl }],
      hasMoreImagesToLoad: true, 
      currentPage: 1,
    };
    setSelectedGameForSlot(slot, finalGameInfo);
  }, [setSelectedGameForSlot]);

  const processCustomImageFile = useCallback((slotIndex: number, file: File) => {
    console.log(`[App|processCustomImageFile] Slot ${slotIndex}, File: ${file.name}, Type: ${file.type}, Size: ${file.size}`);
    const reader = new FileReader();
    reader.onloadend = () => {
      const dataUrl = reader.result as string;
      console.log(`[App|processCustomImageFile] FileReader onloadend. Data URL (first 100 chars): ${dataUrl ? dataUrl.substring(0, 100) : 'null'}`);
      
      if (!dataUrl || !dataUrl.startsWith('data:image/')) {
          console.error("[App|processCustomImageFile] FileReader did not produce a valid image data URL. Received:", dataUrl ? dataUrl.substring(0,30) : 'null');
          alert("Error processing image. The file might be corrupted or not a supported image type.");
          return;
      }
      
      let displayName = file.name || "Custom Image";
      if (displayName.length > 30) {
        displayName = displayName.substring(0, 27) + '...';
      }

      const customGameDisplayInfo: SelectedGameDisplayInfo = {
        appId: -Date.now(), 
        name: displayName,
        headerImageUrl: dataUrl,
        availableImages: [{ id: `custom_${slotIndex}_${Date.now()}`, thumbnailUrl: dataUrl, fullUrl: dataUrl }],
        currentImageIndex: 0,
        source: 'custom',
        currentPage: 1,
        hasMoreImagesToLoad: false,
      };
      console.log(`[App|processCustomImageFile] Setting selected game for slot ${slotIndex} with appId: ${customGameDisplayInfo.appId}, name: ${customGameDisplayInfo.name}`);
      setSelectedGameForSlot(slotIndex, customGameDisplayInfo);
    };
    reader.onerror = (error) => {
      console.error("[App|processCustomImageFile] FileReader error:", error);
      alert("Error reading file. Please try a different image or check browser console for details.");
    };
    reader.readAsDataURL(file);
  }, [setSelectedGameForSlot]);


  const handleCustomImageUpload = useCallback((slot: number, file: File | null) => {
    if (!file) return;
    processCustomImageFile(slot, file);
  }, [processCustomImageFile]);

  const handleImageDrop = useCallback((slotIndex: number, file: File) => {
    console.log(`[App|handleImageDrop] Image file dropped on slot ${slotIndex}:`, file.name);
    processCustomImageFile(slotIndex, file);
  }, [processCustomImageFile]);

  const handleImageUrlDrop = useCallback((slotIndex: number, imageUrl: string, imageName: string | null) => {
    console.log(`[App|handleImageUrlDrop] Image URL dropped on slot ${slotIndex}: ${imageUrl.substring(0,100)}... Name: ${imageName}`);
    
    let displayName = imageName || "Web Image";
    if (displayName.length > 30) {
      displayName = displayName.substring(0, 27) + '...';
    }
  
    const newImageInfo: SelectedGameDisplayInfo = {
      appId: -Date.now() - slotIndex, // Unique ID for custom/web images, ensure slightly different from file drop
      name: displayName,
      headerImageUrl: imageUrl, // This will be the URL to load
      availableImages: [{ id: `web_${slotIndex}_${Date.now()}`, thumbnailUrl: imageUrl, fullUrl: imageUrl }],
      currentImageIndex: 0,
      source: 'custom', // Treat web-dropped images like custom ones for simplicity in logic
      currentPage: 1,
      hasMoreImagesToLoad: false, // Typically, a single dropped web image doesn't have 'more'
    };
    console.log(`[App|handleImageUrlDrop] Setting selected game for slot ${slotIndex} with appId: ${newImageInfo.appId}, name: ${newImageInfo.name}`);
    setSelectedGameForSlot(slotIndex, newImageInfo);
  }, [setSelectedGameForSlot]);


  const handleOpenModalForSlot = (slotIndex: number) => {
    setModalGameIndex(slotIndex);
    setIsModalOpen(true);
  };
  
  const handleModalImageSelect = (selectedImgIdx: number) => {
    if (modalGameIndex === null) return;
    
    const currentGameData = getSelectedGameForSlot(modalGameIndex);

    if (currentGameData && selectedImgIdx >= 0 && selectedImgIdx < currentGameData.availableImages.length) {
      setSelectedGameForSlot(modalGameIndex, {
        ...currentGameData,
        currentImageIndex: selectedImgIdx,
      });
    }
    setIsModalOpen(false);
    setModalGameIndex(null);
  };

  const handleLoadMoreImages = async () => {
    if (modalGameIndex === null) return;
    const currentGameData = getSelectedGameForSlot(modalGameIndex);

    if (!currentGameData || !currentGameData.hasMoreImagesToLoad || currentGameData.source === 'custom') {
      console.log("[App|LoadMore] No current game data, no more images to load, or custom source.");
      return;
    }

    setIsLoadingMoreModalImages(true);
    const nextPage = (currentGameData.currentPage || 1) + 1;
    let newImages: ScreenshotInfo[] = [];

    console.log(`[App|LoadMore] Attempting to load more images for "${currentGameData.name}", Source: ${currentGameData.source}, Next Page: ${nextPage}`);

    try {
      newImages = await searchWebForImages(currentGameData.name, process.env.API_KEY, nextPage);
      console.log(`[App|LoadMore] Fetched ${newImages.length} raw new images for page ${nextPage}.`);
      
      const uniqueNewImages = newImages.filter(
        (img) => !currentGameData.availableImages.some((existing) => existing.fullUrl === img.fullUrl)
      );
      console.log(`[App|LoadMore] Found ${uniqueNewImages.length} unique new images to add.`);

      if (uniqueNewImages.length > 0) {
        const updatedAvailableImages = [...currentGameData.availableImages, ...uniqueNewImages];
        setSelectedGameForSlot(modalGameIndex, {
          ...currentGameData,
          availableImages: updatedAvailableImages,
          currentPage: nextPage,
          hasMoreImagesToLoad: newImages.length > 0, 
        });
      } else {
        setSelectedGameForSlot(modalGameIndex, { ...currentGameData, currentPage: nextPage, hasMoreImagesToLoad: false });
      }
    } catch (error) {
      console.error("[App|LoadMore] Error loading more images:", error);
      setSelectedGameForSlot(modalGameIndex, { ...currentGameData, hasMoreImagesToLoad: false });
    } finally {
      setIsLoadingMoreModalImages(false);
    }
  };
  
  const modalCurrentGame = modalGameIndex !== null ? getSelectedGameForSlot(modalGameIndex) : null;

  return (
    <div className="min-h-screen bg-slate-900 text-gray-100 p-4 md:p-8 flex flex-col items-center">
      <header className="mb-4 md:mb-6 text-center"> {/* Reduced bottom margin */}
        {/* 
        <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
          YouTube Thumbnail Creator
        </h1> 
        */}
        <p className="text-slate-400 mt-2 text-base md:text-lg"> {/* Adjusted text size slightly for balance */}
          Select games or upload/drop custom images. Use buttons to change images. Scroll to zoom. Drag to pan.
        </p>
      </header>

      <main className="w-full max-w-6xl">
        <div className="mb-6 md:mb-8 p-4 md:p-6 bg-slate-800 rounded-xl shadow-2xl"> {/* Reduced bottom margin and padding slightly */}
          <h2 className="text-xl md:text-2xl font-semibold mb-4 md:mb-6 text-gray-200 border-b border-slate-700 pb-3">Choose Content for Slots</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6"> {/* Reduced gap slightly */}
            {[0, 1, 2].map((index) => {
              const slotGame = getSelectedGameForSlot(index);
              return (
                <div key={`slot-controls-${index}`} className="flex flex-col space-y-3 bg-slate-750 p-4 rounded-lg shadow">
                  <GameSelector
                    id={`game${index}`}
                    label={`Game ${index + 1} (${['Left', 'Middle', 'Right'][index]})`}
                    onGameSelect={(game) => handleGameSelect(index, game)}
                    selectedGameName={slotGame?.source !== 'custom' ? slotGame?.name || null : null}
                  />
                  <label 
                    htmlFor={`custom-upload-slot-${index}`} 
                    className="w-full text-center bg-teal-600 hover:bg-teal-700 text-white font-semibold py-2 px-4 rounded-md shadow-sm cursor-pointer transition-colors duration-150 ease-in-out"
                    role="button"
                    aria-label={`Upload custom image for slot ${index + 1}`}
                  >
                    Upload Custom (Slot {index + 1})
                  </label>
                  <input
                    id={`custom-upload-slot-${index}`}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handleCustomImageUpload(index, file);
                      }
                      e.target.value = ''; 
                    }}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="my-4 grid grid-cols-3 gap-x-4 w-full px-2 md:px-0">
          {[selectedGame1, selectedGame2, selectedGame3].map((game, index) => (
            <div key={`change-btn-slot-${index}`} className="flex justify-center">
              {game && game.source !== 'custom' && game.availableImages.length > 0 && ( 
                <button
                  onClick={() => handleOpenModalForSlot(index)}
                  className="bg-purple-500 hover:bg-purple-600 text-white font-semibold py-2 px-3 md:px-4 rounded-md shadow transition-colors text-xs sm:text-sm truncate max-w-full"
                  title={`Change Image for ${game.name}`}
                >
                  Change: {game.name.length > 15 ? game.name.substring(0,12) + "..." : game.name}
                </button>
              )}
               {game && game.source === 'custom' && (
                <button
                  onClick={() => {
                    const fileInput = document.getElementById(`custom-upload-slot-${index}`) as HTMLInputElement;
                    if (fileInput) fileInput.click();
                  }}
                  className="bg-teal-500 hover:bg-teal-600 text-white font-semibold py-2 px-3 md:px-4 rounded-md shadow transition-colors text-xs sm:text-sm truncate max-w-full"
                  title={`Change Custom Image: ${game.name}`}
                >
                  Change: {game.name.length > 15 ? game.name.substring(0,12) + "..." : game.name}
                </button>
              )}
            </div>
          ))}
        </div>

        <ThumbnailCanvas 
          selectedGamesRaw={[selectedGame1, selectedGame2, selectedGame3]}
          onImageDrop={handleImageDrop}
          onImageUrlDrop={handleImageUrlDrop}
        />
      </main>
      
      {isModalOpen && modalCurrentGame && modalGameIndex !== null && modalCurrentGame.source !== 'custom' && (
        <ImageSelectionModal
          isOpen={isModalOpen}
          onClose={() => { setIsModalOpen(false); setModalGameIndex(null); setIsLoadingMoreModalImages(false); }}
          images={modalCurrentGame.availableImages}
          onImageSelect={handleModalImageSelect} 
          gameName={modalCurrentGame.name}
          currentImageFullUrl={modalCurrentGame.availableImages[modalCurrentGame.currentImageIndex]?.fullUrl || ''}
          onLoadMore={handleLoadMoreImages}
          isLoadingMore={isLoadingMoreModalImages}
          hasMoreImages={modalCurrentGame.hasMoreImagesToLoad || false}
        />
      )}

      <footer className="mt-8 md:mt-12 text-center text-slate-500 text-sm"> {/* Adjusted top margin */}
        <p>&copy; {new Date().getFullYear()} Thumbnail Generator. Powered by React & Tailwind CSS.</p>
        <p className="text-xs mt-1">Steam data via public APIs & CORS proxies. Web Image Search uses a mock service.</p>
      </footer>
    </div>
  );
};

export default App;
