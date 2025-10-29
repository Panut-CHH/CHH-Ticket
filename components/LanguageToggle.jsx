"use client";

import React from "react";
import { Button } from "@heroui/react";
import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { t } from "@/utils/translations";

export default function LanguageToggle() {
  const { language, changeLanguage } = useLanguage();

  const toggleLanguage = () => {
    const newLanguage = language === "th" ? "en" : "th";
    changeLanguage(newLanguage);
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggleLanguage}
      className="min-w-0 px-2 py-1 text-gray-600 dark:text-gray-300 hover:text-emerald-600 dark:hover:text-emerald-400"
      startContent={<Globe className="w-4 h-4" />}
    >
      <span className="text-xs font-medium">
        {language === "th" ? "TH" : "EN"}
      </span>
    </Button>
  );
}


