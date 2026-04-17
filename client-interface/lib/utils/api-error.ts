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
