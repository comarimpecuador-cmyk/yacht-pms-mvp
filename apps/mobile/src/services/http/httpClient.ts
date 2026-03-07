import { AxiosRequestConfig } from 'axios';
import { apiClient } from './apiClient';

export async function httpGet<T>(url: string, config?: AxiosRequestConfig) {
  const response = await apiClient.get<T>(url, config);
  return response.data;
}

export async function httpPost<TResponse, TBody>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
) {
  const response = await apiClient.post<TResponse>(url, body, config);
  return response.data;
}

export async function httpPatch<TResponse, TBody>(
  url: string,
  body?: TBody,
  config?: AxiosRequestConfig,
) {
  const response = await apiClient.patch<TResponse>(url, body, config);
  return response.data;
}

