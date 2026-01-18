// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 900;
canvas.height = 500;

// Offscreen canvas for cached background
const bgCanvas = document.createElement('canvas');
bgCanvas.width = canvas.width;
bgCanvas.height = canvas.height;
const bgCtx = bgCanvas.getContext('2d');

const keys = {};
const GROUND_Y = canvas.height - 60;

// Minimal color palette
const COLORS = {
    bg: '#08080c',
    mid: '#151520',
    dim: '#252535',
    line: '#404055',
    bright: '#ffffff'
};

// World scrolling
let worldScroll = 0;

// Slowmo system
let slowmo = false;
let slowmoFactor = 1;

// Hit particles (minimal)
const hitParticles = [];

// Foreground silhouettes - clean triangles
const silhouettes = [
    { worldX: -100, height: 320, width: 60 },
    { worldX: 150, height: 180, width: 30 },
    { worldX: 380, height: 260, width: 45 },
    { worldX: 520, height: 140, width: 35 },
    { worldX: 750, height: 290, width: 55 },
    { worldX: 950, height: 200, width: 35 },
    { worldX: 1150, height: 350, width: 65 },
    { worldX: 1350, height: 170, width: 40 },
    { worldX: 1550, height: 240, width: 38 },
    { worldX: 1780, height: 310, width: 58 },
    { worldX: 1950, height: 190, width: 42 },
    { worldX: 2150, height: 280, width: 48 },
];

// Robot character
const robot = {
    x: 150,
    y: GROUND_Y,
    velocityX: 0,
    velocityY: 0,
    isJumping: false,

    speed: 30,
    jumpForce: -18,
    gravity: 0.6,
    friction: 0.85,

    combo: 0,
    comboTimer: 0,
    bestCombo: 0,

    armAngle: -Math.PI / 2,
    bladeAngle: 0,
    armExtension: 0,
    bladeExtension: 0,

    attackState: 'idle',
    attackProgress: 0,
    attackHeld: null,
    strikeTrail: [],

    wheelRotation: 0,
    afterimages: [],
    screenShake: { x: 0, y: 0 }
};

// Targets - simple nodes
const targets = [
    // Ground level
    { worldX: 400, x: 400, baseY: GROUND_Y - 25, y: 0, radius: 8, alive: true },
    { worldX: 900, x: 900, baseY: GROUND_Y - 20, y: 0, radius: 7, alive: true },
    { worldX: 1500, x: 1500, baseY: GROUND_Y - 25, y: 0, radius: 8, alive: true },
    { worldX: 2100, x: 2100, baseY: GROUND_Y - 22, y: 0, radius: 7, alive: true },
    // Low air
    { worldX: 300, x: 300, baseY: GROUND_Y - 70, y: 0, radius: 7, alive: true },
    { worldX: 600, x: 600, baseY: GROUND_Y - 90, y: 0, radius: 8, alive: true },
    { worldX: 1000, x: 1000, baseY: GROUND_Y - 80, y: 0, radius: 7, alive: true },
    { worldX: 1400, x: 1400, baseY: GROUND_Y - 75, y: 0, radius: 8, alive: true },
    { worldX: 1800, x: 1800, baseY: GROUND_Y - 85, y: 0, radius: 7, alive: true },
    // Mid air
    { worldX: 450, x: 450, baseY: GROUND_Y - 130, y: 0, radius: 6, alive: true },
    { worldX: 750, x: 750, baseY: GROUND_Y - 150, y: 0, radius: 7, alive: true },
    { worldX: 1100, x: 1100, baseY: GROUND_Y - 140, y: 0, radius: 7, alive: true },
    { worldX: 1600, x: 1600, baseY: GROUND_Y - 135, y: 0, radius: 6, alive: true },
    { worldX: 1950, x: 1950, baseY: GROUND_Y - 145, y: 0, radius: 7, alive: true },
    // High air
    { worldX: 550, x: 550, baseY: GROUND_Y - 190, y: 0, radius: 5, alive: true },
    { worldX: 850, x: 850, baseY: GROUND_Y - 210, y: 0, radius: 6, alive: true },
    { worldX: 1250, x: 1250, baseY: GROUND_Y - 200, y: 0, radius: 5, alive: true },
    { worldX: 1700, x: 1700, baseY: GROUND_Y - 195, y: 0, radius: 6, alive: true },
];

// Input handling
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (!keys[key] && !keys[e.key]) {
        keys[key] = true;
        keys[e.key] = true;

        if (key === 'a') handleAttackPress('left');
        else if (key === 'd') handleAttackPress('right');
        else if (key === 'w') handleAttackPress('up');
        else if (key === 's') handleAttackPress('down');
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    keys[e.key] = false;

    if (key === 'a') handleAttackRelease('left');
    else if (key === 'd') handleAttackRelease('right');
    else if (key === 'w') handleAttackRelease('up');
    else if (key === 's') handleAttackRelease('down');
});

function handleAttackPress(direction) {
    if (robot.attackHeld && robot.attackHeld !== direction) {
        const held = robot.attackHeld;
        if ((held === 'up' && direction === 'down') || (held === 'down' && direction === 'up')) {
            robot.attackState = held === 'up' ? 'swing-ud' : 'swing-du';
        } else if ((held === 'left' && direction === 'right') || (held === 'right' && direction === 'left')) {
            robot.attackState = held === 'left' ? 'swing-lr' : 'swing-rl';
        } else {
            robot.attackState = 'swing-diag';
        }
        robot.attackProgress = 0;
        robot.strikeTrail = [];
        robot.attackHeld = null;
    } else {
        if (direction === 'left') robot.attackState = 'jab-left';
        else if (direction === 'right') robot.attackState = 'jab-right';
        else if (direction === 'up') robot.attackState = 'jab-up';
        else robot.attackState = 'jab-down';

        robot.attackProgress = 0;
        robot.strikeTrail = [];
        robot.attackHeld = direction;
    }
}

function handleAttackRelease(direction) {
    if (robot.attackHeld === direction) {
        robot.attackHeld = null;
    }
}

function update() {
    slowmo = keys[' '] && robot.isJumping;
    slowmoFactor = slowmo ? 0.25 : 1;
    const dt = slowmoFactor;

    // Movement
    if (keys['ArrowLeft']) {
        robot.velocityX = -robot.speed;
    } else if (keys['ArrowRight']) {
        robot.velocityX = robot.speed;
    } else {
        robot.velocityX *= robot.friction;
    }

    // Jump from ground
    if (keys['ArrowUp'] && !robot.isJumping) {
        robot.velocityY = robot.jumpForce;
        robot.isJumping = true;
        robot.combo = 0;
    }

    // Air control
    if (robot.isJumping) {
        if (keys['ArrowUp']) {
            robot.velocityY = -robot.speed * 0.5;
        } else if (keys['ArrowDown']) {
            robot.velocityY = robot.speed * 0.5;
        } else {
            robot.velocityY += robot.gravity * dt;
        }
    } else {
        robot.velocityY += robot.gravity * dt;
    }

    robot.y += robot.velocityY * dt;

    if (robot.comboTimer > 0) robot.comboTimer -= dt;

    if (robot.y >= GROUND_Y) {
        robot.y = GROUND_Y;
        robot.velocityY = 0;
        if (robot.isJumping && robot.combo > 1) {
            robot.comboTimer = 120;
        }
        robot.isJumping = false;
    }

    // World scroll at edges
    const LEFT_EDGE = 150;
    const RIGHT_EDGE = canvas.width - 150;
    robot.x += robot.velocityX * dt;

    if (robot.x < LEFT_EDGE) {
        worldScroll += robot.x - LEFT_EDGE;
        robot.x = LEFT_EDGE;
    } else if (robot.x > RIGHT_EDGE) {
        worldScroll += robot.x - RIGHT_EDGE;
        robot.x = RIGHT_EDGE;
    }

    // Update targets
    for (let i = 0; i < targets.length; i++) {
        targets[i].x = targets[i].worldX - worldScroll;
        targets[i].y = targets[i].baseY;
    }

    robot.wheelRotation += robot.velocityX * 0.15;
    updateAttack();
    checkTargetCollisions();

    robot.screenShake.x *= 0.8;
    robot.screenShake.y *= 0.8;

    // Afterimages
    if (Math.abs(robot.velocityX) > 2 && Math.random() > 0.6) {
        robot.afterimages.push({
            x: robot.x,
            y: robot.y,
            alpha: 0.4,
            wheelRotation: robot.wheelRotation,
            armAngle: robot.armAngle,
            armExtension: robot.armExtension,
            bladeExtension: robot.bladeExtension
        });
    }

    robot.afterimages = robot.afterimages.filter(img => {
        img.alpha -= 0.08;
        return img.alpha > 0;
    });

    robot.strikeTrail = robot.strikeTrail.filter(p => {
        p.alpha -= 0.15;
        return p.alpha > 0;
    });

    // Update hit particles
    for (let i = hitParticles.length - 1; i >= 0; i--) {
        const p = hitParticles[i];
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 0.15 * dt;
        p.alpha -= 0.03 * dt;
        if (p.alpha <= 0) hitParticles.splice(i, 1);
    }
}

function checkTargetCollisions() {
    if (robot.bladeExtension < 0.3 || robot.armExtension < 0.3) return;

    const wheelRadius = 10;
    const armLength = 12 * robot.armExtension;
    const bladeLength = 60 * robot.bladeExtension;
    const pivotX = robot.x;
    const pivotY = robot.y - wheelRadius - 2;

    const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
    const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
    const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
    const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

    for (let i = 0; i < targets.length; i++) {
        const target = targets[i];
        if (!target.alive) continue;

        const dx = bladeTipX - armEndX;
        const dy = bladeTipY - armEndY;
        const fx = armEndX - target.x;
        const fy = armEndY - target.y;

        const a = dx * dx + dy * dy;
        const b = 2 * (fx * dx + fy * dy);
        const c = fx * fx + fy * fy - target.radius * target.radius;

        let discriminant = b * b - 4 * a * c;
        if (discriminant >= 0) {
            discriminant = Math.sqrt(discriminant);
            const t1 = (-b - discriminant) / (2 * a);
            const t2 = (-b + discriminant) / (2 * a);

            if ((t1 >= 0 && t1 <= 1) || (t2 >= 0 && t2 <= 1)) {
                target.alive = false;
                robot.screenShake.x = (Math.random() - 0.5) * 6;
                robot.screenShake.y = (Math.random() - 0.5) * 6;

                // Minimal hit particles - just a few white dots
                for (let p = 0; p < 4; p++) {
                    const angle = (p / 4) * Math.PI * 2 + Math.random() * 0.5;
                    const speed = 1.5 + Math.random() * 2;
                    hitParticles.push({
                        x: target.x,
                        y: target.y,
                        vx: Math.cos(angle) * speed,
                        vy: Math.sin(angle) * speed - 1.5,
                        alpha: 1
                    });
                }

                if (robot.isJumping) {
                    robot.combo++;
                    if (robot.combo > robot.bestCombo) {
                        robot.bestCombo = robot.combo;
                    }
                }
            }
        }
    }
}

function updateAttack() {
    const easeOutQuart = (t) => 1 - Math.pow(1 - t, 4);
    const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    const isJab = robot.attackState.startsWith('jab-');
    const isSwing = robot.attackState.startsWith('swing-');

    if (isJab) {
        const direction = robot.attackState.replace('jab-', '');
        const held = robot.attackHeld === direction;

        if (robot.attackProgress < 1) {
            robot.attackProgress += 0.12;
            if (robot.attackProgress > 1) robot.attackProgress = 1;
        }

        const p = robot.attackProgress;

        if (direction === 'up') robot.armAngle = -Math.PI / 2;
        else if (direction === 'down') robot.armAngle = Math.PI / 2;
        else if (direction === 'left') robot.armAngle = -Math.PI;
        else robot.armAngle = 0;

        if (held) {
            robot.armExtension = easeOutQuint(Math.min(p / 0.2, 1));
            const bladeP = Math.max(0, (p - 0.1) / 0.4);
            robot.bladeExtension = easeOutQuart(Math.min(bladeP, 1)) * 1.8;
        } else {
            if (p < 0.2) {
                robot.armExtension = easeOutQuint(p / 0.2);
                robot.bladeExtension = 0;
            } else if (p < 0.5) {
                robot.armExtension = 1;
                const bladeP = (p - 0.2) / 0.3;
                robot.bladeExtension = easeOutQuart(bladeP) * 1.8;
            } else {
                const retractP = (p - 0.5) / 0.5;
                robot.bladeExtension = 1.8 * (1 - easeOutQuart(Math.min(retractP * 1.5, 1)));
                robot.armExtension = 1 - easeOutQuart(Math.max(0, (retractP - 0.3) / 0.7));
                if (robot.armExtension < 0.01 && robot.bladeExtension < 0.01) {
                    robot.attackState = 'idle';
                    robot.armExtension = 0;
                    robot.bladeExtension = 0;
                }
            }
        }
        robot.bladeAngle = 0;

        if (robot.bladeExtension > 0.3 && robot.attackProgress < 0.5) {
            addTrailPoint();
        }

    } else if (isSwing) {
        robot.attackProgress += 0.08;

        if (robot.attackProgress >= 1) {
            robot.attackState = 'idle';
            robot.attackProgress = 0;
            robot.armExtension = 0;
            robot.bladeExtension = 0;
        } else {
            const p = robot.attackProgress;
            const swingType = robot.attackState.replace('swing-', '');

            robot.armExtension = 1;
            robot.bladeExtension = 1.3;

            if (swingType === 'lr') {
                robot.armAngle = -Math.PI - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'rl') {
                robot.armAngle = 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'ud') {
                robot.armAngle = -Math.PI / 2 - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'du') {
                robot.armAngle = Math.PI / 2 + 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else {
                robot.armAngle = -Math.PI * 0.75 + easeInOut(p) * Math.PI * 1.5;
            }

            robot.bladeAngle = Math.sin(p * Math.PI) * 0.15;

            if (p > 0.3 && p < 0.7) {
                robot.screenShake.x = (Math.random() - 0.5) * 4;
                robot.screenShake.y = (Math.random() - 0.5) * 2;
            }
        }
        addTrailPoint();

    } else {
        robot.armAngle += (-Math.PI/2 - robot.armAngle) * 0.15;
        robot.bladeAngle *= 0.8;
        robot.bladeExtension *= 0.85;
        robot.armExtension *= 0.85;
        if (robot.bladeExtension < 0.01) robot.bladeExtension = 0;
        if (robot.armExtension < 0.01) robot.armExtension = 0;
    }
}

function addTrailPoint() {
    if (robot.bladeExtension > 0.3 && robot.armExtension > 0.3) {
        const wheelRadius = 10;
        const armLength = 12 * robot.armExtension;
        const bladeLength = 60 * robot.bladeExtension;
        const pivotX = robot.x;
        const pivotY = robot.y - wheelRadius - 2;

        const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
        const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
        const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
        const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

        robot.strikeTrail.push({ x: bladeTipX, y: bladeTipY, alpha: 1 });
    }
}

// Cache static background
function initBackground() {
    // Solid dark background
    bgCtx.fillStyle = COLORS.bg;
    bgCtx.fillRect(0, 0, canvas.width, canvas.height);

    // Moon outline
    bgCtx.strokeStyle = COLORS.dim;
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    bgCtx.arc(780, 70, 30, 0, Math.PI * 2);
    bgCtx.stroke();

    // Distant mountains - wireframe outline
    bgCtx.strokeStyle = COLORS.line;
    bgCtx.lineWidth = 1;
    bgCtx.beginPath();
    bgCtx.moveTo(0, GROUND_Y - 60);
    bgCtx.lineTo(120, GROUND_Y - 160);
    bgCtx.lineTo(240, GROUND_Y - 80);
    bgCtx.lineTo(360, GROUND_Y - 200);
    bgCtx.lineTo(480, GROUND_Y - 100);
    bgCtx.lineTo(600, GROUND_Y - 180);
    bgCtx.lineTo(720, GROUND_Y - 90);
    bgCtx.lineTo(840, GROUND_Y - 150);
    bgCtx.lineTo(900, GROUND_Y - 70);
    bgCtx.stroke();

    // Closer mountain range - slightly brighter
    bgCtx.strokeStyle = COLORS.dim;
    bgCtx.beginPath();
    bgCtx.moveTo(0, GROUND_Y - 30);
    bgCtx.lineTo(80, GROUND_Y - 100);
    bgCtx.lineTo(180, GROUND_Y - 50);
    bgCtx.lineTo(300, GROUND_Y - 130);
    bgCtx.lineTo(420, GROUND_Y - 70);
    bgCtx.lineTo(540, GROUND_Y - 110);
    bgCtx.lineTo(660, GROUND_Y - 60);
    bgCtx.lineTo(780, GROUND_Y - 95);
    bgCtx.lineTo(900, GROUND_Y - 45);
    bgCtx.stroke();
}

function draw() {
    ctx.save();
    ctx.translate(robot.screenShake.x | 0, robot.screenShake.y | 0);

    // Draw cached background
    ctx.drawImage(bgCanvas, 0, 0);

    // Silhouettes (foreground trees)
    drawSilhouettes();

    // Ground with grid
    drawGround();

    // Targets
    drawTargets();

    // Hit particles
    drawHitParticles();

    // Afterimages
    drawAfterimages();

    // Strike trail
    drawStrikeTrail();

    // Robot
    drawRobot(robot.x | 0, robot.y | 0, 1, robot.armAngle, robot.bladeAngle, robot.wheelRotation, robot.bladeExtension, false, robot.armExtension);

    // Slowmo indicator - thin radial lines
    if (slowmo) {
        ctx.strokeStyle = COLORS.line;
        ctx.lineWidth = 1;
        const rx = robot.x | 0;
        const ry = (robot.y - 10) | 0;
        for (let i = 0; i < 8; i++) {
            const angle = (i / 8) * Math.PI * 2;
            ctx.beginPath();
            ctx.moveTo(rx + Math.cos(angle) * 30, ry + Math.sin(angle) * 30);
            ctx.lineTo(rx + Math.cos(angle) * 150, ry + Math.sin(angle) * 150);
            ctx.stroke();
        }
    }

    // Combo display - minimal
    if (robot.combo > 1 && robot.isJumping) {
        ctx.fillStyle = COLORS.bright;
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${robot.combo}x`, canvas.width / 2, 70);
        ctx.restore();
    } else if (robot.comboTimer > 0 && robot.combo > 1) {
        ctx.globalAlpha = robot.comboTimer / 120;
        ctx.fillStyle = COLORS.bright;
        ctx.font = '24px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${robot.combo}x`, canvas.width / 2, 70);
        ctx.textAlign = 'left';
        ctx.globalAlpha = 1;
    }

    drawUI();
    ctx.restore();
}

function drawSilhouettes() {
    ctx.strokeStyle = COLORS.dim;
    ctx.lineWidth = 1;
    const baseY = GROUND_Y + 10;

    for (let i = 0; i < silhouettes.length; i++) {
        const s = silhouettes[i];
        let screenX = s.worldX - (worldScroll * 1.2);
        screenX = ((screenX % 2500) + 2500) % 2500 - 400;

        if (screenX < -100 || screenX > 1000) continue;

        // Wireframe triangle
        ctx.beginPath();
        ctx.moveTo(screenX | 0, (baseY - s.height) | 0);
        ctx.lineTo((screenX - s.width) | 0, baseY);
        ctx.lineTo((screenX + s.width) | 0, baseY);
        ctx.closePath();
        ctx.stroke();
    }
}

let groundScrollPos = 0;

function drawGround() {
    // Main ground line
    ctx.strokeStyle = COLORS.bright;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 10);
    ctx.lineTo(canvas.width, GROUND_Y + 10);
    ctx.stroke();

    // Grid markers
    ctx.strokeStyle = COLORS.line;
    groundScrollPos = ((groundScrollPos - robot.velocityX * 0.5) % 40 + 40) % 40;

    for (let x = groundScrollPos | 0; x < canvas.width; x += 40) {
        // Vertical tick
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 10);
        ctx.lineTo(x, GROUND_Y + 18);
        ctx.stroke();
    }

    // Subtle perspective grid lines extending up
    ctx.globalAlpha = 0.15;
    for (let x = groundScrollPos | 0; x < canvas.width; x += 80) {
        ctx.beginPath();
        ctx.moveTo(x, GROUND_Y + 10);
        ctx.lineTo(canvas.width / 2, 50);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

function drawTargets() {
    ctx.strokeStyle = COLORS.bright;
    ctx.lineWidth = 1;

    for (let i = 0; i < targets.length; i++) {
        const t = targets[i];
        if (!t.alive || t.x < -50 || t.x > 950) continue;

        const x = t.x | 0;
        const y = t.y | 0;

        // Simple circle outline
        ctx.beginPath();
        ctx.arc(x, y, t.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Small center dot
        ctx.fillStyle = COLORS.bright;
        ctx.beginPath();
        ctx.arc(x, y, 1.5, 0, Math.PI * 2);
        ctx.fill();
    }
}

function drawHitParticles() {
    ctx.fillStyle = COLORS.bright;
    for (let i = 0; i < hitParticles.length; i++) {
        const p = hitParticles[i];
        ctx.globalAlpha = p.alpha;
        ctx.fillRect((p.x - 1) | 0, (p.y - 1) | 0, 2, 2);
    }
    ctx.globalAlpha = 1;
}

function drawAfterimages() {
    for (let i = 0; i < robot.afterimages.length; i++) {
        const img = robot.afterimages[i];
        drawRobot(img.x | 0, img.y | 0, img.alpha * 0.5, img.armAngle, 0, img.wheelRotation, img.bladeExtension, true, img.armExtension);
    }
}

function drawStrikeTrail() {
    if (robot.strikeTrail.length < 2) return;

    ctx.lineWidth = 1;
    for (let i = 1; i < robot.strikeTrail.length; i++) {
        const p1 = robot.strikeTrail[i - 1];
        const p2 = robot.strikeTrail[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${p2.alpha})`;
        ctx.beginPath();
        ctx.moveTo(p1.x | 0, p1.y | 0);
        ctx.lineTo(p2.x | 0, p2.y | 0);
        ctx.stroke();
    }
}

function drawRobot(x, y, alpha = 1, armAng = -Math.PI/2, bladeAng = 0, wheelRot = 0, bladeExt = 0, isAfterimage = false, armExt = null) {
    ctx.globalAlpha = alpha;

    const armExtension = armExt !== null ? armExt : robot.armExtension;
    const wheelRadius = 10;
    const wheelY = y + 1;

    ctx.strokeStyle = isAfterimage ? COLORS.dim : COLORS.bright;
    ctx.lineWidth = isAfterimage ? 1 : 1.5;

    // Wheel
    ctx.beginPath();
    ctx.arc(x, wheelY, wheelRadius, 0, Math.PI * 2);
    ctx.stroke();

    // Arm and blade
    if (armExtension > 0.01) {
        const pivotX = x;
        const pivotY = y - wheelRadius - 2;

        // Pivot
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 2, 0, Math.PI * 2);
        ctx.stroke();

        // Arm
        const armLength = 12 * armExtension;
        const armEndX = pivotX + Math.cos(armAng) * armLength;
        const armEndY = pivotY + Math.sin(armAng) * armLength;

        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(armEndX | 0, armEndY | 0);
        ctx.stroke();

        // Blade
        if (bladeExt > 0.01) {
            const bladeLength = 60 * bladeExt;
            const totalBladeAngle = armAng + bladeAng;
            const bladeTipX = armEndX + Math.cos(totalBladeAngle) * bladeLength;
            const bladeTipY = armEndY + Math.sin(totalBladeAngle) * bladeLength;

            ctx.beginPath();
            ctx.moveTo(armEndX | 0, armEndY | 0);
            ctx.lineTo(bladeTipX | 0, bladeTipY | 0);
            ctx.stroke();
        }
    }

    ctx.globalAlpha = 1;
}

function drawUI() {
    ctx.fillStyle = COLORS.line;
    ctx.font = '11px monospace';

    const alive = targets.filter(t => t.alive).length;
    ctx.fillText(`${alive}/${targets.length}`, 20, 22);

    if (robot.bestCombo > 1) {
        ctx.fillText(`best: ${robot.bestCombo}x`, 20, 36);
    }

    if (slowmo) {
        ctx.fillStyle = COLORS.bright;
        ctx.fillText('SLOW', canvas.width - 50, 22);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

// Initialize and start
initBackground();
gameLoop();
