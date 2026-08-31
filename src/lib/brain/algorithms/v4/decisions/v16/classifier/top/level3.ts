export const rulesLevel3 = {
  targetCoin: {
    currentPriceNorm: {
      P: {
        min: 0.028721452521034987,
        avg: 0.5076010815229591,
        max: 1,
      },
      L: {
        min: 0.05159558604235013,
        avg: 0.35493504987264984,
        max: 1,
      },
    },
    downRatio: {
      P: {
        min: 0,
        avg: 0.4771613875237251,
        max: 0.8185809489379892,
      },
      L: {
        min: 0,
        avg: 0.3124196296854168,
        max: 0.7862819888091677,
      },
    },
    velocityMove: {
      P: {
        min: 900000,
        avg: 84708235.29411764,
        max: 823200000,
      },
      L: {
        min: 13500000,
        avg: 214740000,
        max: 1362900000,
      },
      humanizedP: {
        min: "15 minutes",
        avg: "a day",
        max: "10 days",
      },
      humanizedL: {
        min: "4 hours",
        avg: "2 days",
        max: "16 days",
      },
    },
    meanLevel: {
      P: {
        min: -0.39,
        avg: 0.17889972916640823,
        max: 1.4,
      },
      L: {
        min: -0.25,
        avg: 0.125008547008547,
        max: 0.4666666666666667,
      },
    },
  },
  btc: {
    currentPriceNorm: {
      P: {
        min: 0.1208892400183505,
        avg: 0.7196967612679558,
        max: 1,
      },
      L: {
        min: 0.424721411777937,
        avg: 0.8874783286164943,
        max: 1,
      },
    },
    downRatio: {
      P: {
        min: 0,
        avg: 0.5067798113829398,
        max: 1,
      },
      L: {
        min: 0,
        avg: 0.6235964432862382,
        max: 1,
      },
    },
    lastBTCVolatilityPoint: {
      level: {
        P: {
          min: -2,
          avg: 1.011764705882353,
          max: 4,
        },
        L: {
          min: -1,
          avg: 1.4,
          max: 3,
        },
      },
    },
  },
  comparative: {
    diffWithBTC: {
      P: {
        min: -0.3395139370085176,
        avg: 0.21209567974499627,
        max: 0.8382284238523241,
      },
      L: {
        min: -0.10758994903426855,
        avg: 0.5325432787438446,
        max: 0.9484044139576498,
      },
    },
  },
  sensitive: {
    weeklyVolatilityIndex: {
      P: {
        min: 0.19935691318327975,
        avg: 0.5458047883200708,
        max: 1,
      },
      L: {
        min: 0.4025423728813559,
        avg: 0.5701934701931269,
        max: 0.8053097345132744,
      },
    },
    weeklyMeanLevel: {
      P: {
        min: -0.9333333333333333,
        avg: 0.5628850150001522,
        max: 2.5625,
      },
      L: {
        min: -0.45454545454545453,
        avg: 0.7004482448967878,
        max: 1.95,
      },
    },
    minLevel: {
      P: {
        min: -6,
        avg: -2.1098039215686275,
        max: 0,
      },
      L: {
        min: -3,
        avg: -2,
        max: -1,
      },
    },
    maxLevel: {
      P: {
        min: 0,
        avg: 3.384313725490196,
        max: 7,
      },
      L: {
        min: 1,
        avg: 3.8666666666666667,
        max: 5,
      },
    },
  },
  trading: {
    numberOfProfitTrades: {
      P: {
        min: 0,
        avg: 6.149019607843138,
        max: 32,
      },
      L: {
        min: 0,
        avg: 6.533333333333333,
        max: 24,
      },
    },
  },
};

export const rulesLevel3Accurate = {
  targetCoin: {
    currentPriceNorm: {
      P: { min: 0.028721452521034987, avg: 0.5214712524780226, max: 1 },
      L: { min: 0.05159558604235013, avg: 0.4309434851462111, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.4838750129195186, max: 0.8185809489379892 },
      L: { min: 0, avg: 0.3932901583439841, max: 0.7862819888091677 },
    },
    velocityMove: {
      P: { min: 900000, avg: 87352226.72064777, max: 823200000 },
      L: { min: 13500000, avg: 138210000, max: 491700000 },
      humanizedP: { min: "15 minutes", avg: "a day", max: "10 days" },
      humanizedL: { min: "4 hours", avg: "2 days", max: "6 days" },
    },
    meanLevel: {
      P: { min: -0.39, avg: 0.17823962960806347, max: 1.4 },
      L: { min: -0.25, avg: 0.1775128205128205, max: 0.4666666666666667 },
    },
  },
  btc: {
    currentPriceNorm: {
      P: { min: 0.1208892400183505, avg: 0.7118453770397265, max: 1 },
      L: { min: 0.424721411777937, avg: 0.8426095745358868, max: 1 },
    },
    downRatio: {
      P: { min: 0, avg: 0.4949501673222499, max: 1 },
      L: { min: 0, avg: 0.6343893302772582, max: 1 },
    },
    lastBTCVolatilityPoint: {
      level: {
        P: { min: -2, avg: 1.008097165991903, max: 4 },
        L: { min: -1, avg: 1.2, max: 3 },
      },
    },
  },
  comparative: {
    diffWithBTC: {
      P: {
        min: -0.3395139370085176,
        avg: 0.19037412456170347,
        max: 0.8382284238523241,
      },
      L: {
        min: -0.10758994903426855,
        avg: 0.4116660893896757,
        max: 0.9484044139576498,
      },
    },
  },
  sensitive: {
    weeklyVolatilityIndex: {
      P: { min: 0.19935691318327975, avg: 0.5394472074988482, max: 1 },
      L: {
        min: 0.4025423728813559,
        avg: 0.5317674996342896,
        max: 0.6666666666666666,
      },
    },
    weeklyMeanLevel: {
      P: { min: -0.9333333333333333, avg: 0.5575666915924703, max: 2.5625 },
      L: { min: 0.021052631578947368, avg: 0.6378233946124883, max: 1.95 },
    },
    minLevel: {
      P: { min: -6, avg: -2.11336032388664, max: 0 },
      L: { min: -3, avg: -2.2, max: -1 },
    },
    maxLevel: {
      P: { min: 0, avg: 3.348178137651822, max: 7 },
      L: { min: 2, avg: 3.9, max: 5 },
    },
  },
  trading: {
    numberOfProfitTrades: {
      P: { min: 0, avg: 6.040485829959514, max: 32 },
      L: { min: 0, avg: 6.5, max: 15 },
    },
  },
};
