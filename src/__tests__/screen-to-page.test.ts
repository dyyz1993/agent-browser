import { describe, it, expect } from 'vitest';
import { buildViewerScript } from '../viewer-script.js';

describe('screenToPage - simplified linear mapping', () => {
  const script = buildViewerScript();

  it('should have screenToPage function', () => {
    expect(script).toContain('function screenToPage(screenX, screenY)');
  });

  it('should use getBoundingClientRect for rect', () => {
    expect(script).toContain('screen.getBoundingClientRect()');
  });

  it('should use deviceWidth/deviceHeight for scale (full-screen)', () => {
    expect(script).toContain('metadata.deviceWidth / rect.width');
    expect(script).toContain('metadata.deviceHeight / rect.height');
  });

  it('should add element offset in element mode', () => {
    expect(script).toContain('if (metadata.element)');
    expect(script).toContain('pageX += metadata.element.x');
    expect(script).toContain('pageY += metadata.element.y');
  });

  it('should NOT have letterbox/pillarbox calculation (no containerRatio/imageRatio)', () => {
    // The new simplified version has NO letterbox logic
    expect(script).not.toContain('containerRatio');
    expect(script).not.toContain('imageRatio');
    expect(script).not.toContain('contentW');
    expect(script).not.toContain('offsetX');
    expect(script).not.toContain('offsetY');
  });

  it('should have fitImageToContainer function for explicit image sizing', () => {
    expect(script).toContain('fitImageToContainer');
    expect(script).toMatch(/screen\.style\.width/);
    expect(script).toMatch(/screen\.style\.height/);
  });

  it('should use object-fit: fill on #screen (JS controls size)', () => {
    // The CSS should be object-fit: fill since JS sets exact dimensions
    expect(script).not.toContain('object-fit: contain');
  });

  it('should re-fit on window resize', () => {
    expect(script).toContain("window.addEventListener('resize'");
    expect(script).toContain('fitImageToContainer');
  });
});

describe('element mode coordinate conversion', () => {
  const script = buildViewerScript();

  it('should include element offset in page coordinates', () => {
    expect(script).toContain('metadata.element.x');
    expect(script).toContain('metadata.element.y');
  });

  it('should handle status message with element info', () => {
    expect(script).toContain('msg.element');
    expect(script).toContain('metadata.element = msg.element');
  });
});

describe('URL selector encoding/decoding', () => {
  const script = buildViewerScript();

  it('should correctly encode selector with hash', () => {
    const selector = '#my-element';
    const encoded = encodeURIComponent(selector);
    const decoded = decodeURIComponent(encoded);
    expect(encoded).toBe('%23my-element');
    expect(decoded).toBe(selector);
  });

  it('should correctly encode complex selectors', () => {
    const selector = 'div#id.class[data-attr="value"]';
    const encoded = encodeURIComponent(selector);
    const decoded = decodeURIComponent(encoded);
    expect(decoded).toBe(selector);
  });
});
