import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { BrowserManager } from '../../browser.js';
import { executeCommand } from '../../actions.js';
import { parseCliArgs } from '../utils/parseCli';
import { getFixturePath } from './utils/test-helpers';
import { isSuccessResponse } from '../../types.js';

describe('diff iframe/fragment/shadow E2E tests', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true,
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('multi-layer iframe diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-iframe-main.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    describe('level 1 iframe operations', () => {
      it.skip('should detect button click in level 1 iframe - requires iframe load', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#level1-btn', '--in-frame', '#frame1', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Level1 Counter');
        }
      }, 15000);

      it.skip('should detect input fill in level 1 iframe - requires iframe load', async () => {
        const fillResult = await executeCommand(
          parseCliArgs(['fill', '#level1-input', 'test value', '--in-frame', '#frame1', '--diff']),
          browser
        );
        expect(fillResult.success).toBe(true);
        
        if (isSuccessResponse(fillResult)) {
          expect(fillResult.data.diff).toBeDefined();
          expect(fillResult.data.diff).toContain('test value');
        }
      }, 15000);
    });

    describe('level 2 iframe operations', () => {
      it.skip('should detect button click in level 2 iframe - requires iframe load', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#level2-btn', '--in-frame', '#frame1/#frame2', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Level2 Counter');
        }
      }, 15000);

      it.skip('should detect email fill in level 2 iframe - requires iframe load', async () => {
        const fillResult = await executeCommand(
          parseCliArgs(['fill', '#level2-email', 'test@example.com', '--in-frame', '#frame1/#frame2', '--diff']),
          browser
        );
        expect(fillResult.success).toBe(true);
        
        if (isSuccessResponse(fillResult)) {
          expect(fillResult.data.diff).toBeDefined();
          expect(fillResult.data.diff).toContain('test@example.com');
        }
      }, 15000);

      it.skip('should detect select change in level 2 iframe - requires iframe load', async () => {
        const selectResult = await executeCommand(
          parseCliArgs(['select', '#level2-select', 'a', '--in-frame', '#frame1/#frame2', '--diff']),
          browser
        );
        expect(selectResult.success).toBe(true);
        
        if (isSuccessResponse(selectResult)) {
          expect(selectResult.data.diff).toBeDefined();
        }
      }, 15000);
    });

    describe('main page operations', () => {
      it('should detect main page button click', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#main-btn', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Main Counter');
        }
      }, 15000);
    });
  });

  describe('fragment diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-fragment.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    it('should detect fragment navigation change', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', 'a[href="#section1"]', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('#section1');
      }
    }, 15000);

    it('should detect counter increment in section 1', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Section 1 Counter');
      }
    }, 15000);

    it('should detect status change in section 3', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s3-btn', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('Status');
      }
    }, 15000);

    it('should detect toggle show in section 3', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s3-toggle', '--diff']),
        browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diff).toBeDefined();
        expect(clickResult.data.diff).toContain('+ paragraph');
      }
    }, 15000);

    it('should work with CSS selector scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff', '#section1']),
      browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diffScope).toBe('#section1');
      }
    }, 15000);

    it('should work with full scope', async () => {
      const clickResult = await executeCommand(
        parseCliArgs(['click', '#s1-btn', '--diff', 'full']),
        browser
      );
      expect(clickResult.success).toBe(true);
      
      if (isSuccessResponse(clickResult)) {
        expect(clickResult.data.diffScope).toBe('full page');
      }
    }, 15000);
  });

  describe('shadow DOM diff', () => {
    beforeEach(async () => {
      const openResult = await executeCommand(
        parseCliArgs(['open', getFixturePath('diff-shadow.html')]),
        browser
      );
      expect(openResult.success).toBe(true);
    }, 15000);

    describe('outside shadow DOM operations', () => {
      it('should detect outside counter increment', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('Outside Shadow DOM');
        }
      }, 15000);

      it('should detect outside toggle show', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-toggle', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diff).toBeDefined();
          expect(clickResult.data.diff).toContain('+ paragraph');
        }
      }, 15000);
    });

    describe('shadow DOM operations', () => {
      it.skip('should detect shadow counter increment - requires special selector', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#shadow-counter >> internal:role=button[name="Increment"]', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
      }, 15000);

      it.skip('should detect shadow input fill - requires special selector', async () => {
        const fillResult = await executeCommand(
          parseCliArgs(['fill', '#shadow-form >> internal:role=textbox[name="Shadow input"]', 'shadow test', '--diff']),
          browser
        );
        expect(fillResult.success).toBe(true);
      }, 15000);

      it.skip('should detect shadow toggle show - requires special selector', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#shadow-toggle >> internal:role=button', '--diff']),
          browser
        );
        expect(clickResult.success).toBe(true);
      }, 15000);
    });

    describe('diff scope options with shadow DOM', () => {
      it('should work with full scope', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff', 'full']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diffScope).toBe('full page');
        }
      }, 15000);

      it('should work with CSS selector scope', async () => {
        const clickResult = await executeCommand(
          parseCliArgs(['click', '#outside-btn', '--diff', '#outside-text']),
          browser
        );
        expect(clickResult.success).toBe(true);
        
        if (isSuccessResponse(clickResult)) {
          expect(clickResult.data.diffScope).toBe('#outside-text');
        }
      }, 15000);
    });
  });
});
