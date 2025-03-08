const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const URL = 'https://buscheb.ru/';
const OUTPUT_DIR = path.join(process.cwd(), 'json');

// Создаем папку json, если её нет
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, {recursive: true});
}

(async () => {
    // const browser = await puppeteer.launch({ headless: true });
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ['--start-maximized']
    });
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('getVehiclesMarkers.php')) {
            console.log('Intercepted request:', url);
            request.continue();
        } else {
            request.continue();
        }
    });

    page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('getVehiclesMarkers.php')) {
            try {
                const json = await response.json();
                const timestamp = Date.now();
                const filePath = path.join(OUTPUT_DIR, `${timestamp}.json`);
                fs.writeFileSync(filePath, JSON.stringify(json, null, 2), 'utf8');
                console.log(`Saved: ${filePath}`);
            } catch (error) {
                console.error('Error saving JSON:', error);
            }
        }
    });

    console.log(`Navigating to ${URL}...`);
    await page.goto(URL, {waitUntil: 'networkidle2'});

    console.log('Press CTRL+C to stop the script.');
    process.on('SIGINT', async () => {
        console.log('Closing browser...');
        await browser.close();
        process.exit(0);
    });
})();
