"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import s from "./ui.module.css";

/** Old Tables and Stories URLs. Static export cannot emit a real redirect. */
export default function GoHome() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <p className={`${s.note} ${s.page}`}>
      <a href="/">Home</a>
    </p>
  );
}
