// public/client.js
const canvas = document.getElementById('gameCanvas'); const ctx = canvas.getContext('2d');
const loginScreen = document.getElementById('loginScreen'); const playerNameInput = document.getElementById('playerNameInput'); const playButton = document.getElementById('playButton');
const hud = document.getElementById('hud'); const scoreDisplay = document.getElementById('score'); const healthDisplay = document.getElementById('integrity');
const bossWarning = document.getElementById('bossWarning'); const bossEnergyContainer = document.getElementById('bossEnergyContainer'); const bossEnergyBar = document.getElementById('bossEnergyBar');

canvas.width = 1600; canvas.height = 900;
let socket; let gameState = { players: {}, bullets: [], asteroids: [], boss: null, bossEnergy: 0, BOSS_MAX_ENERGY: 1, explosions: [] }; let localPlayerId = null;
// ... (logika připojení a listenery beze změny)
playButton.addEventListener('click', () => { const n = playerNameInput.value; loginScreen.style.display = 'none'; canvas.style.display = 'block'; hud.style.display = 'block'; connectToServer(n); });
playerNameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') playButton.click(); });
function connectToServer(name) { const p = window.location.protocol === 'https:' ? 'wss' : 'ws'; socket = new WebSocket(`${p}://${window.location.host}`); socket.onopen = () => { socket.send(JSON.stringify({ type: 'join', name: name })); }; socket.onmessage = (e) => { gameState = JSON.parse(e.data); if (!localPlayerId) { for(const id in gameState.players) { if(gameState.players[id].name === (name.trim().slice(0, 12) || `runner_${id}`).toLowerCase()) { localPlayerId = id; break; } } } }; socket.onclose = () => { document.body.innerHTML = '<div style="text-align: center; margin-top: 40vh; font-size: 24px;">connection lost</div>'; }; }
const keysPressed = {}; window.addEventListener('keydown', (e) => { if (!keysPressed[e.key] && socket && socket.readyState === WebSocket.OPEN) { keysPressed[e.key] = true; socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: true })); } }); window.addEventListener('keyup', (e) => { if (socket && socket.readyState === WebSocket.OPEN) { keysPressed[e.key] = false; socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: false })); } });

// --- VYKRESLOVACÍ FUNKCE ---
// ... (drawShip, drawBullet, drawAsteroid beze změny)
function drawShip(player) { if (!player.isAlive) return; const SHIP_SIZE = 15; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle); ctx.beginPath(); ctx.moveTo(SHIP_SIZE, 0); ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2); ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2); ctx.closePath(); ctx.strokeStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#fff'; ctx.lineWidth = 2; ctx.stroke(); if (player.keys && player.keys['ArrowUp']) { ctx.beginPath(); ctx.moveTo(-SHIP_SIZE / 2, 0); ctx.lineTo(-SHIP_SIZE, 0); ctx.strokeStyle = '#f90'; ctx.stroke(); } ctx.restore(); ctx.font = '18px "VT323"'; ctx.textAlign = 'center'; ctx.fillStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#ccc'; ctx.fillText(player.name, player.x, player.y - 25); ctx.fillStyle = '#f00'; ctx.fillRect(player.x - 20, player.y - 20, 40, 4); ctx.fillStyle = '#0f0'; ctx.fillRect(player.x - 20, player.y - 20, 40 * (player.health / player.maxHealth), 4); }
function drawBullet(bullet) { ctx.fillStyle = bullet.ownerId === 'boss' ? '#f55' : '#fff'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.ownerId === 'boss' ? 4 : 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 5; ctx.shadowColor = bullet.ownerId === 'boss' ? '#f00' : '#fff'; }
function drawAsteroid(asteroid) { ctx.save(); ctx.translate(asteroid.x, asteroid.y); ctx.beginPath(); for (let i = 0; i < asteroid.sides; i++) { const angle = (i / asteroid.sides) * Math.PI * 2; const radius = asteroid.size * asteroid.offset[i]; ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle)); } ctx.closePath(); ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }

function drawBoss(boss) { if (!boss || !boss.isAlive) { bossWarning.style.display = 'none'; return; } bossWarning.style.display = 'block'; const BOSS_SIZE = 60; ctx.save(); ctx.translate(boss.x, boss.y); if (boss.shield > 0) { ctx.beginPath(); const shieldOpacity = 0.2 + (boss.shield / 3000) * 0.4; const shieldRadius = BOSS_SIZE + 10 + Math.sin(Date.now() / 200) * 5; ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2); ctx.fillStyle = `rgba(0, 150, 255, ${shieldOpacity})`; ctx.fill(); ctx.strokeStyle = `rgba(100, 200, 255, ${shieldOpacity + 0.2})`; ctx.stroke(); } ctx.rotate(boss.angle); ctx.beginPath(); ctx.moveTo(BOSS_SIZE, 0); ctx.lineTo(BOSS_SIZE * 0.2, BOSS_SIZE * 0.8); ctx.lineTo(-BOSS_SIZE * 0.6, BOSS_SIZE * 0.5); ctx.lineTo(-BOSS_SIZE * 0.6, -BOSS_SIZE * 0.5); ctx.lineTo(BOSS_SIZE * 0.2, -BOSS_SIZE * 0.8); ctx.closePath(); ctx.fillStyle = '#222'; ctx.fill(); ctx.strokeStyle = '#f00'; ctx.lineWidth = 3; ctx.stroke(); if(boss.laser.charging) { ctx.beginPath(); ctx.arc(BOSS_SIZE, 0, Math.random() * 10 + 5, 0, Math.PI * 2); ctx.fillStyle = '#ff0'; ctx.fill(); } ctx.restore(); if (boss.laser.firing) { ctx.save(); ctx.translate(boss.x, boss.y); ctx.rotate(boss.laser.angle); ctx.beginPath(); ctx.moveTo(BOSS_SIZE, 0); ctx.lineTo(boss.laser.targetX - boss.x, boss.laser.targetY - boss.y); ctx.strokeStyle = '#ff0'; ctx.lineWidth = 20 + Math.sin(Date.now() / 50) * 5; ctx.shadowColor = '#ff0'; ctx.shadowBlur = 30; ctx.stroke(); ctx.restore(); } ctx.fillStyle = '#555'; ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 40, 200, 10); ctx.fillStyle = '#f00'; ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 40, 200 * (boss.health / 15000), 10); ctx.fillStyle = '#05a'; ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 25, 200, 10); ctx.fillStyle = '#0af'; ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 25, 200 * (boss.shield / 3000), 10); }

// NOVÉ: Vykreslení explozí
function drawExplosion(explosion) {
    if (explosion.type === 'boss') {
        const progress = 1 - (explosion.life / 300); // 0 to 1
        const initialRadius = explosion.size;
        const maxRadius = 400;

        // Fáze 1: Rychlá bílá exploze
        if (progress < 0.2) {
            const radius = initialRadius + (maxRadius / 2) * (progress / 0.2);
            ctx.fillStyle = `rgba(255, 255, 255, ${1 - progress / 0.2})`;
            ctx.beginPath();
            ctx.arc(explosion.x, explosion.y, radius, 0, 2 * Math.PI);
            ctx.fill();
        }

        // Fáze 2: Ohnivá koule
        if (progress < 0.6) {
            const radius = initialRadius + maxRadius * (progress / 0.6);
            const gradient = ctx.createRadialGradient(explosion.x, explosion.y, 0, explosion.x, explosion.y, radius);
            gradient.addColorStop(0, 'rgba(255, 255, 150, 0.8)');
            gradient.addColorStop(0.5, 'rgba(255, 100, 0, 0.5)');
            gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
            ctx.fillStyle = gradient;
            ctx.fillRect(explosion.x - radius, explosion.y - radius, radius * 2, radius * 2);
        }

        // Fáze 3: Létající jiskry
        for (let i = 0; i < 50; i++) {
            const angle = (i / 50) * Math.PI * 2 + progress;
            const dist = progress * maxRadius * (1 + (i % 5) * 0.1);
            const x = explosion.x + Math.cos(angle) * dist;
            const y = explosion.y + Math.sin(angle) * dist;
            ctx.fillStyle = `rgba(255, 200, 100, ${1 - progress})`;
            ctx.fillRect(x, y, 3, 3);
        }
    }
}

function drawHUD() { const p = gameState.players[localPlayerId]; if (!p) return; scoreDisplay.textContent = `score: ${p.score}`; healthDisplay.textContent = `integrity: ${Math.max(0, Math.round(p.health))}/${p.maxHealth}`; if(!gameState.boss) { bossEnergyContainer.style.display = 'block'; bossEnergyBar.style.width = `${(gameState.bossEnergy / gameState.BOSS_MAX_ENERGY) * 100}%`; } else { bossEnergyContainer.style.display = 'none'; } }

function render() {
    ctx.shadowBlur = 0; ctx.fillStyle = 'black'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    for (const id in gameState.players) drawShip(gameState.players[id]);
    if (gameState.boss) drawBoss(gameState.boss);
    for (const bullet of gameState.bullets) drawBullet(bullet); ctx.shadowBlur = 0;
    for (const asteroid of gameState.asteroids) drawAsteroid(asteroid);
    for (const explosion of gameState.explosions) drawExplosion(explosion); // NOVÉ
    if(socket && socket.readyState === WebSocket.OPEN) drawHUD();
    const localPlayer = gameState.players[localPlayerId]; if(localPlayer && !localPlayer.isAlive) { ctx.fillStyle = 'rgba(255, 0, 0, 0.8)'; ctx.font = '60px "VT323"'; ctx.textAlign = 'center'; ctx.fillText("terminated", canvas.width / 2, canvas.height / 2); ctx.font = '30px "VT323"'; ctx.fillText(`rebooting in ${Math.ceil(localPlayer.respawnTimer / 60)}`, canvas.width / 2, canvas.height / 2 + 40); }
    requestAnimationFrame(render);
}
render();