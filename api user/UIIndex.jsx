"use client";

import { Button, Input } from "@heroui/react";
import { motion } from "framer-motion";
import React, { useEffect, useState } from "react";
import { Flame } from "lucide-react";
import Image from "next/image";

function OrbitIcon({ Icon, color, radius, angle, duration, reverse }) {
  const [coords, setCoords] = useState(null);

  useEffect(() => {
    const rad = (angle * Math.PI) / 180;
    setCoords({
      x: Math.cos(rad) * (radius / 2),
      y: Math.sin(rad) * (radius / 2),
    });
  }, [radius, angle]);

  if (!coords) return null;

  return (
    <motion.div
      className="absolute lg:flex hidden"
      animate={{ rotate: reverse ? -360 : 360 }}
      transition={{ duration, repeat: Infinity, ease: "linear" }}
      style={{ transformOrigin: `-${coords.x}px -${coords.y}px` }}
    >
      <div
        className="absolute flex items-center justify-center p-2 rounded-full"
        style={{ transform: `translate(${coords.x}px, ${coords.y}px)` }}
      >
        <Icon className={`w-8 h-8 ${color}`} />
      </div>
    </motion.div>
  );
}

export default function UIIndex({
  email,
  password,
  setEmail,
  setPassword,
  handleLogin,
}) {
  const circleSizes = [500, 600, 700, 800];
  const flames = [];

  circleSizes.forEach((size, ci) => {
    const count = 5;
    for (let i = 0; i < count; i++) {
      flames.push({
        Icon: Flame,
        color: "text-primary",
        radius: size,
        angle: (i * 360) / count,
        duration: 25 + ci * 5,
        reverse: ci % 2 === 1,
      });
    }
  });

  return (
    <div className="flex flex-row items-center justify-center w-full h-full">
      <div className="flex flex-col items-center justify-center w-full h-full lg:w-4/12 p-2 gap-2 border-r-1 border-default shadow">
        <div className="flex items-center justify-center w-full h-fit p-2 gap-2 text-4xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-primary via-danger to-warning drop-shadow">
          Api Documents
        </div>
        <div className="flex items-center justify-center w-full h-fit p-2 gap-2">
          <Input
            name="email"
            type="email"
            label="Email"
            labelPlacement="outside"
            placeholder="Enter your email"
            variant="bordered"
            isRequired
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-center w-full h-fit p-2 gap-2">
          <Input
            name="password"
            type="password"
            label="Password"
            labelPlacement="outside"
            placeholder="Enter your password"
            variant="bordered"
            isRequired
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-center w-full h-fit p-2 gap-2">
          <Button
            onPress={handleLogin}
            type="submit"
            color="primary"
            className="w-4/12 p-2 gap-2"
          >
            Signin
          </Button>
        </div>
      </div>

      <div className="relative lg:flex hidden flex-col items-center justify-center w-8/12 h-full p-2 gap-2 overflow-hidden">
        <div className="absolute w-[500px] h-[500px] border-1 border-default rounded-full" />
        <div className="absolute w-[600px] h-[600px] border-1 border-default rounded-full" />
        <Image
          src="/mascot/mascot_1.png"
          alt="mascot"
          width={250}
          height={250}
          priority
        />
        <div className="absolute w-[700px] h-[700px] border-1 border-default rounded-full" />
        <div className="absolute w-[800px] h-[800px] border-1 border-default rounded-full" />

        {flames.map((f, i) => (
          <OrbitIcon key={i} {...f} />
        ))}
      </div>
    </div>
  );
}
