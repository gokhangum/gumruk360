"use client";

import React from "react";
import BlogContent from "@/components/blog/BlogContent";

type Props = { docStr: string };

export default function BlogContentBridge({ docStr }: Props) {
  let doc: any = null;
  try {
    doc = docStr ? JSON.parse(docStr) : null;
  } catch {
    doc = null;
  }
  return <BlogContent doc={doc} />;
}
