// Validation utilities for forms
import { extractApiErrorMessage } from './api-error';

export const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const urlRegex = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/;

export const validateEmail = (email: string): boolean => {
  return emailRegex.test(email);
};

export const validatePassword = (password: string): { valid: boolean; errors: string[] } => {
  const errors: string[] = [];
  
  if (password.length < 8) {
    errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number');
  }
  
  if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
    errors.push('Password must contain at least one special character');
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
};

export const validateUrl = (url: string): boolean => {
  return urlRegex.test(url);
};

export const validateRequired = (value: string | undefined | null): boolean => {
  return value !== undefined && value !== null && value.trim().length > 0;
};

export const validateMinLength = (value: string, minLength: number): boolean => {
  return value.length >= minLength;
};

/**
 * Extracts and formats field-level validation errors from an API error response.
 * Returns a bullet-point string if the response contains an `errors` array,
 * otherwise falls back to the generic `message` field.
 *
 * @example
 * // "• End date must be after start date\n• maxEnrollments must be a number"
 * getValidationErrors(error)
 */
export const getValidationErrors = (error: any): string => {
  const errors = error?.response?.data?.errors;
  if (Array.isArray(errors) && errors.length > 0) {
    return errors.map((e: { field: string; message: string }) => `\u2022 ${e.message}`).join('\n');
  }
  return extractApiErrorMessage(error, 'Something went wrong');
};

export const validateMaxLength = (value: string, maxLength: number): boolean => {
  return value.length <= maxLength;
};

export const validateDateRange = (startDate: string, endDate: string): boolean => {
  return new Date(startDate) < new Date(endDate);
};
