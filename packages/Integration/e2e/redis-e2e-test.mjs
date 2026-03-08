/**
 * Redis Cross-Server Cache Invalidation E2E Test
 *
 * Tests that editing a record via MJAPI-A causes the change to propagate
 * to MJAPI-B via Redis pub/sub cache invalidation.
 */
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const SCREENSHOTS_DIR = '/workspace/MJ/docs/plans/redis-e2e/screenshots';
const EVIDENCE_DIR = '/workspace/MJ/docs/plans/redis-e2e';

const MJAPI_A = 'http://localhost:4000';
const MJAPI_B = 'http://localhost:4002';
const MJEXPLORER_A = 'http://localhost:4200';

const AUTH_EMAIL = 'da-robot-tester@bluecypress.io';
const AUTH_PASSWORD = '!!SoDamnSecureItHurt$';

let capturedAuthHeader = null;

async function screenshot(page, name) {
  const path = join(SCREENSHOTS_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log(`  Screenshot: ${name}.png`);
}

async function login(page) {
  console.log('Logging in via Auth0...');
  page.on('request', request => {
    const auth = request.headers()['authorization'];
    if (auth && auth.startsWith('Bearer ')) capturedAuthHeader = auth;
  });

  await page.goto(MJEXPLORER_A, { waitUntil: 'networkidle', timeout: 30000 });
  await screenshot(page, '00-login-page');

  const bodyText = await page.evaluate(() => document.body.innerText);
  if (!bodyText.includes('Log In') && !bodyText.includes('Log in')) {
    console.log('  May already be logged in');
    return true;
  }

  const loginBtn = page.locator('button, a').filter({ hasText: /log.?in/i }).first();
  await loginBtn.click();
  await page.waitForTimeout(3000);
  await screenshot(page, '01-auth0-page');

  const emailInput = page.locator('input[name="email"], input[type="email"], input[name="username"]').first();
  await emailInput.waitFor({ timeout: 15000 });
  await emailInput.fill(AUTH_EMAIL);

  const continueBtn = page.locator('button[type="submit"], button').filter({ hasText: /continue|next/i }).first();
  if (await continueBtn.isVisible()) {
    await continueBtn.click();
    await page.waitForTimeout(2000);
  }

  const passwordInput = page.locator('input[name="password"], input[type="password"]').first();
  await passwordInput.waitFor({ timeout: 15000 });
  await passwordInput.fill(AUTH_PASSWORD);
  await screenshot(page, '02-auth0-credentials');

  const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /continue|log.?in|sign.?in|submit/i }).first();
  await submitBtn.click();

  await page.waitForURL(/localhost:4200/, { timeout: 30000 });
  await page.waitForTimeout(5000);
  await screenshot(page, '03-logged-in');
  console.log(`  Login complete, URL: ${page.url()}`);
  console.log(`  Auth header captured: ${capturedAuthHeader ? 'YES' : 'NO'}`);
  return true;
}

async function gql(url, query, token) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ query }),
  });
  return response.json();
}

function parseRunViewResults(data) {
  // RunDynamicView returns Results as array of { Data: "JSON_STRING" }
  if (!data?.RunDynamicView?.Success) return [];
  const rows = data.RunDynamicView.Results || [];
  return rows.map(row => JSON.parse(row.Data));
}

function buildViewQuery(entityName, filter, fields, maxRows) {
  return `{
    RunDynamicView(input: {
      EntityName: "${entityName}",
      ExtraFilter: "${filter}",
      OrderBy: "Name",
      Fields: [${fields.map(f => `"${f}"`).join(', ')}],
      MaxRows: ${maxRows}
    }) {
      Results { Data }
      Success
      ErrorMessage
      RowCount
    }
  }`;
}

async function waitForAuth(page) {
  if (!capturedAuthHeader) {
    console.log('  Waiting for auth header...');
    await page.goto(MJEXPLORER_A, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(3000);
    if (!capturedAuthHeader) {
      await page.reload({ waitUntil: 'networkidle', timeout: 15000 });
      await page.waitForTimeout(3000);
    }
  }
  return capturedAuthHeader;
}

async function runTest() {
  console.log('=== Redis Cross-Server Cache Invalidation E2E Test ===\n');
  mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser = await chromium.launch({ chromiumSandbox: false, headless: true });
  const results = { infrastructure: {}, testAtoB: {}, testBtoA: {}, errors: [] };

  try {
    // Phase 1: Verify infrastructure
    console.log('Phase 1: Verifying infrastructure...');
    const [respA, respB] = await Promise.all([
      fetch(MJAPI_A).then(r => ({ status: r.status, ok: true })).catch(e => ({ ok: false, error: e.message })),
      fetch(MJAPI_B).then(r => ({ status: r.status, ok: true })).catch(e => ({ ok: false, error: e.message })),
    ]);
    results.infrastructure = { mjapiA: respA, mjapiB: respB };
    console.log(`  MJAPI-A: ${respA.ok ? 'OK' : 'FAIL'} (${respA.status})`);
    console.log(`  MJAPI-B: ${respB.ok ? 'OK' : 'FAIL'} (${respB.status})`);

    // Phase 3: Login
    console.log('\nPhase 3: Login to MJExplorer-A...');
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage();
    await login(page);

    const authToken = await waitForAuth(page);
    if (!authToken) throw new Error('Could not capture auth token');
    console.log(`  Auth token: ${authToken.substring(0, 30)}...`);

    // Query AI Models
    console.log('\n  Querying AI Models via MJAPI-A...');
    const modelsResult = await gql(MJAPI_A, buildViewQuery('MJ: AI Models', '', ['ID', 'Name', 'Description'], 10), authToken);

    if (modelsResult?.errors) {
      console.log('  Errors:', JSON.stringify(modelsResult.errors[0]?.message));
      throw new Error('Failed to query AI Models: ' + modelsResult.errors[0]?.message);
    }

    const models = parseRunViewResults(modelsResult?.data);
    console.log(`  Found ${models.length} AI Models`);

    const testRecord = models.find(m => m.Name && m.ID);
    if (!testRecord) throw new Error('No AI Model records found');

    const originalDescription = testRecord.Description || '';
    console.log(`  Selected: "${testRecord.Name}" (ID: ${testRecord.ID})`);
    console.log(`  Original Description: "${originalDescription.substring(0, 100)}"`);

    // ==== Test A→B ====
    console.log('\n  === Test A→B: Edit via MJAPI-A, verify on MJAPI-B ===');
    const testMarkerA = ` [Redis E2E Test A-B ${new Date().toISOString().substring(0, 19)}]`;
    const newDescA = originalDescription + testMarkerA;

    const updateA = await gql(MJAPI_A, `mutation {
      UpdateMJAIModel(input: { ID: "${testRecord.ID}", Description: ${JSON.stringify(newDescA)} }) {
        ID Name Description
      }
    }`, authToken);

    if (updateA?.errors) {
      console.log('  Update errors:', JSON.stringify(updateA.errors[0]?.message));
      results.testAtoB.updateSuccess = false;
      results.errors.push('Update A failed: ' + updateA.errors[0]?.message);
    } else if (updateA?.data?.UpdateMJAIModel) {
      console.log('  Record updated on MJAPI-A');
      results.testAtoB.updateSuccess = true;

      console.log('  Waiting 3s for Redis propagation...');
      await new Promise(r => setTimeout(r, 3000));

      // Verify on MJAPI-B
      console.log('  Querying MJAPI-B to verify...');
      const verifyB = await gql(MJAPI_B,
        buildViewQuery('MJ: AI Models', `ID='${testRecord.ID}'`, ['ID', 'Name', 'Description'], 1),
        authToken);

      const verifyDataB = parseRunViewResults(verifyB?.data);
      if (verifyDataB.length > 0) {
        const desc = verifyDataB[0].Description || '';
        const propagated = desc.includes('[Redis E2E Test A-B');
        results.testAtoB.verifySuccess = propagated;
        results.testAtoB.verifiedDescription = desc;
        results.testAtoB.recordId = testRecord.ID;
        results.testAtoB.recordName = testRecord.Name;
        console.log(`  MJAPI-B Description: "${desc.substring(0, 150)}"`);
        console.log(`  ${propagated ? '✅ PASS' : '❌ FAIL'}: Change ${propagated ? 'propagated' : 'NOT propagated'} to MJAPI-B`);
      } else {
        console.log('  ❌ No results from MJAPI-B verify query');
        results.testAtoB.verifySuccess = false;
      }
    }

    // ==== Test B→A ====
    console.log('\n  === Test B→A: Edit via MJAPI-B, verify on MJAPI-A ===');
    const testMarkerB = ` [Redis E2E Test B-A ${new Date().toISOString().substring(0, 19)}]`;
    const newDescB = originalDescription + testMarkerB;

    const updateB = await gql(MJAPI_B, `mutation {
      UpdateMJAIModel(input: { ID: "${testRecord.ID}", Description: ${JSON.stringify(newDescB)} }) {
        ID Name Description
      }
    }`, authToken);

    if (updateB?.errors) {
      console.log('  Update errors:', JSON.stringify(updateB.errors[0]?.message));
      results.testBtoA.updateSuccess = false;
      results.errors.push('Update B failed: ' + updateB.errors[0]?.message);
    } else if (updateB?.data?.UpdateMJAIModel) {
      console.log('  Record updated on MJAPI-B');
      results.testBtoA.updateSuccess = true;

      console.log('  Waiting 3s for Redis propagation...');
      await new Promise(r => setTimeout(r, 3000));

      // Verify on MJAPI-A
      console.log('  Querying MJAPI-A to verify...');
      const verifyA = await gql(MJAPI_A,
        buildViewQuery('MJ: AI Models', `ID='${testRecord.ID}'`, ['ID', 'Name', 'Description'], 1),
        authToken);

      const verifyDataA = parseRunViewResults(verifyA?.data);
      if (verifyDataA.length > 0) {
        const desc = verifyDataA[0].Description || '';
        const propagated = desc.includes('[Redis E2E Test B-A');
        results.testBtoA.verifySuccess = propagated;
        results.testBtoA.verifiedDescription = desc;
        console.log(`  MJAPI-A Description: "${desc.substring(0, 150)}"`);
        console.log(`  ${propagated ? '✅ PASS' : '❌ FAIL'}: Change ${propagated ? 'propagated' : 'NOT propagated'} to MJAPI-A`);
      } else {
        console.log('  ❌ No results from MJAPI-A verify query');
        results.testBtoA.verifySuccess = false;
      }
    }

    // ==== Revert ====
    console.log('\n  === Reverting record ===');
    const revert = await gql(MJAPI_A, `mutation {
      UpdateMJAIModel(input: { ID: "${testRecord.ID}", Description: ${JSON.stringify(originalDescription)} }) {
        ID Name Description
      }
    }`, authToken);

    results.reverted = !!revert?.data?.UpdateMJAIModel;
    if (results.reverted) {
      console.log('  Record reverted to original description');
      await new Promise(r => setTimeout(r, 2000));

      const revertVerify = await gql(MJAPI_B,
        buildViewQuery('MJ: AI Models', `ID='${testRecord.ID}'`, ['ID', 'Description'], 1),
        authToken);
      const rd = parseRunViewResults(revertVerify?.data);
      if (rd.length > 0) {
        const clean = !(rd[0].Description || '').includes('[Redis E2E Test');
        results.revertPropagated = clean;
        console.log(`  Revert propagated to MJAPI-B: ${clean ? 'YES' : 'NO'}`);
      }
    } else {
      console.log('  ❌ Revert failed:', JSON.stringify(revert).substring(0, 200));
    }

    // Final screenshot
    await page.goto(MJEXPLORER_A, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    await screenshot(page, '09-final-state');
    await context.close();

  } catch (error) {
    console.error('Test error:', error.message);
    results.errors.push(error.message);
  } finally {
    await browser.close();
  }

  writeFileSync(join(EVIDENCE_DIR, 'test-results.json'), JSON.stringify(results, null, 2));

  console.log('\n=== Test Summary ===');
  console.log(`Infrastructure: MJAPI-A=${results.infrastructure.mjapiA?.ok}, MJAPI-B=${results.infrastructure.mjapiB?.ok}`);
  console.log(`Test A→B: Update=${results.testAtoB.updateSuccess}, Verify=${results.testAtoB.verifySuccess}`);
  console.log(`Test B→A: Update=${results.testBtoA.updateSuccess}, Verify=${results.testBtoA.verifySuccess}`);
  console.log(`Reverted: ${results.reverted}`);
  if (results.errors.length > 0) console.log(`Errors: ${results.errors.join('; ')}`);

  return results;
}

runTest().then(results => {
  const allPassed = results.testAtoB?.verifySuccess && results.testBtoA?.verifySuccess;
  console.log(`\n${allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED'}`);
  process.exit(allPassed ? 0 : 1);
}).catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
