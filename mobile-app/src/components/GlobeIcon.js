import React from 'react';
import Svg, { Circle, Ellipse, Path } from 'react-native-svg';

const GlobeIcon = ({ size = 24, color = '#D4A843' }) => {
  const half = size / 2;
  const sw = size * 0.04; // stroke width scales with size

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {/* Globe outline */}
      <Circle cx="12" cy="12" r="10" stroke={color} strokeWidth={sw * (24 / size) || 1.5} fill="none" />
      {/* Vertical meridian */}
      <Ellipse cx="12" cy="12" rx="4" ry="10" stroke={color} strokeWidth={sw * (24 / size) || 1.5} fill="none" />
      {/* Horizontal equator */}
      <Path d="M2 12 Q12 8 22 12" stroke={color} strokeWidth={sw * (24 / size) || 1.5} fill="none" />
      {/* Upper latitude */}
      <Path d="M4 7.5 Q12 5 20 7.5" stroke={color} strokeWidth={sw * (24 / size) || 1.5} fill="none" />
      {/* Lower latitude */}
      <Path d="M4 16.5 Q12 19 20 16.5" stroke={color} strokeWidth={sw * (24 / size) || 1.5} fill="none" />
    </Svg>
  );
};

export default GlobeIcon;
