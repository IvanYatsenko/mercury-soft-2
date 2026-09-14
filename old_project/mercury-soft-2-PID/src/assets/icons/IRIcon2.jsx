import React from 'react'

export const IRIcon2 = ({ gray = false, white = false, green = false }) => {
  return (
    <div className="line side" style={{transform: 'rotate(180deg) translateY(4px) translateX(3px)'}}>
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="24px"
        height="24px"
        viewBox="0 0 24 24"
        version="1.1"
      >
        <defs>
          <linearGradient id="myGradientIR" x1="100%" y1="0%" x2="0%" y2="0%">
          {white &&(<stop offset='100%' stopColor="#fff" />)}
          {gray && (<stop offset='100%' stopColor="#cbcbcb" />)}
          {green && <stop offset="100%" stopColor="#2e7d32" />}
          </linearGradient>
        </defs>

        <g id="surface107826" fill="url(#myGradientIR)">
          <path d="M 4 2 L 4 4 L 7 4 C 7.554688 4 8 4.445312 8 5 L 8 10 C 6.894531 10 6 10.894531 6 12 C 6 13.105469 6.894531 14 8 14 L 8 19 C 8 19.554688 7.554688 20 7 20 L 4 20 L 4 22 L 7 22 C 8.644531 22 10 20.644531 10 19 L 10 5 C 10 3.355469 8.644531 2 7 2 Z M 12 2 L 12 4 C 16.464844 4 20 7.535156 20 12 C 20 16.464844 16.464844 20 12 20 L 12 22 C 17.535156 22 22 17.535156 22 12 C 22 6.464844 17.535156 2 12 2 Z M 12 6 L 12 8 C 14.277344 8 16 9.722656 16 12 C 16 14.277344 14.277344 16 12 16 L 12 18 C 15.324219 18 18 15.324219 18 12 C 18 8.675781 15.324219 6 12 6 Z M 12 10 L 12 14 C 13.101562 14 14 13.101562 14 12 C 14 10.898438 13.101562 10 12 10 Z M 12 10 " />
        </g>
      </svg>
    </div>
  )
}
