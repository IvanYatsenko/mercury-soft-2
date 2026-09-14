// 81 - 78: 1.03846
// 101 - 97: 1.0412
// 122 - 116: 1.051
// 141 - 134: 1.052
// 161 - 152: 1.059
// 180 - 171: 1.052
// 200 - 189: 1.058
// 220 - 208: 1.057
// 240 - 226: 1.061
// 260 - 244: 1.065
// 280 - 261: 1.072

export const TCORRECT300 = [
  { temp: 0, coef: 1 },
  { temp: 50, coef: 1 },
  { temp: 80, coef: 1.038 },
  { temp: 100, coef: 1.041 },
  { temp: 120, coef: 1.051 },
  { temp: 140, coef: 1.052 },
  { temp: 160, coef: 1.055 },
  { temp: 180, coef: 1.057 },
  { temp: 200, coef: 1.058 },
  { temp: 220, coef: 1.06 },
  { temp: 240, coef: 1.061 },
  { temp: 260, coef: 1.065 },
  { temp: 280, coef: 1.072 },
  { temp: 1000, coef: 1.072 }
]

// 83 - 81: 1.02459
// 100 - 97: 1.03092
// 121 - 118: 1.02542
// 141 - 137: 1.0291
// 161 - 156: 1.032
// 182 - 176: 1.03409
// 201 - 194: 1.036
// 220 - 213: 1.0328
// 240 - 231: 1.03896
// 262 - 252: 1.03968

export const TCORRECT400 = [
  { temp: 0, coef: 1 },
  { temp: 50, coef: 1 },
  { temp: 80, coef: 1.024 },
  { temp: 100, coef: 1.025 },
  { temp: 120, coef: 1.026 },
  { temp: 140, coef: 1.029 },
  { temp: 160, coef: 1.032 },
  { temp: 180, coef: 1.034 },
  { temp: 200, coef: 1.036 },
  { temp: 220, coef: 1.036 },
  { temp: 240, coef: 1.038 },
  { temp: 260, coef: 1.039 },
  { temp: 1000, coef: 1.04 }
]

export const SPEED300 = {
  light: [
    {
      pow: 1,
      ts: [
        { temp: 50, speed: 1.3 },
        { temp: 130, speed: 1.3 },
        { temp: 200, speed: 1.09 },
        { temp: 250, speed: 1 },
        { temp: 300, speed: 0.96 }
      ]
    },
    {
      pow: 0.75,
      ts: [
        { temp: 50, speed: 1.07 },
        { temp: 130, speed: 1.07 },
        { temp: 200, speed: 0.994 },
        { temp: 250, speed: 0.919 },
        { temp: 300, speed: 0.87 }
      ]
    },
    {
      pow: 0.5,
      ts: [
        { temp: 50, speed: 0.988 },
        { temp: 130, speed: 0.988 },
        { temp: 200, speed: 0.88 },
        { temp: 250, speed: 0.787 },
        { temp: 300, speed: 0.7 }
      ]
    },
    {
      pow: 0.25,
      ts: [
        { temp: 50, speed: 0.846 },
        { temp: 130, speed: 0.846 },
        { temp: 200, speed: 0.737 },
        { temp: 250, speed: 0.65 },
        { temp: 300, speed: 0.6 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: 50, speed: 0.8 },
        { temp: 130, speed: 0.8 },
        { temp: 200, speed: 0.65 },
        { temp: 250, speed: 0.48 },
        { temp: 300, speed: 0.375 }
      ]
    }
  ],
  bothHeaters: [
    {
      pow: 1,
      ts: [
        { temp: 50, speed: 0.8 },
        { temp: 130, speed: 0.8 },
        { temp: 200, speed: 0.65 },
        { temp: 250, speed: 0.48 },
        { temp: 300, speed: 0.375 }
      ]
    },
    {
      pow: 0.75,
      ts: [
        { temp: 50, speed: 0.57 },
        { temp: 130, speed: 0.57 },
        { temp: 200, speed: 0.403 },
        { temp: 250, speed: 0.3 },
        { temp: 300, speed: 0.182 }
      ]
    },
    {
      pow: 0.5,
      ts: [
        { temp: 50, speed: 0.345 },
        { temp: 130, speed: 0.345 },
        { temp: 200, speed: 0.2 },
        { temp: 250, speed: 0.075 },
        { temp: 300, speed: 0 }
      ]
    },
    {
      pow: 0.25,
      ts: [
        { temp: 50, speed: 0.27 },
        { temp: 130, speed: 0.11 },
        { temp: 200, speed: 0.01 },
        { temp: 250, speed: -0.083 },
        { temp: 300, speed: -0.2 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: 0, speed: 0 },
        { temp: 50, speed: 0 },
        { temp: 130, speed: -0.1 },
        { temp: 200, speed: -0.216 },
        { temp: 250, speed: -0.32 },
        { temp: 300, speed: -0.43 }
      ]
    }
  ],
  cooling: [
    {
      pow: 1,
      ts: [
        { temp: 0, speed: -0.05 },
        { temp: 50, speed: -0.05 },
        { temp: 130, speed: -0.204 },
        { temp: 200, speed: -0.348 },
        { temp: 250, speed: -0.463 },
        { temp: 300, speed: -0.579 }
      ]
    },
    {
      pow: 0.25,
      ts: [
        { temp: 0, speed: -0.04 },
        { temp: 50, speed: -0.04 },
        { temp: 130, speed: -0.17 },
        { temp: 200, speed: -0.3 },
        { temp: 250, speed: -0.4 },
        { temp: 300, speed: -0.515 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: 0, speed: 0 },
        { temp: 50, speed: 0 },
        { temp: 130, speed: -0.1 },
        { temp: 200, speed: -0.216 },
        { temp: 250, speed: -0.32 },
        { temp: 300, speed: -0.43 }
      ]
    }
  ]
}

export const SPEED400 = {
  light: [
    {
      pow: 0.666,
      ts: [
        { temp: -1, speed: 1.388 },
        { temp: 50, speed: 1.388 },
        { temp: 100, speed: 1.343 },
        { temp: 150, speed: 1.19 },
        { temp: 205, speed: 1.053 },
        { temp: 250, speed: 0.94 },
        { temp: 280, speed: 0.855 }
      ]
    },
    {
      pow: 0.5,
      ts: [
        { temp: -1, speed: 1.2 },
        { temp: 50, speed: 1.2 },
        { temp: 100, speed: 1.15 },
        { temp: 150, speed: 1.02 },
        { temp: 205, speed: 0.9 },
        { temp: 250, speed: 0.832 },
        { temp: 280, speed: 0.745 }
      ]
    },
    {
      pow: 0.33333,
      ts: [
        { temp: -1, speed: 0.955 },
        { temp: 50, speed: 0.955 },
        { temp: 100, speed: 0.9 },
        { temp: 150, speed: 0.851 },
        { temp: 205, speed: 0.777 },
        { temp: 250, speed: 0.673 },
        { temp: 280, speed: 0.597 }
      ]
    },
    {
      pow: 0.166666,
      ts: [
        { temp: -1, speed: 0.75 },
        { temp: 50, speed: 0.75 },
        { temp: 100, speed: 0.75 },
        { temp: 150, speed: 0.725 },
        { temp: 205, speed: 0.636 },
        { temp: 250, speed: 0.547 },
        { temp: 280, speed: 0.493 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: -1, speed: 0.37 },
        { temp: 50, speed: 0.37 },
        { temp: 100, speed: 0.5 },
        { temp: 150, speed: 0.42 },
        { temp: 205, speed: 0.306 },
        { temp: 250, speed: 0.253 },
        { temp: 280, speed: 0.192 }
      ]
    }
  ],
  bothHeaters: [
    {
      pow: 1,
      ts: [
        { temp: -1, speed: 0.37 },
        { temp: 50, speed: 0.37 },
        { temp: 100, speed: 0.5 },
        { temp: 150, speed: 0.42 },
        { temp: 205, speed: 0.306 },
        { temp: 250, speed: 0.253 },
        { temp: 280, speed: 0.192 }
      ]
    },
    {
      pow: 0.75,
      ts: [
        { temp: -1, speed: 0.3 },
        { temp: 50, speed: 0.3 },
        { temp: 100, speed: 0.373 },
        { temp: 150, speed: 0.282 },
        { temp: 205, speed: 0.176 },
        { temp: 250, speed: 0.114 },
        { temp: 280, speed: 0.065 }
      ]
    },
    {
      pow: 0.5,
      ts: [
        { temp: -1, speed: 0.214 },
        { temp: 50, speed: 0.214 },
        { temp: 100, speed: 0.228 },
        { temp: 150, speed: 0.151 },
        { temp: 205, speed: 0.048 },
        { temp: 250, speed: -0.0035 },
        { temp: 280, speed: -0.105 }
      ]
    },
    {
      pow: 0.25,
      ts: [
        { temp: -1, speed: 0.127 },
        { temp: 50, speed: 0.127 },
        { temp: 100, speed: 0.08 },
        { temp: 150, speed: 0.02 },
        { temp: 205, speed: -0.05 },
        { temp: 250, speed: -0.12 },
        { temp: 280, speed: -0.145 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.01 },
        { temp: 100, speed: -0.04 },
        { temp: 150, speed: -0.1076 },
        { temp: 205, speed: -0.193 },
        { temp: 250, speed: -0.233 },
        { temp: 280, speed: -0.261 }
      ]
    }
  ],
  cooling: [
    {
      pow: 1,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.032 },
        { temp: 100, speed: -0.14 },
        { temp: 150, speed: -0.25 },
        { temp: 205, speed: -0.37 },
        { temp: 250, speed: -0.45 },
        { temp: 280, speed: -0.51 }
      ]
    },
    {
      pow: 0.75,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.0217 },
        { temp: 100, speed: -0.132 },
        { temp: 150, speed: -0.2408 },
        { temp: 205, speed: -0.353 },
        { temp: 250, speed: -0.44 },
        { temp: 280, speed: -0.5 }
      ]
    },
    {
      pow: 0.5,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.02 },
        { temp: 100, speed: -0.1214 },
        { temp: 150, speed: -0.2249 },
        { temp: 205, speed: -0.32 },
        { temp: 250, speed: -0.41 },
        { temp: 280, speed: -0.48 }
      ]
    },
    {
      pow: 0.25,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.015 },
        { temp: 100, speed: -0.095 },
        { temp: 150, speed: -0.2 },
        { temp: 205, speed: -0.3 },
        { temp: 250, speed: -0.37 },
        { temp: 280, speed: -0.42 }
      ]
    },
    {
      pow: 0,
      ts: [
        { temp: 30, speed: 0 },
        { temp: 50, speed: -0.01 },
        { temp: 100, speed: -0.04 },
        { temp: 150, speed: -0.1076 },
        { temp: 205, speed: -0.193 },
        { temp: 250, speed: -0.233 },
        { temp: 280, speed: -0.261 }
      ]
    }
  ]
}

export const CALIBRATE_PROFILE = {
  state: {
    name: 'Calibrate',
  },
  points: [
   
  ],
  shelves: [
   
  ]
}
