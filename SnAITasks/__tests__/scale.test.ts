import {scaleFor, scaleStyles} from '../src/scale';

describe('scaleFor', () => {
  it('keeps Manta-sized screens at 1 and never scales up', () => {
    expect(scaleFor(1920, 2560)).toBe(1);
    expect(scaleFor(2560, 1920)).toBe(1);
    expect(scaleFor(3000, 4000)).toBe(1);
  });
  it('shrinks Nomad/A5X/A6X screens in either orientation', () => {
    expect(scaleFor(1404, 1872)).toBeCloseTo(0.731, 3);
    expect(scaleFor(1872, 1404)).toBeCloseTo(0.731, 3);
  });
  it('uses the tighter axis when the window is not the full screen', () => {
    expect(scaleFor(1920, 1280)).toBeCloseTo(0.667, 3);
    expect(scaleFor(1920, 2048)).toBe(0.8);
  });
  it('never goes below the minimum', () => {
    expect(scaleFor(500, 500)).toBe(0.6);
  });
  it('falls back to 1 for unknown sizes', () => {
    expect(scaleFor(0, 0)).toBe(1);
    expect(scaleFor(NaN, 100)).toBe(1);
  });
});

describe('scaleStyles', () => {
  const base = {
    text: {fontSize: 32, fontWeight: '700', color: '#000000', marginRight: 40},
    box: {borderWidth: 3, borderTopWidth: 0, padding: 40, width: '90%', flex: 1},
  };
  it('returns the same object at scale 1', () => {
    expect(scaleStyles(base, 1)).toBe(base);
  });
  it('scales sizes, keeps non-size values, and keeps borders visible', () => {
    const s = scaleStyles(base, 0.6);
    expect(s.text).toEqual({fontSize: 19, fontWeight: '700', color: '#000000', marginRight: 24});
    expect(s.box).toEqual({borderWidth: 2, borderTopWidth: 0, padding: 24, width: '90%', flex: 1});
  });
});
