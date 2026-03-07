export type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface ApiErrorShape {
  message: string;
  status?: number;
  code?: string;
}

export interface PagedResponse<T> {
  data: T[];
  total: number;
}

