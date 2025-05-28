
import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { SelectedGameDisplayInfo, CanvasImageState } from '../types';
import { CANVAS_WIDTH, CANVAS_HEIGHT, MIN_ZOOM, MAX_ZOOM, ZOOM_SENSITIVITY } from '../constants';

interface ThumbnailCanvasProps {
  selectedGamesRaw: (SelectedGameDisplayInfo | null)[];
  onImageDrop: (slotIndex: number, file: File) => void;
  onImageUrlDrop: (slotIndex: number, imageUrl: string, imageName: string | null) => void;
}

const initialImageState = (): CanvasImageState => ({
  appId: null,
  imageUrlToLoad: null,
  image: null,
  status: 'idle',
  displayName: null,
  offsetX: 0,
  offsetY: 0,
  zoom: 1.0,
});


const ThumbnailCanvas: React.FC<ThumbnailCanvasProps> = ({ selectedGamesRaw, onImageDrop, onImageUrlDrop }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [imageStates, setImageStates] = useState<CanvasImageState[]>(() =>
    Array(3).fill(null).map(initialImageState)
  );

  const [draggingImageIndex, setDraggingImageIndex] = useState<number | null>(null);
  const [dragStartCoords, setDragStartCoords] = useState<{ x: number, y: number } | null>(null);
  const [initialImageOffsets, setInitialImageOffsets] = useState<{ x: number, y: number } | null>(null);
  const [cursorStyle, setCursorStyle] = useState('default');
  const [draggedOverSlotIndex, setDraggedOverSlotIndex] = useState<number | null>(null);


  const polygons = useMemo(() => {
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const slantAmount = W * 0.04; 
    const line1_base_x = W * 0.30;
    const line2_base_x = W * 0.70;

    return [
      [{ x: 0, y: 0 }, { x: line1_base_x + slantAmount, y: 0 }, { x: line1_base_x - slantAmount, y: H }, { x: 0, y: H }],
      [{ x: line1_base_x + slantAmount, y: 0 }, { x: line2_base_x - slantAmount, y: 0 }, { x: line2_base_x + slantAmount, y: H }, { x: line1_base_x - slantAmount, y: H }],
      [{ x: line2_base_x - slantAmount, y: 0 }, { x: W, y: 0 }, { x: W, y: H }, { x: line2_base_x + slantAmount, y: H }],
    ];
  }, []);

  const getMousePosOnCanvas = useCallback((
    event: React.MouseEvent<HTMLCanvasElement> | MouseEvent | React.WheelEvent<HTMLCanvasElement> | React.DragEvent<HTMLCanvasElement>,
    canvasOverride?: HTMLCanvasElement
  ): { x: number, y: number } | null => {
    const canvas = canvasOverride || canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const clientX = 'clientX' in event ? event.clientX : 0;
    const clientY = 'clientY' in event ? event.clientY : 0;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  }, []);
  
  const isPointInPolygon = useCallback((point: { x: number, y: number }, polygon: { x: number, y: number }[]): boolean => {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }, []);

  useEffect(() => {
    setImageStates(prevStates => {
      return prevStates.map((currentState, index) => {
        const gameData = selectedGamesRaw[index];

        if (!gameData) {
          return (currentState.status !== 'idle' || currentState.appId !== null) ? initialImageState() : currentState;
        }
        
        const newImageUrl = gameData.source === 'custom' 
                            ? gameData.headerImageUrl 
                            : (gameData.availableImages.length > 0 && gameData.currentImageIndex >= 0 && gameData.currentImageIndex < gameData.availableImages.length
                                ? gameData.availableImages[gameData.currentImageIndex].fullUrl
                                : gameData.headerImageUrl); 

        let needsChange = false;
        if (currentState.appId !== gameData.appId) {
          needsChange = true;
        } else if (currentState.imageUrlToLoad !== newImageUrl) {
          needsChange = true;
        }
        if (currentState.status === 'error' && currentState.appId === gameData.appId && currentState.imageUrlToLoad === newImageUrl) {
            needsChange = false; 
        }

        if (needsChange) {
          console.log(`[ThumbCanvas|Effect1|Slot${index}] State needs change. New appId: ${gameData.appId}, URL (start): ${newImageUrl ? newImageUrl.substring(0,50) : 'null'}`);
          return {
            ...initialImageState(),
            appId: gameData.appId,
            displayName: gameData.name,
            imageUrlToLoad: newImageUrl,
            status: newImageUrl ? 'loading' : 'error', 
            image: null, 
          };
        }
        
        if (currentState.displayName !== gameData.name && currentState.appId === gameData.appId && currentState.imageUrlToLoad === newImageUrl) {
            return {...currentState, displayName: gameData.name };
        }
        return currentState; 
      });
    });
  }, [selectedGamesRaw]);

  useEffect(() => {
    imageStates.forEach((imgState, index) => {
      if (imgState.status === 'loading' && imgState.imageUrlToLoad && !imgState.image) {
        const currentUrl = imgState.imageUrlToLoad; 
        console.log(`[ThumbCanvas|Effect2|Slot${index}] Initiating image load. AppId: ${imgState.appId}, URL type: ${typeof currentUrl}, URL starts with data: ${currentUrl.startsWith('data:')}, URL length: ${currentUrl.length}, URL (first 80 chars): ${currentUrl.substring(0, 80)}`);
        
        const newImg = new Image();
        if (!currentUrl.startsWith('data:')) {
            newImg.crossOrigin = "Anonymous";
        }

        newImg.onload = () => {
          console.log(`[ThumbCanvas|Effect2|Slot${index}] Image ONLOAD fired. AppId: ${imgState.appId}, URL (first 80): ${currentUrl.substring(0,80)}. Image dimensions: ${newImg.naturalWidth}x${newImg.naturalHeight}`);
          setImageStates(s => {
            const currentMappedState = s[index];
            if (currentMappedState && currentMappedState.imageUrlToLoad === currentUrl && currentMappedState.status === 'loading') {
              return s.map((is, i) => (i === index) 
                ? { ...is, status: 'loaded', image: newImg } 
                : is
              );
            }
            console.warn(`[ThumbCanvas|Effect2|Slot${index}] ONLOAD fired, but state for slot ${index} or URL ${currentUrl.substring(0,80)} no longer matches 'loading' status or URL. Current status: ${currentMappedState?.status}, current URL: ${currentMappedState?.imageUrlToLoad?.substring(0,80)}. No state update.`);
            return s; 
          });
        };

        newImg.onerror = (errorEvent) => { 
          let errorMsg = `[ThumbCanvas|Effect2|Slot${index}] Image ONERROR fired. AppId: ${imgState.appId}, Game: ${imgState.displayName || 'Unknown'}, URL (first 80): ${currentUrl.substring(0,80)}.`;
          if (currentUrl.includes('via.placeholder.com')) {
            errorMsg += "\nThis is a placeholder image URL. Check connection or ad blockers.";
          } else if (currentUrl.includes('proxy.cors.sh')) {
            errorMsg += "\nCORS proxy might be down or rate-limiting.";
          } else if (currentUrl.startsWith('data:')) {
            errorMsg += "\nThis was a data URL. The data might be corrupted, not a valid image format, or a browser limitation for data URLs.";
          }
          console.error(errorMsg, 'Raw error event:', errorEvent);
          setImageStates(s => {
            const currentMappedState = s[index];
            if (currentMappedState && currentMappedState.imageUrlToLoad === currentUrl && currentMappedState.status === 'loading') {
              return s.map((is, i) => (i === index) 
                ? { ...is, status: 'error', image: null } 
                : is
              );
            }
             console.warn(`[ThumbCanvas|Effect2|Slot${index}] ONERROR fired, but state for slot ${index} or URL ${currentUrl.substring(0,80)} no longer matches 'loading' status or URL. Current status: ${currentMappedState?.status}, current URL: ${currentMappedState?.imageUrlToLoad?.substring(0,80)}. No state update.`);
            return s; 
          });
        };
        
        try {
          newImg.src = currentUrl;
          console.log(`[ThumbCanvas|Effect2|Slot${index}] Assigned .src for image. AppId: ${imgState.appId}. Image should now be loading asynchronously.`);
        } catch (e) {
          console.error(`[ThumbCanvas|Effect2|Slot${index}] CRITICAL SYNC ERROR assigning .src to Image object. AppId: ${imgState.appId}. Error:`, e);
          setImageStates(s => s.map((is, i) => (i === index && is.imageUrlToLoad === currentUrl) 
            ? { ...is, status: 'error', image: null, displayName: `${is.displayName || 'Image'} (SrcAssignFail)` } 
            : is
          ));
        }
      }
    });
  }, [imageStates]);


  const drawCanvasContent = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = '#1E293B'; 
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    
    imageStates.forEach((imgState, index) => {
      ctx.save();
      const polygon = polygons[index];
      ctx.beginPath();
      polygon.forEach((point, idx) => {
        if (idx === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.clip();

      const isHighlightedForDrop = draggedOverSlotIndex === index;

      if (isHighlightedForDrop) {
        const minXClip = Math.min(...polygon.map(p => p.x));
        const maxXClip = Math.max(...polygon.map(p => p.x));
        const minYClip = Math.min(...polygon.map(p => p.y));
        const maxYClip = Math.max(...polygon.map(p => p.y));
        ctx.fillStyle = 'rgba(168, 85, 247, 0.4)'; 
        ctx.fillRect(minXClip, minYClip, maxXClip - minXClip, maxYClip - minYClip);
      }

      if (imgState.status === 'loaded' && imgState.image) {
        const img = imgState.image;
        const zoom = imgState.zoom;

        const dMinX = Math.min(...polygon.map(p => p.x));
        const dMaxX = Math.max(...polygon.map(p => p.x));
        const dMinY = Math.min(...polygon.map(p => p.y));
        const dMaxY = Math.max(...polygon.map(p => p.y));
        const dWidth = dMaxX - dMinX; 
        const dHeight = dMaxY - dMinY;

        const imgAspect = img.naturalWidth / img.naturalHeight;
        const polyAspect = dWidth / dHeight;

        let sVisibleWidth, sVisibleHeight; 
        if (imgAspect > polyAspect) {
            sVisibleHeight = img.naturalHeight;
            sVisibleWidth = sVisibleHeight * polyAspect;
        } else {
            sVisibleWidth = img.naturalWidth;
            sVisibleHeight = sVisibleWidth / polyAspect;
        }
        
        const sZoomedWidth = sVisibleWidth / zoom;
        const sZoomedHeight = sVisibleHeight / zoom;

        let sx = (img.naturalWidth - sZoomedWidth) / 2 + imgState.offsetX;
        let sy = (img.naturalHeight - sZoomedHeight) / 2 + imgState.offsetY;

        sx = Math.max(0, Math.min(sx, img.naturalWidth - sZoomedWidth));
        sy = Math.max(0, Math.min(sy, img.naturalHeight - sZoomedHeight));
        
        ctx.drawImage(img, sx, sy, sZoomedWidth, sZoomedHeight, dMinX, dMinY, dWidth, dHeight);

      } else { 
        const minX = Math.min(...polygon.map(p => p.x));
        const maxX = Math.max(...polygon.map(p => p.x));
        const midX = (minX + maxX) / 2;
        
        if (!isHighlightedForDrop) { 
          ctx.fillStyle = '#334155'; 
          ctx.fillRect(minX, 0, maxX - minX, CANVAS_HEIGHT);
        }

        ctx.fillStyle = isHighlightedForDrop ? '#FFFFFF' : '#94A3B8'; 
        ctx.font = '30px Arial';
        ctx.textAlign = 'center';
        let text = `Slot ${index + 1}`;

        if (isHighlightedForDrop) {
            text = 'Drop Image Here';
        } else if (imgState.status === 'loading') {
            text = 'Loading...';
        } else if (imgState.status === 'error') {
            text = `Error: ${imgState.displayName || 'Image'}`;
        } else if (imgState.displayName) {
            text = imgState.displayName;
        } else if(imgState.status === 'idle' && !imgState.appId) {
            text = `Slot ${index+1} empty`;
        }
        ctx.fillText(text, midX, CANVAS_HEIGHT / 2);
      }
      ctx.restore();
    });

    ctx.strokeStyle = '#A855F7'; 
    ctx.lineWidth = 15;
    const W = CANVAS_WIDTH;
    const H = CANVAS_HEIGHT;
    const slantAmount = W * 0.04; 
    const line1_base_x = W * 0.30;
    const line2_base_x = W * 0.70;

    ctx.beginPath(); ctx.moveTo(line1_base_x + slantAmount, 0); ctx.lineTo(line1_base_x - slantAmount, H); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(line2_base_x - slantAmount, 0); ctx.lineTo(line2_base_x + slantAmount, H); ctx.stroke();

  }, [imageStates, polygons, draggedOverSlotIndex]); 

  useEffect(() => {
    drawCanvasContent();
  }, [drawCanvasContent]);


  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePosOnCanvas(event);
    if (!pos) return;
    
    for (let i = 0; i < polygons.length; i++) {
      if (isPointInPolygon(pos, polygons[i])) {
        if (imageStates[i].status === 'loaded' && imageStates[i].image) {
          setDraggingImageIndex(i);
          setDragStartCoords(pos);
          setInitialImageOffsets({ x: imageStates[i].offsetX, y: imageStates[i].offsetY });
          setCursorStyle('grabbing');
          event.preventDefault();
        }
        return; 
      }
    }
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const pos = getMousePosOnCanvas(event);
    if (!pos) return;

    if (draggingImageIndex !== null && dragStartCoords && initialImageOffsets && imageStates[draggingImageIndex].image) {
      setCursorStyle('grabbing');
      const activeState = imageStates[draggingImageIndex];
      const img = activeState.image!;
      const zoom = activeState.zoom;
      
      const dMinXCanvas = Math.min(...polygons[draggingImageIndex].map(p => p.x));
      const dMaxXCanvas = Math.max(...polygons[draggingImageIndex].map(p => p.x));
      const dWidthCanvas = dMaxXCanvas - dMinXCanvas;
      const dMinYCanvas = Math.min(...polygons[draggingImageIndex].map(p => p.y));
      const dMaxYCanvas = Math.max(...polygons[draggingImageIndex].map(p => p.y));
      const dHeightCanvas = dMaxYCanvas - dMinYCanvas;

      const imgAspect = img.naturalWidth / img.naturalHeight;
      const polyAspect = dWidthCanvas / dHeightCanvas;
      
      let sVisibleWidth, sVisibleHeight;
       if (imgAspect > polyAspect) {
          sVisibleHeight = img.naturalHeight;
          sVisibleWidth = sVisibleHeight * polyAspect;
      } else {
          sVisibleWidth = img.naturalWidth;
          sVisibleHeight = sVisibleWidth / polyAspect;
      }
      const sZoomedWidth = sVisibleWidth / zoom;
      const sZoomedHeight = sVisibleHeight / zoom; 

      const sourcePixelPerCanvasPixelX = sZoomedWidth / dWidthCanvas;
      const sourcePixelPerCanvasPixelY = sZoomedHeight / dHeightCanvas; 
      
      const dx = (pos.x - dragStartCoords.x) * sourcePixelPerCanvasPixelX;
      const dy = (pos.y - dragStartCoords.y) * sourcePixelPerCanvasPixelY; 

      setImageStates(prev => prev.map((s, idx) => 
        idx === draggingImageIndex ? { ...s, offsetX: initialImageOffsets.x - dx, offsetY: initialImageOffsets.y - dy } : s
      ));
    } else { 
      let newCursor = 'default';
      for (let i = 0; i < polygons.length; i++) {
        if (imageStates[i].status === 'loaded' && isPointInPolygon(pos, polygons[i])) {
          newCursor = 'grab';
          break;
        }
      }
      if (cursorStyle !== newCursor) {
        setCursorStyle(newCursor);
      }
    }
  };

  const handleMouseUpOrLeave = () => {
    if (draggingImageIndex !== null) {
      setCursorStyle('grab'); 
      setDraggingImageIndex(null);
      setDragStartCoords(null);
      setInitialImageOffsets(null);
    }
  };
  
  const handleMouseLeaveCanvas = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingImageIndex === null) {
      setCursorStyle('default'); 
    }
     // For drag leave of files, not mouse cursor leaving for panning
    if (event.type === 'dragleave' && draggedOverSlotIndex !== null) {
        const canvasEl = canvasRef.current;
        if (canvasEl && !canvasEl.contains(event.relatedTarget as Node)) {
            setDraggedOverSlotIndex(null);
        }
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLCanvasElement>) => {
    const canvasElement = canvasRef.current;
    if (!canvasElement) return;

    // Prevent default page scroll if wheel event is on the canvas,
    // irrespective of whether a specific image is targeted for zoom.
    event.preventDefault(); 

    const pos = getMousePosOnCanvas(event);
    if (!pos) {
      return; 
    }

    for (let i = 0; i < polygons.length; i++) {
      if (imageStates[i].status === 'loaded' && 
          imageStates[i].image && 
          isPointInPolygon(pos, polygons[i])) {
        
        const currentZoom = imageStates[i].zoom;
        const zoomFactor = 1 - event.deltaY * ZOOM_SENSITIVITY;
        let newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom * zoomFactor));
        
        setImageStates(prev => prev.map((s, idx) => idx === i ? { ...s, zoom: newZoom } : s));
        return; 
      }
    }
  };
  
  useEffect(() => { 
    const canvasElement = canvasRef.current;
    if (!canvasElement || draggingImageIndex === null) return;

    const globalMouseMove = (event: MouseEvent) => {
        if (draggingImageIndex === null || !dragStartCoords || !initialImageOffsets || !imageStates[draggingImageIndex].image) return;
        if (event.buttons !== 1) { handleMouseUpOrLeave(); return; }

        const pos = getMousePosOnCanvas(event, canvasElement);
        if(!pos) { 
            handleMouseUpOrLeave();
            return; 
        }

        const activeState = imageStates[draggingImageIndex];
        const img = activeState.image!;
        const zoom = activeState.zoom;
        
        const dMinXCanvas = Math.min(...polygons[draggingImageIndex].map(p => p.x));
        const dMaxXCanvas = Math.max(...polygons[draggingImageIndex].map(p => p.x));
        const dWidthCanvas = dMaxXCanvas - dMinXCanvas;
        const dMinYCanvas = Math.min(...polygons[draggingImageIndex].map(p => p.y));
        const dMaxYCanvas = Math.max(...polygons[draggingImageIndex].map(p => p.y));
        const dHeightCanvas = dMaxYCanvas - dMinYCanvas;

        const imgAspect = img.naturalWidth / img.naturalHeight;
        const polyAspect = dWidthCanvas / dHeightCanvas;
        
        let sVisibleWidth, sVisibleHeight;
        if (imgAspect > polyAspect) {
            sVisibleHeight = img.naturalHeight;
            sVisibleWidth = sVisibleHeight * polyAspect;
        } else {
            sVisibleWidth = img.naturalWidth;
            sVisibleHeight = sVisibleWidth / polyAspect;
        }
        const sZoomedWidth = sVisibleWidth / zoom;
        const sZoomedHeight = sVisibleHeight / zoom;

        const sourcePixelPerCanvasPixelX = sZoomedWidth / dWidthCanvas;
        const sourcePixelPerCanvasPixelY = sZoomedHeight / dHeightCanvas; 
        
        const dx = (pos.x - dragStartCoords.x) * sourcePixelPerCanvasPixelX;
        const dy = (pos.y - dragStartCoords.y) * sourcePixelPerCanvasPixelY; 

        setImageStates(prev => prev.map((s, idx) => 
            idx === draggingImageIndex ? { ...s, offsetX: initialImageOffsets.x - dx, offsetY: initialImageOffsets.y - dy } : s
        ));
    };
    const globalMouseUp = (event: MouseEvent) => { 
      if (event.button === 0 && draggingImageIndex !== null) { 
         handleMouseUpOrLeave();
      }
    };
    
    document.addEventListener('mousemove', globalMouseMove);
    document.addEventListener('mouseup', globalMouseUp);
    return () => {
      document.removeEventListener('mousemove', globalMouseMove);
      document.removeEventListener('mouseup', globalMouseUp);
    };
  }, [draggingImageIndex, dragStartCoords, initialImageOffsets, getMousePosOnCanvas, imageStates, polygons]);


  const handleDownload = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      requestAnimationFrame(() => { 
        const currentDragOver = draggedOverSlotIndex;
        if (currentDragOver !== null) setDraggedOverSlotIndex(null); 
        
        drawCanvasContent(); 
        
        const imageURL = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = imageURL;
        link.download = 'youtube_thumbnail.png';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (currentDragOver !== null) setDraggedOverSlotIndex(currentDragOver);
      });
    }
  };

  const handleDragOver = useCallback((event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault(); 
    event.dataTransfer.dropEffect = 'copy'; 
    
    const pos = getMousePosOnCanvas(event);
    if (!pos) {
      if (draggedOverSlotIndex !== null) setDraggedOverSlotIndex(null);
      return;
    }
  
    let newHoveredSlot: number | null = null;
    for (let i = 0; i < polygons.length; i++) {
      if (isPointInPolygon(pos, polygons[i])) {
        newHoveredSlot = i;
        break;
      }
    }
  
    if (draggedOverSlotIndex !== newHoveredSlot) {
      setDraggedOverSlotIndex(newHoveredSlot);
    }
  }, [getMousePosOnCanvas, polygons, isPointInPolygon, draggedOverSlotIndex]);
  
  const handleDragLeave = useCallback((event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const canvasEl = canvasRef.current;
    if (canvasEl && (!event.relatedTarget || !canvasEl.contains(event.relatedTarget as Node))) {
       if (draggedOverSlotIndex !== null) {
          setDraggedOverSlotIndex(null);
       }
    }
  }, [draggedOverSlotIndex]);
  
  const handleDrop = useCallback((event: React.DragEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    const droppedSlotIndex = draggedOverSlotIndex; 
    setDraggedOverSlotIndex(null); 
  
    if (droppedSlotIndex === null) return;

    console.log('[ThumbCanvas|handleDrop] Available data types:', Array.from(event.dataTransfer.types));
  
    const files = event.dataTransfer.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('image/')) {
        console.log(`[ThumbCanvas|handleDrop] Slot ${droppedSlotIndex} received image FILE: ${file.name}`);
        onImageDrop(droppedSlotIndex, file);
        return;
      } else {
        console.warn('[ThumbCanvas|handleDrop] Dropped file is not an image:', file.type, file.name);
        alert('Please drop an image file (e.g., PNG, JPG, GIF).');
        return;
      }
    }
  
    let imageUrl: string | null = null;
    let imageName: string | null = "Web Image";
  
    const uriList = event.dataTransfer.getData('text/uri-list');
    if (uriList) {
      imageUrl = uriList.split('\n')[0].trim();
      console.log(`[ThumbCanvas|handleDrop] Extracted URL from text/uri-list: ${imageUrl}`);
    }
  
    if (!imageUrl) {
      const urlData = event.dataTransfer.getData('URL');
      if (urlData) {
        imageUrl = urlData.trim();
        console.log(`[ThumbCanvas|handleDrop] Extracted URL from URL type: ${imageUrl}`);
      }
    }
    
    if (!imageUrl) {
      const plainText = event.dataTransfer.getData('text/plain');
      if (plainText) {
          const potentialUrl = plainText.trim();
          if (potentialUrl.startsWith('http://') || potentialUrl.startsWith('https://') || potentialUrl.startsWith('data:image/')) {
            // Basic check if it looks like a URL that could be an image
             if (/\.(?:jpg|jpeg|png|gif|webp|svg)(?:\?.*)?$/i.test(potentialUrl) || potentialUrl.startsWith('data:image/') || !potentialUrl.includes('.')) {
                // The !potentialUrl.includes('.') is a weak check for things like direct image server links without extensions but are images.
                // Or, it might be a data URL.
                imageUrl = potentialUrl;
                console.log(`[ThumbCanvas|handleDrop] Extracted URL from text/plain: ${imageUrl}`);
            } else {
                 console.log(`[ThumbCanvas|handleDrop] text/plain data looked like a URL but not an obvious image URL: ${potentialUrl.substring(0,100)}`);
            }
          } else {
               console.log(`[ThumbCanvas|handleDrop] text/plain data did not start with http/https or data:image: ${plainText.substring(0,100)}`);
          }
      }
    }
  
    if (!imageUrl) {
      const htmlContent = event.dataTransfer.getData('text/html');
      if (htmlContent) {
        console.log('[ThumbCanvas|handleDrop] Attempting to extract img src from text/html snippet.');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlContent;
        const imgTag = tempDiv.querySelector('img');
        if (imgTag && imgTag.src) {
          imageUrl = imgTag.src;
          console.log(`[ThumbCanvas|handleDrop] Extracted URL from text/html img src: ${imageUrl}`);
          if (imgTag.alt && imgTag.alt.trim() !== "") {
            imageName = imgTag.alt;
          } else {
            // Try to get a name from the URL path
            try {
                const urlPath = new URL(imageUrl).pathname;
                const filename = urlPath.substring(urlPath.lastIndexOf('/') + 1);
                if (filename) imageName = filename;
            } catch (e) { /* ignore if URL parsing fails for name */ }
          }
        } else {
            console.log('[ThumbCanvas|handleDrop] No img tag with src found in text/html snippet.');
        }
      }
    }
  
    if (imageUrl) {
      if (imageUrl.startsWith('http:') || imageUrl.startsWith('https:') || imageUrl.startsWith('data:image/')) {
        console.log(`[ThumbCanvas|handleDrop] Slot ${droppedSlotIndex} received image URL: ${imageUrl.substring(0,100)}...`);
        onImageUrlDrop(droppedSlotIndex, imageUrl, imageName);
      } else {
        console.warn('[ThumbCanvas|handleDrop] Extracted URL does not seem like a valid image source (http, https, data:):', imageUrl.substring(0,100));
        alert('Could not get a valid image URL from the dropped item. The URL must start with http, https, or be a data URL.');
      }
    } else {
      console.log('[ThumbCanvas|handleDrop] No image file or valid image URL found in dropped data after all checks.');
    }
  }, [draggedOverSlotIndex, onImageDrop, onImageUrlDrop, isPointInPolygon, polygons, getMousePosOnCanvas]);


  const canvasStyle: React.CSSProperties = {
    aspectRatio: `${CANVAS_WIDTH}/${CANVAS_HEIGHT}`,
    cursor: cursorStyle,
    touchAction: 'none', 
  };

  return (
    <div className="flex flex-col items-center mt-2">
      <canvas
        ref={canvasRef}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        className="border border-slate-600 shadow-2xl rounded-lg max-w-full h-auto"
        style={canvasStyle}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUpOrLeave}
        onMouseLeave={handleMouseLeaveCanvas} 
        onWheel={handleWheel}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave} 
        onDrop={handleDrop}
        aria-label="Thumbnail canvas for game images, drag and drop enabled. Use mouse wheel to zoom images, drag to pan."
      />
      <button
        onClick={handleDownload}
        className="mt-6 bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-opacity-50 text-lg"
        aria-label="Download Thumbnail"
      >
        Download Thumbnail
      </button>
    </div>
  );
};

export default ThumbnailCanvas;
