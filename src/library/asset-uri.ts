const PREFIX = 'ph://';

/** expo-image, expo-video and expo-media-library address a Photos item as `ph://<local identifier>`. */
export const assetUri = (id: string) => `${PREFIX}${id}`;

/** The bare PhotoKit local identifier the app uses, from an expo-media-library id. */
export const toLocalIdentifier = (uri: string) => (uri.startsWith(PREFIX) ? uri.slice(PREFIX.length) : uri);
