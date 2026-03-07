import * as SecureStore from 'expo-secure-store';
import { TokenSession } from '../../types/auth';

const ACCESS_TOKEN_KEY = 'auth.accessToken';
const REFRESH_TOKEN_KEY = 'auth.refreshToken';

let accessToken: string | null = null;
let refreshToken: string | null = null;

export function getAccessToken() {
  return accessToken;
}

export function getRefreshToken() {
  return refreshToken;
}

export function hasSessionTokens() {
  return Boolean(accessToken && refreshToken);
}

export async function hydrateTokensFromStorage() {
  const [storedAccessToken, storedRefreshToken] = await Promise.all([
    SecureStore.getItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.getItemAsync(REFRESH_TOKEN_KEY),
  ]);

  accessToken = storedAccessToken;
  refreshToken = storedRefreshToken;

  if (!storedAccessToken || !storedRefreshToken) {
    return null;
  }

  return {
    accessToken: storedAccessToken,
    refreshToken: storedRefreshToken,
    tokenType: 'Bearer',
  } as TokenSession;
}

export async function persistTokens(session: TokenSession) {
  accessToken = session.accessToken;
  refreshToken = session.refreshToken;

  await Promise.all([
    SecureStore.setItemAsync(ACCESS_TOKEN_KEY, session.accessToken),
    SecureStore.setItemAsync(REFRESH_TOKEN_KEY, session.refreshToken),
  ]);
}

export async function clearTokens() {
  accessToken = null;
  refreshToken = null;

  await Promise.all([
    SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY),
    SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY),
  ]);
}
