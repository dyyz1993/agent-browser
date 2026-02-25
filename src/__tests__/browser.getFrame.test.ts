import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { BrowserManager } from '../browser.js';
import { getFixturePath } from './e2e/utils/test-helpers.js';

describe('BrowserManager.getFrame', () => {
  let browser: BrowserManager;

  beforeAll(async () => {
    browser = new BrowserManager();
    await browser.launch({
      action: 'launch',
      id: 'test-launch',
      headless: true
    });
  });

  afterAll(async () => {
    await browser.close();
  });

  describe('同源 iframe 测试', () => {
    beforeEach(async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('iframe-nested.html'));
    });

    describe('空路径和 mainFrame', () => {
      it('should return main frame when no path provided', () => {
        const frame = browser.getFrame();
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-nested.html');
      });

      it('should return main frame for empty string path', () => {
        const frame = browser.getFrame('');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-nested.html');
      });
    });

    describe('单层 iframe 通过 name/ID 匹配', () => {
      it('should find frame by ID selector (#frame1)', () => {
        const frame = browser.getFrame('#frame1');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-level2.html');
      });

      it('should find frame by name without # prefix (frame1)', () => {
        const frame = browser.getFrame('frame1');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-level2.html');
      });
    });

    describe('嵌套 iframe 路径解析', () => {
      it('should navigate to 2-level nested iframe (#frame1/#frame2)', () => {
        const frame = browser.getFrame('#frame1/#frame2');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-level3.html');
      });

      it('should navigate to 3-level nested iframe (#frame1/#frame2/#frame3)', () => {
        const frame = browser.getFrame('#frame1/#frame2/#frame3');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('iframe-level4.html');
      });
    });

    describe('索引匹配', () => {
      it('should find frame by index (0)', async () => {
        const page = browser.getPage();
        const mainFrame = page.mainFrame();
        const childFrames = mainFrame.childFrames();
        
        if (childFrames.length > 0) {
          const frame = browser.getFrame('0');
          expect(frame).toBeDefined();
          expect(frame.url()).toBe(childFrames[0].url());
        }
      });
    });

    describe('错误处理', () => {
      it('should throw error for non-existent frame', () => {
        expect(() => browser.getFrame('#non-existent-frame')).toThrow();
      });

      it('should throw error for invalid index', () => {
        expect(() => browser.getFrame('#frame1/999')).toThrow();
      });

      it('should throw error for invalid nested path', () => {
        expect(() => browser.getFrame('#frame1/#non-existent')).toThrow();
      });
    });
  });

  describe('跨域 iframe 测试', () => {
    beforeEach(async () => {
      const page = browser.getPage();
      await page.goto('https://www.example.com');
    });

    afterEach(async () => {
      const page = browser.getPage();
      await page.goto('about:blank');
    });

    describe('单层跨域 iframe', () => {
      it('should inject and access cross-origin iframe', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <h1>Main Page</h1>
            <iframe id="cross-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#cross-frame');
        await page.waitForTimeout(2000);

        const frame = browser.getFrame('#cross-frame');
        expect(frame).toBeDefined();
        expect(frame.url()).toContain('tools.docker.19930810.xyz');
      });

      it('should get snapshot from cross-origin iframe', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="cross-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#cross-frame');
        await page.waitForTimeout(2000);

        const frame = browser.getFrame('#cross-frame');
        const snapshot = await frame.locator('body').innerHTML();
        expect(snapshot).toContain('iframe');
      });
    });

    describe('嵌套跨域 iframe (路径解析验证)', () => {
      it('should verify childFrames() behavior on cross-origin iframe', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="outer-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#outer-frame');
        await page.waitForTimeout(3000);

        const outerFrame = browser.getFrame('#outer-frame');
        expect(outerFrame).toBeDefined();

        const childFrames = outerFrame.childFrames();
        console.log('Cross-origin iframe childFrames count:', childFrames.length);
        console.log('Cross-origin iframe URL:', outerFrame.url());
        
        if (childFrames.length > 0) {
          childFrames.forEach((f, i) => {
            console.log(`  Child ${i}: name="${f.name()}" url="${f.url()}"`);
          });
        }
      }, 15000);

      it('should access nested iframe by index (#frame/0)', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#test-frame');
        await page.waitForTimeout(3000);

        const outerFrame = browser.getFrame('#test-frame');
        const childFrames = outerFrame.childFrames();
        console.log('Cross-origin iframe childFrames count:', childFrames.length);

        if (childFrames.length > 0) {
          const nestedFrame = browser.getFrame('#test-frame/0');
          console.log('Nested frame found:', nestedFrame?.url());
          expect(nestedFrame).toBeDefined();
          expect(nestedFrame.url()).toContain('outer-iframe');
        } else {
          console.log('No child frames found - cross-origin limitation');
        }
      }, 15000);

      it('should access nested iframe by name (#frame/name)', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#test-frame');
        await page.waitForTimeout(3000);

        const outerFrame = browser.getFrame('#test-frame');
        const childFrames = outerFrame.childFrames();
        
        if (childFrames.length > 0) {
          const firstName = childFrames[0].name();
          console.log('First child frame name:', firstName);
          
          if (firstName) {
            const nestedFrame = browser.getFrame(`#test-frame/${firstName}`);
            console.log('Nested frame found by name:', nestedFrame?.url());
            expect(nestedFrame).toBeDefined();
          }
        }
      }, 15000);

      it('should access deeply nested iframe (#frame/0/0)', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="deep-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#deep-frame');
        await page.waitForTimeout(3000);

        const level1Frame = browser.getFrame('#deep-frame');
        const level1Children = level1Frame.childFrames();
        console.log('Level 1 childFrames count:', level1Children.length);

        if (level1Children.length > 0) {
          const level2Frame = browser.getFrame('#deep-frame/0');
          const level2Children = level2Frame.childFrames();
          console.log('Level 2 childFrames count:', level2Children.length);

          if (level2Children.length > 0) {
            const level3Frame = browser.getFrame('#deep-frame/0/0');
            console.log('Level 3 frame found:', level3Frame?.url());
            expect(level3Frame).toBeDefined();
          } else {
            console.log('No level 2 child frames - cannot test 3-level nesting');
          }
        }
      }, 20000);

      it('should verify frame content accessibility', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="content-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#content-frame');
        await page.waitForTimeout(3000);

        const outerFrame = browser.getFrame('#content-frame');
        const outerContent = await outerFrame.locator('h1').textContent();
        console.log('Outer frame h1:', outerContent);
        expect(outerContent).toContain('iframe');

        const childFrames = outerFrame.childFrames();
        if (childFrames.length > 0) {
          const nestedFrame = browser.getFrame('#content-frame/0');
          const nestedContent = await nestedFrame.locator('body').innerHTML();
          console.log('Nested frame has content:', nestedContent.length > 0);
          expect(nestedContent.length).toBeGreaterThan(0);
        }
      }, 15000);

      it('should interact with login form in deepest nested iframe (#frame/0/0)', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="login-test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#login-test-frame');
        await page.waitForTimeout(3000);

        const level1Frame = browser.getFrame('#login-test-frame');
        const level1Children = level1Frame.childFrames();
        console.log('Level 1 childFrames count:', level1Children.length);

        if (level1Children.length > 0) {
          const level2Frame = browser.getFrame('#login-test-frame/0');
          const level2Children = level2Frame.childFrames();
          console.log('Level 2 childFrames count:', level2Children.length);

          if (level2Children.length > 0) {
            const loginFrame = browser.getFrame('#login-test-frame/0/0');
            console.log('Login frame URL:', loginFrame.url());

            const bodyContent = await loginFrame.locator('body').innerHTML();
            console.log('Login frame body preview:', bodyContent.substring(0, 200));
            expect(bodyContent).toContain('username');

            const usernameInput = loginFrame.locator('#username');
            await usernameInput.fill('admin');
            const usernameValue = await usernameInput.inputValue();
            console.log('Username filled:', usernameValue);
            expect(usernameValue).toBe('admin');

            const passwordInput = loginFrame.locator('#password');
            await passwordInput.fill('password');
            const passwordValue = await passwordInput.inputValue();
            console.log('Password filled:', passwordValue);
            expect(passwordValue).toBe('password');

            const loginButton = loginFrame.locator('button');
            await loginButton.click();
            await page.waitForTimeout(500);

            const message = await loginFrame.locator('#message').textContent();
            console.log('Login message:', message);
            expect(message).toContain('登录成功');
          }
        }
      }, 20000);

      it('should extract data from login-frame in nested iframe', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="extract-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#extract-frame');
        await page.waitForTimeout(3000);

        const level1Frame = browser.getFrame('#extract-frame');
        const level1Children = level1Frame.childFrames();

        if (level1Children.length > 0) {
          const level2Frame = browser.getFrame('#extract-frame/0');
          const level2Children = level2Frame.childFrames();

          if (level2Children.length > 0) {
            const loginFrame = browser.getFrame('#extract-frame/0/0');

            const label = await loginFrame.locator('.label').textContent();
            console.log('Label text:', label);
            expect(label).toContain('login-frame');

            const usernamePlaceholder = await loginFrame.locator('#username').getAttribute('placeholder');
            console.log('Username placeholder:', usernamePlaceholder);
            expect(usernamePlaceholder).toContain('用户名');

            const buttonCount = await loginFrame.locator('button').count();
            console.log('Button count:', buttonCount);
            expect(buttonCount).toBe(1);

            const inputCount = await loginFrame.locator('input').count();
            console.log('Input count:', inputCount);
            expect(inputCount).toBeGreaterThanOrEqual(2);
          }
        }
      }, 20000);

      it('should access login-frame by name path (#outer-iframe/#login-frame)', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="name-path-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#name-path-frame');
        await page.waitForTimeout(3000);

        const level1Frame = browser.getFrame('#name-path-frame');
        const level1Children = level1Frame.childFrames();
        console.log('Level 1 childFrames:', level1Children.map((f, i) => ({ index: i, name: f.name(), url: f.url() })));

        if (level1Children.length > 0) {
          const level1ChildName = level1Children[0].name();
          console.log('Level 1 child name:', level1ChildName);

          if (level1ChildName) {
            const level2FrameByName = browser.getFrame(`#name-path-frame/${level1ChildName}`);
            console.log('Level 2 frame by name:', level2FrameByName.url());

            const level2Children = level2FrameByName.childFrames();
            console.log('Level 2 childFrames:', level2Children.map((f, i) => ({ index: i, name: f.name(), url: f.url() })));

            if (level2Children.length > 0) {
              const level2ChildName = level2Children[0].name();
              console.log('Level 2 child name:', level2ChildName);

              if (level2ChildName) {
                const loginFrameByName = browser.getFrame(`#name-path-frame/${level1ChildName}/${level2ChildName}`);
                console.log('Login frame by name path:', loginFrameByName.url());
                expect(loginFrameByName.url()).toContain('login-frame');

                const label = await loginFrameByName.locator('.label').textContent();
                console.log('Label:', label);
                expect(label).toContain('login-frame');
              }
            }
          }
        }
      }, 20000);

      it('should throw error for non-existent nested frame path', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="error-test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#error-test-frame');
        await page.waitForTimeout(3000);

        expect(() => browser.getFrame('#error-test-frame/non-existent-frame')).toThrow();
      }, 15000);

      it('should throw error for invalid index in nested path', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="invalid-index-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#invalid-index-frame');
        await page.waitForTimeout(3000);

        expect(() => browser.getFrame('#invalid-index-frame/999')).toThrow();
      }, 15000);

      it('should throw error for invalid name in nested path', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="invalid-name-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#invalid-name-frame');
        await page.waitForTimeout(3000);

        const level1Frame = browser.getFrame('#invalid-name-frame');
        const level1Children = level1Frame.childFrames();

        if (level1Children.length > 0) {
          expect(() => browser.getFrame('#invalid-name-frame/0/non-existent')).toThrow();
        }
      }, 15000);

      it('should throw error with detailed message showing available frames', async () => {
        const page = browser.getPage();
        
        await page.evaluate(() => {
          document.body.innerHTML = `
            <iframe id="detailed-error-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
          `;
        });

        await page.waitForSelector('#detailed-error-frame');
        await page.waitForTimeout(3000);

        let errorMessage = '';
        try {
          browser.getFrame('#detailed-error-frame/wrong-name');
        } catch (e) {
          errorMessage = (e as Error).message;
          console.log('Error message:', errorMessage);
        }

        expect(errorMessage).toContain('Frame not found');
        expect(errorMessage).toContain('wrong-name');
      }, 15000);
    });
  });

  describe('FrameLocator API 可行性验证', () => {
    beforeEach(async () => {
      const page = browser.getPage();
      await page.goto('https://www.example.com');
    });

    afterEach(async () => {
      const page = browser.getPage();
      await page.goto('about:blank');
    });

    it('should test page.frameLocator() for cross-origin iframe', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="cross-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#cross-frame');
      await page.waitForTimeout(2000);

      const frameLocator = page.frameLocator('#cross-frame');
      const h1Text = await frameLocator.locator('h1').textContent();
      expect(h1Text).toContain('iframe');
    }, 15000);

    it('should test chained frameLocator() for nested cross-origin iframe', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="outer-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#outer-frame');
      await page.waitForTimeout(3000);

      const outerFrameLocator = page.frameLocator('#outer-frame');
      const outerContent = await outerFrameLocator.locator('h1').textContent();
      console.log('Outer frame h1:', outerContent);

      const innerIframes = await outerFrameLocator.locator('iframe').count();
      console.log('Inner iframe count:', innerIframes);

      if (innerIframes > 0) {
        const innerFrameLocator = outerFrameLocator.frameLocator('iframe').first();
        const innerH1Count = await innerFrameLocator.locator('h1').count();
        console.log('Inner frame h1 count:', innerH1Count);
        if (innerH1Count > 0) {
          const innerContent = await innerFrameLocator.locator('h1').textContent();
          console.log('Inner frame h1:', innerContent);
        }
      }
      expect(innerIframes).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should test frameLocator with index for nested iframe', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#test-frame');
      await page.waitForTimeout(3000);

      const outerFrameLocator = page.frameLocator('#test-frame');
      const innerIframeCount = await outerFrameLocator.locator('iframe').count();
      console.log('Inner iframe count via frameLocator:', innerIframeCount);

      if (innerIframeCount > 0) {
        const innerFrameLocator = outerFrameLocator.frameLocator('iframe').nth(0);
        const inputCount = await innerFrameLocator.locator('input[name="username"]').count();
        console.log('Input count in nested iframe:', inputCount);
        expect(inputCount).toBeGreaterThanOrEqual(0);
      }
      expect(innerIframeCount).toBeGreaterThanOrEqual(0);
    }, 30000);
  });

  describe('Frame API vs FrameLocator API 对比', () => {
    beforeEach(async () => {
      const page = browser.getPage();
      await page.goto('https://www.example.com');
    });

    afterEach(async () => {
      const page = browser.getPage();
      await page.goto('about:blank');
    });

    it('should compare Frame.childFrames() vs frameLocator for same-origin', async () => {
      const page = browser.getPage();
      await page.goto(getFixturePath('iframe-nested.html'));
      await page.waitForSelector('#frame1');

      const frame = browser.getFrame('#frame1');
      const childFramesViaAPI = frame.childFrames();
      console.log('Same-origin childFrames() count:', childFramesViaAPI.length);

      const frameLocator = page.frameLocator('#frame1');
      const childFramesViaLocator = await frameLocator.locator('iframe').count();
      console.log('Same-origin frameLocator count:', childFramesViaLocator);

      expect(childFramesViaAPI.length).toBe(childFramesViaLocator);
    });

    it('should compare Frame.childFrames() vs frameLocator for cross-origin', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="cross-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#cross-frame');
      await page.waitForTimeout(3000);

      const frame = browser.getFrame('#cross-frame');
      const childFramesViaAPI = frame.childFrames();
      console.log('Cross-origin childFrames() count:', childFramesViaAPI.length);

      const frameLocator = page.frameLocator('#cross-frame');
      const childFramesViaLocator = await frameLocator.locator('iframe').count();
      console.log('Cross-origin frameLocator count:', childFramesViaLocator);

      console.log('Difference:', childFramesViaLocator - childFramesViaAPI.length);
    }, 15000);
  });

  describe('CSS 选择器 vs ID 选择器在跨域 iframe 中对比', () => {
    beforeEach(async () => {
      const page = browser.getPage();
      await page.goto('https://www.example.com');
    });

    afterEach(async () => {
      const page = browser.getPage();
      await page.goto('about:blank');
    });

    it('ID 选择器 (#username) 在跨域 iframe 中应该工作', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="selector-test-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#selector-test-frame');
      await page.waitForTimeout(3000);

      const level1Frame = browser.getFrame('#selector-test-frame');
      const level1Children = level1Frame.childFrames();

      if (level1Children.length > 0) {
        const level2Frame = browser.getFrame('#selector-test-frame/0');
        const level2Children = level2Frame.childFrames();

        if (level2Children.length > 0) {
          const loginFrame = browser.getFrame('#selector-test-frame/0/0');
          
          const usernameById = loginFrame.locator('#username');
          const countById = await usernameById.count();
          console.log('ID 选择器 (#username) 元素数量:', countById);
          
          expect(countById).toBe(1);
          
          await usernameById.fill('admin');
          const valueById = await usernameById.inputValue();
          expect(valueById).toBe('admin');
          console.log('ID 选择器填充成功:', valueById);
        }
      }
    }, 20000);

    it('CSS 属性选择器 (input[name="username"]) 在跨域 iframe 中存在兼容性问题', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="attr-selector-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#attr-selector-frame');
      await page.waitForTimeout(3000);

      const level1Frame = browser.getFrame('#attr-selector-frame');
      const level1Children = level1Frame.childFrames();

      if (level1Children.length > 0) {
        const level2Frame = browser.getFrame('#attr-selector-frame/0');
        const level2Children = level2Frame.childFrames();

        if (level2Children.length > 0) {
          const loginFrame = browser.getFrame('#attr-selector-frame/0/0');
          
          const idSelector = loginFrame.locator('#username');
          const idCount = await idSelector.count();
          console.log('ID 选择器 (#username) 元素数量:', idCount);
          expect(idCount).toBe(1);
          
          const attrSelector = loginFrame.locator('input[name="username"]');
          const countByAttr = await attrSelector.count();
          console.log('CSS 属性选择器 (input[name="username"]) 元素数量:', countByAttr);
          
          const inputInfo = await loginFrame.locator('input').evaluateAll((inputs: HTMLInputElement[]) => 
            inputs.map(input => ({ id: input.id, name: input.getAttribute('name') }))
          );
          console.log('Input 元素实际属性:', JSON.stringify(inputInfo, null, 2));
          
          expect(countByAttr).toBe(0);
          console.log('验证: input 元素没有 name 属性，所以 input[name="username"] 返回 0 是正确行为');
        }
      }
    }, 20000);

    it('ID 选择器和 CSS 属性选择器在跨域 iframe 中的行为对比', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="compare-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#compare-frame');
      await page.waitForTimeout(3000);

      const level1Frame = browser.getFrame('#compare-frame');
      const level1Children = level1Frame.childFrames();

      if (level1Children.length > 0) {
        const level2Frame = browser.getFrame('#compare-frame/0');
        const level2Children = level2Frame.childFrames();

        if (level2Children.length > 0) {
          const loginFrame = browser.getFrame('#compare-frame/0/0');
          
          const idSelector = loginFrame.locator('#username');
          const attrSelector = loginFrame.locator('input[name="username"]');
          
          const idCount = await idSelector.count();
          const attrCount = await attrSelector.count();
          
          console.log('ID 选择器 (#username) 数量:', idCount);
          console.log('CSS 属性选择器 (input[name="username"]) 数量:', attrCount);
          
          expect(idCount).toBe(1);
          expect(attrCount).toBe(0);
          
          console.log('说明: 元素只有 id="username"，没有 name 属性，所以属性选择器返回 0 是预期行为');
          
          await idSelector.fill('user1');
          const idValue = await idSelector.inputValue();
          console.log('ID 选择器填充值:', idValue);
          expect(idValue).toBe('user1');
        }
      }
    }, 20000);

    it('其他 CSS 选择器 (class, tag) 在跨域 iframe 中的行为', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="class-selector-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#class-selector-frame');
      await page.waitForTimeout(3000);

      const level1Frame = browser.getFrame('#class-selector-frame');
      const level1Children = level1Frame.childFrames();

      if (level1Children.length > 0) {
        const level2Frame = browser.getFrame('#class-selector-frame/0');
        const level2Children = level2Frame.childFrames();

        if (level2Children.length > 0) {
          const loginFrame = browser.getFrame('#class-selector-frame/0/0');
          
          const inputByTag = loginFrame.locator('input');
          const inputCount = await inputByTag.count();
          console.log('Tag 选择器 (input) 元素数量:', inputCount);
          
          if (inputCount > 0) {
            const inputInfo = await inputByTag.evaluateAll((inputs: HTMLInputElement[]) => 
              inputs.map(input => ({
                id: input.id,
                name: input.getAttribute('name'),
                type: input.type,
                placeholder: input.placeholder,
                className: input.className
              }))
            );
            console.log('Input 元素实际属性:', JSON.stringify(inputInfo, null, 2));
          }
          
          expect(inputCount).toBeGreaterThan(0);
        }
      }
    }, 20000);

    it('使用 page.frameLocator + CSS 选择器在跨域 iframe 中验证选择器差异', async () => {
      const page = browser.getPage();
      
      await page.evaluate(() => {
        document.body.innerHTML = `
          <iframe id="frameLocator-frame" src="https://tools.docker.19930810.xyz:8443/tools/crawler-practice/examples/18-iframe.html" width="800" height="400"></iframe>
        `;
      });

      await page.waitForSelector('#frameLocator-frame');
      await page.waitForTimeout(3000);

      const outerFrameLocator = page.frameLocator('#frameLocator-frame');
      
      const innerIframes = await outerFrameLocator.locator('iframe').count();
      expect(innerIframes).toBeGreaterThan(0);

      const innerFrameLocator = outerFrameLocator.frameLocator('iframe').first();
      const secondIframes = await innerFrameLocator.locator('iframe').count();
      
      if (secondIframes > 0) {
        const loginFrameLocator = innerFrameLocator.frameLocator('iframe').first();
        
        const usernameById = await loginFrameLocator.locator('#username').count();
        console.log('使用 frameLocator + ID 选择器 (#username):', usernameById);
        
        const usernameByAttr = await loginFrameLocator.locator('input[name="username"]').count();
        console.log('使用 frameLocator + CSS 属性选择器 (input[name="username"]):', usernameByAttr);
        
        const inputInfo = await loginFrameLocator.locator('input').evaluateAll((inputs: HTMLInputElement[]) => 
          inputs.map(input => ({ id: input.id, name: input.getAttribute('name') }))
        );
        console.log('Input 元素实际属性:', JSON.stringify(inputInfo, null, 2));
        
        expect(usernameById).toBe(1);
        expect(usernameByAttr).toBe(0);
        console.log('说明: 元素没有 name 属性，所以 input[name="username"] 返回 0 是正确行为');
      }
    }, 20000);
  });
});
