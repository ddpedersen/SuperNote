/**
 * Screen-size scaling. Sizes in the style sheets are tuned for the Manta
 * (1920×2560 px); smaller screens (Nomad, A5X, A6X: 1404×1872 px) get every
 * size shrunk by the same factor so the layout fits without clipping.
 * Never scales up, and follows rotation.
 */
import {useMemo} from 'react';
import {PixelRatio, StyleSheet, useWindowDimensions} from 'react-native';

const REF_SHORT_PX = 1920;
const REF_LONG_PX = 2560;
const MIN_SCALE = 0.6;

/** Scale factor for a window of the given physical pixel size. */
export function scaleFor(widthPx: number, heightPx: number): number {
  if (!(widthPx > 0 && heightPx > 0)) {
    return 1;
  }
  const short = Math.min(widthPx, heightPx);
  const long = Math.max(widthPx, heightPx);
  const s = Math.min(1, short / REF_SHORT_PX, long / REF_LONG_PX);
  return Math.max(MIN_SCALE, s);
}

const SCALED_KEYS = new Set([
  'fontSize',
  'lineHeight',
  'padding',
  'paddingVertical',
  'paddingHorizontal',
  'paddingTop',
  'paddingBottom',
  'paddingLeft',
  'paddingRight',
  'margin',
  'marginVertical',
  'marginHorizontal',
  'marginTop',
  'marginBottom',
  'marginLeft',
  'marginRight',
  'borderRadius',
  'gap',
  'top',
  'right',
  'bottom',
  'left',
]);

const BORDER_KEYS = new Set([
  'borderWidth',
  'borderTopWidth',
  'borderBottomWidth',
  'borderLeftWidth',
  'borderRightWidth',
]);

type Styles = Record<string, Record<string, unknown>>;

/** Returns a copy of a style object with every size multiplied by `s`. */
export function scaleStyles<T extends Styles>(styles: T, s: number): T {
  if (s === 1) {
    return styles;
  }
  const out: Styles = {};
  for (const [name, style] of Object.entries(styles)) {
    const scaled: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(style)) {
      if (typeof value !== 'number' || value === 0) {
        scaled[key] = value;
      } else if (SCALED_KEYS.has(key)) {
        scaled[key] = Math.round(value * s);
      } else if (BORDER_KEYS.has(key)) {
        // Keep lines visible on e-ink: borders shrink but never below 2.
        scaled[key] = Math.max(Math.min(value, 2), Math.round(value * s));
      } else {
        scaled[key] = value;
      }
    }
    out[name] = scaled;
  }
  return out as T;
}

/** Current scale factor for the plugin window. */
export function useScale(): number {
  const {width, height} = useWindowDimensions();
  const ratio = PixelRatio.get();
  return scaleFor(width * ratio, height * ratio);
}

/** `StyleSheet.create` output scaled for the current screen. */
export function useScaledStyles<T extends Styles>(styles: T): T {
  const s = useScale();
  return useMemo(() => StyleSheet.create(scaleStyles(styles, s)) as T, [styles, s]);
}
