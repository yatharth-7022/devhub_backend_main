export interface ApiError {
  message: string;
  code?: string;
}
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: ApiError | null;
}
export function ok<T>(data: T): ApiResponse<T> {
  return {
    success: true,
    data,
    error: null,
  };
}
export function fail<T>(message: string, code?: string): ApiResponse<T> {
  return {
    success: false,
    data: null,
    error: { message, code },
  };
}
