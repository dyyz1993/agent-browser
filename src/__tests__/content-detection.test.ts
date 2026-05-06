import { describe, it, expect } from 'vitest';
import { generateContentTips } from '../content-detection.js';
import type { ContentDetectionResult } from '../content-detection.js';

describe('content-detection', () => {
  describe('generateContentTips', () => {
    it('should return tip when auto-detected and selector is not body', () => {
      const result: ContentDetectionResult = {
        selector: 'main',
        isAutoDetected: true,
      };
      const tip = generateContentTips(result);
      expect(tip).toBe("Showing main region. Use -s 'body' for full page");
    });

    it('should return tip for article selector', () => {
      const result: ContentDetectionResult = {
        selector: 'article',
        isAutoDetected: true,
      };
      const tip = generateContentTips(result);
      expect(tip).toBe("Showing article region. Use -s 'body' for full page");
    });

    it('should return tip for class-based selector', () => {
      const result: ContentDetectionResult = {
        selector: '.content',
        isAutoDetected: true,
      };
      const tip = generateContentTips(result);
      expect(tip).toBe("Showing .content region. Use -s 'body' for full page");
    });

    it('should return null when isAutoDetected is false', () => {
      const result: ContentDetectionResult = {
        selector: 'body',
        isAutoDetected: false,
      };
      expect(generateContentTips(result)).toBeNull();
    });

    it('should return null when selector is body even if auto-detected', () => {
      const result: ContentDetectionResult = {
        selector: 'body',
        isAutoDetected: true,
      };
      expect(generateContentTips(result)).toBeNull();
    });

    it('should return null when both conditions fail', () => {
      const result: ContentDetectionResult = {
        selector: 'body',
        isAutoDetected: false,
      };
      expect(generateContentTips(result)).toBeNull();
    });

    it('should return tip for ARIA role selector', () => {
      const result: ContentDetectionResult = {
        selector: '[role="main"]',
        isAutoDetected: true,
      };
      const tip = generateContentTips(result);
      expect(tip).toBe('Showing [role="main"] region. Use -s \'body\' for full page');
    });
  });
});
