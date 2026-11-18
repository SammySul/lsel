const whole = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** 12480 as "12,480". */
export const count = (n: number) => whole.format(n);

/** 3000 as "3.0 s". */
export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`;
