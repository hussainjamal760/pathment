type ErrorDetail = {
  field?: string;
  message?: string;
};

const GENERIC_MESSAGES = new Set([
  'validation failed',
  'bad request',
  'request failed',
  'something went wrong'
]);

const toSafeString = (value: unknown): string => {
  if (typeof value !== 'string') return '';
  return value.trim();
};

const unique = (items: string[]): string[] => {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
};

export const extractApiErrorDetails = (error: any): string[] => {
  const details = error?.response?.data?.errors;
  if (!Array.isArray(details)) return [];

  return unique(
    details
      .map((item: ErrorDetail) => toSafeString(item?.message))
      .filter(Boolean)
  );
};

/**
 * The backend's STABLE machine error code (e.g. 'NOT_FOUND', 'CONFLICT',
 * 'RATE_LIMITED', 'VALIDATION_ERROR'). Branch on this — never parse the message.
 */
export const getErrorCode = (error: any): string | null => { // eslint-disable-line @typescript-eslint/no-explicit-any
  const code = error?.response?.data?.code;
  return typeof code === 'string' && code ? code : null;
};

/** The correlation id for a failed request (X-Request-Id) — quote it to support. */
export const getRequestId = (error: any): string | null => { // eslint-disable-line @typescript-eslint/no-explicit-any
  return error?.response?.data?.requestId || error?.response?.headers?.['x-request-id'] || null;
};

export const extractApiErrorMessage = (error: any, fallback = 'Something went wrong'): string => {
  const details = extractApiErrorDetails(error);
  const backendMessage = toSafeString(error?.response?.data?.message);

  if (details.length > 0) {
    if (!backendMessage || GENERIC_MESSAGES.has(backendMessage.toLowerCase())) {
      return details[0];
    }
  }

  if (backendMessage) return backendMessage;

  const directMessage = toSafeString(error?.message);
  if (directMessage) return directMessage;

  return fallback;
};

/** Format a seconds count as a friendly "1m 20s" / "45s" / "2m". */
export const formatRetryAfter = (sec: number): string => {
  const s = Math.max(0, Math.ceil(sec));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
};

/**
 * Read rate-limit (HTTP 429) info off an axios error. Handles our structured
 * JSON body ({ message, retryAfter }), the `Retry-After` header, and a plain
 * string body - so callers can show a real countdown instead of a generic error.
 */
export const getRateLimit = (
  error: any
): { limited: boolean; retryAfterSec: number; message: string } => {
  if (error?.response?.status !== 429) return { limited: false, retryAfterSec: 0, message: '' };
  const data = error?.response?.data;
  const headerRA = Number(error?.response?.headers?.['retry-after']);
  const retryAfterSec =
    Number(data?.retryAfter) || (Number.isFinite(headerRA) && headerRA > 0 ? headerRA : 60);
  const message =
    toSafeString(data?.message) ||
    (typeof data === 'string' ? toSafeString(data) : '') ||
    'Too many attempts. Please slow down and try again shortly.';
  return { limited: true, retryAfterSec, message };
};

export const normalizeAxiosError = (error: any): any => {
  const preferredMessage = extractApiErrorMessage(error);

  if (!error || typeof error !== 'object') {
    return error;
  }

  error.userMessage = preferredMessage;

  if (error.response?.data && typeof error.response.data === 'object') {
    error.response.data.displayMessage = preferredMessage;

    const currentMessage = toSafeString(error.response.data.message);
    if (!currentMessage || GENERIC_MESSAGES.has(currentMessage.toLowerCase())) {
      error.response.data.message = preferredMessage;
    }
  }

  return error;
};
