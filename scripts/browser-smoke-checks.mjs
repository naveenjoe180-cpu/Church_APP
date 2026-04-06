import { createServer } from 'node:http';
import { mkdirSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium } = require('../qa-tools/node_modules/playwright-core');

const root = process.cwd();
const userDist = join(root, 'church-network-app', 'dist');
const adminDist = join(root, 'church-network-admin', 'dist');
const edgeExecutablePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

function startStaticServer(rootDir, basePath = '/') {
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;

  const server = createServer(async (request, response) => {
    try {
      const requestUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
      let pathname = requestUrl.pathname;

      if (normalizedBase && normalizedBase !== '/' && pathname.startsWith(normalizedBase)) {
        pathname = pathname.slice(normalizedBase.length) || '/';
      }

      const safePath = normalize(pathname === '/' ? '/index.html' : pathname).replace(/^(\.\.[/\\])+/, '');
      let filePath = resolve(rootDir, `.${safePath}`);

      if (!filePath.startsWith(resolve(rootDir))) {
        response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
        response.end('Forbidden');
        return;
      }

      let fileBuffer;
      try {
        fileBuffer = await readFile(filePath);
      } catch {
        filePath = join(rootDir, 'index.html');
        fileBuffer = await readFile(filePath);
      }

      const contentType = mimeTypes[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
      response.writeHead(200, { 'Content-Type': contentType });
      response.end(fileBuffer);
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end(`Server error: ${error instanceof Error ? error.message : String(error)}`);
    }
  });

  return new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        rejectPromise(new Error('Unable to determine server address.'));
        return;
      }
      resolvePromise({
        server,
        port: address.port,
        close: () => new Promise((resolveClose) => server.close(() => resolveClose())),
      });
    });
  });
}

function createRecorder(page) {
  const consoleErrors = [];
  const pageErrors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') {
      consoleErrors.push(message.text());
    }
  });
  page.on('pageerror', (error) => {
    pageErrors.push(error.message);
  });
  return { consoleErrors, pageErrors };
}

function summarizeErrors(recorder) {
  return {
    consoleErrors: recorder.consoleErrors.filter((message) => !message.includes('favicon')),
    pageErrors: recorder.pageErrors,
  };
}

async function waitForCoreShell(page, texts) {
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(800);
  for (const text of texts) {
    await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout: 10000 });
  }
}

const tests = [];

function addTest(id, area, requirement, steps, run) {
  tests.push({ id, area, requirement, steps, run });
}

addTest(
  'BROWSER-001',
  'Browser Smoke',
  'User app should load the guest shell on desktop with the expected top-level navigation.',
  [
    'Launch Microsoft Edge headless.',
    'Open the built user app on a local static server.',
    'Wait for the guest shell to render.',
    'Verify Bethel Connect branding plus Access and Explore navigation are visible.',
    'Fail if a page crash occurs.',
  ],
  async ({ browser, userBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(userBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect', 'Access', 'Explore']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Guest desktop shell loaded successfully.'] };
  },
);

addTest(
  'BROWSER-002',
  'Browser Smoke',
  'User app should keep the guest top strip and primary tabs visible in a mobile-sized viewport.',
  [
    'Launch Microsoft Edge headless in a mobile-sized context.',
    'Open the built user app.',
    'Wait for the guest shell to render.',
    'Verify Bethel Connect branding, Access, and Explore are visible in the mobile layout.',
  ],
  async ({ browser, userBaseUrl }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(userBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect', 'Access', 'Explore']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Guest mobile shell rendered successfully.'] };
  },
);

addTest(
  'BROWSER-003',
  'Offline / Resilience',
  'User app should still render a usable guest shell when Firebase and Google backend requests are blocked.',
  [
    'Launch Microsoft Edge headless.',
    'Block outbound Firebase and Google API requests in the browser context while leaving localhost assets available.',
    'Open the built user app.',
    'Verify the guest shell still renders and does not crash.',
  ],
  async ({ browser, userBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url.includes('googleapis.com')
        || url.includes('firebaseio.com')
        || url.includes('gstatic.com')
        || url.includes('google.com')
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(userBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect', 'Access', 'Explore']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['User app remained usable with backend requests blocked.', `Console errors captured: ${errors.consoleErrors.length}`] };
  },
);

addTest(
  'BROWSER-004',
  'Runtime Stability',
  'User app should survive repeated desktop reloads without crashing the guest shell.',
  [
    'Launch Microsoft Edge headless.',
    'Open the built user app.',
    'Reload the page five times.',
    'Verify the guest shell remains visible after each reload and no page crash occurs.',
  ],
  async ({ browser, userBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.goto(userBaseUrl, { waitUntil: 'domcontentloaded' });
      await waitForCoreShell(page, ['Bethel Connect', 'Access', 'Explore']);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForCoreShell(page, ['Bethel Connect', 'Access', 'Explore']);
    }
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['User app survived repeated reloads without page crashes.'] };
  },
);

addTest(
  'BROWSER-005',
  'Browser Smoke',
  'Admin app should load the signed-out shell on desktop with the expected branding and sign-in action.',
  [
    'Launch Microsoft Edge headless.',
    'Open the built admin app on a local static server under /admin/.',
    'Wait for the signed-out shell to render.',
    'Verify Bethel Connect Admin and Continue With Google are visible.',
  ],
  async ({ browser, adminBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(adminBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect Admin', 'Continue With Google']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Admin desktop sign-in shell loaded successfully.'] };
  },
);

addTest(
  'BROWSER-006',
  'Browser Smoke',
  'Admin app should render the signed-out shell in a mobile-sized viewport.',
  [
    'Launch Microsoft Edge headless in a mobile-sized context.',
    'Open the built admin app.',
    'Wait for the signed-out shell to render.',
    'Verify Bethel Connect Admin remains visible in the mobile layout.',
  ],
  async ({ browser, adminBaseUrl }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 2,
    });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(adminBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect Admin', 'Continue With Google']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Admin mobile sign-in shell loaded successfully.'] };
  },
);

addTest(
  'BROWSER-007',
  'Offline / Resilience',
  'Admin app should still render a usable signed-out shell when Firebase and Google backend requests are blocked.',
  [
    'Launch Microsoft Edge headless.',
    'Block outbound Firebase and Google API requests while leaving localhost assets available.',
    'Open the built admin app.',
    'Verify the sign-in shell still renders and does not crash.',
  ],
  async ({ browser, adminBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route('**/*', async (route) => {
      const url = route.request().url();
      if (
        url.includes('googleapis.com')
        || url.includes('firebaseio.com')
        || url.includes('gstatic.com')
        || url.includes('google.com')
      ) {
        await route.abort();
        return;
      }
      await route.continue();
    });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    await page.goto(adminBaseUrl, { waitUntil: 'domcontentloaded' });
    await waitForCoreShell(page, ['Bethel Connect Admin', 'Continue With Google']);
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Admin app remained usable with backend requests blocked.', `Console errors captured: ${errors.consoleErrors.length}`] };
  },
);

addTest(
  'BROWSER-008',
  'Runtime Stability',
  'Admin app should survive repeated reloads without crashing the signed-out shell.',
  [
    'Launch Microsoft Edge headless.',
    'Open the built admin app.',
    'Reload the page five times.',
    'Verify the signed-out shell remains visible after each reload and no page crash occurs.',
  ],
  async ({ browser, adminBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 1366, height: 820 } });
    const page = await context.newPage();
    const recorder = createRecorder(page);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await page.goto(adminBaseUrl, { waitUntil: 'domcontentloaded' });
      await waitForCoreShell(page, ['Bethel Connect Admin', 'Continue With Google']);
      await page.reload({ waitUntil: 'domcontentloaded' });
      await waitForCoreShell(page, ['Bethel Connect Admin', 'Continue With Google']);
    }
    const errors = summarizeErrors(recorder);
    await context.close();
    if (errors.pageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${errors.pageErrors.join(' | ')}`);
    }
    return { notes: ['Admin app survived repeated reloads without page crashes.'] };
  },
);

addTest(
  'BROWSER-009',
  'Concurrency Smoke',
  'User and admin shells should load correctly when multiple browser pages open in parallel.',
  [
    'Launch Microsoft Edge headless.',
    'Open three user-app pages and three admin-app pages in parallel.',
    'Wait for the expected shell text in each page.',
    'Verify no page crashes occur during the parallel load.',
  ],
  async ({ browser, userBaseUrl, adminBaseUrl }) => {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const pages = await Promise.all(Array.from({ length: 6 }, () => context.newPage()));
    const recorders = pages.map((page) => createRecorder(page));
    const navigations = pages.map((page, index) => page.goto(index < 3 ? userBaseUrl : adminBaseUrl, { waitUntil: 'domcontentloaded' }));
    await Promise.all(navigations);
    await Promise.all([
      waitForCoreShell(pages[0], ['Bethel Connect', 'Access', 'Explore']),
      waitForCoreShell(pages[1], ['Bethel Connect', 'Access', 'Explore']),
      waitForCoreShell(pages[2], ['Bethel Connect', 'Access', 'Explore']),
      waitForCoreShell(pages[3], ['Bethel Connect Admin', 'Continue With Google']),
      waitForCoreShell(pages[4], ['Bethel Connect Admin', 'Continue With Google']),
      waitForCoreShell(pages[5], ['Bethel Connect Admin', 'Continue With Google']),
    ]);
    const allPageErrors = recorders.flatMap((recorder) => summarizeErrors(recorder).pageErrors);
    await context.close();
    if (allPageErrors.length > 0) {
      throw new Error(`Encountered page errors: ${allPageErrors.join(' | ')}`);
    }
    return { notes: ['Parallel user/admin shell loading completed without page crashes.'] };
  },
);

const startedServers = [];

try {
  const userServer = await startStaticServer(userDist, '/');
  const adminServer = await startStaticServer(adminDist, '/admin');
  startedServers.push(userServer, adminServer);

  const browser = await chromium.launch({
    executablePath: edgeExecutablePath,
    headless: true,
  });

  const results = [];

  for (const test of tests) {
    try {
      const result = await test.run({
        browser,
        userBaseUrl: `http://127.0.0.1:${userServer.port}/`,
        adminBaseUrl: `http://127.0.0.1:${adminServer.port}/admin/`,
      });
      results.push({
        id: test.id,
        area: test.area,
        requirement: test.requirement,
        status: 'PASS',
        steps: test.steps,
        notes: result?.notes ?? [],
      });
    } catch (error) {
      results.push({
        id: test.id,
        area: test.area,
        requirement: test.requirement,
        status: 'FAIL',
        steps: test.steps,
        notes: [error instanceof Error ? error.message : String(error)],
      });
    }
  }

  await browser.close();

  const passed = results.filter((result) => result.status === 'PASS').length;
  const failed = results.filter((result) => result.status === 'FAIL').length;

  const markdown = [
    '# Browser Smoke and Runtime Report',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Summary: ${passed} passed, ${failed} failed`,
    '',
    '| ID | Area | Status | Requirement | Notes |',
    '| --- | --- | --- | --- | --- |',
    ...results.map((result) => `| ${result.id} | ${result.area} | ${result.status} | ${result.requirement} | ${(result.notes ?? []).join(' / ')} |`),
    '',
    '## Detailed Steps',
    '',
    ...results.flatMap((result) => [
      `### ${result.id} ${result.status}`,
      '',
      result.requirement,
      '',
      ...result.steps.map((step) => `- ${step}`),
      '',
      ...(result.notes.length > 0 ? ['Notes:', ...result.notes.map((note) => `- ${note}`), ''] : []),
    ]),
  ].join('\n');

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed,
      failed,
    },
    results,
  };

  const reportsDir = join(root, 'docs', 'test-reports');
  mkdirSync(reportsDir, { recursive: true });
  writeFileSync(join(reportsDir, 'browser-smoke-runtime-report.md'), markdown, 'utf8');
  writeFileSync(join(reportsDir, 'browser-smoke-runtime-report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log(markdown);
} finally {
  await Promise.all(startedServers.map((entry) => entry.close()));
}
