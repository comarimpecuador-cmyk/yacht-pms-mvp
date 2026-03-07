const DEFAULT_API_BASE_URL = 'https://yacht.reinotierra.com/api';

const stripTrailingSlashes = (value: string) => value.replace(/\/+$/, '');

export function getApiBaseUrl() {
  const envValue = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (!envValue) return DEFAULT_API_BASE_URL;

  const normalized = stripTrailingSlashes(envValue);
  return normalized.endsWith('/api') ? normalized : `${normalized}/api`;
}
