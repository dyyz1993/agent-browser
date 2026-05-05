import { execSync } from 'child_process';

const CASES = [
  'AC-001','AC-002','AC-003','AC-004','AC-005','AC-006','AC-007','AC-008','AC-009','AC-010',
  'AU-002','AU-007','AU-008','AU-011',
  'EC-002','EC-012','EC-020','EC-021','EC-022','EC-029',
  'ED-002','ED-005','ED-020',
  'FN-002','FN-003','FN-005','FN-007','FN-008',
  'FN-010','FN-015','FN-018',
  'FW-001','FW-002','FW-003','FW-004','FW-005','FW-006','FW-007','FW-008','FW-009',
  'FW-011','FW-012','FW-013','FW-014','FW-015','FW-016','FW-017','FW-018','FW-019','FW-020',
  'GV-002','GV-003','GV-005','GV-013',
  'HE-002','HE-005',
];

const AB = 'agent-browser';
const env = { ...process.env, AGENT_BROWSER_EXECUTABLE_PATH: '/Applications/Chromium.app/Contents/MacOS/Chromium' };

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', timeout: 30000, env });
  } catch (e) {
    return e.stdout || e.message;
  }
}

let pass = 0, fail = 0, partial = 0, error = 0;
const results = [];

console.log(`${'CASE_ID'.padEnd(10)} | ${'STATUS'.padEnd(8)} | ${'FIELDS'.padEnd(6)} | NOTES`);
console.log(`${'----------'.padEnd(10)}-+-${'--------'.padEnd(8)}-+-${'------'.padEnd(6)}-+-${' '.repeat(50)}`);

for (const caseId of CASES) {
  const url = `http://localhost:3000/crawler-practice/dynamic/${caseId}`;

  // Open page
  const openOut = run(`${AB} open "${url}"`);

  // Wait for dynamic content
  run('sleep 2');

  // Evaluate content
  const evalScript = `(() => {
    const title = document.querySelector('.detail-title, h1, h2, [class*=title]')?.textContent?.trim() || '';
    const fields = document.querySelectorAll('.detail-field, [class*=field], [class*=info] dd, [class*=meta] span, [class*=prop], [class*=spec], [class*=param], [class*=attr], [class*=detail]');
    const bodyLen = document.body.textContent.length;
    const hasContent = bodyLen > 200;
    const isErr = document.body.textContent.includes('模板渲染错误');
    return JSON.stringify({ t: title.substring(0,50), f: fields.length, b: bodyLen, h: hasContent ? 1 : 0, e: isErr ? 1 : 0 });
  })()`;

  const raw = run(`${AB} eval "${evalScript.replace(/"/g, '\\"')}"`);

  // Parse JSON from output
  let data;
  try {
    // Extract JSON from output (may have CLI prefix text)
    const jsonMatch = raw.match(/\{[^}]+\}/);
    if (jsonMatch) {
      data = JSON.parse(jsonMatch[0]);
    } else {
      // Try simpler eval for body length
      const bl = run(`${AB} eval "document.body.textContent.length"`);
      const num = bl.match(/\d+/);
      const bodyLen = num ? parseInt(num[0]) : 0;
      if (bodyLen > 200) {
        data = { t: '(parse failed)', f: -1, b: bodyLen, h: 1, e: 0 };
      } else {
        data = { t: '(parse failed)', f: 0, b: bodyLen, h: 0, e: 0 };
      }
    }
  } catch (e) {
    data = { t: '(eval error)', f: 0, b: 0, h: 0, e: 0 };
  }

  let status, notes;
  const titleDisp = (data.t || '').substring(0, 40);

  if (data.e === 1) {
    status = 'ERROR';
    notes = 'Template render error';
    error++;
  } else if (data.h === 1 && data.f > 0) {
    status = 'PASS';
    notes = titleDisp;
    pass++;
  } else if (data.h === 1 && data.f <= 0) {
    status = 'PARTIAL';
    notes = `content ok, no matched fields | ${titleDisp}`;
    partial++;
  } else {
    status = 'FAIL';
    notes = `bodyLen=${data.b} | ${titleDisp}`;
    fail++;
  }

  const fieldsStr = data.f === -1 ? '?' : String(data.f);
  console.log(`${caseId.padEnd(10)} | ${status.padEnd(8)} | ${fieldsStr.padEnd(6)} | ${notes}`);
  results.push({ caseId, status, fields: fieldsStr, notes });
}

console.log('');
console.log('=== SUMMARY ===');
console.log(`PASS:    ${pass}`);
console.log(`PARTIAL: ${partial}`);
console.log(`FAIL:    ${fail}`);
console.log(`ERROR:   ${error}`);
console.log(`TOTAL:   ${results.length}`);
