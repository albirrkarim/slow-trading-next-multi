"use client";

import dynamic from "next/dynamic";

const BlackSwanBacktest = dynamic(() => import("./MainPage"), {
  ssr: false,
  loading: () => <p>Loading Black Swan candle backtest…</p>,
});

export default BlackSwanBacktest;
