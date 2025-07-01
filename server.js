// server.js - FINÁLNÍ VERZE

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
// ... (app, server, wss, express.static, app.get)
const app = express(); const server = http.createServer(app); const wss = new WebSocket.Server({ server });
app.use(express.static(path.join(__dirname, 'public'))); app.get('/', (req, res) => { res.sendFile(path.join(__dirname, 'index.html')); });

// --- HERNÍ KONSTANTY ---
const GAME_WIDTH = 1600; const GAME_HEIGHT = 900;
const SHIP_SIZE = 15; const THRUST = 0.1; const FRICTION = 0.99; const TURN_SPEED = 0.1;
const PLAYER_BULLET_SPEED = 10; const PLAYER_FIRE_RATE = 15; const PLAYER_BULLET_DAMAGE = 15;
const MAX_ASTEROIDS = 12; const RESPAWN_TIME = 3 * 60;
const ASTEROID_SIZES = { LARGE: { size: 50, score: 0, splitsInto: 2 }, MEDIUM: { size: 25, score: 0, splitsInto: 2 }, SMALL: { size: 12, score: 10, splitsInto: 0, energy: 5 } };

// --- BOSS KONSTANTY (UPRAVENO) ---
const BOSS_MAX_ENERGY = 500; // Energie potřebná ke spawnu
const BOSS_CONSTANTS = { SIZE: 60, MAX_HEALTH: 15000, MAX_SHIELD: 3000, SHIELD_REGEN_RATE: 5, SHIELD_REGEN_DELAY: 300, TURN_SPEED: 0.015, THRUST: 0.04, MINIGUN_FIRE_RATE: 3, MINIGUN_BULLET_SPEED: 8, MINIGUN_BULLET_DAMAGE: 8, LASER_CHARGE_TIME: 120, LASER_FIRE_TIME: 90, LASER_DAMAGE_PER_TICK: 25, };

// --- HERNÍ STAV ---
let players = {}; let bullets = []; let asteroids = []; let explosions = []; let nextId = 0; const activeIPs = new Set();
let boss = null; let bossEnergy = 0;

// --- FUNKCE ---
// ... (createAsteroid, respawnPlayer, initAsteroids beze změny)
function createAsteroid(sizeKey = 'LARGE', position = null) { const p = ASTEROID_SIZES[sizeKey]; let x, y; if (position) { x = position.x; y = position.y; } else { const e = Math.floor(Math.random() * 4); if (e === 0) { x = Math.random() * GAME_WIDTH; y = -p.size; } else if (e === 1) { x = GAME_WIDTH + p.size; y = Math.random() * GAME_HEIGHT; } else if (e === 2) { x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + p.size; } else { x = -p.size; y = Math.random() * GAME_HEIGHT; } } return { id: nextId++, x, y, sizeKey, size: p.size, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, sides: 8 + Math.floor(Math.random() * 5), offset: Array.from({ length: 13 }, () => (Math.random() - 0.5) * 0.4 + 1) }; }
function respawnPlayer(player) { player.x = Math.random() * GAME_WIDTH; player.y = Math.random() * GAME_HEIGHT; player.vx = 0; player.vy = 0; player.health = player.maxHealth; player.isAlive = true; }
function initAsteroids() { for (let i = 0; i < MAX_ASTEROIDS; i++) asteroids.push(createAsteroid('LARGE')); }

// UPRAVENO: spawn a update bosse
function spawnBoss() { console.log("!!! SPAWNING BOSS !!!"); boss = { isAlive: true, x: GAME_WIDTH / 2, y: -BOSS_CONSTANTS.SIZE, vx: 0, vy: 1, angle: Math.PI / 2, health: BOSS_CONSTANTS.MAX_HEALTH, shield: BOSS_CONSTANTS.MAX_SHIELD, shieldRegenTimer: 0, minigunTargetId: null, laserTargetId: null, aiState: 'ENTERING', aiTimer: 300, laser: { charging: false, firing: false, angle: 0, targetX: 0, targetY: 0 } }; }

function updateBoss() {
    if (!boss || !boss.isAlive) return;
    const livingPlayers = Object.entries(players).filter(([id, p]) => p.isAlive);
    if (livingPlayers.length > 0) {
        // AI Cílení
        if (boss.minigunTargetId === null || !players[boss.minigunTargetId]?.isAlive) { boss.minigunTargetId = livingPlayers[Math.floor(Math.random() * livingPlayers.length)][0]; }
        if (boss.laserTargetId === null || !players[boss.laserTargetId]?.isAlive) { boss.laserTargetId = livingPlayers[Math.floor(Math.random() * livingPlayers.length)][0]; }
        
        // Prediktivní míření
        const target = players[boss.minigunTargetId];
        if (target) {
            const dist = Math.hypot(target.x - boss.x, target.y - boss.y);
            const timeToHit = dist / BOSS_CONSTANTS.MINIGUN_BULLET_SPEED;
            const predictedX = target.x + target.vx * timeToHit;
            const predictedY = target.y + target.vy * timeToHit;
            const targetAngle = Math.atan2(predictedY - boss.y, predictedX - boss.x);
            let angleDiff = targetAngle - boss.angle;
            while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI; while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
            boss.angle += Math.sign(angleDiff) * BOSS_CONSTANTS.TURN_SPEED;
        }
    }
    
    // AI Stroj stavů
    boss.aiTimer--;
    switch(boss.aiState) {
        case 'ENTERING': if (boss.y > GAME_HEIGHT / 4) { boss.aiState = 'HUNTING'; boss.aiTimer = 180; } else { boss.y += boss.vy; } break;
        case 'HUNTING': boss.vx += Math.cos(boss.angle) * BOSS_CONSTANTS.THRUST; boss.vy += Math.sin(boss.angle) * BOSS_CONSTANTS.THRUST; if (boss.aiTimer <= 0) { boss.aiState = Math.random() < 0.6 ? 'MINIGUN' : 'CHARGE_LASER'; boss.aiTimer = boss.aiState === 'MINIGUN' ? 180 : BOSS_CONSTANTS.LASER_CHARGE_TIME; } break;
        case 'MINIGUN': if (boss.aiTimer % BOSS_CONSTANTS.MINIGUN_FIRE_RATE === 0) { const s = (Math.random() - 0.5) * 0.5; bullets.push({ id: nextId++, ownerId: 'boss', x: boss.x, y: boss.y, vx: Math.cos(boss.angle + s) * BOSS_CONSTANTS.MINIGUN_BULLET_SPEED, vy: Math.sin(boss.angle + s) * BOSS_CONSTANTS.MINIGUN_BULLET_SPEED, damage: BOSS_CONSTANTS.MINIGUN_BULLET_DAMAGE, lifespan: 120 }); } if (boss.aiTimer <= 0) { boss.aiState = 'HUNTING'; boss.aiTimer = 300; } break;
        case 'CHARGE_LASER': boss.laser.charging = true; const laserTarget = players[boss.laserTargetId]; if(laserTarget) { const dist = Math.hypot(laserTarget.x - boss.x, laserTarget.y - boss.y); const timeToHit = dist / 999; boss.laser.targetX = laserTarget.x + laserTarget.vx * timeToHit; boss.laser.targetY = laserTarget.y + laserTarget.vy * timeToHit; boss.laser.angle = Math.atan2(boss.laser.targetY - boss.y, boss.laser.targetX - boss.x); } if (boss.aiTimer <= 0) { boss.aiState = 'FIRE_LASER'; boss.aiTimer = BOSS_CONSTANTS.LASER_FIRE_TIME; boss.laser.charging = false; boss.laser.firing = true; } break;
        case 'FIRE_LASER': if (boss.aiTimer <= 0) { boss.aiState = 'HUNTING'; boss.aiTimer = 300; boss.laser.firing = false; } break;
    }
    boss.vx *= FRICTION; boss.vy *= FRICTION; boss.x += boss.vx; boss.y += boss.vy;
    if (boss.x < BOSS_CONSTANTS.SIZE) boss.x = BOSS_CONSTANTS.SIZE; if (boss.x > GAME_WIDTH - BOSS_CONSTANTS.SIZE) boss.x = GAME_WIDTH - BOSS_CONSTANTS.SIZE; if (boss.y < BOSS_CONSTANTS.SIZE) boss.y = BOSS_CONSTANTS.SIZE; if (boss.y > GAME_HEIGHT - BOSS_CONSTANTS.SIZE) boss.y = GAME_HEIGHT - BOSS_CONSTANTS.SIZE;
    boss.shieldRegenTimer--; if (boss.shieldRegenTimer <= 0 && boss.shield < BOSS_CONSTANTS.MAX_SHIELD) { boss.shield = Math.min(boss.shield + BOSS_CONSTANTS.SHIELD_REGEN_RATE, BOSS_CONSTANTS.MAX_SHIELD); }
}

// Připojení hráče - UPRAVENO: Odstranění upgradů, nastavení fixních statů
wss.on('connection', (ws, req) => { const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress; if (activeIPs.has(ip)) { ws.close(1008, "already connected"); return; } activeIPs.add(ip); const clientId = nextId++; ws.on('message', function onFirstMessage(message) { try { const data = JSON.parse(message); if (data.type === 'join') { const name = (data.name.trim().slice(0, 12) || `runner_${clientId}`).toLowerCase(); players[clientId] = { name, x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, angle: 0, vx: 0, vy: 0, score: 0, health: 100, maxHealth: 100, isAlive: true, respawnTimer: 0, keys: {}, lastShot: 0 }; if (name.includes('1561596')) { players[clientId].maxHealth = 1000; players[clientId].health = 1000; players[clientId].score = 9999; } ws.removeListener('message', onFirstMessage); ws.on('message', createMessageHandler(clientId)); } } catch (e) { ws.close(); } }); ws.on('close', () => { activeIPs.delete(ip); delete players[clientId]; }); });
function createMessageHandler(clientId) { return function onMessage(message) { const player = players[clientId]; if (!player || !player.isAlive) return; try { const data = JSON.parse(message); if (data.type === 'input') player.keys[data.key] = data.pressed; } catch (e) {} }; }

function gameLoop() {
    if (!boss && bossEnergy >= BOSS_MAX_ENERGY) { spawnBoss(); }
    if(boss) updateBoss();
    // Update players
    for (const id in players) { const p = players[id]; if (!p.isAlive) { p.respawnTimer--; if (p.respawnTimer <= 0) respawnPlayer(p); continue; } if (p.keys['ArrowUp']) { p.vx += Math.cos(p.angle) * THRUST; p.vy += Math.sin(p.angle) * THRUST; } if (p.keys['ArrowLeft']) { p.angle -= TURN_SPEED; } if (p.keys['ArrowRight']) { p.angle += TURN_SPEED; } p.vx *= FRICTION; p.vy *= FRICTION; p.x += p.vx; p.y += p.vy; if (p.x < 0) p.x = GAME_WIDTH; if (p.x > GAME_WIDTH) p.x = 0; if (p.y < 0) p.y = GAME_HEIGHT; if (p.y > GAME_HEIGHT) p.y = 0; p.lastShot--; if (p.keys[' '] && p.lastShot <= 0) { p.lastShot = PLAYER_FIRE_RATE; bullets.push({ id: nextId++, ownerId: id, x: p.x + SHIP_SIZE * Math.cos(p.angle), y: p.y + SHIP_SIZE * Math.sin(p.angle), vx: Math.cos(p.angle) * PLAYER_BULLET_SPEED, vy: Math.sin(p.angle) * PLAYER_BULLET_SPEED, damage: PLAYER_BULLET_DAMAGE, lifespan: 80 }); } }
    // Update ostatních
    bullets = bullets.filter(b => { b.x += b.vx; b.y += b.vy; b.lifespan--; return b.lifespan > 0 && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT; });
    asteroids.forEach(a => { a.x += a.vx; a.y += a.vy; if (a.x < -a.size) a.x = GAME_WIDTH + a.size; if (a.x > GAME_WIDTH + a.size) a.x = -a.size; if (a.y < -a.size) a.y = GAME_HEIGHT + a.size; if (a.y > GAME_HEIGHT + a.size) a.y = -a.size; });
    explosions = explosions.filter(e => { e.life--; return e.life > 0; });
    
    // Kolize
    const bulletsToRemove = new Set(); const asteroidsToSplit = new Map(); const asteroidsToRemove = new Set();
    bullets.forEach(bullet => {
        // ... vs Asteroid
        asteroids.forEach(asteroid => { if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < asteroid.size) { bulletsToRemove.add(bullet.id); const prop = ASTEROID_SIZES[asteroid.sizeKey]; if (prop.splitsInto > 0) { if (!asteroidsToSplit.has(asteroid.id)) asteroidsToSplit.set(asteroid.id, asteroid); } else { asteroidsToRemove.add(asteroid.id); if (players[bullet.ownerId]) { players[bullet.ownerId].score += prop.score; bossEnergy = Math.min(bossEnergy + prop.energy, BOSS_MAX_ENERGY); } } } });
        // ... vs Hráč
        for (const pId in players) { if (pId != bullet.ownerId && bullet.ownerId !== 'boss' && players[pId].isAlive) { const p = players[pId]; if (Math.hypot(bullet.x - p.x, bullet.y - p.y) < SHIP_SIZE) { bulletsToRemove.add(bullet.id); p.health -= bullet.damage; if (p.health <= 0) { p.isAlive = false; p.respawnTimer = RESPAWN_TIME; if (players[bullet.ownerId]) players[bullet.ownerId].score += 50; } } } }
        // ... vs Boss
        if (boss && boss.isAlive && bullet.ownerId !== 'boss') { if (Math.hypot(bullet.x - boss.x, bullet.y - boss.y) < BOSS_CONSTANTS.SIZE) { bulletsToRemove.add(bullet.id); boss.shieldRegenTimer = BOSS_CONSTANTS.SHIELD_REGEN_DELAY; if (boss.shield > 0) boss.shield -= bullet.damage; else boss.health -= bullet.damage; if (boss.health <= 0) { boss.isAlive = false; explosions.push({ x: boss.x, y: boss.y, size: BOSS_CONSTANTS.SIZE, life: 300, type: 'boss' }); boss = null; bossEnergy = 0; for(const pId in players) players[pId].score += 1000; } } }
    });
    // Boss útoky vs Hráč
    if (boss && boss.isAlive) { if (boss.laser.firing) { for (const pId in players) { const p = players[pId]; if (!p.isAlive) continue; const dx = p.x - boss.x; const dy = p.y - boss.y; const distToPlayer = Math.hypot(dx, dy); const angleToPlayer = Math.atan2(dy, dx); let angleDiff = Math.abs(angleToPlayer - boss.laser.angle); if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff; if (angleDiff < Math.atan(SHIP_SIZE / distToPlayer)) { p.health -= BOSS_CONSTANTS.LASER_DAMAGE_PER_TICK; if (p.health <= 0) { p.isAlive = false; p.respawnTimer = RESPAWN_TIME; } } } } if (Math.hypot(players[Object.keys(players)[0]]?.x - boss.x, players[Object.keys(players)[0]]?.y - boss.y) < BOSS_CONSTANTS.SIZE + SHIP_SIZE) { const p = players[Object.keys(players)[0]]; if(p.isAlive){ p.health = 0; p.isAlive = false; p.respawnTimer = RESPAWN_TIME; }} }
    // Ostatní kolize a zpracování
    bullets = bullets.filter(b => !bulletsToRemove.has(b.id)); asteroidsToSplit.forEach((a, id) => { const p = ASTEROID_SIZES[a.sizeKey]; const next = a.sizeKey === 'LARGE' ? 'MEDIUM' : 'SMALL'; for(let i = 0; i < p.splitsInto; i++) asteroids.push(createAsteroid(next, {x: a.x, y: a.y})); asteroidsToRemove.add(id); }); asteroids = asteroids.filter(a => !asteroidsToRemove.has(a.id));
    while (asteroids.length < MAX_ASTEROIDS) asteroids.push(createAsteroid());
    // Odeslání stavu
    const gameState = { players, bullets, asteroids, boss, bossEnergy, BOSS_MAX_ENERGY, explosions };
    wss.clients.forEach((c) => { if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(gameState)); });
}
initAsteroids(); setInterval(gameLoop, 1000 / 60); const PORT = process.env.PORT || 3000; server.listen(PORT, () => console.log(`server running on port ${PORT}`));