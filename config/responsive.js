import { useWindowDimensions } from 'react-native';

export function getResponsiveScale(width) {
  return Math.max(0.88, Math.min(1, width / 390));
}

export function useResponsiveLayout() {
  const { width, height, fontScale } = useWindowDimensions();
  const horizontalGutter = width < 340 ? 14 : width < 390 ? 16 : 20;

  return {
    width,
    height,
    fontScale,
    scale: getResponsiveScale(width),
    isCompact: width < 360,
    horizontalGutter,
    contentWidth: Math.max(0, width - horizontalGutter * 2),
  };
}
