
import { SearchResultApp, SteamAppDetailsResponse, SteamAppDetailsData, ScreenshotInfo } from '../types';
import { STEAM_API_DETAILS_URL_TEMPLATE, CORS_PROXY_PREFIX } from '../constants';
import { searchWebForImages } from './imageSearchService'; // Import the new service

// CORS Workaround for GetAppList:
const STEAM_API_TARGET_URL = 'https://api.steampowered.com/ISteamApps/GetAppList/v2/';
const PROXIED_STEAM_API_URL = `${CORS_PROXY_PREFIX}${STEAM_API_TARGET_URL}`;

let allSteamAppsCache: SearchResultApp[] | null = null;
let activeFetchPromise: Promise<SearchResultApp[]> | null = null;
const MAX_RETRIES_LIST = 2;
const RETRY_DELAY_MS = 1500;

// Cache for game details
const gameDetailsCache = new Map<number, SteamAppDetailsData>();
const activeDetailFetchPromises = new Map<number, Promise<SteamAppDetailsData | null>>();


const fetchSteamAppsWithRetries = async (attempt = 0): Promise<SearchResultApp[]> => {
  console.log(`Fetching Steam games list (Attempt ${attempt + 1}/${MAX_RETRIES_LIST + 1})... Proxy URL: ${PROXIED_STEAM_API_URL}`);
  try {
    const response = await fetch(PROXIED_STEAM_API_URL);
    if (!response.ok) {
      let errorBody = 'Could not read error body from proxy.';
      try { errorBody = await response.text(); } catch (e) { /* Ignore */ }
      throw new Error(`Proxy request to Steam API failed: ${response.status} ${response.statusText}. Failed URL: ${response.url}. Proxy Response: ${errorBody.substring(0, 300)}`);
    }
    const responseText = await response.text();
    if (!responseText) throw new Error("Received empty response body from proxy for app list.");
    const data = JSON.parse(responseText);
    if (!data.applist || !data.applist.apps) {
      console.error('Unexpected Steam API response structure (app list):', data);
      throw new Error('Invalid data structure received from proxied Steam API (app list).');
    }
    const apps = data.applist.apps.filter(
      (app: any): app is SearchResultApp =>
        app && typeof app.appid === 'number' && app.name && app.name.trim() !== ''
    ).map((app: any) => ({ // Ensure it conforms to SearchResultApp, adding source
        appid: app.appid,
        name: app.name,
        source: 'steam'
    }));
    console.log(`Successfully fetched and processed ${apps.length} Steam games.`);
    
    const cs2App = apps.find(app => app.appid === 730);
    if (cs2App) {
      console.log('Game details for AppID 730 (from GetAppList):', cs2App.name); // CS2 name is 'Counter-Strike 2'
    }

    return apps;
  } catch (error: any) {
    console.error(`Error fetching/processing Steam games (Attempt ${attempt + 1}):`, error.message);
    if (attempt < MAX_RETRIES_LIST) {
      await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
      return fetchSteamAppsWithRetries(attempt + 1);
    } else {
      console.error("Max retries reached for app list.");
      throw error;
    }
  }
};

const getOrFetchAllSteamApps = (): Promise<SearchResultApp[]> => {
  if (allSteamAppsCache) return Promise.resolve(allSteamAppsCache);
  if (activeFetchPromise) return activeFetchPromise;
  activeFetchPromise = fetchSteamAppsWithRetries()
    .then(apps => {
      allSteamAppsCache = apps;
      return apps;
    })
    .catch(error => {
      console.error("Caching fetch failure: Storing empty list for Steam games.");
      allSteamAppsCache = [];
      activeFetchPromise = null;
      return [];
    });
  return activeFetchPromise;
};

export const searchSteamGames = async (query: string): Promise<SearchResultApp[]> => {
  try {
    const apps = await getOrFetchAllSteamApps();
    if (!query.trim() || apps.length === 0) return [];
    const lowerCaseQuery = query.toLowerCase();
    const filteredGames = apps.filter(game =>
        game.name.toLowerCase().includes(lowerCaseQuery)
    );
    return filteredGames.slice(0, 20);
  } catch (error) {
    console.error("Unexpected error within searchSteamGames:", error);
    return []; 
  }
};

// Fetch details for a single game
export const fetchGameDetails = async (appId: number): Promise<SteamAppDetailsData | null> => {
  if (gameDetailsCache.has(appId)) {
    return gameDetailsCache.get(appId) || null;
  }
  if (activeDetailFetchPromises.has(appId)) {
    return activeDetailFetchPromises.get(appId)!;
  }

  const url = STEAM_API_DETAILS_URL_TEMPLATE(appId);
  console.log(`Fetching details for appID ${appId} from ${url}`);

  const promise = fetch(url)
    .then(async response => {
      if (!response.ok) {
        let errorBody = 'Could not read error body from proxy.';
        try { errorBody = await response.text(); } catch (e) { /* Ignore */ }
        throw new Error(`Proxy request to Steam AppDetails API failed for ${appId}: ${response.status} ${response.statusText}. Proxy Response: ${errorBody.substring(0,300)}`);
      }
      const responseText = await response.text();
      if (!responseText) {
        throw new Error(`Received empty response body from proxy for appID ${appId} details.`);
      }
      const jsonData = JSON.parse(responseText) as SteamAppDetailsResponse;
      const appData = jsonData[appId.toString()];

      if (appData && appData.success && appData.data) {
        console.log(`Successfully fetched details for ${appData.data.name || `AppID ${appId}`}`);
        gameDetailsCache.set(appId, appData.data);
        return appData.data;
      } else {
        console.warn(`No data or failed success for appID ${appId}:`, appData);
        gameDetailsCache.set(appId, null as any); 
        return null;
      }
    })
    .catch(error => {
      console.error(`Failed to fetch details for appID ${appId}:`, error);
      gameDetailsCache.set(appId, null as any); 
      return null;
    })
    .finally(() => {
      activeDetailFetchPromises.delete(appId);
    });

  activeDetailFetchPromises.set(appId, promise);
  return promise;
};


export const convertToScreenshotInfo = async (
  details: SteamAppDetailsData | null, 
  headerImageUrl: string, 
  gameNameForWebSearch: string,
  page: number = 1 // Added page for web search fallback pagination
): Promise<ScreenshotInfo[]> => {
  const screenshots: ScreenshotInfo[] = [];
  const existingUrls = new Set<string>();

  const addUniqueScreenshot = (ss: ScreenshotInfo) => {
    if (!existingUrls.has(ss.fullUrl)) {
      screenshots.push(ss);
      existingUrls.add(ss.fullUrl);
    }
  };
  
  // Only add header and Steam screenshots if it's the first page load
  if (page === 1) {
    if (headerImageUrl) {
      addUniqueScreenshot({
        id: 0, 
        thumbnailUrl: headerImageUrl,
        fullUrl: headerImageUrl,      
      });
    }

    if (details && details.screenshots && details.screenshots.length > 0) {
      details.screenshots.forEach(ss => {
        const thumbnailUrl = ss.path_thumbnail; 
        let fullUrl = ss.path_full; 

        if (fullUrl.startsWith('http://') || fullUrl.startsWith('https://')) {
          // Use direct absolute URL for screenshots from Steam API
        } else {
          console.warn(`[steamService] Screenshot path_full for ${gameNameForWebSearch} is not absolute: ${fullUrl}. Prepending proxy.`);
          fullUrl = `${CORS_PROXY_PREFIX}${fullUrl}`;
        }
        
        addUniqueScreenshot({
          id: ss.id,
          thumbnailUrl: thumbnailUrl, 
          fullUrl: fullUrl,          
        });
      });
    }
  }


  // If page is 1 and few images, OR if page > 1 (meaning user explicitly asked for more from web)
  if ((page === 1 && screenshots.length <= 1 && gameNameForWebSearch) || (page > 1 && gameNameForWebSearch)) {
    console.log(`[steamService] Attempting web image search for "${gameNameForWebSearch}", Page: ${page}.`);
    try {
      const webImages = await searchWebForImages(gameNameForWebSearch, process.env.API_KEY, page);
      webImages.forEach(addUniqueScreenshot);
    } catch (error) {
      console.error('[steamService] Error during web image search fallback:', error);
    }
  }
  
  // Fallback if absolutely no images are found AND it's the first page load
  if (page === 1 && screenshots.length === 0) {
     addUniqueScreenshot({
        id: -1, // Special ID for placeholder
        thumbnailUrl: 'https://via.placeholder.com/150/CCCCCC/FFFFFF?Text=No+Image',
        fullUrl: 'https://via.placeholder.com/600x400/CCCCCC/FFFFFF?Text=No+Image+Found',
    });
  }

  return screenshots;
};