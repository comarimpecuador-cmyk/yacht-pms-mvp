import { AxiosError } from 'axios';
import { getMe, loginMobile, logoutMobile, refreshMobile } from '../../repositories/authRepository';
import { LoginRequest, MeResponse, MobileLoginResponse, TokenSession } from '../../types/auth';
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hydrateTokensFromStorage,
  persistTokens,
} from './tokenStore';

const UNAUTHORIZED_STATUS = 401;

function isUnauthorizedError(error: unknown) {
  const axiosError = error as AxiosError | undefined;
  return axiosError?.response?.status === UNAUTHORIZED_STATUS;
}

function toTokenSession(response: MobileLoginResponse): TokenSession {
  if (!response.success || !response.accessToken || !response.refreshToken) {
    throw new Error('Respuesta de autenticacion invalida');
  }

  return {
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    tokenType: response.tokenType || 'Bearer',
    accessTokenExpiresIn: response.accessTokenExpiresIn,
    refreshTokenExpiresIn: response.refreshTokenExpiresIn,
  };
}

export async function loginWithPassword(payload: LoginRequest) {
  const response = await loginMobile(payload);
  const session = toTokenSession(response);
  await persistTokens(session);
  return getMe();
}

export async function refreshSessionTokens() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    throw new Error('No hay refresh token en sesion');
  }

  const response = await refreshMobile(refreshToken);
  const session = toTokenSession(response);
  await persistTokens(session);
  return session;
}

export async function bootstrapSession(): Promise<MeResponse | null> {
  await hydrateTokensFromStorage();

  const hasAccessToken = Boolean(getAccessToken());
  const hasRefreshToken = Boolean(getRefreshToken());

  if (!hasAccessToken && !hasRefreshToken) {
    return null;
  }

  if (!hasAccessToken && hasRefreshToken) {
    try {
      await refreshSessionTokens();
      return await getMe();
    } catch {
      await clearTokens();
      return null;
    }
  }

  try {
    return await getMe();
  } catch (error) {
    if (!isUnauthorizedError(error)) {
      throw error;
    }

    try {
      await refreshSessionTokens();
      return await getMe();
    } catch {
      await clearTokens();
      return null;
    }
  }
}

export async function logoutSession() {
  try {
    await logoutMobile();
  } finally {
    await clearTokens();
  }
}
