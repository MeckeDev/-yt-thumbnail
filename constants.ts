
export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const CORS_PROXY_PREFIX = 'https://proxy.cors.sh/';

export const STEAM_IMAGE_URL_TEMPLATE = (gameId: number): string => 
  `${CORS_PROXY_PREFIX}https://shared.cloudflare.steamstatic.com/store_item_assets/steam/apps/${gameId}/library_600x900_2x.jpg`;

export const STEAM_API_DETAILS_URL_TEMPLATE = (gameId: number): string =>
  `${CORS_PROXY_PREFIX}https://store.steampowered.com/api/appdetails?appids=${gameId}`;

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 5.0;
export const ZOOM_SENSITIVITY = 0.001; // Adjust for wheel scroll speed
