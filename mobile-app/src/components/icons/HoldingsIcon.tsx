import React from 'react';
import Svg, { Ellipse, Line, Path } from 'react-native-svg';

interface HoldingsIconProps {
  size?: number;
  color?: string;
}

export default function HoldingsIcon({ size = 24, color = '#fbbf24' }: HoldingsIconProps) {
  const sw = 1.8;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Cylinder with horizontal disc lines — database/stack style */}
      {/* Vertical sides */}
      <Line x1="5" y1="6" x2="5" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      <Line x1="19" y1="6" x2="19" y2="18" stroke={color} strokeWidth={sw} strokeLinecap="round" />
      {/* Top ellipse */}
      <Ellipse cx="12" cy="6" rx="7" ry="3" stroke={color} strokeWidth={sw} fill="none" />
      {/* Bottom half-ellipse */}
      <Path d="M5 18 C5 19.7 8.1 21 12 21 C15.9 21 19 19.7 19 18" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
      {/* Horizontal disc lines */}
      <Path d="M5 10 C5 11.7 8.1 13 12 13 C15.9 13 19 11.7 19 10" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
      <Path d="M5 14 C5 15.7 8.1 17 12 17 C15.9 17 19 15.7 19 14" stroke={color} strokeWidth={sw} fill="none" strokeLinecap="round" />
    </Svg>
  );
}
