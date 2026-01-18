// Canvas setup
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

canvas.width = 900;
canvas.height = 500;

const keys = {};
const GROUND_Y = canvas.height - 60;

// Scale factor for character
const SCALE = 0.5;

// Robot character
const robot = {
    x: 150,
    y: GROUND_Y,
    velocityX: 0,
    velocityY: 0,
    isJumping: false,

    speed: 14,
    jumpForce: -12,
    gravity: 0.5,
    friction: 0.85,

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
    speedLines: [],
    dustParticles: [],
    screenShake: { x: 0, y: 0 }
};

// Targets
const targets = [
    { x: 400, y: GROUND_Y - 30 * SCALE, radius: 15, alive: true },
    { x: 550, y: GROUND_Y - 60 * SCALE, radius: 15, alive: true },
    { x: 650, y: GROUND_Y - 20 * SCALE, radius: 12, alive: true },
    { x: 300, y: GROUND_Y - 80 * SCALE, radius: 18, alive: true },
    { x: 750, y: GROUND_Y - 40 * SCALE, radius: 14, alive: true },
];

// Input handling
// Movement: Arrow keys (left/right to move, up or space to jump)
// Attacks: WASD (A=left, D=right, W=up, S=down)
document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();

    if (!keys[key] && !keys[e.key]) {
        keys[key] = true;
        keys[e.key] = true;

        // WASD for attacks
        if (key === 'a') {
            handleAttackPress('left');
        } else if (key === 'd') {
            handleAttackPress('right');
        } else if (key === 'w') {
            handleAttackPress('up');
        } else if (key === 's') {
            handleAttackPress('down');
        }
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    keys[key] = false;
    keys[e.key] = false;

    // Attack release
    if (key === 'a') {
        handleAttackRelease('left');
    } else if (key === 'd') {
        handleAttackRelease('right');
    } else if (key === 'w') {
        handleAttackRelease('up');
    } else if (key === 's') {
        handleAttackRelease('down');
    }
});

function handleAttackPress(direction) {
    if (robot.attackHeld && robot.attackHeld !== direction) {
        // Combo - determine swing type
        const held = robot.attackHeld;
        if ((held === 'up' && direction === 'down') || (held === 'down' && direction === 'up')) {
            // Vertical combo
            robot.attackState = held === 'up' ? 'swing-ud' : 'swing-du';
        } else if ((held === 'left' && direction === 'right') || (held === 'right' && direction === 'left')) {
            // Horizontal combo
            robot.attackState = held === 'left' ? 'swing-lr' : 'swing-rl';
        } else {
            // Diagonal combo
            robot.attackState = 'swing-diag';
        }
        robot.attackProgress = 0;
        robot.strikeTrail = [];
        robot.attackHeld = null;
    } else {
        // Single jab
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
    // Movement with arrow keys
    if (keys['ArrowLeft']) {
        robot.velocityX = -robot.speed;
    } else if (keys['ArrowRight']) {
        robot.velocityX = robot.speed;
    } else {
        robot.velocityX *= robot.friction;
    }

    // Jump with arrow up or space
    if ((keys['ArrowUp'] || keys[' ']) && !robot.isJumping) {
        robot.velocityY = robot.jumpForce;
        robot.isJumping = true;
    }

    robot.velocityY += robot.gravity;
    robot.x += robot.velocityX;
    robot.y += robot.velocityY;

    if (robot.y >= GROUND_Y) {
        robot.y = GROUND_Y;
        robot.velocityY = 0;
        robot.isJumping = false;
    }

    if (robot.x < 30) robot.x = 30;
    if (robot.x > canvas.width - 30) robot.x = canvas.width - 30;

    robot.wheelRotation += robot.velocityX * 0.15;
    updateAttack();
    checkTargetCollisions();

    robot.screenShake.x *= 0.8;
    robot.screenShake.y *= 0.8;

    // Enhanced speed effects
    const absVel = Math.abs(robot.velocityX);
    if (absVel > 0.5) {
        // More afterimages
        if (Math.random() > 0.2) {
            robot.afterimages.push({
                x: robot.x,
                y: robot.y,
                alpha: 0.8,
                wheelRotation: robot.wheelRotation,
                armAngle: robot.armAngle,
                armExtension: robot.armExtension,
                bladeExtension: robot.bladeExtension
            });
        }

        // More speed lines - bigger and more frequent
        if (Math.random() > 0.1) {
            const direction = robot.velocityX > 0 ? -1 : 1;
            robot.speedLines.push({
                x: robot.x + direction * 30 + Math.random() * 150 * direction,
                y: robot.y - 15 * SCALE + (Math.random() - 0.5) * 80,
                length: 40 + Math.random() * 80,
                alpha: 0.9,
                speed: absVel * 2.5
            });
        }

        // More dust
        if (!robot.isJumping && Math.random() > 0.3) {
            const direction = robot.velocityX > 0 ? -1 : 1;
            robot.dustParticles.push({
                x: robot.x + direction * 8 * SCALE,
                y: GROUND_Y,
                vx: direction * (3 + Math.random() * 5),
                vy: -Math.random() * 4,
                size: 3 + Math.random() * 5,
                alpha: 0.7
            });
        }
    }

    // Update effects
    robot.afterimages = robot.afterimages.filter(img => {
        img.alpha -= 0.1;
        return img.alpha > 0;
    });

    robot.speedLines = robot.speedLines.filter(line => {
        const direction = robot.velocityX > 0 ? -1 : 1;
        line.x += direction * line.speed;
        line.alpha -= 0.06;
        return line.alpha > 0;
    });

    robot.dustParticles = robot.dustParticles.filter(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.15;
        p.alpha -= 0.04;
        return p.alpha > 0 && p.y <= GROUND_Y;
    });

    robot.strikeTrail = robot.strikeTrail.filter(p => {
        p.alpha -= 0.15;
        return p.alpha > 0;
    });
}

function checkTargetCollisions() {
    if (robot.bladeExtension < 0.3 || robot.armExtension < 0.3) return;

    const wheelRadius = 20 * SCALE;
    const armLength = 25 * SCALE * robot.armExtension;
    const bladeLength = 120 * SCALE * robot.bladeExtension;
    const pivotX = robot.x;
    const pivotY = robot.y - wheelRadius - 5 * SCALE;

    const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
    const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
    const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
    const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

    targets.forEach(target => {
        if (!target.alive) return;

        // Check line-circle collision
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
                robot.screenShake.x = (Math.random() - 0.5) * 8;
                robot.screenShake.y = (Math.random() - 0.5) * 8;
            }
        }
    });
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

        // Set arm angle: 0=right, -PI=left, -PI/2=up, PI/2=down
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

            // Different swing arcs
            if (swingType === 'lr') {
                robot.armAngle = -Math.PI - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'rl') {
                robot.armAngle = 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'ud') {
                robot.armAngle = -Math.PI / 2 - 0.2 + easeInOut(p) * (Math.PI + 0.4);
            } else if (swingType === 'du') {
                robot.armAngle = Math.PI / 2 + 0.2 - easeInOut(p) * (Math.PI + 0.4);
            } else {
                // Diagonal swing
                robot.armAngle = -Math.PI * 0.75 + easeInOut(p) * Math.PI * 1.5;
            }

            robot.bladeAngle = Math.sin(p * Math.PI) * 0.15;

            if (p > 0.3 && p < 0.7) {
                robot.screenShake.x = (Math.random() - 0.5) * 5;
                robot.screenShake.y = (Math.random() - 0.5) * 3;
            }
        }
        addTrailPoint();

    } else {
        // Idle
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
        const wheelRadius = 20 * SCALE;
        const armLength = 25 * SCALE * robot.armExtension;
        const bladeLength = 120 * SCALE * robot.bladeExtension;
        const pivotX = robot.x;
        const pivotY = robot.y - wheelRadius - 5 * SCALE;

        const armEndX = pivotX + Math.cos(robot.armAngle) * armLength;
        const armEndY = pivotY + Math.sin(robot.armAngle) * armLength;
        const bladeTipX = armEndX + Math.cos(robot.armAngle + robot.bladeAngle) * bladeLength;
        const bladeTipY = armEndY + Math.sin(robot.armAngle + robot.bladeAngle) * bladeLength;

        robot.strikeTrail.push({ x: bladeTipX, y: bladeTipY, alpha: 1 });
    }
}

function draw() {
    ctx.save();
    ctx.translate(robot.screenShake.x, robot.screenShake.y);

    ctx.fillStyle = '#000000';
    ctx.fillRect(-10, -10, canvas.width + 20, canvas.height + 20);

    // Stronger vignette when moving
    const absVel = Math.abs(robot.velocityX);
    if (absVel > 2) {
        const gradient = ctx.createRadialGradient(
            canvas.width/2, canvas.height/2, canvas.height * 0.3,
            canvas.width/2, canvas.height/2, canvas.width * 0.55
        );
        gradient.addColorStop(0, 'rgba(0,0,0,0)');
        gradient.addColorStop(1, `rgba(0,0,0,${Math.min(absVel * 0.04, 0.5)})`);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    // Scanlines
    ctx.fillStyle = 'rgba(255, 255, 255, 0.012)';
    for (let y = 0; y < canvas.height; y += 3) {
        ctx.fillRect(0, y, canvas.width, 1);
    }

    drawGround();
    drawTargets();
    drawSpeedLines();
    drawDustParticles();
    drawAfterimages();
    drawStrikeTrail();
    drawRobot(robot.x, robot.y, 1, robot.armAngle, robot.bladeAngle, robot.wheelRotation, robot.bladeExtension, false, robot.armExtension);
    drawUI();

    ctx.restore();
}

let groundScrollPos = 0;

function drawGround() {
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, GROUND_Y + 10);
    ctx.lineTo(canvas.width, GROUND_Y + 10);
    ctx.stroke();

    ctx.strokeStyle = '#666666';
    const lineSpacing = 25;
    groundScrollPos -= robot.velocityX * 0.5;
    groundScrollPos = ((groundScrollPos % lineSpacing) + lineSpacing) % lineSpacing;

    for (let xPos = groundScrollPos; xPos < canvas.width; xPos += lineSpacing) {
        ctx.beginPath();
        ctx.moveTo(xPos, GROUND_Y + 12);
        ctx.lineTo(xPos, GROUND_Y + 18);
        ctx.stroke();
    }
}

function drawTargets() {
    targets.forEach(target => {
        if (!target.alive) return;

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(target.x, target.y, target.radius, 0, Math.PI * 2);
        ctx.stroke();

        // X marks the spot
        ctx.lineWidth = 1;
        const s = target.radius * 0.5;
        ctx.beginPath();
        ctx.moveTo(target.x - s, target.y - s);
        ctx.lineTo(target.x + s, target.y + s);
        ctx.moveTo(target.x + s, target.y - s);
        ctx.lineTo(target.x - s, target.y + s);
        ctx.stroke();
    });
}

function drawSpeedLines() {
    robot.speedLines.forEach(line => {
        ctx.strokeStyle = `rgba(255, 255, 255, ${line.alpha * 0.7})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(line.x, line.y);
        ctx.lineTo(line.x + line.length * (robot.velocityX > 0 ? -1 : 1), line.y);
        ctx.stroke();
    });
}

function drawDustParticles() {
    robot.dustParticles.forEach(p => {
        ctx.fillStyle = `rgba(255, 255, 255, ${p.alpha * 0.6})`;
        ctx.fillRect(p.x - p.size/2, p.y - p.size/2, p.size, p.size);
    });
}

function drawAfterimages() {
    robot.afterimages.forEach(img => {
        drawRobot(img.x, img.y, img.alpha * 0.4, img.armAngle, 0, img.wheelRotation, img.bladeExtension, true, img.armExtension);
    });
}

function drawStrikeTrail() {
    if (robot.strikeTrail.length < 2) return;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    for (let i = 1; i < robot.strikeTrail.length; i++) {
        const p1 = robot.strikeTrail[i - 1];
        const p2 = robot.strikeTrail[i];
        ctx.strokeStyle = `rgba(255, 255, 255, ${p2.alpha * 0.8})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
    }
}

function drawRobot(x, y, alpha = 1, armAng = -Math.PI/2, bladeAng = 0, wheelRot = 0, bladeExt = 0, isAfterimage = false, armExt = null) {
    ctx.save();
    ctx.globalAlpha = alpha;

    const armExtension = armExt !== null ? armExt : robot.armExtension;
    const wheelRadius = 20 * SCALE;
    const wheelY = y + 2 * SCALE;
    const absVel = Math.abs(robot.velocityX);

    // Draw wheel - clean ellipse, no blur effects
    ctx.save();
    ctx.translate(x, wheelY);

    // Oblong deformation when moving
    const deformAmount = Math.min(absVel / 12, 0.3);
    if (absVel > 0.5 && !isAfterimage) {
        ctx.scale(1 + deformAmount, 1 - deformAmount * 0.5);
    }

    // Just the outline
    ctx.strokeStyle = isAfterimage ? '#555555' : '#ffffff';
    ctx.lineWidth = 2 * SCALE;
    ctx.beginPath();
    ctx.arc(0, 0, wheelRadius, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();

    // Arm and blade
    if (armExtension > 0.01) {
        const pivotX = x;
        const pivotY = y - wheelRadius - 5 * SCALE;

        // Pivot joint
        ctx.strokeStyle = isAfterimage ? '#555555' : '#ffffff';
        ctx.lineWidth = 2 * SCALE;
        ctx.beginPath();
        ctx.arc(pivotX, pivotY, 4 * SCALE, 0, Math.PI * 2);
        ctx.stroke();

        // Arm
        const armLength = 25 * SCALE * armExtension;
        const armEndX = pivotX + Math.cos(armAng) * armLength;
        const armEndY = pivotY + Math.sin(armAng) * armLength;

        ctx.strokeStyle = isAfterimage ? '#555555' : '#ffffff';
        ctx.lineWidth = 2 * SCALE;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(pivotX, pivotY);
        ctx.lineTo(armEndX, armEndY);
        ctx.stroke();

        // Blade
        if (bladeExt > 0.01) {
            const bladeLength = 120 * SCALE * bladeExt;
            const totalBladeAngle = armAng + bladeAng;
            const bladeTipX = armEndX + Math.cos(totalBladeAngle) * bladeLength;
            const bladeTipY = armEndY + Math.sin(totalBladeAngle) * bladeLength;

            ctx.strokeStyle = isAfterimage ? '#666666' : '#ffffff';
            ctx.lineWidth = 1.5 * SCALE;
            ctx.beginPath();
            ctx.moveTo(armEndX, armEndY);
            ctx.lineTo(bladeTipX, bladeTipY);
            ctx.stroke();
        }
    }

    ctx.restore();
}

function drawUI() {
    ctx.fillStyle = '#666666';
    ctx.font = '12px monospace';

    const vx = Math.abs(robot.velocityX).toFixed(1);
    ctx.fillText(`vel: ${vx}`, 20, 25);

    // Target count
    const alive = targets.filter(t => t.alive).length;
    ctx.fillText(`targets: ${alive}/${targets.length}`, 20, 40);

    if (robot.attackState !== 'idle') {
        ctx.fillStyle = '#ffffff';
        let mode = '';
        switch(robot.attackState) {
            case 'jab-left': mode = robot.attackHeld ? '[JAB_L_HOLD]' : '[JAB_L]'; break;
            case 'jab-right': mode = robot.attackHeld ? '[JAB_R_HOLD]' : '[JAB_R]'; break;
            case 'jab-up': mode = robot.attackHeld ? '[JAB_UP_HOLD]' : '[JAB_UP]'; break;
            case 'swing-lr': mode = '[SWING_LR]'; break;
            case 'swing-rl': mode = '[SWING_RL]'; break;
            case 'swing-up': mode = '[SWING_UP]'; break;
        }
        ctx.fillText(mode, canvas.width - 130, 25);
    }
}

function gameLoop() {
    update();
    draw();
    requestAnimationFrame(gameLoop);
}

gameLoop();
