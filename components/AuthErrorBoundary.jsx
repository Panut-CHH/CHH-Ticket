"use client";

import React, { Component } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

class AuthErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null,
      errorInfo: null 
    };
  }

  static getDerivedStateFromError(error) {
    // Update state so the next render will show the fallback UI
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    // Log error details
    console.error('AuthErrorBoundary caught an error:', error, errorInfo);
    
    this.setState({
      error: error,
      errorInfo: errorInfo
    });

    // Check if it's a refresh token error
    if (error.message && (
      error.message.includes('refresh_token_not_found') || 
      error.message.includes('Invalid Refresh Token') ||
      error.message.includes('AuthApiError')
    )) {
      console.warn('Refresh token error detected, clearing auth data');
      this.clearAuthData();
    }
  }

  clearAuthData = () => {
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
      
      // Reload the page to reset the application state
      window.location.reload();
    }
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    this.clearAuthData();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
          <div className="max-w-md w-full mx-auto">
            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-lg p-6">
              <div className="flex items-center justify-center w-12 h-12 mx-auto bg-red-100 dark:bg-red-900/20 rounded-full mb-4">
                <AlertCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
              </div>
              
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white text-center mb-2">
                Authentication Error
              </h2>
              
              <p className="text-sm text-gray-600 dark:text-gray-400 text-center mb-6">
                There was an issue with your authentication session. This usually happens when your session has expired or become invalid.
              </p>
              
              <div className="space-y-3">
                <button
                  onClick={this.handleRetry}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Refresh Session
                </button>
                
                <button
                  onClick={() => window.location.href = '/login'}
                  className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  Go to Login
                </button>
              </div>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="mt-4 p-3 bg-gray-100 dark:bg-gray-700 rounded text-xs">
                  <summary className="cursor-pointer font-medium">Error Details (Development)</summary>
                  <pre className="mt-2 whitespace-pre-wrap">
                    {this.state.error.toString()}
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default AuthErrorBoundary;
