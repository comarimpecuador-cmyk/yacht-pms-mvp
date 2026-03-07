import { httpGet, httpPost } from '../services/http/httpClient';
import { LoginRequest, MeResponse, MobileLoginResponse, RefreshRequest } from '../types/auth';

export async function loginMobile(payload: LoginRequest) {
  return httpPost<MobileLoginResponse, LoginRequest>('/auth/mobile/login', payload);
}

export async function getMe() {
  return httpGet<MeResponse>('/auth/me');
}

export async function refreshMobile(refreshToken: string) {
  const payload: RefreshRequest = { refreshToken };
  return httpPost<MobileLoginResponse, RefreshRequest>('/auth/mobile/refresh', payload);
}

export async function logoutMobile() {
  return httpPost<{ success: boolean }, Record<string, never>>('/auth/mobile/logout', {});
}
