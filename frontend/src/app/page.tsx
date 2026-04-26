"use client";

import { Terminal } from "@/components/Terminal/Terminal";
import Squares from "@/components/Backgrounds/Squares";

export default function Home() {
  return (
    <div className="relative w-full h-screen bg-[#060606]">
      <div className="absolute inset-0 z-0">
        <Squares speed={0.5} squareSize={40} direction="diagonal" borderColor="#333" hoverFillColor="#222" />
      </div>
      <div className="relative z-10 w-full h-full">
        <Terminal />
      </div>
    </div>
  );
}
