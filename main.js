const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

const URL = 'https://buscheb.ru/';
const OUTPUT_DIR = path.join(process.cwd(), 'json');
const DB_PATH = path.join(process.cwd(), 'data.sqlite');
const LOG_FILE = path.join(process.cwd(), 'app.log');

// Функция для логирования
function logMessage(message) {
    const timestamp = new Date().toISOString();
    fs.appendFileSync(LOG_FILE, `[${timestamp}] ${message}\n`, 'utf8');
}

// Создаем папку json, если её нет
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// Инициализация базы данных с индексами
async function initDb() {
    const db = await open({
        filename: DB_PATH,
        driver: sqlite3.Database
    });
    await db.exec(`
        CREATE TABLE IF NOT EXISTS points (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            vechicle_id INTEGER,
            lon REAL,
            lat REAL,
            dir INTEGER,
            speed INTEGER,
            lasttime DATETIME,
            gos_num TEXT,
            rid INTEGER,
            rnum TEXT,
            rtype TEXT,
            low_floor INTEGER,
            wifi INTEGER,
            anim_key TEXT,
            big_jump INTEGER
        );
    `);

    // Добавляем индексы для ускорения запросов
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_vehicle ON points(vechicle_id);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_route ON points(rnum, rtype);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_grouping ON points(vechicle_id, rnum, rtype);`);

    logMessage('Database initialized and indexes created.');
    return db;
}

// Функция для преобразования даты в формат SQLite (YYYY-MM-DD HH:MM:SS)
function convertToSQLiteDatetime(dateString) {
    const [day, month, year, time] = dateString.split(/\.| /);
    return `${year}-${month}-${day} ${time}`;
}

(async () => {
    const db = await initDb();
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');

    await page.setRequestInterception(true);
    page.on('request', (request) => {
        const url = request.url();
        if (url.includes('getVehiclesMarkers.php')) {
            logMessage(`Intercepted request: ${url}`);
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
                logMessage(`Saved JSON: ${filePath}`);

                // Сохранение в базу данных
                if (json.anims) {
                    const insertStmt = `
                        INSERT INTO points (vechicle_id, lon, lat, dir, speed, lasttime, gos_num, rid, rnum, rtype, low_floor, wifi, anim_key, big_jump)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    `;
                    const stmt = await db.prepare(insertStmt);
                    for (const point of json.anims) {
                        const formattedLasttime = convertToSQLiteDatetime(point.lasttime);
                        await stmt.run([
                            point.id, point.lon, point.lat, point.dir, point.speed, formattedLasttime,
                            point.gos_num, point.rid, point.rnum, point.rtype, point.low_floor,
                            point.wifi, point.anim_key, point.big_jump
                        ]);
                    }
                    await stmt.finalize();
                    logMessage(`Inserted ${json.anims.length} records into database.`);
                }
            } catch (error) {
                logMessage(`Error saving JSON or inserting into database: ${error}`);
            }
        }
    });

    logMessage(`Navigating to ${URL}...`);
    await page.goto(URL, { waitUntil: 'networkidle2' });

    logMessage('Press CTRL+C to stop the script.');
    process.on('SIGINT', async () => {
        logMessage('Closing browser and database...');
        await db.close();
        await browser.close();
        process.exit(0);
    });
})();