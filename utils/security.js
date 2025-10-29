// Security utilities for the login system

/**
 * Safely decode JWT token
 * @param {string} token - JWT token to decode
 * @returns {object|null} - Decoded payload or null if invalid
 */
export const decodeJWT = (token) => {
  try {
    if (!token || typeof token !== 'string') {
      return null;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    // Add padding if needed for base64 decoding
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    
    // Decode base64
    const decodedPayload = atob(paddedPayload);
    
    // Parse JSON
    return JSON.parse(decodedPayload);
  } catch (error) {
    console.warn('JWT decode failed:', error);
    return null;
  }
};

/**
 * Check if JWT token is expired
 * @param {string} token - JWT token to check
 * @returns {boolean} - True if token is expired or invalid
 */
export const isTokenExpired = (token) => {
  const payload = decodeJWT(token);
  if (!payload || !payload.exp) {
    return true;
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  return payload.exp < currentTime;
};

/**
 * Validate JWT token
 * @param {string} token - JWT token to validate
 * @returns {object} - Validation result
 */
export const validateJWT = (token) => {
  const payload = decodeJWT(token);
  
  if (!payload) {
    return { valid: false, reason: 'Invalid token format' };
  }
  
  if (isTokenExpired(token)) {
    return { valid: false, reason: 'Token expired' };
  }
  
  return { valid: true, payload };
};

/**
 * Sanitize user input to prevent XSS attacks
 * @param {string} input - User input to sanitize
 * @returns {string} - Sanitized input
 */
export const sanitizeInput = (input) => {
  if (typeof input !== 'string') return input;
  
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
};

/**
 * Validate email format
 * @param {string} email - Email to validate
 * @returns {boolean} - True if valid email format
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Check password strength
 * @param {string} password - Password to check
 * @returns {object} - Strength analysis
 */
export const checkPasswordStrength = (password) => {
  const minLength = 6;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);
  
  const score = [
    password.length >= minLength,
    hasUpperCase,
    hasLowerCase,
    hasNumbers,
    hasSpecialChar
  ].filter(Boolean).length;
  
  const strength = score < 2 ? 'weak' : score < 4 ? 'medium' : 'strong';
  
  return {
    score,
    strength,
    hasUpperCase,
    hasLowerCase,
    hasNumbers,
    hasSpecialChar,
    minLength: password.length >= minLength
  };
};

/**
 * Generate CSRF token
 * @returns {string} - CSRF token
 */
export const generateCSRFToken = () => {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
};

/**
 * Validate CSRF token
 * @param {string} token - Token to validate
 * @param {string} storedToken - Stored token to compare
 * @returns {boolean} - True if valid
 */
export const validateCSRFToken = (token, storedToken) => {
  return token && storedToken && token === storedToken;
};

/**
 * Rate limiting for login attempts
 * @param {string} identifier - User identifier (email or IP)
 * @param {number} maxAttempts - Maximum attempts allowed
 * @param {number} windowMs - Time window in milliseconds
 * @returns {object} - Rate limit status
 */
export const checkRateLimit = (identifier, maxAttempts = 5, windowMs = 5 * 60 * 1000) => {
  const key = `rate_limit_${identifier}`;
  const now = Date.now();
  const attempts = JSON.parse(localStorage.getItem(key) || '[]');
  
  // Remove old attempts outside the time window
  const validAttempts = attempts.filter(time => now - time < windowMs);
  
  if (validAttempts.length >= maxAttempts) {
    return {
      allowed: false,
      remainingAttempts: 0,
      resetTime: Math.min(...validAttempts) + windowMs
    };
  }
  
  return {
    allowed: true,
    remainingAttempts: maxAttempts - validAttempts.length,
    resetTime: null
  };
};

/**
 * Record login attempt for rate limiting
 * @param {string} identifier - User identifier
 */
export const recordLoginAttempt = (identifier) => {
  const key = `rate_limit_${identifier}`;
  const now = Date.now();
  const attempts = JSON.parse(localStorage.getItem(key) || '[]');
  attempts.push(now);
  localStorage.setItem(key, JSON.stringify(attempts));
};

/**
 * Clear rate limit data
 * @param {string} identifier - User identifier
 */
export const clearRateLimit = (identifier) => {
  const key = `rate_limit_${identifier}`;
  localStorage.removeItem(key);
};

/**
 * Encrypt sensitive data (basic implementation)
 * @param {string} data - Data to encrypt
 * @returns {string} - Encrypted data
 */
export const encryptData = (data) => {
  // In a real application, use proper encryption
  return btoa(data);
};

/**
 * Decrypt sensitive data (basic implementation)
 * @param {string} encryptedData - Encrypted data
 * @returns {string} - Decrypted data
 */
export const decryptData = (encryptedData) => {
  // In a real application, use proper decryption
  try {
    return atob(encryptedData);
  } catch {
    return null;
  }
};

/**
 * Check if running in secure context
 * @returns {boolean} - True if secure context
 */
export const isSecureContext = () => {
  return window.isSecureContext || window.location.protocol === 'https:';
};

/**
 * Security headers for API requests
 * @returns {object} - Security headers
 */
export const getSecurityHeaders = () => {
  const csrfToken = localStorage.getItem('csrfToken') || generateCSRFToken();
  if (!localStorage.getItem('csrfToken')) {
    localStorage.setItem('csrfToken', csrfToken);
  }
  
  return {
    'Content-Type': 'application/json',
    'X-CSRF-Token': csrfToken,
    'X-Requested-With': 'XMLHttpRequest'
  };
};

