export const TRADE_MESSAGE = {
  hold: "[HOLD]",
  /**
   * move base asset to other wallet or sell manually
   */
  move: "[MOVED]",

  sell: {
    EXIT: "[EXIT]",

    SELL: "[SELL]",
    /**
     * Force sell, or final sell at backtest
     */
    FINAL: "[FINAL_SELL]",

    TP: "[TAKE_PROFIT]",
    POST_AVERAGE_RESCUE_EXIT: "[POST_AVERAGE_RESCUE_EXIT]",
    POST_AVERAGE_STOP_LOSS: "[POST_AVERAGE_STOP_LOSS]",
    SL: "[STOP_LOSS]",
    SL_PLUS: "[STOP_LOSS_PLUS_TP]",
    SL_EXPIRED_DATE: "[SL_EXPIRED_DATE]",

    LIQUIDATED_ISOLATED: "[L_ISOLATED]",
    LIQUIDATED_GLOBAL: "[L_GLOBAL]",
  },
  buy: {
    /**
     * Future
     */
    SHORT: "[SHORT]",
    LONG: "[LONG]",

    /**
     * Theres no position, stary new entry
     */
    ENTRY: "[ENTRY]",

    /**
     * Add position, used in averaging
     */
    ADD_POSITION: "[ADD_POSITION]",

    /**
     * Next entry after previous entry was failed to exit
     */
    AGAIN: "[AGAIN]",

    /**
     * Used in testing
     */
    BYPASS: "[BYPASS]",

    /**
     * using memory.justBuy
     */
    MANUAL: "[MANUAL]",

    /**
     * Auto Entry
     */
    COMMON: "[COMMON]",

    /**
     * Deprecated since nov 2025
     */
    HIT: "[HIT]",

    /**
     * DEPRECATED since nov 2025
     */
    DCA: "[DCA]",

    NO_MORE_AFTER_DATE: "[NO_MORE_AFTER_DATE]",
  },
  cancel: {
    amount: {
      NO_ENOUGH: "[NO_ENOUGH]",
      TOO_SMALL: "[TOO_SMALL]",
    },
  },
  tokocrypto: "[TOKOCRYPTO]",
};
