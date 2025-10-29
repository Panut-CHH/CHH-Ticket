"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession, signIn } from "next-auth/react";
import UILoading from "@/components/loading/UILoading";
import UIIndex from "@/components/index/UIIndex";
import { showToast } from "@/components/toast/UIToast";

export default function Index() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "authenticated") router.push("/home");
  }, [status, session, router]);

  const handleLogin = async () => {
    const res = await signIn("credentials", {
      redirect: false,
      email,
      password,
    });

    if (res?.ok) {
      if (session?.toast) {
        const { type, message } = session.toast;
        showToast(type, message);
      }
    } else {
      try {
        const { message, type } = JSON.parse(res?.error);
        showToast(type, message);
      } catch (e) {
        showToast("danger", res?.error || "Login failed");
      }
    }
  };

  return (
    <>
      {status === "loading" ? (
        <UILoading />
      ) : (
        <UIIndex
          email={email}
          password={password}
          setEmail={setEmail}
          setPassword={setPassword}
          handleLogin={handleLogin}
        />
      )}
    </>
  );
}
