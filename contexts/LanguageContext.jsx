"use client";

import React, { createContext, useContext, useState, useEffect } from "react";

const LanguageContext = createContext();

export const useLanguage = () => {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
};

export const LanguageProvider = ({ children }) => {
  const [language, setLanguage] = useState("th"); // Default to Thai
  const [isLoading, setIsLoading] = useState(true);

  // Load language preference from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const savedLanguage = localStorage.getItem("language");
        if (savedLanguage && (savedLanguage === "th" || savedLanguage === "en")) {
          setLanguage(savedLanguage);
        }
      } catch (error) {
        console.warn('Failed to load language from localStorage:', error);
      }
    }
    setIsLoading(false);
  }, []);

  const changeLanguage = (newLanguage) => {
    if (newLanguage === "th" || newLanguage === "en") {
      setLanguage(newLanguage);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem("language", newLanguage);
        } catch (error) {
          console.warn('Failed to save language to localStorage:', error);
        }
      }
    }
  };

  const value = {
    language,
    changeLanguage,
    isLoading,
  };

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
};


