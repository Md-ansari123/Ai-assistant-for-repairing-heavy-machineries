import React from 'react';

export const CameraIcon: React.FC<React.SVGProps<SVGSVGElement>> = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.75v9.75c0 1.243.75 2.17 1.799 2.332.377.063.754.12 1.134.175a2.31 2.31 0 011.64 1.055l.822 1.315a2.25 2.25 0 001.905 1.055h5.158a2.25 2.25 0 001.905-1.055l.822-1.315a2.31 2.31 0 011.64-1.055.75.75 0 00.416-.223 2.31 2.31 0 011.134-.175c1.049-.163 1.799-1.09 1.799-2.332V9.75c0-1.243-.75-2.17-1.799-2.332a2.31 2.31 0 01-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.315a2.25 2.25 0 00-1.905-1.055H8.73c-.832 0-1.612.445-1.905 1.055l-.822 1.315z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);