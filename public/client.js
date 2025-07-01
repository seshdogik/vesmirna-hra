// public/client.js

// ... (všechny const pro získání prvků zůstávají stejné)
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const loginScreen = document.getElementById('loginScreen');
const playerNameInput = document.getElementById('playerNameInput');
const playButton = document.getElementById('playButton');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score');
const healthDisplay = document.getElementById('integrity');
const upgradeFireRateDisplay = document.getElementById('upgrade-firerate');
const upgradeDamageDisplay = document.getElementById('upgrade-damage');
const upgradeHealthDisplay = document.getElementById('upgrade-health');
const bossWarning = document.getElementById('bossWarning'); // NOVÉ

// ... (ostatní proměnné a connectToServer beze změny)
canvas.width = 1600; canvas.height = 900;
let socket;
let gameState = { players: {}, bullets: [], asteroids: [], boss: null, UPGRADE_COSTS: {} }; // Přidán boss
let localPlayerId = null;
// ... (celý blok až po 'keyup' listener zůstává stejný)
playButton.addEventListener('click', () => { const playerName = playerNameInput.value; loginScreen.style.display = 'none'; canvas.style.display = 'block'; hud.style.display = 'block'; connectToServer(playerName); });
playerNameInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') { playButton.click(); } });
function connectToServer(name) { const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'; socket = new WebSocket(`${protocol}://${window.location.host}`); socket.onopen = () => { console.log("connection established."); socket.send(JSON.stringify({ type: 'join', name: name })); }; socket.onmessage = (event) => { gameState = JSON.parse(event.data); if (!localPlayerId) { for(const id in gameState.players) { if(gameState.players[id].name === (name.trim().slice(0, 12) || `runner_${id}`).toLowerCase()) { localPlayerId = id; break; } } } }; socket.onclose = () => { console.log("connection terminated."); document.body.innerHTML = '<div style="text-align: center; margin-top: 40vh; font-size: 24px;">connection lost</div>'; }; }
const keysPressed = {};
window.addEventListener('keydown', (e) => { if (!keysPressed[e.key] && socket && socket.readyState === WebSocket.OPEN) { keysPressed[e.key] = true; if (['1', '2', '3'].includes(e.key)) { const stats = { '1': 'fireRate', '2': 'bulletDamage', '3': 'maxHealth' }; socket.send(JSON.stringify({ type: 'upgrade', stat: stats[e.key] })); } else { socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: true })); } } });
window.addEventListener('keyup', (e) => { if (socket && socket.readyState === WebSocket.OPEN) { keysPressed[e.key] = false; socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: false })); } });


// --- NOVÁ FUNKCE: VYKRESLENÍ BOSSE ---
function drawBoss(boss) {
    if (!boss || !boss.isAlive) {
        bossWarning.style.display = 'none';
        return;
    }
    bossWarning.style.display = 'block';

    const BOSS_SIZE = 60; // Musí odpovídat serveru
    ctx.save();
    ctx.translate(boss.x, boss.y);
    
    // Štít
    if (boss.shield > 0) {
        ctx.beginPath();
        const shieldOpacity = 0.2 + (boss.shield / 1000) * 0.4; // 1000 je maxShield
        const shieldRadius = BOSS_SIZE + 10 + Math.sin(Date.now() / 200) * 5;
        ctx.arc(0, 0, shieldRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 150, 255, ${shieldOpacity})`;
        ctx.fill();
        ctx.strokeStyle = `rgba(100, 200, 255, ${shieldOpacity + 0.2})`;
        ctx.stroke();
    }

    // Tělo bosse
    ctx.rotate(boss.angle);
    ctx.beginPath();
    ctx.moveTo(BOSS_SIZE, 0);
    ctx.lineTo(BOSS_SIZE * 0.2, BOSS_SIZE * 0.8);
    ctx.lineTo(-BOSS_SIZE * 0.6, BOSS_SIZE * 0.5);
    ctx.lineTo(-BOSS_SIZE * 0.6, -BOSS_SIZE * 0.5);
    ctx.lineTo(BOSS_SIZE * 0.2, -BOSS_SIZE * 0.8);
    ctx.closePath();
    ctx.fillStyle = '#222';
    ctx.fill();
    ctx.strokeStyle = '#f00';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Laser
    if(boss.laser.charging) {
        ctx.beginPath();
        ctx.arc(BOSS_SIZE, 0, Math.random() * 10 + 5, 0, Math.PI * 2);
        ctx.fillStyle = '#ff0';
        ctx.fill();
    }
    ctx.restore(); // Zpět do původní rotace pro health bar
    
    if (boss.laser.firing) {
        ctx.save();
        ctx.translate(boss.x, boss.y);
        ctx.rotate(boss.laser.angle);
        ctx.beginPath();
        ctx.moveTo(BOSS_SIZE, 0);
        ctx.lineTo(2000, 0); // Dlouhý paprsek
        ctx.strokeStyle = '#ff0';
        ctx.lineWidth = 20 + Math.sin(Date.now() / 50) * 5;
        ctx.shadowColor = '#ff0';
        ctx.shadowBlur = 30;
        ctx.stroke();
        ctx.restore();
    }

    // Health bar a shield bar
    ctx.fillStyle = '#555';
    ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 40, 200, 10);
    ctx.fillStyle = '#f00';
    ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 40, 200 * (boss.health / 5000), 10); // 5000 je maxHealth

    ctx.fillStyle = '#05a';
    ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 25, 200, 10);
    ctx.fillStyle = '#0af';
    ctx.fillRect(boss.x - 100, boss.y - BOSS_SIZE - 25, 200 * (boss.shield / 1000), 10);
}


// --- Staré vykreslovací funkce zůstávají (beze změny) ---
function drawShip(player) { if (!player.isAlive) return; const SHIP_SIZE = 15; ctx.save(); ctx.translate(player.x, player.y); ctx.rotate(player.angle); ctx.beginPath(); ctx.moveTo(SHIP_SIZE, 0); ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2); ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2); ctx.closePath(); ctx.strokeStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#fff'; ctx.lineWidth = 2; ctx.stroke(); if (player.keys && player.keys['ArrowUp']) { ctx.beginPath(); ctx.moveTo(-SHIP_SIZE / 2, 0); ctx.lineTo(-SHIP_SIZE, 0); ctx.strokeStyle = '#f90'; ctx.stroke(); } ctx.restore(); ctx.font = '18px "VT323"'; ctx.textAlign = 'center'; ctx.fillStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#ccc'; ctx.fillText(player.name, player.x, player.y - 25); ctx.fillStyle = '#f00'; ctx.fillRect(player.x - 20, player.y - 20, 40, 4); ctx.fillStyle = '#0f0'; ctx.fillRect(player.x - 20, player.y - 20, 40 * (player.health / player.maxHealth), 4); }
function drawBullet(bullet) { ctx.fillStyle = bullet.ownerId === 'boss' ? '#f55' : '#fff'; ctx.beginPath(); ctx.arc(bullet.x, bullet.y, bullet.ownerId === 'boss' ? 4 : 2, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 5; ctx.shadowColor = bullet.ownerId === 'boss' ? '#f00' : '#fff'; }
function drawAsteroid(asteroid) { ctx.save(); ctx.translate(asteroid.x, asteroid.y); ctx.beginPath(); for (let i = 0; i < asteroid.sides; i++) { const angle = (i / asteroid.sides) * Math.PI * 2; const radius = asteroid.size * asteroid.offset[i]; ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle)); } ctx.closePath(); ctx.strokeStyle = '#555'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
function drawHUD() { const player = gameState.players[localPlayerId]; if (!player) return; scoreDisplay.textContent = `score: ${player.score}`; healthDisplay.textContent = `integrity: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}`; const costs = gameState.UPGRADE_COSTS; upgradeFireRateDisplay.textContent = `[1] fire rate (cost: ${costs.fireRate})`; upgradeDamageDisplay.textContent = `[2] damage (cost: ${costs.bulletDamage})`; upgradeHealthDisplay.textContent = `[3] integrity (cost: ${costs.maxHealth})`; }


// --- HLAVNÍ RENDER SMYČKA (UPRAVENO) ---
function render() {
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const id in gameState.players) drawShip(gameState.players[id]);
    
    // Vykreslení bosse (pod střelami, aby střely byly vidět)
    if (gameState.boss) drawBoss(gameState.boss);

    for (const bullet of gameState.bullets) drawBullet(bullet);
    ctx.shadowBlur = 0; // Vypnout stín pro asteroidy
    for (const asteroid of gameState.asteroids) drawAsteroid(asteroid);
    
    if(socket && socket.readyState === WebSocket.OPEN) drawHUD();

    const localPlayer = gameState.players[localPlayerId];
    if(localPlayer && !localPlayer.isAlive) {
        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.font = '60px "VT323"';
        ctx.textAlign = 'center';
        ctx.fillText("terminated", canvas.width / 2, canvas.height / 2);
        ctx.font = '30px "VT323"';
        ctx.fillText(`rebooting in ${Math.ceil(localPlayer.respawnTimer / 60)}`, canvas.width / 2, canvas.height / 2 + 40);
    }
    
    requestAnimationFrame(render);
}

render();