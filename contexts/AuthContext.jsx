"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { supabase } from "@/utils/supabaseClient";
import { logAuthEvent } from "@/utils/clientLogger";

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [originalUser, setOriginalUser] = useState(null);
  const [isImpersonating, setIsImpersonating] = useState(false);


  // Initialize Supabase session listener and load current session
  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      try {
        // Load impersonation state from localStorage first
        const savedImpersonation = localStorage.getItem('impersonationState');
        let shouldRestoreImpersonation = false;
        let savedOriginalUser = null;
        
        if (savedImpersonation) {
          const parsed = JSON.parse(savedImpersonation);
          if (parsed.originalUser && parsed.isImpersonating) {
            savedOriginalUser = parsed.originalUser;
            shouldRestoreImpersonation = true;
            setOriginalUser(savedOriginalUser);
            setIsImpersonating(true);
          }
        }

        const { data, error } = await supabase.auth.getSession();
        if (error) {
          // Handle specific refresh token errors silently
          if (error.message?.includes('refresh_token_not_found') || 
              error.message?.includes('Invalid Refresh Token') ||
              error.message?.includes('Refresh Token Not Found')) {
            if (process.env.NODE_ENV === 'development') {
              console.warn('Refresh token invalid, clearing session data');
            }
            clearAuthData();
            return;
          }
          // Only log non-refresh-token errors
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to get session:", error.message);
          }
        }
        const session = data?.session ?? null;
        const supaUser = session?.user ?? null;
        if (!isMounted) return;
        if (supaUser) {
          // Normalize roles: support both old format (role) and new format (roles)
          const roles = supaUser.user_metadata?.roles || 
                       (supaUser.user_metadata?.role ? [supaUser.user_metadata.role] : ["user"]);
          
          const profile = {
            id: supaUser.id,
            email: supaUser.email,
            name: supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0],
            roles: Array.isArray(roles) ? roles : [roles],
            role: roles[0], // Keep for backward compatibility
            avatar: supaUser.user_metadata?.avatar_url || "/pictureUser/pictureUser_1.png",
          };
          
          console.log('DEBUG AuthContext: User profile created:', profile);
          console.log('DEBUG AuthContext: User metadata:', supaUser.user_metadata);
          
          // If we're in impersonation mode, don't override the impersonated user
          if (shouldRestoreImpersonation) {
            // Keep the impersonated user data from localStorage
            const savedUserData = localStorage.getItem('userData');
            if (savedUserData) {
              const impersonatedUser = JSON.parse(savedUserData);
              setUser(impersonatedUser);
            } else {
              setUser(profile);
            }
          } else {
            console.log('DEBUG AuthContext: Setting user profile:', profile);
            setUser(profile);
            localStorage.setItem("userData", JSON.stringify(profile));
          }
          
          setIsAuthenticated(true);
        } else {
          setUser(null);
          setIsAuthenticated(false);
          localStorage.removeItem("userData");
        }
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      console.log('Auth state change:', event, session ? 'Session exists' : 'No session');
      
      // Handle specific auth events
      if (event === 'TOKEN_REFRESHED') {
        if (!session) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('Token refresh failed, user will need to re-authenticate');
          }
          clearAuthData();
          return;
        }
      }
      
      // Handle token refresh errors
      if (event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
        // Check if session is invalid due to refresh token error
        if (!session) {
          try {
            const { error: sessionError } = await supabase.auth.getSession();
            if (sessionError && (
              sessionError.message?.includes('refresh_token_not_found') ||
              sessionError.message?.includes('Invalid Refresh Token') ||
              sessionError.message?.includes('Refresh Token Not Found')
            )) {
              if (process.env.NODE_ENV === 'development') {
                console.warn('Refresh token invalid during auth state change');
              }
              clearAuthData();
              return;
            }
          } catch (err) {
            // Ignore errors during cleanup
          }
        }
      }
      
      if (event === 'SIGNED_OUT') {
        console.log('User signed out, clearing local data');
        // Log logout via auth state change
        const currentUser = user;
        if (currentUser) {
          logAuthEvent('logout', true, {
            email: currentUser.email,
            role: currentUser.roles?.[0] || currentUser.role,
            via: 'auth_state_change'
          }).catch(err => console.warn('Failed to log logout event:', err));
        }
        clearAuthData();
        return;
      }
       
      const supaUser = session?.user ?? null;
      if (supaUser) {
        // Normalize roles: support both old format (role) and new format (roles)
        const roles = supaUser.user_metadata?.roles || 
                     (supaUser.user_metadata?.role ? [supaUser.user_metadata.role] : ["user"]);
        
        const profile = {
          id: supaUser.id,
          email: supaUser.email,
          name: supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0],
          roles: Array.isArray(roles) ? roles : [roles],
          role: roles[0], // Keep for backward compatibility
          avatar: supaUser.user_metadata?.avatar_url || "/pictureUser/pictureUser_1.png",
        };
        
        // Check if we're currently impersonating
        const savedImpersonation = localStorage.getItem('impersonationState');
        const isCurrentlyImpersonating = savedImpersonation && JSON.parse(savedImpersonation).isImpersonating;
        
        if (isCurrentlyImpersonating) {
          // Don't override impersonated user data
          console.log('Auth state change detected but maintaining impersonation state');
          return;
        }
        
        setUser(profile);
        setIsAuthenticated(true);
        localStorage.setItem("userData", JSON.stringify(profile));
      } else {
        setUser(null);
        setIsAuthenticated(false);
        localStorage.removeItem("userData");
      }
    });

    initSession();
    
    // Handle visibility change (tab switching)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab became visible, check if we need to restore impersonation state
        const savedImpersonation = localStorage.getItem('impersonationState');
        if (savedImpersonation) {
          const parsed = JSON.parse(savedImpersonation);
          if (parsed.originalUser && parsed.isImpersonating) {
            setOriginalUser(parsed.originalUser);
            setIsImpersonating(true);
            
            // Restore impersonated user data
            const savedUserData = localStorage.getItem('userData');
            if (savedUserData) {
              const impersonatedUser = JSON.parse(savedUserData);
              setUser(impersonatedUser);
            }
          }
        }
      }
    };
    
    // Handle page focus (when returning to tab)
    const handlePageFocus = () => {
      const savedImpersonation = localStorage.getItem('impersonationState');
      if (savedImpersonation) {
        const parsed = JSON.parse(savedImpersonation);
        if (parsed.originalUser && parsed.isImpersonating) {
          setOriginalUser(parsed.originalUser);
          setIsImpersonating(true);
          
          // Restore impersonated user data
          const savedUserData = localStorage.getItem('userData');
          if (savedUserData) {
            const impersonatedUser = JSON.parse(savedUserData);
            setUser(impersonatedUser);
          }
        }
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handlePageFocus);
    
    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handlePageFocus);
    };
  }, []);

  const login = async ({ email, password }) => {
    try {
      console.log('AuthContext: Attempting login for:', email);
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      
      if (error) {
        // Only log in development mode - invalid credentials is expected behavior
        if (process.env.NODE_ENV === 'development') {
          console.warn('AuthContext: Login failed:', error.message);
        }
        
        // Log failed login attempt
        await logAuthEvent('login_failed', false, {
          email,
          errorMessage: error.message
        }).catch(err => console.warn('Failed to log auth event:', err));
        
        // Provide user-friendly error messages
        let userFriendlyError = error.message;
        if (error.message.includes('Invalid login credentials')) {
          userFriendlyError = 'อีเมลหรือรหัสผ่านไม่ถูกต้อง';
        } else if (error.message.includes('Email not confirmed')) {
          userFriendlyError = 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ';
        } else if (error.message.includes('Too many requests')) {
          userFriendlyError = 'พยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่';
        }
        
        return { success: false, error: userFriendlyError };
      }
      
      const supaUser = data?.user;
      if (!supaUser) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('AuthContext: No user returned from login');
        }
        await logAuthEvent('login_failed', false, {
          email,
          errorMessage: "No user returned"
        }).catch(err => console.warn('Failed to log auth event:', err));
        return { success: false, error: "ไม่พบข้อมูลผู้ใช้" };
      }
      
      if (process.env.NODE_ENV === 'development') {
        console.log('AuthContext: Login successful, user:', supaUser.email);
      }
      
      // Normalize roles: support both old format (role) and new format (roles)
      const roles = supaUser.user_metadata?.roles || 
                   (supaUser.user_metadata?.role ? [supaUser.user_metadata.role] : ["user"]);
      
      const profile = {
        id: supaUser.id,
        email: supaUser.email,
        name: supaUser.user_metadata?.full_name || supaUser.email?.split("@")[0],
        roles: Array.isArray(roles) ? roles : [roles],
        role: roles[0], // Keep for backward compatibility
        avatar: supaUser.user_metadata?.avatar_url || "/pictureUser/pictureUser_1.png",
      };
      
      setUser(profile);
      setIsAuthenticated(true);
      localStorage.setItem("userData", JSON.stringify(profile));
      
      // Log successful login
      await logAuthEvent('login', true, {
        email: profile.email,
        role: profile.roles?.[0] || profile.role
      }).catch(err => console.warn('Failed to log auth event:', err));
      
      return { success: true };
    } catch (err) {
      console.error('AuthContext: Unexpected login error:', err);
      return { success: false, error: err.message || 'เกิดข้อผิดพลาดในการเข้าสู่ระบบ' };
    }
  };

  const logout = async () => {
    const currentUser = user; // Store before clearing
    try {
      await supabase.auth.signOut();
      
      // Log successful logout
      if (currentUser) {
        await logAuthEvent('logout', true, {
          email: currentUser.email,
          role: currentUser.roles?.[0] || currentUser.role
        });
      }
    } catch (error) {
      console.warn('Error during logout:', error.message);
      // Log logout error
      if (currentUser) {
        await logAuthEvent('logout', false, {
          email: currentUser.email,
          role: currentUser.roles?.[0] || currentUser.role,
          errorMessage: error.message
        });
      }
    } finally {
      // Ensure cleanup even if signOut fails
      clearAuthData();
    }
  };

  const updateUser = (userData) => {
    setUser(prev => ({ ...prev, ...userData }));
    localStorage.setItem("userData", JSON.stringify({ ...user, ...userData }));
  };

  const impersonate = async (targetUser) => {
    try {
      // Store current user as original user
      setOriginalUser(user);
      setIsImpersonating(true);
      
      // Update current user to target user
      setUser(targetUser);
      localStorage.setItem("userData", JSON.stringify(targetUser));
      
      // Save impersonation state
      const impersonationState = {
        originalUser: user,
        isImpersonating: true
      };
      localStorage.setItem("impersonationState", JSON.stringify(impersonationState));
      
      return true;
    } catch (error) {
      console.error('Error during impersonation:', error);
      return false;
    }
  };

  const exitImpersonate = () => {
    try {
      if (originalUser) {
        // Restore original user
        setUser(originalUser);
        localStorage.setItem("userData", JSON.stringify(originalUser));
        
        // Clear impersonation state
        setOriginalUser(null);
        setIsImpersonating(false);
        localStorage.removeItem("impersonationState");
      }
    } catch (error) {
      console.error('Error exiting impersonation:', error);
    }
  };

  // Function to manually clear auth data (useful for handling refresh token errors)
  const clearAuthData = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('userData');
      localStorage.removeItem('loginLockEndTime');
      localStorage.removeItem('impersonationState');
      localStorage.removeItem('sb-rvaywihlohlhyrowwixz-auth-token');
      // Clear any other Supabase auth tokens that might exist
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('sb-') && key.includes('auth-token')) {
          localStorage.removeItem(key);
        }
      });
    }
    setUser(null);
    setIsAuthenticated(false);
    setOriginalUser(null);
    setIsImpersonating(false);
  };

  const value = {
    user,
    isAuthenticated,
    isLoading,
    login,
    logout,
    updateUser,
    clearAuthData,
    originalUser,
    isImpersonating,
    impersonate,
    exitImpersonate,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

