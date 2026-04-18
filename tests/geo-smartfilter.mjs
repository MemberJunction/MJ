import { chromium } from 'playwright';
const b = await chromium.launch({headless:true});
const p = await (await b.newContext({viewport:{width:1400,height:900}})).newPage();
const cdp = await p.context().newCDPSession(p);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

const responses = [];
p.on('response', async resp => {
    if (resp.url().includes('localhost:4000') && resp.request().method() === 'POST') {
        try {
            const json = await resp.json();
            if (json?.errors) {
                responses.push({ errors: json.errors.map(e => e.message.substring(0, 300)) });
            }
            if (json?.data?.UpdateMJUserView) {
                responses.push({ updateResult: JSON.stringify(json.data.UpdateMJUserView).substring(0, 300) });
            }
        } catch {}
    }
});

try {
    await p.goto('http://localhost:4201', {waitUntil:'networkidle',timeout:30000});
    await p.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach(e => e.remove()));
    await p.locator('button:has-text("Log in")').first().click({force:true});
    await p.waitForTimeout(5000);
    await p.locator('input[name="username"], input[name="email"]').first().fill('da-robot-tester@bluecypress.io');
    await p.locator('input[name="password"], input[type="password"]').first().fill('!!SoDamnSecureItHurt$');
    await p.locator('button[type="submit"]').first().click();
    await p.waitForTimeout(15000);

    // Navigate to Test Organizations
    await p.locator('text=Data Explorer').first().click();
    await p.waitForTimeout(4000);
    await p.locator('a:has-text("Data"), span:has-text("Data")').first().click();
    await p.waitForTimeout(3000);
    await p.locator('text=Admin (Deprecated)').first().click();
    await p.waitForTimeout(3000);
    for(let i=0;i<10;i++){await p.mouse.wheel(0,400);await p.waitForTimeout(300);}
    await p.evaluate(() => {
        for (const el of document.querySelectorAll('*')) {
            if (el.children.length === 0 && el.textContent?.trim() === 'Test Organizations') {
                el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
                return;
            }
        }
    });
    await p.waitForTimeout(12000);

    // Try Smart Filter
    console.log('Typing smart filter...');
    const filterInput = p.locator('input[placeholder*="Filter"], input[placeholder*="press /"]').first();
    if (await filterInput.isVisible({timeout:5000}).catch(()=>false)) {
        await filterInput.click();
        await filterInput.fill('only California organizations');
        await p.keyboard.press('Enter');
        console.log('Submitted, waiting...');
        await p.waitForTimeout(15000);
        
        console.log('Responses captured:', JSON.stringify(responses.slice(-3), null, 2));
    } else {
        console.log('Filter input not found');
    }
} catch(e) { console.error('Error:', e.message); }
finally { await b.close(); console.log('Done'); }
