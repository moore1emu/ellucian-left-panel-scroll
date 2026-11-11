'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '..');
const origin = 'https://experience-test.elluciancloud.com';
const customOrigin = 'https://experience.school.example';
const unapproved = 'https://other.experience.school.example';

// Model the native header, lazy drawer and SVG sprite observed on Experience Home and its capability pages.
function fixture(base, homeOverlay = false, tenant = 'fixture-tenant') {
  const apps = [
    ['Designer', base + 'app/all-accounts/Ellucian/data-connect-designer/', 'design'],
    ['Packages', base + 'app/all-accounts/Ellucian/data-connect/home', 'packages'],
    ['Reports', base + 'app/all-accounts/Ellucian/Insights%20Reporting/browseInsights', 'missing'],
    ['External', 'https://outside.invalid/', 'missing'],
    ['Parameter link', base + 'app/all-accounts/example?state=example', 'missing'],
    ['Other tenant', '/different/app/all-accounts/example', 'missing']
  ];
  return '<!doctype html><meta charset="utf-8"><base target="_blank"><script>window.__PRELOADED_STATE__='+JSON.stringify({tenant})+'</script>' +
    '<style>#experience-header,#actions{display:flex;align-items:center}#actions>div{margin-inline:8px}#actions button{box-sizing:border-box;width:40px;height:40px}#spacer{flex:1}#home-cover{position:absolute;inset:0 0 auto;height:44px}#actions,#experience-header>a{position:relative;z-index:1}[role=presentation]{position:relative;z-index:2}</style>' +
    '<svg width="0" height="0"><defs><symbol id="ds-icon-design" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/></symbol>' +
    '<symbol id="ds-icon-packages" viewBox="0 0 24 24"><rect width="24" height="24"/></symbol></defs></svg>' +
    '<div id="experience-header"><a aria-label="Home home" target="_self" href="'+base+'">Home</a><span id="spacer"></span>' +
    '<div id="actions"><div><button id="calendar-btn">Tasks</button></div><div><button id="notifications-btn">Notifications</button></div>' +
    '<div><button id="grid-btn">Capabilities</button></div></div><button>Account</button></div><main></main>' + (homeOverlay ? '<div id="home-cover"></div>' : '') +
    '<template id="drawer"><div role="presentation"><section><header><h2 id="applicationsHeader">Capabilities</h2><button id="close">Close</button></header><ul>' +
    apps.map(([name, href, icon]) => '<li><a href="'+href+'"><svg aria-hidden="true"><use href="#ds-icon-'+icon+'"/></svg><span>'+name+'</span></a></li>').join('') +
    '</ul></section></div></template><script>' +
    'document.addEventListener("click", e => { if(e.target.id==="grid-btn") document.body.append(document.getElementById("drawer").content.cloneNode(true));' +
    'if(e.target.id==="close") e.target.closest("[role=presentation]").remove(); });</script>';
}
(async () => {
  const temp = fs.realpathSync(os.tmpdir());
  const profile = fs.mkdtempSync(path.join(temp, 'navigator-capabilities-'));
  let context;
  try {
    // Install the production scripts with a disposable manifest that pre-grants just the synthetic school site.
    // The actual worker must register its scripts dynamically; no static match is added for the school.
    const extension = path.join(profile, 'fixture-extension');
    fs.mkdirSync(extension);
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith('.env') && /\.(css|html|js|json)$/.test(name)) fs.copyFileSync(path.join(root,name), path.join(extension,name));
    }
    fs.cpSync(path.join(root,'icons'), path.join(extension,'icons'), {recursive:true});
    const manifestFile = path.join(extension,'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestFile,'utf8'));
    manifest.permissions.push('scripting');
    manifest.optional_permissions = manifest.optional_permissions.filter(name => name !== 'scripting');
    manifest.host_permissions = [customOrigin+'/*'];
    fs.writeFileSync(manifestFile,JSON.stringify(manifest));
    context = await chromium.launchPersistentContext(profile, {
      headless: true,
      ...(process.env.INTEGRATION_NAVIGATOR_BROWSER ? { channel: process.env.INTEGRATION_NAVIGATOR_BROWSER } : {}),
      args: ['--disable-extensions-except='+extension, '--load-extension='+extension]
    });
    // Fulfill synthetic Experience documents locally and reject any extra network request.
    const unexpected = [];
    let rootTenant = 'school-one';
    await context.route('**/*', route => {
      const url = new URL(route.request().url());
      if (url.protocol === 'chrome-extension:') return route.continue();
      if (url.origin === origin && route.request().isNavigationRequest()) {
        return route.fulfill({ contentType: 'text/html', body: fixture('/'+url.pathname.split('/')[1]+'/', /^\/[^/]+\/?$/.test(url.pathname)) });
      }
      if ([customOrigin, unapproved].includes(url.origin) && route.request().isNavigationRequest()) {
        const mount = url.pathname.startsWith('/portal/east/') ? '/portal/east/' : '/';
        return route.fulfill({contentType:'text/html', body:fixture(mount,url.pathname===mount,rootTenant)});
      }
      unexpected.push(url.origin);
      return route.abort();
    });
    const base = '/sample/';
    const openPage = async route => {
      const page = await context.newPage();
      page.setDefaultTimeout(6000);
      await page.goto(origin + route);
      return page;
    };
    const star = (page, app) => page.getByRole('button',{name:'Favorite '+app, exact:true});
    const shortcut = (page, app) => page.getByRole('navigation',{name:'Favorite capabilities'}).getByRole('link',{name:app,exact:true});
    const packages = await openPage(base+'app/all-accounts/Ellucian/data-connect/jobRuns');
    const home = await openPage(base);
    await Promise.all([packages,home].map(page => page.getByRole('button',{name:'Capabilities'}).click()));
    await star(packages,'Designer').waitFor();
    assert.equal(await packages.locator('.inav-cap-star').count(), 3);
    assert.equal(await packages.getByRole('link',{name:'External'}).count(), 1);

    // Simultaneous trusted clicks keep both pins. The native menu links never navigate on a star click.
    await Promise.all([star(packages,'Designer').press('Space'),star(home,'Reports').click()]);
    await shortcut(home,'Designer').waitFor();
    await shortcut(packages,'Reports').waitFor();
    assert.ok(packages.url().endsWith('/jobRuns'));
    assert.equal(await star(home,'Designer').getAttribute('aria-pressed'), 'true');
    assert.equal(await shortcut(home,'Designer').locator('use').getAttribute('href'), '#ds-icon-design');
    assert.equal(await shortcut(home,'Reports').innerText(), 'Reports');
    assert.equal(await shortcut(home,'Designer').getAttribute('title'), 'Designer');
    await home.getByRole('button',{name:'Close'}).click();
    // The last favorite and Tasks must be as far apart as Tasks and Notifications.
    const spacing = await home.evaluate(() => {
      const boxes = [...document.querySelectorAll('.inav-cap-pins a, #calendar-btn, #notifications-btn')].map(el=>el.getBoundingClientRect());
      const icon = document.querySelector('.inav-cap-pins svg');
      return [boxes[1].left-boxes[0].right, boxes[2].left-boxes[1].right, boxes[3].left-boxes[2].right,
        icon.parentElement.getBoundingClientRect().width, icon.getBoundingClientRect().width];
    });
    assert.deepEqual(spacing,[16,16,16,40,24]);
    await home.reload();
    await shortcut(home,'Designer').waitFor();
    await shortcut(home,'Designer').focus();
    assert.equal(await shortcut(home,'Designer').locator('span').isVisible(), true);
    await home.setViewportSize({width:420,height:580});
    assert.ok(await home.locator('#grid-btn').evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
    await shortcut(home,'Designer').press('Enter');
    await home.waitForURL('**/data-connect-designer/');
    await shortcut(home,'Reports').waitFor();

    // Header replacement on the same page restores exactly one strip. Unpin from Designer updates Packages too.
    await home.evaluate(()=>{ const h=document.getElementById('experience-header'); h.replaceWith(h.cloneNode(true)); });
    await home.getByRole('button',{name:'Capabilities'}).click();
    await star(home,'Designer').click();
    await shortcut(packages,'Designer').waitFor({state:'detached'});
    assert.equal(await star(packages,'Designer').getAttribute('aria-pressed'),'false');
    assert.equal(await shortcut(home,'Reports').count(),1);


    // Return through Ellucian’s left Home link and click a saved icon through the Home overlay.
    await home.getByRole('button',{name:'Close'}).click();
    await home.getByRole('link',{name:'Home home'}).click();
    await home.waitForURL(origin + base);
    const reports = shortcut(home,'Reports');
    await reports.waitFor();
    assert.ok(await reports.evaluate(link => {
      const box = link.getBoundingClientRect();
      return link.contains(document.elementFromPoint(box.x + box.width/2, box.y + box.height/2));
    }), 'Home content must not intercept shortcut clicks');
    await reports.click();
    await home.waitForURL('**/Insights%20Reporting/browseInsights');
    await shortcut(home,'Reports').waitFor();
    await home.getByRole('button',{name:'Capabilities'}).click();
    assert.equal(await star(home,'Reports').getAttribute('aria-pressed'),'true');

    // A transition to another capability keeps its menu and pins. Leaving the app area removes both.
    await packages.evaluate(()=>history.pushState({},'',location.pathname.replace('data-connect/jobRuns','other-app/')));
    await packages.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await shortcut(packages,'Reports').isVisible(),true);
    assert.equal(await star(packages,'Reports').getAttribute('aria-pressed'),'true');
    await packages.evaluate(()=>history.pushState({},'','/sample/non-app-page'));
    await packages.locator('.inav-cap-pins').waitFor({state:'detached'});
    await packages.goBack();
    await shortcut(packages,'Reports').waitFor();

    // Same-host tenant changes and unrelated Experience routes must never inherit the active header.
    const other = await openPage('/different/');
    await other.getByRole('button',{name:'Capabilities'}).click();
    await star(other,'Designer').waitFor();
    assert.equal(await other.locator('.inav-cap-pins').count(),0);
    // Match each person's current permissions list, including changes while the same drawer stays open.
    const list = other.locator('[role="presentation"] ul');
    await list.evaluate(ul => ul.replaceChildren());
    assert.equal(await list.getByRole('button').count(),0);
    const addApps = (ul, names) => {
      for (const name of names) {
        const row = document.createElement('li');
        const link = document.createElement('a');
        link.href = '/different/app/all-accounts/' + name;
        const icon = document.createElementNS('http://www.w3.org/2000/svg','svg');
        icon.setAttribute('width','24');
        icon.setAttribute('height','24');
        link.append(icon, name);
        row.append(link);
        ul.append(row);
      }
    };
    await list.evaluate(addApps,['Library']);
    const libraryStar = star(other,'Library');
    const libraryLink = list.getByRole('link',{name:'Library',exact:true});
    await libraryStar.waitFor();
    const starBox = await libraryStar.boundingBox();
    const iconBox = await libraryLink.locator('svg').boundingBox();
    assert.ok(starBox.x + starBox.width <= iconBox.x, 'Star must appear to the left of the app icon');
    await libraryStar.press('Tab');
    assert.ok(await libraryLink.evaluate(link => link === document.activeElement));
    await list.evaluate(addApps,Array.from({length:17},(_,i)=>'Service-'+i));
    await star(other,'Service-16').waitFor();
    assert.equal(await list.getByRole('button').count(),18);
    // Ellucian may reorder its link, remove entire rows, or leave an empty row behind.
    await list.evaluate(ul => {
      const row = ul.firstElementChild;
      row.prepend(row.querySelector('a'));
      for (const extra of [...ul.children].slice(2)) extra.remove();
      ul.lastElementChild.querySelector('a').remove();
    });
    await star(other,'Service-0').waitFor({state:'detached'});
    assert.equal(await list.getByRole('button').count(),1);
    assert.ok(await libraryLink.evaluate(link => link.previousElementSibling?.getAttribute('aria-label') === 'Favorite Library'));
    const elsewhere = await openPage(base+'non-app-page');
    await elsewhere.getByRole('button',{name:'Capabilities'}).click();
    assert.equal(await elsewhere.locator('.inav-cap-star,.inav-cap-pins').count(),0);
    await star(home,'Reports').click();
    await packages.locator('.inav-cap-pins').waitFor({state:'detached'});

    // Exercise the actual worker registration on a granted custom domain and deny its unapproved subdomain.
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const registered = await worker.evaluate(async custom => {
      await CustomSites.sync();
      const entries = await chrome.scripting.getRegisteredContentScripts();
      return entries.some(entry => entry.matches.includes(custom+'/*') &&
        entry.js?.includes('capability-pins.js') && entry.css?.includes('capability-pins.css'));
    },customOrigin);
    assert.ok(registered);
    const college = await context.newPage();
    college.setDefaultTimeout(6000);
    const tabCount = context.pages().length;
    await college.goto(customOrigin+'/');
    await college.getByRole('button',{name:'Capabilities'}).click();
    await star(college,'Reports').click();
    await shortcut(college,'Reports').waitFor();
    await college.getByRole('button',{name:'Close'}).click();
    await shortcut(college,'Reports').click();
    await college.waitForURL(customOrigin+'/app/all-accounts/Ellucian/Insights%20Reporting/browseInsights');
    await shortcut(college,'Reports').waitFor();
    assert.equal(context.pages().length,tabCount);
    await college.getByRole('button',{name:'Capabilities'}).click();
    const nativePackages = college.getByRole('link',{name:'Packages',exact:true});
    await nativePackages.press('Enter');
    await college.waitForURL(customOrigin+'/app/all-accounts/Ellucian/data-connect/home');
    assert.equal(context.pages().length,tabCount);
    await shortcut(college,'Reports').waitFor();
    // Two tenants can share the same root URL. Neither a new tenant nor a missing identity inherits a pin.
    rootTenant = 'school-two';
    await college.goto(customOrigin+'/');
    await college.getByRole('button',{name:'Capabilities'}).click();
    await star(college,'Reports').waitFor();
    assert.equal(await star(college,'Reports').getAttribute('aria-pressed'),'false');
    assert.equal(await shortcut(college,'Reports').count(),0);
    rootTenant = '';
    await college.reload();
    await college.getByRole('button',{name:'Capabilities'}).click();
    await college.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await college.locator('.inav-cap-star,.inav-cap-pins').count(),0);
    rootTenant = 'school-one';
    await college.goto(customOrigin+'/');
    await shortcut(college,'Reports').waitFor();
    // A nested Home path on the same custom host has its own list and does not need a root-site identity.
    rootTenant = '';
    await college.goto(customOrigin+'/portal/east/');
    await college.getByRole('button',{name:'Capabilities'}).click();
    await star(college,'Designer').click();
    await shortcut(college,'Designer').waitFor();
    assert.equal(await shortcut(college,'Reports').count(),0);
    await college.getByRole('button',{name:'Close'}).click();
    await shortcut(college,'Designer').press('Enter');
    await college.waitForURL(customOrigin+'/portal/east/app/all-accounts/Ellucian/data-connect-designer/');
    await shortcut(college,'Designer').waitFor();
    assert.equal(context.pages().length,tabCount);
    await college.goto(unapproved+'/portal/east/');
    await college.getByRole('button',{name:'Capabilities'}).click();
    assert.equal(await college.locator('.inav-cap-star,.inav-cap-pins').count(),0);

    // Repeat a pin after a failed write, using the production script with a failing storage fixture.
    const failed = await context.newPage();
    await failed.route('https://viewer.invalid/sample/', route => route.fulfill({contentType:'text/html',body:fixture(base)}));
    await failed.goto('https://viewer.invalid/sample/');
    await failed.evaluate(() => {
      let listener;
      window.capStore = { failRead:true, failSave:true, writes:0, pins:{} };
      window.chrome.storage = {
        onChanged:{ addListener(fn) { listener=fn; } },
        local:{
          get:async () => {
            if (capStore.failRead) throw Error('Storage unavailable');
            return capStore.pins;
          },
          set:async data => {
            capStore.writes++;
            if (capStore.failSave) throw Error('Extension context invalidated');
            Object.assign(capStore.pins,data);
            const key=Object.keys(data)[0];
            listener({[key]:{newValue:data[key]}},'local');
          }
        }
      };
    });
    await failed.addScriptTag({path:path.join(root,'favorite-appearance.js')});
    await failed.addScriptTag({path:path.join(root,'capability-pins.js')});
    await failed.getByRole('button',{name:'Capabilities'}).click();
    await failed.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await star(failed,'Designer').count(),0);
    assert.equal(await failed.getByRole('link',{name:'Designer',exact:true}).isVisible(), true);
    // Restoring a reachable route retries the read. A rejected write leaves the same star usable.
    await failed.evaluate(()=>{capStore.failRead=false; history.pushState({},'','/sample/non-app-page');});
    await failed.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await failed.goBack();
    await star(failed,'Designer').click();
    await failed.waitForFunction(()=>capStore.writes===1 && !document.querySelector('button.inav-cap-star[aria-busy]'));
    assert.equal(await star(failed,'Designer').getAttribute('aria-pressed'),'false');
    assert.equal(await shortcut(failed,'Designer').count(),0);
    await failed.evaluate(()=>{capStore.failSave=false;});
    await star(failed,'Designer').click();
    await shortcut(failed,'Designer').waitFor();

    assert.deepEqual(unexpected, []);
    console.log('PASS Capabilities: independent stars, SVG and name shortcuts, keyboard navigation, reload, both concurrent pins, custom-site registration, root and nested Home paths, same-tab navigation, native icon spacing, Home overlay, Reporting and other capability routes, tenant separation, header replacement, native controls and unpin.');
  } finally {
    try { await context?.close(); }
    finally {
      // Remove only the disposable profile created by this test.
      if (path.dirname(profile)!==temp || !path.basename(profile).startsWith('navigator-capabilities-') || fs.lstatSync(profile).isSymbolicLink()) throw Error('Unexpected profile');
      fs.rmSync(profile,{recursive:true,force:true,maxRetries:5,retryDelay:200});
    }
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
