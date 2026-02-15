import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface TrendingUpIconProps {
  size?: number;
  color?: string;
}

export default function TrendingUpIcon({ size = 24, color = '#fbbf24' }: TrendingUpIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M23 6l-9.5 9.5-5-5L1 18"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M17 6h6v6"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}
