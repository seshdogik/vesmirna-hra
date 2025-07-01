const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

canvas.width = 1600;
canvas.height = 900;

const socket = new WebSocket(`ws://${window.location.host}`);

let gameState = { players: {}, bullets: [], asteroids: [] };
const keysPressed = {};

socket.onmessage = (event) => {
    gameState = JSON.parse(event.data);
};

window.addEventListener('keydown', (e) => {
    if (!keysPressed[e.key]) {
        keysPressed[e.key] = true;
        socket.send(JSON.stringify({ type: 'keydown', key: e.key }));
    }
});
window.addEventListener('keyup', (e) => {
    keysPressed[e.key] = false;
    socket.send(JSON.stringify({ type: 'keyup', key: e.key }));
});

function drawShip(player) {
    const SHIP_SIZE = 15;
    ctx.save();
    ctx.translate(player.x, player.y);
    ctx.rotate(player.angle);
    ctx.beginPath();
    ctx.moveTo(SHIP_SIZE, 0);
    ctx.lineTo(-SHIP_SIZE / 2, -SHIP_SIZE / 2);
    ctx.lineTo(-SHIP_SIZE / 2, SHIP_SIZE / 2);
    ctx.closePath();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;
    ctx.stroke();
    if (player.keys && player.keys['ArrowUp']) {
        ctx.beginPath();
        ctx.moveTo(-SHIP_SIZE / 2, 0);
        ctx.lineTo(-SHIP_SIZE, 0);
        ctx.strokeStyle = 'orange';
        ctx.stroke();
    }
    ctx.restore();
}

function drawBullet(bullet) {
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(bullet.x, bullet.y, 2, 0, Math.PI * 2);
    ctx.fill();
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
    ctx.strokeStyle = 'grey';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.restore();
}

function drawScores() {
    ctx.fillStyle = 'white';
    ctx.font = '16px "Courier New", Courier, monospace';
    let yOffset = 10;
    const sortedPlayers = Object.entries(gameState.players).sort((a, b) => b[1].score - a[1].score);
    for (const [id, player] of sortedPlayers) {
        ctx.fillText(`Hráč ${id.toString().slice(-4)}: ${player.score}`, 10, yOffset);
        yOffset += 20;
    }
}

function render() {
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    for (const id in gameState.players) drawShip(gameState.players[id]);
    for (const bullet of gameState.bullets) drawBullet(bullet);
    for (const asteroid of gameState.asteroids) drawAsteroid(asteroid);
    drawScores();

    requestAnimationFrame(render);
}
render();