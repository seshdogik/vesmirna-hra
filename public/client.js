// public/client.js

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const loginScreen = document.getElementById('loginScreen');
const playerNameInput = document.getElementById('playerNameInput');
const playButton = document.getElementById('playButton');
const hud = document.getElementById('hud');
const scoreDisplay = document.getElementById('score');
const healthDisplay = document.getElementById('integrity'); // UPRAVENO: integrity místo health
const upgradeFireRateDisplay = document.getElementById('upgrade-firerate');
const upgradeDamageDisplay = document.getElementById('upgrade-damage');
const upgradeHealthDisplay = document.getElementById('upgrade-health');

canvas.width = 1600;
canvas.height = 900;

let socket;
let gameState = { players: {}, bullets: [], asteroids: [], UPGRADE_COSTS: {} };
let localPlayerId = null;

playButton.addEventListener('click', () => {
    const playerName = playerNameInput.value;
    // Nyní povolujeme i prázdné jméno
    loginScreen.style.display = 'none';
    canvas.style.display = 'block';
    hud.style.display = 'block';
    connectToServer(playerName);
});

// UPRAVENO: Přidána detekce Enteru do input fieldu
playerNameInput.addEventListener('keyup', (e) => {
    if (e.key === 'Enter') {
        playButton.click();
    }
});

function connectToServer(name) {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    socket = new WebSocket(`${protocol}://${window.location.host}`);

    socket.onopen = () => {
        console.log("connection established.");
        socket.send(JSON.stringify({ type: 'join', name: name }));
    };

    socket.onmessage = (event) => {
        gameState = JSON.parse(event.data);
        if (!localPlayerId) {
            // Hledáme hráče se stejným jménem, které jsme poslali
            // Toto je zjednodušení, mohlo by selhat pokud se dva lidi pojmenují stejně
            for(const id in gameState.players) {
                if(gameState.players[id].name === (name.trim().slice(0, 12) || `runner_${id}`).toLowerCase()) {
                    localPlayerId = id;
                    break;
                }
            }
        }
    };

    socket.onclose = () => {
        console.log("connection terminated.");
        document.body.innerHTML = '<div style="text-align: center; margin-top: 40vh; font-size: 24px;">connection lost</div>';
    };
}

const keysPressed = {};
window.addEventListener('keydown', (e) => {
    if (!keysPressed[e.key] && socket && socket.readyState === WebSocket.OPEN) {
        keysPressed[e.key] = true;
        if (['1', '2', '3'].includes(e.key)) {
            const stats = { '1': 'fireRate', '2': 'bulletDamage', '3': 'maxHealth' };
            socket.send(JSON.stringify({ type: 'upgrade', stat: stats[e.key] }));
        } else {
            socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: true }));
        }
    }
});
window.addEventListener('keyup', (e) => {
    if (socket && socket.readyState === WebSocket.OPEN) {
        keysPressed[e.key] = false;
        socket.send(JSON.stringify({ type: 'input', key: e.key, pressed: false }));
    }
});

function drawShip(player) {
    if (!player.isAlive) return;

    const SHIP_SIZE = 15;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
    ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.closePath();
    
    // UPRAVENO: jiná barva pro sebe a ostatní
    ctx.strokeStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    if (player.keys && player.keys['ArrowUp']) {
        ctx.beginPath(); ctx.moveTo(-SHIP_SIZE / 2, 0); ctx.lineTo(-SHIP_SIZE, 0); ctx.strokeStyle = '#f90'; ctx.stroke();
    }
    ctx.restore();

    // UPRAVENO: vykreslení jména a health baru
    ctx.font = '18px "VT323"';
    ctx.textAlign = 'center';
    ctx.fillStyle = (player.name === gameState.players[localPlayerId]?.name) ? '#0f0' : '#ccc';
    ctx.fillText(player.name, player.x, player.y - 25);
    
    ctx.fillStyle = '#f00';
    ctx.fillRect(player.x - 20, player.y - 20, 40, 4);
    ctx.fillStyle = '#0f0';
    ctx.fillRect(player.x - 20, player.y - 20, 40 * (player.health / player.maxHealth), 4);
}

function drawBullet(bullet) {
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 5; // UPRAVENO: lehká záře
    ctx.shadowColor = '#fff';
}

function drawAsteroid(asteroid) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.beginPath();
    for (let i = 0; i < asteroid.sides; i++) {
        const angle = (i / asteroid.sides) * Math.PI * 2;
        const radius = asteroid.size * asteroid.offset[i];
        ctx.lineTo(radius * Math.cos(angle), radius * Math.sin(angle));
    }
    ctx.closePath();
    ctx.strokeStyle = '#555'; // Tmavší
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
}

// UPRAVENO: texty v HUDu
function drawHUD() {
    const player = gameState.players[localPlayerId];
    if (!player) return;

    scoreDisplay.textContent = `score: ${player.score}`;
    healthDisplay.textContent = `integrity: ${Math.max(0, Math.round(player.health))}/${player.maxHealth}`;

    const costs = gameState.UPGRADE_COSTS;
    upgradeFireRateDisplay.textContent = `[1] fire rate (cost: ${costs.fireRate})`;
    upgradeDamageDisplay.textContent = `[2] damage (cost: ${costs.bulletDamage})`;
    upgradeHealthDisplay.textContent = `[3] integrity (cost: ${costs.maxHealth})`;
}


function render() {
    ctx.shadowBlur = 0; // Reset stínu
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const id in gameState.players) drawShip(gameState.players[id]);
    for (const bullet of gameState.bullets) drawBullet(bullet);
    ctx.shadowBlur = 0; // Reset stínu po střelách
    for (const asteroid of gameState.asteroids) drawAsteroid(asteroid);
    
    if(socket && socket.readyState === WebSocket.OPEN) drawHUD();

    // UPRAVENO: zpráva při smrti
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