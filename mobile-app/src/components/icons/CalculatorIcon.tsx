import React from 'react';
import Svg, { Path, Rect, Line } from 'react-native-svg';

interface CalculatorIconProps {
  size?: number;
  color?: string;
}

export default function CalculatorIcon({ size = 24, color = '#fbbf24' }: CalculatorIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect
        x="4" y="2" width="16" height="20" rx="2"
        stroke={color}
        strokeWidth="2"
        fill="none"
      />
      <Rect
        x="8" y="6" width="8" height="4" rx="1"
        stroke={color}
        strokeWidth="1.5"
        fill="none"
      />
      <Line x1="8" y1="14" x2="8" y2="14.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="12" y1="14" x2="12" y2="14.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="16" y1="14" x2="16" y2="14.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="8" y1="18" x2="8" y2="18.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="12" y1="18" x2="12" y2="18.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
      <Line x1="16" y1="18" x2="16" y2="18.01" stroke={color} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
