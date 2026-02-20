/**
 * TroyCoinIcon — realistic gold coin with radial gradient, reeded edge, and embossed T.
 * Used as Troy's icon everywhere: FAB (size=56), section headers (size=20), chat (size=24).
 *
 * Layer order (bottom to top):
 *   1. Main circle with radial gradient (#F5D780 → #A07C28)
 *   2. Outer rim stroke (#8B6914)
 *   3. Reeded edge dashed circle (#9A7B2D)
 *   4. Highlight arc top-left for 3D depth (#FFE8A0, 0.4 opacity)
 *   5. Embossed T with shadow
 *
 * Color spec is unified across mobile (react-native-svg) and web (inline SVG).
 */

import React from 'react';
import { View, Text, Platform } from 'react-native';
import Svg, { Circle, Path, Defs, RadialGradient, Stop } from 'react-native-svg';

const TroyCoinIcon = ({ size = 20 }) => {
  const half = size / 2;
  const fontSize = size * 0.6;
  const rimWidth = 1.5;
  // Radii scaled relative to size
  const bodyR = half - rimWidth;         // gradient fill
  const rimR = half - rimWidth / 2;      // outer rim stroke
  const reedR = half - rimWidth * 1.5;   // reeded edge just inside rim

  // Highlight arc: ~120° arc across top-left for 3D depth
  const hlR = half * 0.78;
  const hlStartAngle = -140 * (Math.PI / 180);
  const hlEndAngle = -20 * (Math.PI / 180);
  const hlX1 = half + hlR * Math.cos(hlStartAngle);
  const hlY1 = half + hlR * Math.sin(hlStartAngle);
  const hlX2 = half + hlR * Math.cos(hlEndAngle);
  const hlY2 = half + hlR * Math.sin(hlEndAngle);
  const hlPath = `M${hlX1.toFixed(2)},${hlY1.toFixed(2)} A${hlR.toFixed(2)},${hlR.toFixed(2)} 0 0,1 ${hlX2.toFixed(2)},${hlY2.toFixed(2)}`;

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <Defs>
          <RadialGradient id={`troyCoinGrad_${size}`} cx="45%" cy="40%" rx="50%" ry="50%">
            <Stop offset="0" stopColor="#F5D780" />
            <Stop offset="1" stopColor="#A07C28" />
          </RadialGradient>
        </Defs>
        {/* 1. Coin body — radial gradient fill */}
        <Circle cx={half} cy={half} r={bodyR} fill={`url(#troyCoinGrad_${size})`} />
        {/* 2. Outer rim stroke */}
        <Circle cx={half} cy={half} r={rimR} fill="none" stroke="#8B6914" strokeWidth={rimWidth} />
        {/* 3. Reeded edge — dashed circle simulating vertical ridges */}
        <Circle cx={half} cy={half} r={reedR} fill="none" stroke="#9A7B2D" strokeWidth={rimWidth} strokeDasharray="1.5 1.5" />
        {/* 4. Highlight arc — 3D depth across top-left */}
        <Path d={hlPath} fill="none" stroke="#FFE8A0" strokeWidth={rimWidth} strokeLinecap="round" opacity={0.4} />
      </Svg>
      {/* 5. Embossed T with shadow */}
      <Text style={{
        position: 'absolute',
        fontSize,
        fontWeight: '700',
        fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
        color: '#7A5C1F',
        textShadowColor: 'rgba(255, 224, 160, 0.5)',
        textShadowOffset: { width: 0, height: 0.5 },
        textShadowRadius: 0,
        includeFontPadding: false,
        textAlignVertical: 'center',
      }}>T</Text>
    </View>
  );
};

export default TroyCoinIcon;
