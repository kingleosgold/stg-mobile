import React from 'react';
import Svg, { Path, Circle } from 'react-native-svg';

interface TodayIconProps {
  size?: number;
  color?: string;
}

export default function TodayIcon({ size = 24, color = '#fbbf24' }: TodayIconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Sun circle */}
      <Circle cx="12" cy="12" r="5" stroke={color} strokeWidth="2" fill="none" />
      {/* Sun rays */}
      <Path
        d="M12 2V4M12 20V22M4 12H2M22 12H20M5.64 5.64L7.05 7.05M16.95 16.95L18.36 18.36M5.64 18.36L7.05 16.95M16.95 7.05L18.36 5.64"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      />
    </Svg>
  );
}
