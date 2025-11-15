'use client';
import dynamic from "next/dynamic";
import React from "react";

const HeavyWidget = dynamic(() => import("./HeavyWidgetActual"), {
  ssr: false,
  loading: () => <div style={{height: 180}} />,
});

export default function DynamicSample() {
  return <HeavyWidget />;
}

// Create components/lazy/HeavyWidgetActual.tsx in your project to use this.
