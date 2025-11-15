"use client";
import * as React from "react";
import { LinkifiedText } from "@/components/utils/linkify";

export default function MessageBody({ text }: { text?: string | null }) {
  return (
    <div className="whitespace-pre-wrap break-words text-sm text-gray-800">
      <LinkifiedText text={text ?? ""} />
    </div>
  );
}
