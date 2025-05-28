export interface SearchResultApp { 
  appid: number; 
  name: string;
  source?: 'steam' | 'custom'; // Updated: Removed 'steamgriddb', can be 'custom'
}

export interface ScreenshotInfo {
  id: number | string; 
  thumbnailUrl: string;
  fullUrl: string;
}

export interface SelectedGameDisplayInfo {
  appId: number; 
  name:string;
  availableImages: ScreenshotInfo[];
  headerImageUrl: string; 
  currentImageIndex: number; 
  source?: 'steam' | 'custom'; // Updated: Removed 'steamgriddb', added 'custom'
  currentPage?: number; 
  hasMoreImagesToLoad?: boolean; 
}


export interface CanvasImageState {
  appId: number | null;
  imageUrlToLoad: string | null;
  image: HTMLImageElement | null;
  status: 'idle' | 'loading' | 'loaded' | 'error';
  displayName: string | null;
  
  offsetX: number;
  offsetY: number;
  zoom: number;
}

// For Steam API appdetails response
export interface SteamAppDetailsData {
  name?: string;
  header_image?: string;
  screenshots?: {
    id: number;
    path_thumbnail: string;
    path_full: string;
  }[];
}

export interface SteamAppDetailsResponse {
  [appId: string]: {
    success: boolean;
    data?: SteamAppDetailsData;
  };
}
