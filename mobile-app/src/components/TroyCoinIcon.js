/**
 * TroyCoinIcon — realistic gold coin with radial gradient, raised rim, and embossed T.
 * Used as Troy's icon everywhere: FAB (size=56), section headers (size=20), chat (size=24).
 */

import React from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';

const TroyCoinIcon = ({ size = 20 }) => {
  const half = size / 2;
  const fontSize = size * 0.5;
  const rimWidth = size >= 40 ? 1.5 : 1;
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`troyCoinGrad_${size}`} cx="45%" cy="40%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#FFD700" />
            <Stop offset="0.5" stopColor="#F5D060" />
            <Stop offset="0.85" stopColor="#C5962C" />
            <Stop offset="1" stopColor="#B8860B" />
          </RadialGradient>
        </Defs>
        {/* Coin body */}
        <Circle cx={half} cy={half} r={half - rimWidth} fill={`url(#troyCoinGrad_${size})`} />
        {/* Raised rim */}
        <Circle cx={half} cy={half} r={half - rimWidth / 2} fill="none" stroke="#FFE88A" strokeWidth={rimWidth} opacity={0.9} />
        {/* Inner shadow for depth */}
        <Circle cx={half} cy={half} r={half - rimWidth * 2} fill="none" stroke="rgba(139, 105, 20, 0.25)" strokeWidth={rimWidth * 0.5} />
      </Svg>
      {/* Embossed T */}
      <Text style={{
        position: 'absolute',
        fontSize,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        color: '#6B4E1B',
        textShadowColor: 'rgba(255, 225, 130, 0.5)',
        textShadowOffset: { width: 0, height: size >= 40 ? 1 : 0.5 },
        textShadowRadius: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
      }}>T</Text>
    </View>
  );
};

export default TroyCoinIcon;
