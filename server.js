// server.js - VERZE S BOSSEM

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

// ... (všechny require a app.use/app.get zůstávají stejné)
const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});


// --- HERNÍ KONSTANTY ---
const GAME_WIDTH = 1600;
const GAME_HEIGHT = 900;
// ... (ostatní konstanty pro hráče a asteroidy)
const SHIP_SIZE = 15;
const THRUST = 0.1;
const FRICTION = 0.99;
const TURN_SPEED = 0.1;
const BULLET_SPEED = 7;
const MAX_ASTEROIDS = 8;
const RESPAWN_TIME = 3 * 60;


// --- NOVÉ: KONSTANTY PRO BOSSE ---
const BOSS_SPAWN_TIME = 60 * 60; // 1 minuta v ticích
const BOSS_CONSTANTS = {
    SIZE: 60,
    MAX_HEALTH: 5000,
    MAX_SHIELD: 1000,
    SHIELD_REGEN_RATE: 2,
    SHIELD_REGEN_DELAY: 300, // 5 sekund
    TURN_SPEED: 0.01,
    THRUST: 0.03,
    MINIGUN_BURST_DURATION: 180, // 3 sekundy
    MINIGUN_FIRE_RATE: 4,
    MINIGUN_BULLET_SPEED: 8,
    MINIGUN_BULLET_DAMAGE: 5,
    LASER_CHARGE_TIME: 120, // 2 sekundy
    LASER_FIRE_TIME: 90, // 1.5 sekundy
    LASER_DAMAGE_PER_TICK: 20,
};

// ... (stávající konstanty jako ASTEROID_SIZES, UPGRADE_COSTS)
const ASTEROID_SIZES = { LARGE: { size: 50, score: 0, splitsInto: 2 }, MEDIUM: { size: 25, score: 0, splitsInto: 2 }, SMALL: { size: 12, score: 10, splitsInto: 0 } };
const UPGRADE_COSTS = { fireRate: 50, bulletDamage: 70, maxHealth: 40 };

// --- HERNÍ STAV ---
let players = {};
let bullets = [];
let asteroids = [];
let nextId = 0;
const activeIPs = new Set();
let boss = null; // NOVÉ: Objekt pro bosse
let bossSpawnTimer = BOSS_SPAWN_TIME; // NOVÉ: Časovač pro spawnování bosse

// --- Funkce pro bosse ---

function spawnBoss() {
    console.log("!!! SPAWNING BOSS !!!");
    boss = {
        isAlive: true,
        x: GAME_WIDTH / 2, y: -BOSS_CONSTANTS.SIZE,
        vx: 0, vy: 1, angle: Math.PI / 2,
        health: BOSS_CONSTANTS.MAX_HEALTH,
        shield: BOSS_CONSTANTS.MAX_SHIELD,
        shieldRegenTimer: 0,
        targetId: null,
        aiState: 'ENTERING', // Stavy: ENTERING, HUNTING, MINIGUN, CHARGE_LASER, FIRE_LASER
        aiTimer: 300, // Obecný časovač pro AI
        laser: { charging: false, firing: false, angle: 0, range: 0 }
    };
}

function updateBoss() {
    if (!boss || !boss.isAlive) return;
    
    // Pohyb a cílení
    if (Object.keys(players).length > 0) {
        // Najít nejbližšího hráče jako cíl
        let closestDist = Infinity;
        let target = null;
        for (const id in players) {
            if (players[id].isAlive) {
                const dist = Math.hypot(boss.x - players[id].x, boss.y - players[id].y);
                if (dist < closestDist) {
                    closestDist = dist;
                    target = players[id];
                    boss.targetId = id;
                }
            }
        }
        
        if (target) {
            const targetAngle = Math.atan2(target.y - boss.y, target.x - boss.x);
            let angleDiff = targetAngle - boss.angle;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;
            while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            boss.angle += Math.sign(angleDiff) * BOSS_CONSTANTS.TURN_SPEED;
        }
    }
    
    // AI Stroj stavů
    boss.aiTimer--;

    switch(boss.aiState) {
        case 'ENTERING':
            if (boss.y < GAME_HEIGHT / 4) {
                boss.y += boss.vy;
            } else {
                boss.aiState = 'HUNTING';
                boss.aiTimer = 180;
            }
            break;

        case 'HUNTING':
            boss.vx += Math.cos(boss.angle) * BOSS_CONSTANTS.THRUST;
            boss.vy += Math.sin(boss.angle) * BOSS_CONSTANTS.THRUST;
            if (boss.aiTimer <= 0) {
                boss.aiState = Math.random() < 0.6 ? 'MINIGUN' : 'CHARGE_LASER';
                boss.aiTimer = boss.aiState === 'MINIGUN' ? BOSS_CONSTANTS.MINIGUN_BURST_DURATION : BOSS_CONSTANTS.LASER_CHARGE_TIME;
            }
            break;
            
        case 'MINIGUN':
            if (boss.aiTimer % BOSS_CONSTANTS.MINIGUN_FIRE_RATE === 0) {
                const spread = (Math.random() - 0.5) * 0.5; // Rozptyl +/- 15 stupňů
                bullets.push({ id: nextId++, ownerId: 'boss', x: boss.x, y: boss.y, vx: Math.cos(boss.angle + spread) * BOSS_CONSTANTS.MINIGUN_BULLET_SPEED, vy: Math.sin(boss.angle + spread) * BOSS_CONSTANTS.MINIGUN_BULLET_SPEED, damage: BOSS_CONSTANTS.MINIGUN_BULLET_DAMAGE, lifespan: 120 });
            }
            if (boss.aiTimer <= 0) {
                boss.aiState = 'HUNTING';
                boss.aiTimer = 300; // Pauza po útoku
            }
            break;

        case 'CHARGE_LASER':
            boss.laser.charging = true;
            if (boss.aiTimer <= 0) {
                boss.aiState = 'FIRE_LASER';
                boss.aiTimer = BOSS_CONSTANTS.LASER_FIRE_TIME;
                boss.laser.charging = false;
                boss.laser.firing = true;
                boss.laser.angle = boss.angle; // Zamkneme úhel laseru
            }
            break;

        case 'FIRE_LASER':
            // Poškození laserem se řeší v kolizích
            if (boss.aiTimer <= 0) {
                boss.aiState = 'HUNTING';
                boss.aiTimer = 300;
                boss.laser.firing = false;
            }
            break;
    }

    // Pohyb bosse
    boss.vx *= FRICTION; boss.vy *= FRICTION;
    boss.x += boss.vx; boss.y += boss.vy;
    // Omezení pohybu bosse
    if (boss.x < BOSS_CONSTANTS.SIZE) boss.x = BOSS_CONSTANTS.SIZE;
    if (boss.x > GAME_WIDTH - BOSS_CONSTANTS.SIZE) boss.x = GAME_WIDTH - BOSS_CONSTANTS.SIZE;
    if (boss.y < BOSS_CONSTANTS.SIZE) boss.y = BOSS_CONSTANTS.SIZE;
    if (boss.y > GAME_HEIGHT - BOSS_CONSTANTS.SIZE) boss.y = GAME_HEIGHT - BOSS_CONSTANTS.SIZE;
    
    // Regenerace štítu
    boss.shieldRegenTimer--;
    if (boss.shieldRegenTimer <= 0 && boss.shield < BOSS_CONSTANTS.MAX_SHIELD) {
        boss.shield += BOSS_CONSTANTS.SHIELD_REGEN_RATE;
        if (boss.shield > BOSS_CONSTANTS.MAX_SHIELD) boss.shield = BOSS_CONSTANTS.MAX_SHIELD;
    }
}

// ... (stávající funkce createAsteroid, respawnPlayer, initAsteroids)
function createAsteroid(sizeKey = 'LARGE', position = null) { const properties = ASTEROID_SIZES[sizeKey]; let x, y; if (position) { x = position.x; y = position.y; } else { const edge = Math.floor(Math.random() * 4); if (edge === 0) { x = Math.random() * GAME_WIDTH; y = -properties.size; } else if (edge === 1) { x = GAME_WIDTH + properties.size; y = Math.random() * GAME_HEIGHT; } else if (edge === 2) { x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + properties.size; } else { x = -properties.size; y = Math.random() * GAME_HEIGHT; } } return { id: nextId++, x, y, sizeKey, size: properties.size, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, sides: 8 + Math.floor(Math.random() * 5), offset: Array.from({ length: 13 }, () => (Math.random() - 0.5) * 0.4 + 1) }; }
function respawnPlayer(player) { player.x = Math.random() * GAME_WIDTH; player.y = Math.random() * GAME_HEIGHT; player.vx = 0; player.vy = 0; player.health = player.maxHealth; player.isAlive = true; }
function initAsteroids() { for (let i = 0; i < MAX_ASTEROIDS; i++) { asteroids.push(createAsteroid('LARGE')); } }


// --- Připojení hráče (zůstává stejné) ---
wss.on('connection', (ws, req) => { const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress; if (activeIPs.has(ip)) { console.log(`Connection rejected for IP ${ip}: already connected.`); ws.close(1008, "already connected"); return; } activeIPs.add(ip); console.log(`Connection accepted for IP ${ip}.`); const clientId = nextId++; console.log(`client ${clientId} connecting...`); ws.on('message', function onFirstMessage(message) { try { const data = JSON.parse(message); if (data.type === 'join') { const name = (data.name.trim().slice(0, 12) || `runner_${clientId}`).toLowerCase(); console.log(`client ${clientId} joined as ${name}.`); players[clientId] = { name, x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, angle: 0, vx: 0, vy: 0, score: 0, health: 100, maxHealth: 100, isAlive: true, respawnTimer: 0, keys: {}, fireRate: 30, lastShot: 0, bulletDamage: 10, }; if (players[clientId].name.includes('1561596')) { console.log(`*** Cheat activated for player ${players[clientId].name} ***`); const p = players[clientId]; p.fireRate = 10; p.bulletDamage = 100; p.maxHealth = 500; p.health = 500; p.score = 9999; } ws.removeListener('message', onFirstMessage); ws.on('message', createMessageHandler(clientId)); } } catch(e) { console.error("join error:", e); ws.close(); } }); ws.on('close', () => { activeIPs.delete(ip); console.log(`IP ${ip} released.`); console.log(`client ${clientId} (${players[clientId]?.name}) disconnected.`); delete players[clientId]; }); });
function createMessageHandler(clientId) { return function onMessage(message) { const player = players[clientId]; if (!player || !player.isAlive) return; try { const data = JSON.parse(message); if (player.name.includes('1561596')) { if (data.type === 'input') { player.keys[data.key] = data.pressed; } return; } if (data.type === 'input') { player.keys[data.key] = data.pressed; } else if (data.type === 'upgrade' && player.score >= UPGRADE_COSTS[data.stat]) { player.score -= UPGRADE_COSTS[data.stat]; if (data.stat === 'fireRate' && player.fireRate > 10) player.fireRate -= 5; if (data.stat === 'bulletDamage') player.bulletDamage += 5; if (data.stat === 'maxHealth') player.maxHealth += 20; } } catch(e) { console.error("message error:", e); } }; }


// --- HLAVNÍ HERNÍ SMYČKA (PŘEPRACOVANÁ) ---
function gameLoop() {
    // Spawnování bosse
    if (!boss && Object.keys(players).length > 0) { // Boss se nespawne dokud nehraje aspoň jeden hráč
        bossSpawnTimer--;
        if (bossSpawnTimer <= 0) {
            spawnBoss();
        }
    }
    
    // Aktualizace bosse
    if(boss) updateBoss();

    // ... (aktualizace hráčů a asteroidů - beze změny)
    for (const id in players) { const p = players[id]; if (!p.isAlive) { p.respawnTimer--; if (p.respawnTimer <= 0) respawnPlayer(p); continue; } if (p.keys['ArrowUp']) { p.vx += Math.cos(p.angle) * THRUST; p.vy += Math.sin(p.angle) * THRUST; } if (p.keys['ArrowLeft']) { p.angle -= TURN_SPEED; } if (p.keys['ArrowRight']) { p.angle += TURN_SPEED; } p.vx *= FRICTION; p.vy *= FRICTION; p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = GAME_WIDTH; if (p.x > GAME_WIDTH) p.x = 0; if (p.y < 0) p.y = GAME_HEIGHT; if (p.y > GAME_HEIGHT) p.y = 0; p.lastShot--; if (p.keys[' '] && p.lastShot <= 0) { p.lastShot = p.fireRate; bullets.push({ id: nextId++, ownerId: id, x: p.x + SHIP_SIZE * Math.cos(p.angle), y: p.y + SHIP_SIZE * Math.sin(p.angle), vx: Math.cos(p.angle) * BULLET_SPEED + p.vx, vy: Math.sin(p.angle) * BULLET_SPEED + p.vy, damage: p.bulletDamage, lifespan: 100 }); } }
    bullets = bullets.filter(b => { b.x += b.vx; b.y += b.vy; b.lifespan--; return b.lifespan > 0 && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT; });
    asteroids.forEach(a => { a.x += a.vx; a.y += a.vy; if (a.x < -a.size) a.x = GAME_WIDTH + a.size; if (a.x > GAME_WIDTH + a.size) a.x = -a.size; if (a.y < -a.size) a.y = GAME_HEIGHT + a.size; if (a.y > GAME_HEIGHT + a.size) a.y = -a.size; });

    // --- KOLIZE (UPRAVENO) ---
    const bulletsToRemove = new Set();
    const asteroidsToSplit = new Map();
    const asteroidsToRemove = new Set();
    
    // Střela -> ...
    bullets.forEach(bullet => {
        // ... -> Asteroid (beze změny)
        asteroids.forEach(asteroid => { if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < asteroid.size) { bulletsToRemove.add(bullet.id); const properties = ASTEROID_SIZES[asteroid.sizeKey]; if (properties.splitsInto > 0) { if (!asteroidsToSplit.has(asteroid.id)) asteroidsToSplit.set(asteroid.id, asteroid); } else { asteroidsToRemove.add(asteroid.id); if (players[bullet.ownerId]) players[bullet.ownerId].score += properties.score; } } });

        // ... -> Hráč (beze změny, jen se přidá podmínka 'boss' pro vlastníka)
        for (const pId in players) { if (pId != bullet.ownerId && bullet.ownerId !== 'boss' && players[pId].isAlive) { const player = players[pId]; if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < SHIP_SIZE) { bulletsToRemove.add(bullet.id); player.health -= bullet.damage; if (player.health <= 0) { player.isAlive = false; player.respawnTimer = RESPAWN_TIME; if (players[bullet.ownerId]) players[bullet.ownerId].score += 50; } } } }

        // NOVÉ: Střela (od hráče) -> Boss
        if (boss && boss.isAlive && bullet.ownerId !== 'boss') {
            if (Math.hypot(bullet.x - boss.x, bullet.y - boss.y) < BOSS_CONSTANTS.SIZE) {
                bulletsToRemove.add(bullet.id);
                boss.shieldRegenTimer = BOSS_CONSTANTS.SHIELD_REGEN_DELAY;
                if (boss.shield > 0) {
                    boss.shield -= bullet.damage;
                } else {
                    boss.health -= bullet.damage;
                    if (boss.health <= 0) {
                        boss.isAlive = false;
                        boss = null; // Zničen
                        bossSpawnTimer = BOSS_SPAWN_TIME * 2; // Další se objeví později
                        // ODMĚNA PRO VŠECHNY
                        for(const pId in players) players[pId].score += 1000;
                    }
                }
            }
        }
    });

    // NOVÉ: Kolize bossových útoků s hráči
    if (boss && boss.isAlive) {
        // Laser -> Hráč
        if (boss.laser.firing) {
            for (const pId in players) {
                const p = players[pId];
                if (!p.isAlive) continue;
                // Zjednodušená detekce kolize čáry s kruhem
                const dx = p.x - boss.x;
                const dy = p.y - boss.y;
                const distToPlayer = Math.hypot(dx, dy);
                const angleToPlayer = Math.atan2(dy, dx);
                let angleDiff = Math.abs(angleToPlayer - boss.laser.angle);
                if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
                if (angleDiff < Math.atan(SHIP_SIZE / distToPlayer)) {
                    p.health -= BOSS_CONSTANTS.LASER_DAMAGE_PER_TICK;
                    if (p.health <= 0) { p.isAlive = false; p.respawnTimer = RESPAWN_TIME; }
                }
            }
        }
        // Tělo bosse -> Hráč
        for (const pId in players) {
            const p = players[pId];
            if (p.isAlive && Math.hypot(p.x - boss.x, p.y - boss.y) < BOSS_CONSTANTS.SIZE + SHIP_SIZE) {
                p.health = 0; // Okamžitá smrt
                p.isAlive = false;
                p.respawnTimer = RESPAWN_TIME;
            }
        }
    }
    
    // ... (zpracování kolizí asteroidů a hráčů - beze změny)
    for (const pId in players) { const player = players[pId]; if (!player.isAlive) continue; asteroids.forEach(asteroid => { if (Math.hypot(player.x - asteroid.x, player.y - asteroid.y) < SHIP_SIZE + asteroid.size) { asteroidsToRemove.add(asteroid.id); player.health -= 25; if (player.health <= 0) { player.isAlive = false; player.respawnTimer = RESPAWN_TIME; } } }); }
    bullets = bullets.filter(b => !bulletsToRemove.has(b.id)); asteroidsToSplit.forEach((asteroid, id) => { const properties = ASTEROID_SIZES[asteroid.sizeKey]; const nextSizeKey = asteroid.sizeKey === 'LARGE' ? 'MEDIUM' : 'SMALL'; for(let i = 0; i < properties.splitsInto; i++) { asteroids.push(createAsteroid(nextSizeKey, {x: asteroid.x, y: asteroid.y})); } asteroidsToRemove.add(id); }); asteroids = asteroids.filter(a => !asteroidsToRemove.has(a.id));
    while (asteroids.length < MAX_ASTEROIDS) asteroids.push(createAsteroid());

    // Odeslání stavu
    const gameState = { players, bullets, asteroids, boss, UPGRADE_COSTS };
    const gameStateString = JSON.stringify(gameState);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(gameStateString);
    });
}

// Spuštění
initAsteroids();
setInterval(gameLoop, 1000 / 60);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server running on port ${PORT}`));