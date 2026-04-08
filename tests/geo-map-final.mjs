import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOTS = path.join(__dirname, '..', 'reports', 'geo-features', 'images');

const b = await chromium.launch({headless:true});
const ctx = await b.newContext({viewport:{width:1400,height:900}});
const p = await ctx.newPage();
const cdp = await p.context().newCDPSession(p);
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });

try {
    await p.goto('http://localhost:4201', {waitUntil:'networkidle',timeout:30000});
    await p.evaluate(() => document.querySelectorAll('vite-error-overlay').forEach(e => e.remove()));
    await p.locator('button:has-text("Log in")').first().click({force:true});
    await p.waitForTimeout(5000);
    await p.locator('input[name="username"], input[name="email"]').first().fill('da-robot-tester@bluecypress.io');
    await p.locator('input[name="password"], input[type="password"]').first().fill('!!SoDamnSecureItHurt$');
    await p.locator('button[type="submit"]').first().click();
    await p.waitForTimeout(15000);
    await p.locator('text=Data Explorer').first().click();
    await p.waitForTimeout(4000);
    await p.locator('a:has-text("Data"), span:has-text("Data")').first().click();
    await p.waitForTimeout(3000);
    await p.locator('text=Admin (Deprecated)').first().click();
    await p.waitForTimeout(3000);
    for(let i=0;i<10;i++){await p.mouse.wheel(0,400);await p.waitForTimeout(300);}
    
    // Find and click Test Organizations
    const testOrg = p.locator('text=Test Organizations').first();
    if (await testOrg.isVisible({timeout:3000}).catch(()=>false)) {
        await testOrg.click();
    } else {
        // Try scrolling more
        for(let i=0;i<10;i++){await p.mouse.wheel(0,400);await p.waitForTimeout(300);}
        await testOrg.click({timeout:5000});
    }
    await p.waitForTimeout(10000);
    
    // Check ALL toggle buttons on the page (in DataExplorerDashboard, not EntityViewer)
    const result = await p.evaluate(() => {
        const allToggles = document.querySelectorAll('.view-mode-toggle button, .toggle-btn');
        return {
            total: allToggles.length,
            buttons: Array.from(allToggles).map(b => ({
                title: b.getAttribute('title'),
                visible: b.offsetWidth > 0 && b.offsetHeight > 0,
                parent: b.parentElement?.className?.split(' ')[0]
            })),
            mapBtnExists: !!document.querySelector('button[title="Map View"]'),
            mapIconExists: !!document.querySelector('.fa-map-location-dot'),
        };
    });
    console.log(JSON.stringify(result, null, 2));
    
    await p.screenshot({ path: path.join(SCREENSHOTS, '50-full-build-test.png'), fullPage: true });
    
    if (result.mapBtnExists) {
        console.log('MAP BUTTON FOUND!!!');
        await p.locator('button[title="Map View"]').click();
        await p.waitForTimeout(5000);
        await p.screenshot({ path: path.join(SCREENSHOTS, '51-MAP-VIEW-ACTIVE.png'), fullPage: true });
        console.log('MAP VIEW SCREENSHOT CAPTURED!');
    }
} catch(e) {
    console.error('Error:', e.message);
    await p.screenshot({ path: path.join(SCREENSHOTS, '50-error.png'), fullPage: true }).catch(()=>{});
} finally { await b.close(); console.log('Done'); }
