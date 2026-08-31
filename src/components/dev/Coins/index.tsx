"use client";

import dynamic from "next/dynamic";

const CoinFinder = dynamic(() => import("./MainPage"), {
  loading: () => <p>Loading coin finder...</p>,
  ssr: false,
});

export default function CoinsPage() {
  return <CoinFinder />;
}
