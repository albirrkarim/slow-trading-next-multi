export const rulesLevel1 = {
  targetCoin: {
    currentPriceNorm: {
      P: { min: 0.007020380376973154, avg: 0.34032334490168054, max: 1 },
      L: { min: 0.012926762404841727, avg: 0.4269425952808367, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5684818585759961, max: 1 },
      L: { min: 0, avg: 0.5854227101891046, max: 1 },
    },
    velocityMove: {
      P: { min: 600000, avg: 117676910.43549712, max: 1689900000 },
      L: { min: 1500000, avg: 118320000, max: 1098900000 },
      humanizedP: { min: "10 minutes", avg: "a day", max: "20 days" },
      humanizedL: { min: "25 minutes", avg: "a day", max: "13 days" },
    },
    meanLevel: {
      P: { min: -0.61, avg: 0.06714216635919087, max: 1.5 },
      L: {
        min: -0.42105263157894735,
        avg: 0.09608136674400365,
        max: 0.6470588235294118,
      },
    },
  },
  btc: {
    currentPriceNorm: {
      P: { min: 0.10988000418421513, avg: 0.608895009064916, max: 1 },
      L: { min: 0.1208892400183505, avg: 0.6834741157094408, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5658761519615055, max: 1 },
      L: { min: 0, avg: 0.6146443476726169, max: 1 },
    },
    lastBTCVolatilityPoint: {
      level: {
        P: { min: -6, avg: 0.4009860312243221, max: 5 },
        L: { min: -3, avg: 0.275, max: 3 },
      },
    },
  },
  comparative: {
    diffWithBTC: {
      P: {
        min: -0.3591766459423136,
        avg: 0.2685716641632353,
        max: 0.9397740829108261,
      },
      L: {
        min: -0.24254496413859994,
        avg: 0.25653152042860394,
        max: 0.9597002684163436,
      },
    },
  },
  sensitive: {
    weeklyVolatilityIndex: {
      P: { min: 0.14814814814814814, avg: 0.5734989421869415, max: 1 },
      L: { min: 0.189873417721519, avg: 0.563402802210249, max: 1 },
    },
    weeklyMeanLevel: {
      P: {
        min: -1.4523809523809523,
        avg: 0.06095459013635686,
        max: 2.8620689655172415,
      },
      L: { min: -1.36, avg: 0.20668548395931435, max: 1.6176470588235294 },
    },
    minLevel: {
      P: { min: -6, avg: -2.5164473684210527, max: 1 },
      L: { min: -6, avg: -2.475, max: 0 },
    },
    maxLevel: {
      P: { min: 0, avg: 2.640625, max: 7 },
      L: { min: 0, avg: 2.9875, max: 5 },
    },
  },
  trading: {
    numberOfProfitTrades: {
      P: { min: 0, avg: 19.388660640920296, max: 96 },
      L: { min: 0, avg: 16.8375, max: 77 },
    },
  },
};
