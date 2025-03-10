const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');
const { logMessage } = require('./logger');

const DB_PATH = path.join(process.cwd(), 'data.sqlite');

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

    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_vehicle ON points(vechicle_id);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_route ON points(rnum, rtype);`);
    await db.exec(`CREATE INDEX IF NOT EXISTS idx_points_grouping ON points(vechicle_id, rnum, rtype);`);

    logMessage('Database initialized and indexes created.');
    return db;
}

async function insertData(db, anims) {
    const insertStmt = `
        INSERT INTO points (vechicle_id, lon, lat, dir, speed, lasttime, gos_num, rid, rnum, rtype, low_floor, wifi, anim_key, big_jump)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    const stmt = await db.prepare(insertStmt);

    for (const point of anims) {
        const formattedLasttime = convertToSQLiteDatetime(point.lasttime);
        await stmt.run([
            point.id, point.lon, point.lat, point.dir, point.speed, formattedLasttime,
            point.gos_num, point.rid, point.rnum, point.rtype, point.low_floor,
            point.wifi, point.anim_key, point.big_jump
        ]);
    }
    await stmt.finalize();
    logMessage(`Inserted ${anims.length} records into database.`);
}

function convertToSQLiteDatetime(dateString) {
    const [day, month, year, time] = dateString.split(/\.| /);
    return `${year}-${month}-${day} ${time}`;
}

module.exports = { initDb, insertData };