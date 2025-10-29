import { supabase } from './supabaseClient';

/**
 * Enhanced API client with automatic token refresh handling
 */
export class ApiClient {
  static async makeRequest(url, options = {}) {
    try {
      // Get current session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.warn('Session error:', sessionError.message);
        
        // Handle refresh token errors
        if (sessionError.message.includes('refresh_token_not_found') || 
            sessionError.message.includes('Invalid Refresh Token')) {
          console.warn('Refresh token invalid, clearing session');
          this.clearAuthData();
          throw new Error('Authentication session expired. Please log in again.');
        }
        
        throw sessionError;
      }

      // Add authorization header if session exists
      const headers = {
        'Content-Type': 'application/json',
        ...options.headers,
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Handle 401 Unauthorized responses
      if (response.status === 401) {
        console.warn('Received 401, attempting to refresh token');
        
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          
          if (refreshError || !refreshData.session) {
            console.warn('Token refresh failed:', refreshError?.message);
            this.clearAuthData();
            throw new Error('Authentication expired. Please log in again.');
          }
          
          // Retry the request with new token
          headers['Authorization'] = `Bearer ${refreshData.session.access_token}`;
          
          return fetch(url, {
            ...options,
            headers,
          });
        } catch (refreshError) {
          console.warn('Token refresh failed:', refreshError.message);
          this.clearAuthData();
          throw new Error('Authentication expired. Please log in again.');
        }
      }

      return response;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  static clearAuthData() {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userData');
      localStorage.removeItem('loginLockEndTime');
      localStorage.removeItem('sb-rvaywihlohlhyrowwixz-auth-token');
      
      // Clear any other Supabase auth tokens
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.includes('auth-token')) {
          localStorage.removeItem(key);
        }
      });
    }
  }

  // Convenience methods
  static async get(url, options = {}) {
    return this.makeRequest(url, { ...options, method: 'GET' });
  }

  static async post(url, data, options = {}) {
    return this.makeRequest(url, {
      ...options,
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  static async put(url, data, options = {}) {
    return this.makeRequest(url, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  static async delete(url, options = {}) {
    return this.makeRequest(url, { ...options, method: 'DELETE' });
  }
}

export default ApiClient;
