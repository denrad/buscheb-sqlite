const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { initDb, insertData } = require('./lib/database');
const { logMessage } = require('./lib/logger');

const URL = 'https://buscheb.ru/';
const OUTPUT_DIR = path.join(process.cwd(), 'json');

if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

(async () => {
    const db = await initDb();
    const browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

    // Логирование событий Puppeteer
    page.on('console', (msg) => logMessage(`[PAGE CONSOLE] ${msg.text()}`));
    page.on('error', (err) => logMessage(`[PAGE ERROR] ${err}`));
    page.on('pageerror', (pageErr) => logMessage(`[PAGE JS ERROR] ${pageErr}`));
    page.on('requestfailed', (request) => logMessage(`[REQUEST FAILED] ${request.url()} -> ${request.failure().errorText}`));

    // Перехват запросов
    await page.setRequestInterception(true);
    page.on('request', (request) => {
        if (request.url().includes('getVehiclesMarkers.php')) {
            logMessage(`Intercepted request: ${request.url()}`);
        }
        request.continue();
    });

    // Обработка ответов
    page.on('response', async (response) => {
        if (response.url().includes('getVehiclesMarkers.php')) {
            try {
                const json = await response.json();
                const timestamp = Date.now();
                const filePath = path.join(OUTPUT_DIR, `${timestamp}.json`);
                fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
                logMessage(`Saved JSON: ${filePath}`);

                if (json.anims) {
                    await insertData(db, json.anims);
                }
            } catch (error) {
                logMessage(`Error saving JSON or inserting into database: ${error}`);
            }
        }
    });

    // Навигация на сайт
    logMessage(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle2' });

    // Скриншот экрана через 2 секунды после загрузки
    setTimeout(async () => {
        try {
            const screenshotPath = path.join(OUTPUT_DIR, `screenshot-${Date.now()}.png`);
            await page.screenshot({ path: screenshotPath });
            logMessage(`Screenshot saved: ${screenshotPath}`);
        } catch (error) {
            logMessage(`Error taking screenshot: ${error}`);
        }
    }, 2000);

    logMessage('Press CTRL+C to stop the script.');

    // Обработка выхода
    process.on('SIGINT', async () => {
        logMessage('Closing browser and database...');
        await db.close();
        await browser.close();
        process.exit(0);
    });
})();