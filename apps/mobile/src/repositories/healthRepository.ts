import { httpGet } from '../services/http/httpClient';

export interface HealthStatus {
  status?: string;
  ok?: boolean;
}

export async function fetchApiHealth() {
  return httpGet<HealthStatus>('/health');
}

