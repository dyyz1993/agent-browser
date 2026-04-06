import { describe, it, expect, beforeAll } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

describe('injectFocusListener - browser.ts method', () => {
  let browserCode: string;

  beforeAll(() => {
    browserCode = fs.readFileSync(path.join(__dirname, '../browser.ts'), 'utf-8');
  });

  it('has injectFocusListener method', () => {
    expect(browserCode).toContain('injectFocusListener');
  });

  it('calls exposeFunction with __agentBrowserInputEvent', () => {
    expect(browserCode).toContain('exposeFunction');
    expect(browserCode).toContain('__agentBrowserInputEvent');
  });

  it('calls addInitScript to inject into future navigations', () => {
    expect(browserCode).toContain('addInitScript');
  });

  it('also calls evaluate to inject into current page (Bug 2 fix)', () => {
    // Must have BOTH addInitScript AND evaluate for immediate injection
    const ifMatch = browserCode.match(/async injectFocusListener[\s\S]*?^  \}/m);
    expect(ifMatch).not.toBeNull();
    const block = ifMatch![0];
    // Should contain evaluate call (for current page)
    expect(block).toMatch(/page\.evaluate\(/);
  });

  it('injected script has focus listener for INPUT elements', () => {
    expect(browserCode).toContain("addEventListener('focus'");
    expect(browserCode).toContain("'INPUT'");
  });

  it('injected script has focus listener for TEXTAREA elements', () => {
    expect(browserCode).toContain("'TEXTAREA'");
  });

  it('injected script has focus listener for contentEditable elements', () => {
    expect(browserCode).toContain('isContentEditable');
  });

  it('injected script sends input_focused event on focus', () => {
    expect(browserCode).toContain("type: 'input_focused'");
  });

  it('included script sends input_value event on input', () => {
    expect(browserCode).toContain("type: 'input_value'");
  });

  it('injected script sends input_blur event on blur', () => {
    expect(browserCode).toContain("type: 'input_blur'");
  });

  it('injected script uses capture phase (third param true)', () => {
    // Find the addEventListener calls and check they end with }, true)
    const focusMatch = browserCode.match(/addEventListener\('focus'[\s\S]*?\},\s*true\)/);
    expect(focusMatch).not.toBeNull();
    const inputMatch = browserCode.match(/addEventListener\('input'[\s\S]*?\},\s*true\)/);
    expect(inputMatch).not.toBeNull();
    const blurMatch = browserCode.match(/addEventListener\('blur'[\s\S]*?\},\s*true\)/);
    expect(blurMatch).not.toBeNull();
  });

  it('has double-injection guard via __agentBrowserListenerInjected flag', () => {
    expect(browserCode).toContain('__agentBrowserListenerInjected');
    // Should check guard before adding listeners
    const guardMatch = browserCode.match(/__agentBrowserListenerInjected.*?return/);
    expect(guardMatch).not.toBeNull();
  });

  it('guards against non-input element focus (filters tag)', () => {
    // The focus handler should check tag before sending event
    const focusBlock = browserCode.match(
      /addEventListener\('focus'[\s\S]*?(?:window\.__agentBrowserInputEvent|catch)/
    );
    expect(focusBlock).not.toBeNull();
    const block = focusBlock![0];
    // Should have return statement for non-input tags
    expect(block).toContain('return');
  });

  it('handles missing page gracefully (early return if !page)', () => {
    const methodMatch = browserCode.match(/async injectFocusListener[\s\S]*?^  \}/m);
    expect(methodMatch).not.toBeNull();
    const block = methodMatch![0];
    expect(block).toContain('if (!page) return');
  });

  it('wraps callback invocations in try-catch', () => {
    // Each __agentBrowserInputEvent call should be in try-catch
    const calls = browserCode.match(/__agentBrowserInputEvent/g);
    expect(calls).toBeTruthy();
    // Should have catch blocks
    expect(browserCode).toContain('catch(ex)');
  });
});

describe('injectFocusListener - script content correctness', () => {
  let browserCode: string;

  beforeAll(() => {
    browserCode = fs.readFileSync(path.join(__dirname, '../browser.ts'), 'utf-8');
  });

  it('focus event captures tag, inputType, value, placeholder, id', () => {
    // The injected script uses plain JS object literals (not Zod schemas)
    // Check that the focus handler includes these property names
    const focusHandler = browserCode.match(
      /addEventListener\('focus'[\s\S]*?window\.__agentBrowserInputEvent[\s\S]*?\},\s*true\)/
    );
    expect(focusHandler).not.toBeNull();
    const block = focusHandler![0];
    expect(block).toContain('tag:');
    expect(block).toContain('inputType:');
    expect(block).toContain("value: typeof el.value === 'string'");
    expect(block).toContain('placeholder:');
    expect(block).toContain('id:');
  });

  it('input event captures text value', () => {
    // Find input event handler block
    const inputEvt = browserCode.match(/addEventListener\('input'[\s\S]*?\},\s*true\)/);
    expect(inputEvt).not.toBeNull();
    expect(inputEvt![0]).toContain("type: 'input_value'");
    expect(inputEvt![0]).toContain('text:');
  });

  it('blur event sends minimal payload (just type)', () => {
    const blurEvt = browserCode.match(/addEventListener\('blur'[\s\S]*?\},\s*true\)/);
    expect(blurEvt).not.toBeNull();
    expect(blurEvt![0]).toContain("{ type: 'input_blur' }");
  });

  it('script is wrapped in IIFE to avoid scope pollution', () => {
    expect(browserCode).toMatch(/\(function\(\)\s*\{/);
    expect(browserCode).toMatch(/\}\)\(\)/);
  });
});
