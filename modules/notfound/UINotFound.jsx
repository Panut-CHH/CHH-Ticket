"use client";

import { Button } from "@heroui/react";
import { SearchCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import React from "react";

export default function UINotFound() {
  return (
    <>
      <div className="relative flex flex-col items-center justify-center w-full h-screen p-1 gap-1">
        <div className="absolute inset-0 flex items-center justify-center p-1 gap-1 text-[300px] opacity-30 blur select-none">
          404
        </div>
        <div className="flex items-end justify-start w-full h-fit lg:w-10/12 p-1 gap-1 text-lg">
          <Image
            src="/logoCompany/logoCompany_1.png"
            alt="logoCompany"
            width={20}
            height={20}
            priority
          />
          Evergreen
        </div>
        <div className="flex flex-col items-center justify-center w-full h-full lg:w-10/12 p-1 gap-1">
          <div className="flex items-center justify-center w-full h-fit p-1 gap-1 text-lg">
            Looking for something? <SearchCheck />
          </div>
          <div className="flex items-center justify-center w-full h-fit p-1 gap-1">
            we couldn't find the page that you're looking for!
          </div>
          <div className="flex items-center justify-center w-full h-fit p-1 gap-1">
            <Link href="/overview">
              <Button color="primary">Head back</Button>
            </Link>
          </div>
        </div>
      </div>
    </>
  );
}
