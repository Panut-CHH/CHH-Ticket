"use client";

import React, { useState, useEffect } from "react";
import { Eye, EyeOff, Lock, Mail, AlertCircle, CheckCircle } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useRouter } from "next/navigation";
import { Input, Button } from "@heroui/react";
import { t } from "@/utils/translations";
import LanguageToggle from "@/components/LanguageToggle";
import {
  sanitizeInput,
  isValidEmail,
  checkPasswordStrength,
  checkRateLimit,
  recordLoginAttempt,
  clearRateLimit,
} from "@/utils/security";

export default function UILogin() {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [lockTime, setLockTime] = useState(0);

  const { login, isAuthenticated } = useAuth();
  const { language } = useLanguage();
  const router = useRouter();

  useEffect(() => {
    if (isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    const lockEndTime = localStorage.getItem("loginLockEndTime");
    if (lockEndTime && Date.now() < parseInt(lockEndTime)) {
      setIsLocked(true);
      setLockTime(parseInt(lockEndTime));
    }
  }, []);

  useEffect(() => {
    if (isLocked) {
      const timer = setInterval(() => {
        if (Date.now() >= lockTime) {
          setIsLocked(false);
          setAttempts(0);
          localStorage.removeItem("loginLockEndTime");
          clearInterval(timer);
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [isLocked, lockTime]);

  const validateForm = () => {
    const newErrors = {};

    const sanitizedEmail = sanitizeInput(formData.email);
    // Don't sanitize password, just check if it exists
    const password = formData.password;

    if (!sanitizedEmail) {
      newErrors.email = t('required', language) + " " + t('email', language).toLowerCase();
    } else if (!isValidEmail(sanitizedEmail)) {
      newErrors.email = t('invalidEmail', language);
    }

    if (!password || password.trim().length === 0) {
      newErrors.password = t('required', language) + " " + t('password', language).toLowerCase();
    } else {
      const strength = checkPasswordStrength(password);
      if (!strength.minLength) {
        newErrors.password = t('password', language) + " " + t('required', language).toLowerCase() + " 6 " + t('characters', language);
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
    if (errors[name]) setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (isLocked) return;
    if (!validateForm()) return;

    const rateLimit = checkRateLimit(formData.email);
    if (!rateLimit.allowed) {
      setErrors({ general: t('tooManyAttempts', language) });
      return;
    }

    setIsLoading(true);
    setErrors({});

    try {
      recordLoginAttempt(formData.email);

      // Sanitize email but NOT password (passwords can contain special characters)
      const sanitizedEmail = sanitizeInput(formData.email);
      // Only trim password (remove leading/trailing spaces) but don't sanitize
      const password = formData.password.trim();

      console.log('Login attempt:', { email: sanitizedEmail, passwordLength: password.length });

      const result = await login({ email: sanitizedEmail, password: password });

      console.log('Login result:', result);

      if (result && result.success) {
        clearRateLimit(formData.email);
        router.push("/");
      } else {
        // Show the actual error message from Supabase
        const errorMessage = result?.error || t('loginFailed', language);
        console.error('Login failed:', errorMessage);
        throw new Error(errorMessage);
      }
    } catch (error) {
      console.error('Login error:', error);
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);

      // Get the actual error message
      let errorMessage = error.message || t('invalidCredentials', language);
      
      // Translate common Supabase error messages
      if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('Email not confirmed')) {
        errorMessage = t('invalidCredentials', language);
      } else if (errorMessage.includes('Email rate limit exceeded')) {
        errorMessage = t('tooManyAttempts', language);
      }

      if (newAttempts >= 5) {
        const lockEndTime = Date.now() + 5 * 60 * 1000;
        setLockTime(lockEndTime);
        setIsLocked(true);
        localStorage.setItem("loginLockEndTime", lockEndTime.toString());
        setErrors({ general: t('accountLocked', language) });
      } else {
        setErrors({ general: errorMessage + ` (${newAttempts}/5)` });
      }
    } finally {
      setIsLoading(false);
    }
  };

  const getRemainingLockTime = () => {
    const remaining = Math.ceil((lockTime - Date.now()) / 1000);
    const minutes = Math.floor(remaining / 60);
    const seconds = remaining % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-gradient-to-br from-gray-50 via-white to-emerald-50/30 dark:from-gray-900 dark:via-gray-800 dark:to-emerald-900/10 px-3 sm:px-4 py-6 sm:py-8 relative overflow-hidden">
      {/* Subtle background blur elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-32 -right-32 w-64 h-64 bg-primary/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-emerald-400/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-secondary/5 rounded-full blur-2xl" />
      </div>

      <div className="w-full max-w-7xl mx-auto relative z-10">
        <div className="absolute top-4 right-4 z-20">
          <LanguageToggle />
        </div>
        <div className="bg-white/80 dark:bg-gray-800/80 backdrop-blur-xl rounded-xl sm:rounded-2xl shadow-xl border border-white/20 dark:border-gray-700/50 overflow-hidden animate-in fade-in-0 slide-in-from-bottom-4 duration-700">
          <div className="grid grid-cols-1 md:grid-cols-2">
            {/* Left: Enhanced form area */}
            <div className="px-6 sm:px-8 lg:px-12 py-12 sm:py-16 flex flex-col justify-center">
              <div className="max-w-md mx-auto w-full">
                <div className="mb-6 sm:mb-8 animate-in fade-in-0 slide-in-from-left-4 duration-700 delay-200">
                  <div className="flex items-center gap-2 sm:gap-3 mb-2">
                    <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gradient-to-br from-primary to-emerald-500 rounded-lg flex items-center justify-center shadow-md animate-in zoom-in-50 duration-500 delay-300">
                      <img src="/logoCompany/logoCompany_1.png" alt="Logo" className="w-4 h-4 sm:w-5 sm:h-5 object-contain" />
                    </div>
                    <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                      {t('login', language)}
                    </h1>
                  </div>
                  <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">{t('welcomeBack', language)}</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6 animate-in fade-in-0 slide-in-from-left-4 duration-700 delay-300">
                  {errors.general && (
                    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                      <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-red-700 dark:text-red-300">{errors.general}</span>
                    </div>
                  )}

                  {isLocked && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2 animate-in slide-in-from-top-2 duration-300">
                      <Lock className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span className="text-xs sm:text-sm text-amber-700 dark:text-amber-300">{t('accountLocked', language)} {getRemainingLockTime()}</span>
                    </div>
                  )}

                  <div className="space-y-4">
                    <div className="group animate-in fade-in-0 slide-in-from-left-4 duration-500 delay-400">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('email', language)}
                      </label>
                      <Input
                        type="email"
                        name="email"
                        placeholder={t('enterEmail', language)}
                        variant="bordered"
                        radius="lg"
                        size="lg"
                        value={formData.email}
                        onChange={handleInputChange}
                        isDisabled={isLocked || isLoading}
                        isInvalid={Boolean(errors.email)}
                        errorMessage={errors.email}
                        startContent={<Mail className="w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors duration-200" />}
                        classNames={{
                          inputWrapper: "bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:border-primary/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300",
                          input: "text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-sm sm:text-base"
                        }}
                      />
                    </div>

                    <div className="group animate-in fade-in-0 slide-in-from-left-4 duration-500 delay-500">
                      <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                        {t('password', language)}
                      </label>
                      <Input
                        type={showPassword ? "text" : "password"}
                        name="password"
                        placeholder={t('enterPassword', language)}
                        variant="bordered"
                        radius="lg"
                        size="lg"
                        value={formData.password}
                        onChange={handleInputChange}
                        isDisabled={isLocked || isLoading}
                        isInvalid={Boolean(errors.password)}
                        errorMessage={errors.password}
                        startContent={<Lock className="w-4 h-4 text-gray-400 group-focus-within:text-primary transition-colors duration-200" />}
                        endContent={
                          <button
                            type="button"
                            onClick={() => setShowPassword(!showPassword)}
                            disabled={isLocked || isLoading}
                            className="text-gray-400 hover:text-primary transition-colors duration-200 p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-600"
                          >
                            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                        }
                        classNames={{
                          inputWrapper: "bg-white/90 dark:bg-gray-700/90 backdrop-blur-sm border-gray-300 dark:border-gray-600 hover:border-primary/50 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all duration-300",
                          input: "text-gray-900 dark:text-gray-100 placeholder:text-gray-400 text-sm sm:text-base"
                        }}
                      />
                    </div>
                  </div>

                  <div className="animate-in fade-in-0 slide-in-from-left-4 duration-500 delay-600">
                    <Button
                      type="submit"
                      color="primary"
                      radius="lg"
                      size="lg"
                      isDisabled={isLocked || isLoading}
                      className="w-full font-medium bg-gradient-to-r from-primary to-emerald-500 hover:from-primary/90 hover:to-emerald-500/90 shadow-lg hover:shadow-xl transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] text-sm sm:text-base"
                      startContent={!isLoading ? <CheckCircle className="w-4 h-4" /> : null}
                    >
                      {isLoading ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          <span className="text-sm sm:text-base">{t('loggingIn', language)}</span>
                        </div>
                      ) : (
                        t('login', language)
                      )}
                    </Button>
                  </div>
                </form>
              </div>
            </div>

            {/* Right: Enhanced illustration */}
            <div className="hidden md:flex items-center justify-center px-6 sm:px-8 py-12 sm:py-16 bg-gradient-to-br from-gray-50/80 via-emerald-50/30 to-gray-50/80 dark:from-gray-700/50 dark:via-emerald-900/10 dark:to-gray-700/50 backdrop-blur-sm">
              <div className="max-w-md animate-in fade-in-0 slide-in-from-right-4 duration-700 delay-400">
                <div className="relative">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-emerald-400/10 rounded-full blur-2xl scale-110" />
                  <img
                    src="/BgFactory/Generated_byAI.png"
                    alt="Illustration"
                    className="relative z-10 w-full h-auto object-contain drop-shadow-lg"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      