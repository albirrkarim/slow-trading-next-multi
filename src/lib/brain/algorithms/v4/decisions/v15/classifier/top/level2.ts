export const rulesLevel2 = {
  targetCoin: {
    currentPriceNorm: {
      P: { min: 0.020635663532315017, avg: 0.40796579577787007, max: 1 },
      L: { min: 0.020223107905780132, avg: 0.39106209110104095, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5381363692919089, max: 0.9921938361719382 },
      L: { min: 0, avg: 0.42559427043759557, max: 0.8131581691168803 },
    },
    velocityMove: {
      P: { min: 900000, avg: 104435611.51079136, max: 1907100000 },
      L: { min: 6300000, avg: 159130769.23076922, max: 1086300000 },
      humanizedP: { min: "15 minutes", avg: "a day", max: "22 days" },
      humanizedL: { min: "2 hours", avg: "2 days", max: "13 days" },
    },
    meanLevel: {
      P: { min: -0.48, avg: 0.09853613230029452, max: 1.5 },
      L: { min: -0.38, avg: 0.0945815295815296, max: 0.66 },
    },
  },
  btc: {
    currentPriceNorm: {
      P: { min: 0.10988000418421513, avg: 0.6441907338441688, max: 1 },
      L: { min: 0.1208892400183505, avg: 0.7093585107338092, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5499454451262107, max: 1 },
      L: { min: 0, avg: 0.5295450431801231, max: 1 },
    },
    lastBTCVolatilityPoint: {
      level: {
        P: { min: -3, avg: 0.7212230215827338, max: 5 },
        L: { min: -1, avg: 0.8205128205128205, max: 3 },
      },
    },
  },
  comparative: {
    diffWithBTC: {
      P: {
        min: -0.31889626412068284,
        avg: 0.23622493806629902,
        max: 0.9111616462869072,
      },
      L: {
        min: -0.19031972709022493,
        avg: 0.31829641963276845,
        max: 0.9536236206382345,
      },
    },
  },
  sensitive: {
    weeklyVolatilityIndex: {
      P: { min: 0.1935483870967742, avg: 0.5703406910329368, max: 1 },
      L: { min: 0.19488817891373802, avg: 0.5588584140874926, max: 1 },
    },
    weeklyMeanLevel: {
      P: {
        min: -1.288888888888889,
        avg: 0.24096670446512797,
        max: 2.5294117647058822,
      },
      L: {
        min: -0.23469387755102042,
        avg: 0.604820497230231,
        max: 1.5517241379310345,
      },
    },
    minLevel: {
      P: { min: -7, avg: -2.485611510791367, max: 0 },
      L: { min: -4, avg: -1.9487179487179487, max: 1 },
    },
    maxLevel: {
      P: { min: 0, avg: 2.9568345323741005, max: 7 },
      L: { min: 1, avg: 3.358974358974359, max: 5 },
    },
  },
  trading: {
    numberOfProfitTrades: {
      P: { min: 0, avg: 11.06115107913669, max: 55 },
      L: { min: 0, avg: 6.384615384615385, max: 23 },
    },
  },
};

export const rulesLevel2Accurate = {
  targetCoin: {
    currentPriceNorm: {
      P: { min: 0.020635663532315017, avg: 0.4639675429399729, max: 1 },
      L: { min: 0.030905159558604234, avg: 0.4096467252303494, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5368862572050553, max: 0.9921938361719382 },
      L: { min: 0, avg: 0.43251008919260464, max: 0.8131581691168803 },
    },
    velocityMove: {
      P: { min: 900000, avg: 97826495.72649573, max: 1907100000 },
      L: { min: 4800000, avg: 152769767.44186047, max: 1086300000 },
      humanizedP: { min: "15 minutes", avg: "a day", max: "22 days" },
      humanizedL: { min: "an hour", avg: "2 days", max: "13 days" },
    },
    meanLevel: {
      P: { min: -0.48, avg: 0.13471302726873446, max: 1.5 },
      L: { min: -0.38, avg: 0.12299255008557335, max: 0.66 },
    },
  },
  btc: {
    currentPriceNorm: {
      P: { min: 0.10988000418421513, avg: 0.6861321382291983, max: 1 },
      L: { min: 0.1208892400183505, avg: 0.7420364079101863, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.5677656178636504, max: 1 },
      L: { min: 0, avg: 0.5486785287196875, max: 1 },
    },
    lastBTCVolatilityPoint: {
      level: {
        P: { min: -3, avg: 0.7464387464387464, max: 5 },
        L: { min: -1, avg: 0.8837209302325582, max: 3 },
      },
    },
  },
  comparative: {
    diffWithBTC: {
      P: {
        min: -0.36927001552037764,
        avg: 0.22216459528922564,
        max: 0.9111616462869072,
      },
      L: {
        min: -0.19031972709022493,
        avg: 0.3323896826798371,
        max: 0.9536236206382345,
      },
    },
  },
  sensitive: {
    weeklyVolatilityIndex: {
      P: { min: 0.1935483870967742, avg: 0.5563798892319771, max: 1 },
      L: { min: 0.19488817891373802, avg: 0.5491976779116876, max: 1 },
    },
    weeklyMeanLevel: {
      P: {
        min: -1.288888888888889,
        avg: 0.27494939595091905,
        max: 2.5294117647058822,
      },
      L: {
        min: -0.23469387755102042,
        avg: 0.5834059975582484,
        max: 1.5517241379310345,
      },
    },
    minLevel: {
      P: { min: -7, avg: -2.4686609686609686, max: 0 },
      L: { min: -4, avg: -2.0232558139534884, max: 1 },
    },
    maxLevel: {
      P: { min: 0, avg: 3.173789173789174, max: 7 },
      L: { min: 1, avg: 3.5348837209302326, max: 5 },
    },
  },
  trading: {
    numberOfProfitTrades: {
      P: { min: 0, avg: 14.202279202279202, max: 88 },
      L: { min: 0, avg: 8.395348837209303, max: 36 },
    },
  },
};
