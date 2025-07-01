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
const MAX_ASTEROIDS = 10;
const ASTEROID_SIZE = 50;

let players = {};
let bullets = [];
let asteroids = [];
let nextBulletId = 0;

function createAsteroid() {
    const edge = Math.floor(Math.random() * 4);
    let x, y;
    if (edge === 0) { x = Math.random() * GAME_WIDTH; y = -ASTEROID_SIZE; }
    else if (edge === 1) { x = GAME_WIDTH + ASTEROID_SIZE; y = Math.random() * GAME_HEIGHT; }
    else if (edge === 2) { x = Math.random() * GAME_WIDTH; y = GAME_HEIGHT + ASTEROID_SIZE; }
    else { x = -ASTEROID_SIZE; y = Math.random() * GAME_HEIGHT; }

    return { id: Date.now() + Math.random(), x, y, size: ASTEROID_SIZE, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, angle: Math.random() * Math.PI * 2, sides: 8 + Math.floor(Math.random() * 5), offset: Array.from({ length: 13 }, () => (Math.random() - 0.5) * 0.4 + 1) };
}

function initAsteroids() {
    for (let i = 0; i < MAX_ASTEROIDS; i++) asteroids.push(createAsteroid());
}

wss.on('connection', (ws) => {
    const clientId = Date.now();
    console.log(`Klient ${clientId} se připojil.`);
    players[clientId] = { x: Math.random() * GAME_WIDTH, y: Math.random() * GAME_HEIGHT, angle: 0, vx: 0, vy: 0, score: 0, keys: {} };

    ws.on('message', (message) => {
        const data = JSON.parse(message);
        const player = players[clientId];
        if (!player) return;
        if (data.type === 'keydown') {
            player.keys[data.key] = true;
            if (data.key === ' ') {
                bullets.push({ id: nextBulletId++, ownerId: clientId, x: player.x + SHIP_SIZE * Math.cos(player.angle), y: player.y + SHIP_SIZE * Math.sin(player.angle), vx: Math.cos(player.angle) * BULLET_SPEED + player.vx, vy: Math.sin(player.angle) * BULLET_SPEED + player.vy, lifespan: 100 });
            }
        } else if (data.type === 'keyup') {
            player.keys[data.key] = false;
        }
    });

    ws.on('close', () => {
        console.log(`Klient ${clientId} se odpojil.`);
        delete players[clientId];
    });
});

function gameLoop() {
    for (const id in players) {
        const p = players[id];
        if (p.keys['ArrowUp']) { p.vx += Math.cos(p.angle) * THRUST; p.vy += Math.sin(p.angle) * THRUST; }
        if (p.keys['ArrowLeft']) { p.angle -= TURN_SPEED; }
        if (p.keys['ArrowRight']) { p.angle += TURN_SPEED; }
        p.vx *= FRICTION; p.vy *= FRICTION; p.x += p.vx; p.y += p.vy;
        if (p.x < 0) p.x = GAME_WIDTH; if (p.x > GAME_WIDTH) p.x = 0; if (p.y < 0) p.y = GAME_HEIGHT; if (p.y > GAME_HEIGHT) p.y = 0;
    }
    bullets = bullets.filter(b => { b.x += b.vx; b.y += b.vy; b.lifespan--; return b.lifespan > 0 && b.x > 0 && b.x < GAME_WIDTH && b.y > 0 && b.y < GAME_HEIGHT; });
    asteroids.forEach(a => {
        a.x += a.vx; a.y += a.vy;
        if (a.x < -ASTEROID_SIZE) a.x = GAME_WIDTH + ASTEROID_SIZE; if (a.x > GAME_WIDTH + ASTEROID_SIZE) a.x = -ASTEROID_SIZE; if (a.y < -ASTEROID_SIZE) a.y = GAME_HEIGHT + ASTEROID_SIZE; if (a.y > GAME_HEIGHT + ASTEROID_SIZE) a.y = -ASTEROID_SIZE;
    });
    const bulletsToRemove = new Set();
    const asteroidsToRemove = new Set();
    bullets.forEach(bullet => {
        asteroids.forEach(asteroid => {
            const dist = Math.hypot(bullet.x - asteroid.x, bullet.y - asteroid.y);
            if (dist < asteroid.size) {
                bulletsToRemove.add(bullet.id); asteroidsToRemove.add(asteroid.id);
                if(players[bullet.ownerId]) { players[bullet.ownerId].score += 10; }
            }
        });
    });
    bullets = bullets.filter(b => !bulletsToRemove.has(b.id));
    asteroids = asteroids.filter(a => !asteroidsToRemove.has(a.id));
    while (asteroids.length < MAX_ASTEROIDS) asteroids.push(createAsteroid());

    const gameState = { players, bullets, asteroids };
    const gameStateString = JSON.stringify(gameState);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) client.send(gameStateString);
    });
}

initAsteroids();
setInterval(gameLoop, 1000 / 60);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server běží na portu ${PORT}`));