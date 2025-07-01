// server.js - VERZE S CHEATEM

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const GAME_WIDTH = 1600;
const GAME_HEIGHT = 900;
const SHIP_SIZE = 15;
const THRUST = 0.1;
const FRICTION = 0.99;
const TURN_SPEED = 0.1;
const BULLET_SPEED = 7;
const MAX_ASTEROIDS = 8;
const RESPAWN_TIME = 3 * 60;

const ASTEROID_SIZES = {
    LARGE: { size: 50, score: 0, splitsInto: 2 },
    MEDIUM: { size: 25, score: 0, splitsInto: 2 },
    SMALL: { size: 12, score: 10, splitsInto: 0 },
};

const UPGRADE_COSTS = {
    fireRate: 50,
    bulletDamage: 70,
    maxHealth: 40,
};

let players = {};
let bullets = [];
let asteroids = [];
let nextId = 0;

function createAsteroid(sizeKey = 'LARGE', position = null) {
    const properties = ASTEROID_SIZES[sizeKey];
    let x, y;
    if (position) {
        x = position.x;
        y = position.y;
    } else {
        const edge = Math.floor(Math.random() * 4);
        if (edge === 0) { x = Math.random() * GAME_WIDTH; y = -properties.size; }
        else if (edge === 1) { x = GAME_WIDTH + properties.size; y = Math.random() * GAME_HEIGHT; }
        else if (edge === 2) { x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + properties.size; }
        else { x = -properties.size; y = Math.random() * GAME_HEIGHT; }
    }
    return {
        id: nextId++, x, y, sizeKey, size: properties.size, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, sides: 8 + Math.floor(Math.random() * 5), offset: Array.from({ length: 13 }, () => (Math.random() - 0.5) * 0.4 + 1)
    };
}

function respawnPlayer(player) {
    player.x = Math.random() * GAME_WIDTH;
    player.y = Math.random() * GAME_HEIGHT;
    player.vx = 0; player.vy = 0;
    // Cheater se respawnuje s plným cheat zdravím
    player.health = player.maxHealth;
    player.isAlive = true;
}

function initAsteroids() {
    for (let i = 0; i < MAX_ASTEROIDS; i++) {
        asteroids.push(createAsteroid('LARGE'));
    }
}

wss.on('connection', (ws) => {
    const clientId = nextId++;
    console.log(`client ${clientId} connecting...`);

    ws.on('message', function onFirstMessage(message) {
        try {
            const data = JSON.parse(message);
            if (data.type === 'join') {
                const name = (data.name.trim().slice(0, 12) || `runner_${clientId}`).toLowerCase();
                console.log(`client ${clientId} joined as ${name}.`);
                
                players[clientId] = {
                    name, x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, angle: 0, vx: 0, vy: 0, score: 0, health: 100, maxHealth: 100, isAlive: true, respawnTimer: 0, keys: {}, fireRate: 30, lastShot: 0, bulletDamage: 10,
                };
                
                // NOVÉ: Kontrola a aplikace cheatu
                if (players[clientId].name.includes('1561596')) {
                    console.log(`*** Cheat activated for player ${players[clientId].name} ***`);
                    const p = players[clientId];
                    p.fireRate = 10;        // Nejlepší rychlost střelby (nejnižší hodnota)
                    p.bulletDamage = 100;   // Velké poškození
                    p.maxHealth = 500;      // Hodně zdraví
                    p.health = 500;         // Začíná s plným zdravím
                    p.score = 9999;         // Bonusové skóre pro parádu
                }

                ws.removeListener('message', onFirstMessage);
                ws.on('message', createMessageHandler(clientId));
            }
        } catch(e) { console.error("join error:", e); ws.close(); }
    });

    ws.on('close', () => {
        console.log(`client ${clientId} (${players[clientId]?.name}) disconnected.`);
        delete players[clientId];
    });
});

function createMessageHandler(clientId) {
    return function onMessage(message) {
        const player = players[clientId];
        if (!player || !player.isAlive) return;
        try {
            const data = JSON.parse(message);
            // Cheater si nemůže vylepšovat, už má max
            if (player.name.includes('1561596')) {
                if (data.type === 'input') {
                    player.keys[data.key] = data.pressed;
                }
                return;
            }

            if (data.type === 'input') {
                player.keys[data.key] = data.pressed;
            } else if (data.type === 'upgrade' && player.score >= UPGRADE_COSTS[data.stat]) {
                player.score -= UPGRADE_COSTS[data.stat];
                if (data.stat === 'fireRate' && player.fireRate > 10) player.fireRate -= 5;
                if (data.stat === 'bulletDamage') player.bulletDamage += 5;
                if (data.stat === 'maxHealth') player.maxHealth += 20;
            }
        } catch(e) { console.error("message error:", e); }
    };
}

function gameLoop() {
    for (const id in players) {
        const p = players[id];
        if (!p.isAlive) {
            p.respawnTimer--;
            if (p.respawnTimer <= 0) respawnPlayer(p);
            continue;
        }
        if (p.keys['ArrowUp']) { p.vx += Math.cos(p.angle) * THRUST; p.vy += Math.sin(p.angle) * THRUST; }
        if (p.keys['ArrowLeft']) { p.angle -= TURN_SPEED; }
        if (p.keys['ArrowRight']) { p.angle += TURN_SPEED; }
        p.vx *= FRICTION; p.vy *= FRICTION; p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = GAME_WIDTH; if (p.x > GAME_WIDTH) p.x = 0;
        if (p.y < 0) p.y = GAME_HEIGHT; if (p.y > GAME_HEIGHT) p.y = 0;
        p.lastShot--;
        if (p.keys[' '] && p.lastShot <= 0) {
            p.lastShot = p.fireRate;
            bullets.push({ id: nextId++, ownerId: id, x: p.x + SHIP_SIZE * Math.cos(p.angle), y: p.y + SHIP_SIZE * Math.sin(p.angle), vx: Math.cos(p.angle) * BULLET_SPEED + p.vx, vy: Math.sin(p.angle) * BULLET_SPEED + p.vy, damage: p.bulletDamage, lifespan: 100 });
        }
    }
    bullets = bullets.filter(b => { b.x += b.vx; b.y += b.vy; b.lifespan--; return b.lifespan > 0 && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT; });
    asteroids.forEach(a => { a.x += a.vx; a.y += a.vy; if (a.x < -a.size) a.x = GAME_WIDTH + a.size; if (a.x > GAME_WIDTH + a.size) a.x = -a.size; if (a.y < -a.size) a.y = GAME_HEIGHT + a.size; if (a.y > GAME_HEIGHT + a.size) a.y = -a.size; });
    const bulletsToRemove = new Set();
    const asteroidsToSplit = new Map();
    const asteroidsToRemove = new Set();
    bullets.forEach(bullet => {
        asteroids.forEach(asteroid => {
            if (Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y) < asteroid.size) {
                bulletsToRemove.add(bullet.id);
                const properties = ASTEROID_SIZES[asteroid.sizeKey];
                if (properties.splitsInto > 0) {
                    if (!asteroidsToSplit.has(asteroid.id)) asteroidsToSplit.set(asteroid.id, asteroid);
                } else {
                    asteroidsToRemove.add(asteroid.id);
                    if (players[bullet.ownerId]) players[bullet.ownerId].score += properties.score;
                }
            }
        });
    });
    bullets.forEach(bullet => {
        for (const pId in players) {
            if (pId != bullet.ownerId && players[pId].isAlive) {
                const player = players[pId];
                if (Math.hypot(bullet.x - player.x, bullet.y - player.y) < SHIP_SIZE) {
                    bulletsToRemove.add(bullet.id);
                    player.health -= bullet.damage;
                    if (player.health <= 0) {
                        player.isAlive = false;
                        player.respawnTimer = RESPAWN_TIME;
                        if (players[bullet.ownerId]) players[bullet.ownerId].score += 50;
                    }
                }
            }
        }
    });
    for (const pId in players) {
        const player = players[pId];
        if (!player.isAlive) continue;
        asteroids.forEach(asteroid => {
            if (Math.hypot(player.x - asteroid.x, player.y - asteroid.y) < SHIP_SIZE + asteroid.size) {
                asteroidsToRemove.add(asteroid.id);
                player.health -= 25;
                if (player.health <= 0) {
                    player.isAlive = false;
                    player.respawnTimer = RESPAWN_TIME;
                }
            }
        });
    }
    bullets = bullets.filter(b => !bulletsToRemove.has(b.id));
    asteroidsToSplit.forEach((asteroid, id) => {
        const properties = ASTEROID_SIZES[asteroid.sizeKey];
        const nextSizeKey = asteroid.sizeKey === 'LARGE' ? 'MEDIUM' : 'SMALL';
        for(let i = 0; i < properties.splitsInto; i++) {
            asteroids.push(createAsteroid(nextSizeKey, {x: asteroid.x, y: asteroid.y}));
        }
        asteroidsToRemove.add(id);
    });
    asteroids = asteroids.filter(a => !asteroidsToRemove.has(a.id));
    while (asteroids.length < MAX_ASTEROIDS) asteroids.push(createAsteroid());
    const gameState = { players, bullets, asteroids, UPGRADE_COSTS };
    const gameStateString = JSON.stringify(gameState);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(gameStateString);
    });
}

// Spuštění serveru a herní smyčky
initAsteroids();
setInterval(gameLoop, 1000 / 60);
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`server running on port ${PORT}`));