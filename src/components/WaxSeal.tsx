import React from 'react';

interface WaxSealProps {
  className?: string;
  size?: number;
  motif?: 'heart' | 'sparkle' | 'rose';
}

export const WaxSeal: React.FC<WaxSealProps> = ({
  className = '',
  size = 48,
  motif = 'heart',
}) => {
  // A lovely organic, wobbly wax seal shape
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={`select-none drop-shadow-[0_4px_6px_rgba(92,26,43,0.15)] filter ${className}`}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Outer wobbly seal melt */}
      <path
        d="M 50,6 
           C 74,4 93,18 95,43 
           C 97,68 82,92 57,94 
           C 32,96 11,81 7,56 
           C 3,31 26,8 50,6 Z"
        fill="currentColor"
      />
      
      {/* Inner ring edge highlighting for depth */}
      <path
        d="M 50,14 
           C 68,14 83,26 84,45 
           C 85,64 73,81 54,82 
           C 35,83 19,70 17,51 
           C 15,32 32,14 50,14 Z"
        fill="none"
        stroke="rgba(255, 255, 255, 0.25)"
        strokeWidth="3"
      />

      {/* Inner ring shadow */}
      <path
        d="M 50,17 
           C 66,17 80,28 81,46 
           C 82,64 70,78 53,79 
           C 36,80 21,68 20,50 
           C 19,32 34,17 50,17 Z"
        fill="none"
        stroke="rgba(0, 0, 0, 0.2)"
        strokeWidth="2"
      />

      {/* Stamp motif */}
      {motif === 'heart' && (
        <path
          d="M 50,60 
             C 45,55 35,46 35,38 
             C 35,32 39.5,28 45,28 
             C 48.2,28 50,30 50,30 
             C 50,30 51.8,28 55,28 
             C 60.5,28 65,32 65,38 
             C 65,46 55,55 50,60 Z"
          fill="rgba(43, 26, 31, 0.4)"
        />
      )}
      {motif === 'sparkle' && (
        <path
          d="M 50,28 L 53,44 L 69,47 L 53,50 L 50,66 L 47,50 L 31,47 L 47,44 Z"
          fill="rgba(43, 26, 31, 0.4)"
        />
      )}
      {motif === 'rose' && (
        <g fill="rgba(43, 26, 31, 0.4)">
          <circle cx="50" cy="45" r="10" />
          <path d="M 45,47 C 45,43 55,43 55,47 C 55,52 45,52 45,47 Z" />
          <path d="M 40,43 C 45,37 55,37 60,43 C 60,50 50,55 40,43 Z" />
        </g>
      )}
    </svg>
  );
};
