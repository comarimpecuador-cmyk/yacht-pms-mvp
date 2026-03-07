export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenSession {
  accessToken: string;
  refreshToken: string;
  tokenType: string;
  accessTokenExpiresIn?: string;
  refreshTokenExpiresIn?: string;
}

export interface MobileLoginResponse extends TokenSession {
  success: boolean;
}

export interface MeResponse {
  id: string;
  email: string;
  role: string;
  yachtIds: string[];
}

export interface RefreshRequest {
  refreshToken: string;
}
