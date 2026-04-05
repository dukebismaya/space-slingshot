/**
 * Avyra - Space Slingshot Game
 * A one-tap mobile physics game for Telegram Web App
 */

// ============================================
// UTILITY FUNCTIONS
// ============================================

const Utils = {
    lerp: (a, b, t) => a + (b - a) * t,
    
    clamp: (val, min, max) => Math.max(min, Math.min(max, val)),
    
    distance: (x1, y1, x2, y2) => Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2),
    
    angle: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1),
    
    randomRange: (min, max) => Math.random() * (max - min) + min,
    
    randomInt: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
    
    normalizeAngle: (angle) => {
        while (angle > Math.PI) angle -= Math.PI * 2;
        while (angle < -Math.PI) angle += Math.PI * 2;
        return angle;
    }
};

// ============================================
// ACCRETION PARTICLE CLASS (for black holes)
// ============================================

class AccretionParticle {
    constructor(parentWell) {
        this.parent = parentWell;
        this.angle = Utils.randomRange(0, Math.PI * 2);
        this.radius = Utils.randomRange(parentWell.eventHorizon * 1.2, parentWell.radius * 1.5);
        this.speed = Utils.randomRange(0.02, 0.06);
        this.size = Utils.randomRange(1, 3);
        this.alpha = Utils.randomRange(0.3, 0.8);
        this.color = this.getColor();
        this.spiralRate = Utils.randomRange(0.001, 0.003);
    }
    
    getColor() {
        const colors = [
            '#FF6B4A', '#FF8C42', '#FFD93D', '#66FCF1', '#FFFFFF'
        ];
        return colors[Utils.randomInt(0, colors.length - 1)];
    }
    
    update() {
        this.angle += this.speed;
        this.radius -= this.spiralRate * this.radius;
        
        // Reset if consumed
        if (this.radius < this.parent.eventHorizon * 0.9) {
            this.radius = Utils.randomRange(this.parent.radius * 1.2, this.parent.radius * 1.8);
            this.angle = Utils.randomRange(0, Math.PI * 2);
        }
    }
    
    getPosition() {
        // Create elliptical orbit with tilt
        const x = Math.cos(this.angle) * this.radius;
        const y = Math.sin(this.angle) * this.radius * 0.35;
        return { x, y };
    }
}

// ============================================
// PARTICLE CLASS
// ============================================

class Particle {
    constructor(x, y, options = {}) {
        this.x = x;
        this.y = y;
        this.vx = options.vx || Utils.randomRange(-3, 3);
        this.vy = options.vy || Utils.randomRange(-3, 3);
        this.radius = options.radius || Utils.randomRange(1, 4);
        this.color = options.color || '#66FCF1';
        this.alpha = 1;
        this.decay = options.decay || Utils.randomRange(0.015, 0.03);
        this.gravity = options.gravity || 0;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += this.gravity;
        this.alpha -= this.decay;
        this.radius *= 0.98;
    }
    
    draw(ctx) {
        if (this.alpha <= 0) return;
        
        ctx.save();
        ctx.globalAlpha = this.alpha;
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.radius), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
    
    get isDead() {
        return this.alpha <= 0 || this.radius < 0.5;
    }
}

// ============================================
// TRAIL POINT CLASS
// ============================================

class TrailPoint {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.alpha = 1;
    }
}

// ============================================
// SHIP CLASS
// ============================================

class Ship {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.vx = 3;
        this.vy = 0;
        this.speed = 3.5;
        this.maxSpeed = 14;
        this.radius = 12;
        this.angle = 0;
        this.trail = [];
        this.maxTrailLength = 40;
        this.tethered = false;
        this.tetherTarget = null;
        this.orbitAngle = 0;
        this.orbitRadius = 0;
        this.orbitSpeed = 0;
        this.baseOrbitSpeed = 0.05;
        this.orbitAcceleration = 0.0015; // Increased for faster momentum build up
        this.glowIntensity = 1;
        this.releaseBurst = false;
        
        // Player assist features
        this.shield = 1; // One-time collision save
        this.shieldCooldown = 0;
        this.autoCorrect = true; // Subtle trajectory correction
        this.slowMoActive = false;
        this.slowMoFactor = 1;
        this.magneticPull = 0.15; // Gentle pull towards nearest gravity well
        this.trajectoryPreview = []; // Predicted path
        
        // Directional control (spaceship-style steering)
        this.steerAngle = 0; // Current steering direction
        this.steerInput = 0; // -1 (left/up), 0 (none), 1 (right/down)
        this.steerSpeed = 0.06; // How fast the ship can turn
        this.thrustInput = 0; // -1 (brake), 0 (none), 1 (boost)
        this.thrustPower = 0.08; // Acceleration from thrust
        this.maxSteerAngle = Math.PI / 3; // Max turn rate per frame
    }
    
    tether(gravityWell) {
        if (this.tethered) return;
        
        this.tethered = true;
        this.tetherTarget = gravityWell;
        
        // Calculate initial orbit parameters
        const dx = this.x - gravityWell.x;
        const dy = this.y - gravityWell.y;
        this.orbitRadius = Utils.distance(this.x, this.y, gravityWell.x, gravityWell.y);
        this.orbitAngle = Math.atan2(dy, dx);
        
        // Determine orbit direction based on current velocity
        const tangentAngle = Math.atan2(this.vy, this.vx);
        const toShipAngle = Math.atan2(dy, dx);
        const angleDiff = tangentAngle - toShipAngle;
        
        // Clockwise or counter-clockwise based on approach angle
        this.orbitDirection = Math.sin(angleDiff) > 0 ? 1 : -1;
        
        // Initial orbit speed based on current velocity
        const currentSpeed = Math.sqrt(this.vx ** 2 + this.vy ** 2);
        this.orbitSpeed = (currentSpeed / this.orbitRadius) * 0.8;
        this.orbitSpeed = Math.max(this.orbitSpeed, this.baseOrbitSpeed);
    }
    
    release() {
        if (!this.tethered) return;
        
        // Calculate release velocity (tangent to orbit)
        const tangentAngle = this.orbitAngle + (this.orbitDirection * Math.PI / 2);
        const releaseSpeed = this.orbitSpeed * this.orbitRadius * 1.8;
        const clampedSpeed = Utils.clamp(releaseSpeed, this.speed * 1.2, this.maxSpeed);
        
        this.vx = Math.cos(tangentAngle) * clampedSpeed;
        this.vy = Math.sin(tangentAngle) * clampedSpeed;
        this.angle = tangentAngle; // Update angle to match launch direction
        
        this.tethered = false;
        this.tetherTarget = null;
        
        // Boost glow on release
        this.glowIntensity = 2.5;
        
        // Create release burst particles
        this.releaseBurst = true;
    }
    
    applyGravityAssist(gravityWells) {
        if (this.tethered) return;
        
        // Magnetic pull towards nearest gravity well (helps catch them)
        let nearestWell = null;
        let minDist = Infinity;
        
        for (const well of gravityWells) {
            const dist = Utils.distance(this.x, this.y, well.x, well.y);
            if (dist < well.pullRadius * 1.5 && dist < minDist) {
                minDist = dist;
                nearestWell = well;
            }
        }
        
        if (nearestWell && minDist > nearestWell.eventHorizon * 2) {
            const angle = Utils.angle(this.x, this.y, nearestWell.x, nearestWell.y);
            const pullStrength = this.magneticPull * (1 - minDist / (nearestWell.pullRadius * 1.5));
            
            this.vx += Math.cos(angle) * pullStrength;
            this.vy += Math.sin(angle) * pullStrength;
        }
    }
    
    applyBoundaryCorrection(screenHeight) {
        if (!this.autoCorrect || this.tethered) return;
        
        // Subtle push away from screen edges
        const margin = 80;
        const correctionStrength = 0.08;
        
        if (this.y < margin) {
            this.vy += correctionStrength * (1 - this.y / margin);
        } else if (this.y > screenHeight - margin) {
            this.vy -= correctionStrength * (1 - (screenHeight - this.y) / margin);
        }
    }
    
    calculateTrajectory(gravityWells, steps = 60) {
        if (this.tethered) {
            this.trajectoryPreview = [];
            return;
        }
        
        // Simulate future positions
        this.trajectoryPreview = [];
        let simX = this.x;
        let simY = this.y;
        let simVx = this.vx;
        let simVy = this.vy;
        
        for (let i = 0; i < steps; i++) {
            // Apply gravity from wells
            for (const well of gravityWells) {
                const dist = Utils.distance(simX, simY, well.x, well.y);
                if (dist < well.pullRadius && dist > well.eventHorizon) {
                    const angle = Utils.angle(simX, simY, well.x, well.y);
                    const pullStrength = 0.3 * (1 - dist / well.pullRadius);
                    simVx += Math.cos(angle) * pullStrength;
                    simVy += Math.sin(angle) * pullStrength;
                }
            }
            
            simX += simVx;
            simY += simVy;
            
            if (i % 3 === 0) {
                this.trajectoryPreview.push({ x: simX, y: simY, alpha: 1 - i / steps });
            }
        }
    }
    
    useShield() {
        if (this.shield > 0 && this.shieldCooldown <= 0) {
            this.shield--;
            this.shieldCooldown = 180; // 3 seconds at 60fps
            return true;
        }
        return false;
    }
    
    update(deltaTime, screenHeight, gravityWells) {
        // Update shield cooldown
        if (this.shieldCooldown > 0) this.shieldCooldown--;
        
        // Add current position to trail
        this.trail.unshift(new TrailPoint(this.x, this.y));
        if (this.trail.length > this.maxTrailLength) {
            this.trail.pop();
        }
        
        // Fade trail points
        for (let i = 0; i < this.trail.length; i++) {
            this.trail[i].alpha = 1 - (i / this.maxTrailLength);
        }
        
        if (this.tethered && this.tetherTarget) {
            // Orbit physics
            this.orbitSpeed += this.orbitAcceleration;
            this.orbitSpeed = Math.min(this.orbitSpeed, 0.15);
            
            // Gradually decrease orbit radius for spiral effect (slower decay)
            this.orbitRadius *= 0.999;
            this.orbitRadius = Math.max(this.orbitRadius, this.tetherTarget.eventHorizon + 25);
            
            this.orbitAngle += this.orbitSpeed * this.orbitDirection * this.slowMoFactor;
            
            this.x = this.tetherTarget.x + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.y = this.tetherTarget.y + Math.sin(this.orbitAngle) * this.orbitRadius;
            
            // Update angle for visual rotation
            this.angle = this.orbitAngle + (this.orbitDirection * Math.PI / 2);
        } else {
            // Apply assists
            this.applyGravityAssist(gravityWells);
            this.applyBoundaryCorrection(screenHeight);
            
            // Apply steering
            if (this.steerInput !== 0) {
                this.angle += this.steerInput * this.steerSpeed;
            }
            
            // Apply thrust
            if (this.thrustInput > 0) {
                this.vx += Math.cos(this.angle) * this.thrustPower;
                this.vy += Math.sin(this.angle) * this.thrustPower;
                this.glowIntensity = Utils.lerp(this.glowIntensity, 1.8, 0.2);
            } else if (this.thrustInput < 0) {
                this.vx *= 0.98;
                this.vy *= 0.98;
            }
            
            // Cap speed
            const speed = Math.sqrt(this.vx ** 2 + this.vy ** 2);
            if (speed > this.maxSpeed) {
                this.vx = (this.vx / speed) * this.maxSpeed;
                this.vy = (this.vy / speed) * this.maxSpeed;
            }
            
            // Free movement
            this.x += this.vx * this.slowMoFactor;
            this.y += this.vy * this.slowMoFactor;
            
            // Calculate trajectory preview
            this.calculateTrajectory(gravityWells);
        }
        
        // Decay glow intensity
        this.glowIntensity = Utils.lerp(this.glowIntensity, 1, 0.05);
        
        // Update slow-mo
        this.slowMoFactor = Utils.lerp(this.slowMoFactor, this.slowMoActive ? 0.4 : 1, 0.1);
    }
    
    draw(ctx) {
        // Draw trajectory preview
        this.drawTrajectory(ctx);
        
        // Draw trail
        this.drawTrail(ctx);
        
        // Draw tether line
        if (this.tethered && this.tetherTarget) {
            this.drawTether(ctx);
        }
        
        // Draw ship
        this.drawShip(ctx);
        
        // Draw shield indicator
        if (this.shield > 0) {
            this.drawShieldIndicator(ctx);
        }
    }
    
    drawTrajectory(ctx) {
        if (this.trajectoryPreview.length < 2) return;
        
        ctx.save();
        
        for (let i = 0; i < this.trajectoryPreview.length; i++) {
            const point = this.trajectoryPreview[i];
            const alpha = point.alpha * 0.4;
            
            ctx.fillStyle = `rgba(102, 252, 241, ${alpha})`;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 3 * point.alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
    
    drawTrail(ctx) {
        if (this.trail.length < 2) return;
        
        ctx.save();
        
        for (let i = 0; i < this.trail.length - 1; i++) {
            const point = this.trail[i];
            const nextPoint = this.trail[i + 1];
            
            const gradient = ctx.createLinearGradient(
                point.x, point.y, nextPoint.x, nextPoint.y
            );
            
            const alpha1 = point.alpha * 0.8;
            const alpha2 = nextPoint.alpha * 0.8;
            
            gradient.addColorStop(0, `rgba(102, 252, 241, ${alpha1})`);
            gradient.addColorStop(1, `rgba(102, 252, 241, ${alpha2})`);
            
            ctx.strokeStyle = gradient;
            ctx.lineWidth = (1 - i / this.trail.length) * 6 + 1;
            ctx.lineCap = 'round';
            ctx.shadowColor = '#66FCF1';
            ctx.shadowBlur = 15 * point.alpha;
            
            ctx.beginPath();
            ctx.moveTo(point.x, point.y);
            ctx.lineTo(nextPoint.x, nextPoint.y);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    drawShieldIndicator(ctx) {
        if (this.shieldCooldown > 0) return;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Shield aura
        const pulsePhase = Date.now() / 500;
        const pulse = Math.sin(pulsePhase) * 0.2 + 0.8;
        
        ctx.strokeStyle = `rgba(100, 200, 255, ${0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#64C8FF';
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, this.radius + 8, 0, Math.PI * 2);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawTether(ctx) {
        ctx.save();
        
        const gradient = ctx.createLinearGradient(
            this.x, this.y, this.tetherTarget.x, this.tetherTarget.y
        );
        gradient.addColorStop(0, 'rgba(255, 217, 61, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 217, 61, 0.4)');
        gradient.addColorStop(1, 'rgba(255, 107, 107, 0.2)');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#FFD93D';
        ctx.shadowBlur = 10;
        ctx.setLineDash([5, 10]);
        
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.tetherTarget.x, this.tetherTarget.y);
        ctx.stroke();
        
        ctx.restore();
    }
    
    drawShip(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.angle);
        
        // Glow effect
        const glowSize = 25 * this.glowIntensity;
        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, glowSize);
        gradient.addColorStop(0, 'rgba(102, 252, 241, 0.6)');
        gradient.addColorStop(0.5, 'rgba(102, 252, 241, 0.2)');
        gradient.addColorStop(1, 'rgba(102, 252, 241, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, glowSize, 0, Math.PI * 2);
        ctx.fill();
        
        // Ship body (triangle)
        ctx.shadowColor = '#66FCF1';
        ctx.shadowBlur = 20 * this.glowIntensity;
        ctx.fillStyle = '#66FCF1';
        
        ctx.beginPath();
        ctx.moveTo(this.radius, 0);
        ctx.lineTo(-this.radius * 0.7, -this.radius * 0.6);
        ctx.lineTo(-this.radius * 0.4, 0);
        ctx.lineTo(-this.radius * 0.7, this.radius * 0.6);
        ctx.closePath();
        ctx.fill();
        
        // Inner highlight
        ctx.fillStyle = '#FFFFFF';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(this.radius * 0.5, 0);
        ctx.lineTo(-this.radius * 0.2, -this.radius * 0.25);
        ctx.lineTo(-this.radius * 0.2, this.radius * 0.25);
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
    }
    
    createExplosion() {
        const particles = [];
        const colors = ['#66FCF1', '#FFD93D', '#FF6B6B', '#FFFFFF', '#45A29E'];
        
        for (let i = 0; i < 50; i++) {
            const angle = Utils.randomRange(0, Math.PI * 2);
            const speed = Utils.randomRange(2, 8);
            
            particles.push(new Particle(this.x, this.y, {
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                radius: Utils.randomRange(2, 6),
                color: colors[Utils.randomInt(0, colors.length - 1)],
                decay: Utils.randomRange(0.01, 0.025)
            }));
        }
        
        return particles;
    }
}

// ============================================
// GRAVITY WELL CLASS (Realistic Black Hole)
// ============================================

class GravityWell {
    constructor(x, y, radius) {
        this.x = x;
        this.y = y;
        this.radius = radius || Utils.randomRange(40, 80);
        this.eventHorizon = this.radius * 0.35;
        this.pullRadius = this.radius * 3.5;
        this.photonSphere = this.eventHorizon * 1.5;
        
        // Rotation and animation
        this.rotationAngle = 0;
        this.rotationSpeed = Utils.randomRange(0.015, 0.035);
        this.pulsePhase = Math.random() * Math.PI * 2;
        this.time = Math.random() * 1000;
        
        // Accretion disk particles
        this.accretionParticles = [];
        this.initAccretionDisk();
        
        // Gravitational lensing
        this.lensStrength = Utils.randomRange(0.8, 1.2);
        
        // Hawking radiation particles
        this.hawkingParticles = [];
    }
    
    initAccretionDisk() {
        const particleCount = Utils.randomInt(25, 40);
        for (let i = 0; i < particleCount; i++) {
            this.accretionParticles.push(new AccretionParticle(this));
        }
    }
    
    update() {
        this.rotationAngle += this.rotationSpeed;
        this.pulsePhase += 0.03;
        this.time++;
        
        // Update accretion particles
        for (const particle of this.accretionParticles) {
            particle.update();
        }
        
        // Spawn hawking radiation occasionally
        if (Math.random() < 0.03) {
            this.spawnHawkingParticle();
        }
        
        // Update and clean hawking particles
        for (const p of this.hawkingParticles) {
            p.x += p.vx;
            p.y += p.vy;
            p.alpha -= 0.015;
        }
        this.hawkingParticles = this.hawkingParticles.filter(p => p.alpha > 0);
    }
    
    spawnHawkingParticle() {
        const angle = Utils.randomRange(0, Math.PI * 2);
        const dist = this.eventHorizon * 1.1;
        this.hawkingParticles.push({
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist,
            vx: Math.cos(angle) * Utils.randomRange(0.5, 1.5),
            vy: Math.sin(angle) * Utils.randomRange(0.5, 1.5),
            alpha: 1,
            size: Utils.randomRange(1, 2)
        });
    }
    
    draw(ctx) {
        ctx.save();
        ctx.translate(this.x, this.y);
        
        // Draw gravitational lensing effect (outer distortion rings)
        this.drawLensingEffect(ctx);
        
        // Draw outer gravity field indicator
        this.drawGravityField(ctx);
        
        // Draw accretion disk (behind black hole)
        this.drawAccretionDiskBack(ctx);
        
        // Draw photon sphere
        this.drawPhotonSphere(ctx);
        
        // Draw event horizon (the actual black hole)
        this.drawEventHorizon(ctx);
        
        // Draw accretion disk (front)
        this.drawAccretionDiskFront(ctx);
        
        // Draw hawking radiation
        this.drawHawkingRadiation(ctx);
        
        // Draw relativistic jets
        this.drawRelativisticJets(ctx);
        
        ctx.restore();
    }
    
    drawLensingEffect(ctx) {
        // Multiple distortion rings to simulate gravitational lensing
        const rings = 4;
        for (let i = rings; i >= 1; i--) {
            const ringRadius = this.photonSphere + (this.radius * 0.3 * i);
            const alpha = 0.08 / i;
            
            const gradient = ctx.createRadialGradient(0, 0, ringRadius - 5, 0, 0, ringRadius + 5);
            gradient.addColorStop(0, `rgba(150, 120, 255, 0)`);
            gradient.addColorStop(0.5, `rgba(150, 120, 255, ${alpha})`);
            gradient.addColorStop(1, `rgba(150, 120, 255, 0)`);
            
            ctx.fillStyle = gradient;
            ctx.beginPath();
            ctx.arc(0, 0, ringRadius + 5, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawGravityField(ctx) {
        // Subtle gradient showing gravitational influence
        const gradient = ctx.createRadialGradient(0, 0, this.eventHorizon, 0, 0, this.pullRadius);
        gradient.addColorStop(0, 'rgba(180, 100, 255, 0.15)');
        gradient.addColorStop(0.3, 'rgba(100, 50, 200, 0.08)');
        gradient.addColorStop(0.6, 'rgba(50, 30, 150, 0.03)');
        gradient.addColorStop(1, 'rgba(30, 20, 100, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.pullRadius, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawAccretionDiskBack(ctx) {
        ctx.save();
        ctx.rotate(this.rotationAngle);
        
        // Draw particles in back half of orbit
        for (const particle of this.accretionParticles) {
            const pos = particle.getPosition();
            
            // Only draw if behind the black hole
            if (pos.y > 0) {
                const distFromCenter = Math.sqrt(pos.x ** 2 + pos.y ** 2);
                const depthFade = 0.5; // Dimmer in back
                
                ctx.fillStyle = particle.color;
                ctx.globalAlpha = particle.alpha * depthFade;
                ctx.shadowColor = particle.color;
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, particle.size * 0.8, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    drawPhotonSphere(ctx) {
        // The photon sphere - where light orbits
        const pulse = Math.sin(this.pulsePhase) * 0.15 + 0.85;
        
        const gradient = ctx.createRadialGradient(0, 0, this.eventHorizon, 0, 0, this.photonSphere);
        gradient.addColorStop(0, 'rgba(255, 200, 100, 0)');
        gradient.addColorStop(0.7, `rgba(255, 150, 50, ${0.2 * pulse})`);
        gradient.addColorStop(1, 'rgba(255, 100, 30, 0)');
        
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.photonSphere, 0, Math.PI * 2);
        ctx.fill();
        
        // Bright ring at photon sphere edge
        ctx.strokeStyle = `rgba(255, 200, 100, ${0.4 * pulse})`;
        ctx.lineWidth = 2;
        ctx.shadowColor = '#FFC864';
        ctx.shadowBlur = 15;
        ctx.beginPath();
        ctx.arc(0, 0, this.photonSphere, 0, Math.PI * 2);
        ctx.stroke();
    }
    
    drawEventHorizon(ctx) {
        // Innermost stable orbit glow
        const isoGradient = ctx.createRadialGradient(0, 0, this.eventHorizon * 0.8, 0, 0, this.eventHorizon * 1.3);
        isoGradient.addColorStop(0, 'rgba(0, 0, 0, 0)');
        isoGradient.addColorStop(0.5, 'rgba(255, 100, 50, 0.3)');
        isoGradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = isoGradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.eventHorizon * 1.3, 0, Math.PI * 2);
        ctx.fill();
        
        // The actual event horizon (pure black)
        const coreGradient = ctx.createRadialGradient(0, 0, 0, 0, 0, this.eventHorizon);
        coreGradient.addColorStop(0, '#000000');
        coreGradient.addColorStop(0.8, '#000000');
        coreGradient.addColorStop(0.95, '#0a0008');
        coreGradient.addColorStop(1, 'rgba(100, 50, 150, 0.5)');
        
        ctx.fillStyle = coreGradient;
        ctx.beginPath();
        ctx.arc(0, 0, this.eventHorizon, 0, Math.PI * 2);
        ctx.fill();
        
        // Subtle inner glow/distortion
        const innerGlow = ctx.createRadialGradient(0, 0, 0, 0, 0, this.eventHorizon * 0.5);
        innerGlow.addColorStop(0, 'rgba(80, 40, 120, 0.3)');
        innerGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        
        ctx.fillStyle = innerGlow;
        ctx.beginPath();
        ctx.arc(0, 0, this.eventHorizon * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }
    
    drawAccretionDiskFront(ctx) {
        ctx.save();
        ctx.rotate(this.rotationAngle);
        
        // Bright inner edge of accretion disk
        const diskGradient = ctx.createRadialGradient(0, 0, this.eventHorizon, 0, 0, this.radius);
        diskGradient.addColorStop(0, 'rgba(255, 200, 100, 0.6)');
        diskGradient.addColorStop(0.3, 'rgba(255, 150, 50, 0.3)');
        diskGradient.addColorStop(0.6, 'rgba(255, 100, 30, 0.1)');
        diskGradient.addColorStop(1, 'rgba(200, 50, 20, 0)');
        
        // Draw elliptical disk
        ctx.fillStyle = diskGradient;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.radius * 1.2, this.radius * 0.25, 0, Math.PI, Math.PI * 2);
        ctx.fill();
        
        // Draw particles in front half
        for (const particle of this.accretionParticles) {
            const pos = particle.getPosition();
            
            if (pos.y <= 0) {
                ctx.fillStyle = particle.color;
                ctx.globalAlpha = particle.alpha;
                ctx.shadowColor = particle.color;
                ctx.shadowBlur = 12;
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, particle.size, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        
        ctx.restore();
    }
    
    drawHawkingRadiation(ctx) {
        for (const p of this.hawkingParticles) {
            ctx.fillStyle = `rgba(200, 150, 255, ${p.alpha})`;
            ctx.shadowColor = '#C896FF';
            ctx.shadowBlur = 5;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    
    drawRelativisticJets(ctx) {
        const jetAlpha = 0.15 + Math.sin(this.time * 0.05) * 0.05;
        const jetLength = this.radius * 2;
        
        // Top jet
        const topGradient = ctx.createLinearGradient(0, -this.eventHorizon, 0, -jetLength);
        topGradient.addColorStop(0, `rgba(100, 150, 255, ${jetAlpha})`);
        topGradient.addColorStop(0.5, `rgba(150, 100, 255, ${jetAlpha * 0.5})`);
        topGradient.addColorStop(1, 'rgba(100, 50, 200, 0)');
        
        ctx.fillStyle = topGradient;
        ctx.beginPath();
        ctx.moveTo(-3, -this.eventHorizon);
        ctx.lineTo(3, -this.eventHorizon);
        ctx.lineTo(8, -jetLength);
        ctx.lineTo(-8, -jetLength);
        ctx.closePath();
        ctx.fill();
        
        // Bottom jet
        const bottomGradient = ctx.createLinearGradient(0, this.eventHorizon, 0, jetLength);
        bottomGradient.addColorStop(0, `rgba(100, 150, 255, ${jetAlpha})`);
        bottomGradient.addColorStop(0.5, `rgba(150, 100, 255, ${jetAlpha * 0.5})`);
        bottomGradient.addColorStop(1, 'rgba(100, 50, 200, 0)');
        
        ctx.fillStyle = bottomGradient;
        ctx.beginPath();
        ctx.moveTo(-3, this.eventHorizon);
        ctx.lineTo(3, this.eventHorizon);
        ctx.lineTo(8, jetLength);
        ctx.lineTo(-8, jetLength);
        ctx.closePath();
        ctx.fill();
    }
    
    containsPoint(x, y) {
        return Utils.distance(x, y, this.x, this.y) < this.eventHorizon;
    }
    
    isInPullRange(x, y) {
        return Utils.distance(x, y, this.x, this.y) < this.pullRadius;
    }
}

// ============================================
// STAR BACKGROUND CLASS
// ============================================

class StarField {
    constructor(width, height) {
        this.stars = [];
        this.width = width;
        this.height = height;
        this.generate();
    }
    
    generate() {
        this.stars = [];
        const starCount = Math.floor((this.width * this.height) / 8000);
        
        for (let i = 0; i < starCount; i++) {
            this.stars.push({
                x: Math.random() * this.width,
                y: Math.random() * this.height,
                radius: Utils.randomRange(0.5, 2),
                alpha: Utils.randomRange(0.3, 1),
                twinkleSpeed: Utils.randomRange(0.02, 0.05),
                twinklePhase: Math.random() * Math.PI * 2
            });
        }
    }
    
    resize(width, height) {
        this.width = width;
        this.height = height;
        this.generate();
    }
    
    update() {
        for (const star of this.stars) {
            star.twinklePhase += star.twinkleSpeed;
        }
    }
    
    draw(ctx, offsetX = 0) {
        ctx.save();
        
        for (const star of this.stars) {
            const twinkle = Math.sin(star.twinklePhase) * 0.3 + 0.7;
            const alpha = star.alpha * twinkle;
            
            // Parallax effect
            const x = (star.x - offsetX * 0.1) % this.width;
            
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(x, star.y, star.radius, 0, Math.PI * 2);
            ctx.fill();
        }
        
        ctx.restore();
    }
}

// ============================================
// GAME CLASS
// ============================================

class Game {
    constructor() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Telegram Web App integration
        this.tg = window.Telegram?.WebApp;
        if (this.tg) {
            this.tg.ready();
            this.tg.expand();
        }
        
        // Game state
        this.state = 'menu'; // menu, playing, gameOver
        this.score = 0;
        this.highScore = this.loadHighScore();
        this.distance = 0;
        
        // Game objects
        this.ship = null;
        this.gravityWells = [];
        this.particles = [];
        this.starField = null;
        
        // Camera
        this.cameraX = 0;
        this.screenShake = 0;
        
        // Input state
        this.isHolding = false;
        this.paused = false;
        this.touchStartX = 0;
        this.touchStartY = 0;
        
        // Timing
        this.lastTime = 0;
        this.deltaTime = 0;
        
        // DOM elements
        this.scoreElement = document.getElementById('score');
        this.highScoreElement = document.getElementById('high-score');
        this.startScreen = document.getElementById('start-screen');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.finalDistanceElement = document.getElementById('final-distance');
        this.bestDistanceElement = document.getElementById('best-distance');
        this.startButton = document.getElementById('start-btn');
        this.restartButton = document.getElementById('restart-btn');
        this.infoButton = document.getElementById('info-btn');
        this.helpModal = document.getElementById('help-modal');
        this.closeModalButton = document.getElementById('close-modal');
        this.holdIndicator = document.getElementById('hold-indicator');
        this.shieldIndicator = document.getElementById('shield-indicator');
        
        this.init();
    }
    
    init() {
        this.setupCanvas();
        this.setupEventListeners();
        this.updateHighScoreDisplay();
        this.starField = new StarField(this.canvas.width, this.canvas.height);
        this.gameLoop(0);
    }
    
    setupCanvas() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        
        this.ctx.scale(dpr, dpr);
        
        this.width = rect.width;
        this.height = rect.height;
    }
    
    setupEventListeners() {
        // Resize handler
        window.addEventListener('resize', () => {
            this.setupCanvas();
            if (this.starField) {
                this.starField.resize(this.canvas.width, this.canvas.height);
            }
        });
        
        // Touch/Mouse events
        this.canvas.addEventListener('mousedown', (e) => this.onInputStart(e));
        
        this.canvas.addEventListener('mousemove', (e) => {
            if (this.state === 'playing') this.onInputMove(e);
        });
        
        this.canvas.addEventListener('mouseup', () => this.onInputEnd());
        this.canvas.addEventListener('mouseleave', () => this.onInputEnd());
        
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.onInputStart(e.touches[0]);
        }, { passive: false });
        
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (this.state === 'playing') this.onInputMove(e.touches[0]);
        }, { passive: false });
        
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.onInputEnd();
        }, { passive: false });
        
        this.canvas.addEventListener('touchcancel', () => this.onInputEnd());
        
        // Button events
        this.startButton.addEventListener('click', () => this.startGame());
        this.restartButton.addEventListener('click', () => this.startGame());
        
        // Help modal events
        this.infoButton.addEventListener('click', () => this.showHelp());
        this.closeModalButton.addEventListener('click', () => this.hideHelp());
        this.helpModal.addEventListener('click', (e) => {
            if (e.target === this.helpModal) this.hideHelp();
        });
        
        // Keyboard events
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
        
        // Prevent context menu
        this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    
    onKeyDown(e) {
        // Space bar to hold
        if (e.code === 'Space' && !e.repeat) {
            e.preventDefault();
            if (this.state === 'playing') {
                this.onInputStart();
            } else if (this.state === 'menu') {
                this.startGame();
            } else if (this.state === 'gameOver' && !this.gameOverScreen.classList.contains('hidden')) {
                this.startGame();
            }
        }
        
        // Arrow Keys for Spaceship Steering
        if (this.state === 'playing' && this.ship) {
            if (e.code === 'ArrowLeft') { e.preventDefault(); this.ship.steerInput = -1; }
            if (e.code === 'ArrowRight') { e.preventDefault(); this.ship.steerInput = 1; }
            if (e.code === 'ArrowUp') { e.preventDefault(); this.ship.thrustInput = 1; }
            if (e.code === 'ArrowDown') { e.preventDefault(); this.ship.thrustInput = -1; }
        }
        
        // Escape to close help or pause
        if (e.code === 'Escape') {
            if (!this.helpModal.classList.contains('hidden')) {
                this.hideHelp();
            }
        }
        
        // R to restart
        if (e.code === 'KeyR' && this.state === 'gameOver') {
            this.startGame();
        }
    }
    
    onKeyUp(e) {
        if (e.code === 'Space') {
            e.preventDefault();
            if (this.state === 'playing') {
                this.onInputEnd();
            }
        }
        
        if (this.state === 'playing' && this.ship) {
            if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') { e.preventDefault(); this.ship.steerInput = 0; }
            if (e.code === 'ArrowUp' || e.code === 'ArrowDown') { e.preventDefault(); this.ship.thrustInput = 0; }
        }
    }
    
    showHelp() {
        this.helpModal.classList.remove('hidden');
        this.paused = true;
    }
    
    hideHelp() {
        this.helpModal.classList.add('hidden');
        this.paused = false;
    }
    
    onInputStart(e) {
        if (this.state !== 'playing') return;
        
        this.isHolding = true;
        this.updateHoldIndicator();
        
        // Track starting touch position for gestures
        if (e && e.clientX !== undefined) {
             this.touchStartX = e.clientX;
             this.touchStartY = e.clientY;
        }
        
        // Find nearest gravity well
        const nearestWell = this.findNearestGravityWell();
        if (nearestWell && this.ship) {
            this.ship.tether(nearestWell);
        }
        
        // Activate slow-mo while holding (helps with timing)
        if (this.ship) {
            this.ship.slowMoActive = true;
        }
    }
    
    onInputMove(e) {
        if (!this.isHolding || !this.ship || !e || e.clientX === undefined) return;
        
        const dx = e.clientX - this.touchStartX;
        const dy = e.clientY - this.touchStartY;
        
        // If tethered and swiped enough, break the tether to allow steering
        if (this.ship.tethered && (Math.abs(dx) > 40 || Math.abs(dy) > 40)) {
            this.ship.release();
            this.ship.slowMoActive = false;
            // update start pos so the gesture continues smoothly
            this.touchStartX = e.clientX;
            this.touchStartY = e.clientY;
            return;
        }
        
        // Only process gestures if NOT tethered
        if (!this.ship.tethered) {
             if (dx < -30) this.ship.steerInput = -1;
             else if (dx > 30) this.ship.steerInput = 1;
             else this.ship.steerInput = 0;
             
             if (dy < -30) this.ship.thrustInput = 1; // swipe up to thrust  (Wait! in canvas, smaller Y is UP. So dy < 0 is UP)
             else if (dy > 30) this.ship.thrustInput = -1; // swipe down to brake
             else this.ship.thrustInput = 0;
             
             // Dynamic thrust based on swipe distance
             if (Math.abs(dx) > 30 || Math.abs(dy) > 30) {
                 // Option: we could update touch origin slowly for repeated swipes, 
                 // but keeping it absolute to touch start is often easier for simple logic
             }
        }
    }
    
    onInputEnd() {
        if (this.state !== 'playing') return;
        
        this.isHolding = false;
        this.updateHoldIndicator();
        
        if (this.ship) {
            this.ship.release();
            this.ship.slowMoActive = false;
            this.ship.steerInput = 0;
            this.ship.thrustInput = 0;
        }
    }
    
    updateHoldIndicator() {
        if (this.state !== 'playing') {
            this.holdIndicator.classList.remove('visible', 'holding');
            return;
        }
        
        this.holdIndicator.classList.add('visible');
        
        if (this.isHolding && this.ship?.tethered) {
            this.holdIndicator.textContent = 'ORBITING...';
            this.holdIndicator.classList.add('holding');
        } else if (this.isHolding) {
            this.holdIndicator.textContent = 'NO GRAVITY WELL';
            this.holdIndicator.classList.add('holding');
        } else {
            const shieldText = this.ship?.shield > 0 ? ' 🛡️' : '';
            this.holdIndicator.textContent = `HOLD TO ORBIT${shieldText}`;
            this.holdIndicator.classList.remove('holding');
        }
    }
    
    findNearestGravityWell() {
        if (!this.ship || this.gravityWells.length === 0) return null;
        
        let nearest = null;
        let minDist = Infinity;
        
        // Increased pull radius for easier tethering
        const tetherBonus = 1.3;
        
        for (const well of this.gravityWells) {
            const dist = Utils.distance(this.ship.x, this.ship.y, well.x, well.y);
            if (dist < well.pullRadius * tetherBonus && dist < minDist) {
                minDist = dist;
                nearest = well;
            }
        }
        
        return nearest;
    }
    
    startGame() {
        this.state = 'playing';
        this.score = 0;
        this.distance = 0;
        this.cameraX = 0;
        this.screenShake = 0;
        this.isHolding = false;
        
        // Initialize ship
        this.ship = new Ship(this.width * 0.2, this.height / 2);
        
        // Initialize gravity wells
        this.gravityWells = [];
        this.spawnInitialGravityWells();
        
        // Clear particles
        this.particles = [];
        
        // Hide screens
        this.startScreen.classList.add('hidden');
        this.gameOverScreen.classList.add('hidden');
        
        // Show hold indicator
        this.holdIndicator.classList.add('visible');
        this.holdIndicator.textContent = 'HOLD TO ORBIT 🛡️';
        
        // Show shield indicator
        this.shieldIndicator.classList.remove('hidden', 'used');
        
        // Update display
        this.updateScoreDisplay();
    }
    
    spawnInitialGravityWells() {
        const isMobile = window.innerWidth <= 768;
        const startX = isMobile ? this.width * 0.8 : this.width * 0.45;
        const spacing = isMobile ? this.width * 0.8 : this.width * 0.5;

        // First gravity well closer and easier to reach (give mobile players more reaction time)
        this.gravityWells.push(new GravityWell(
            startX,
            this.height * 0.5,
            50
        ));

        for (let i = 1; i < 5; i++) {
            const x = startX + i * spacing + Utils.randomRange(-30, 30);
            const y = Utils.randomRange(this.height * 0.15, this.height * 0.85);
            this.gravityWells.push(new GravityWell(x, y));
        }
    }
    
    spawnGravityWell() {
        const lastWell = this.gravityWells[this.gravityWells.length - 1];
        const spacing = Utils.randomRange(this.width * 0.4, this.width * 0.7);
        
        const x = lastWell.x + spacing;
        const y = Utils.randomRange(this.height * 0.15, this.height * 0.85);
        
        this.gravityWells.push(new GravityWell(x, y));
    }
    
    update(deltaTime) {
        if (this.state !== 'playing' || this.paused) return;
        
        // Update ship
        this.ship.update(deltaTime, this.height, this.gravityWells);
        
        // Update camera to follow ship
        const targetCameraX = this.ship.x - this.width * 0.3;
        this.cameraX = Utils.lerp(this.cameraX, targetCameraX, 0.05);
        
        // Update distance/score
        this.distance = Math.max(0, Math.floor(this.ship.x / 10));
        this.score = this.distance;
        this.updateScoreDisplay();
        
        // Update gravity wells
        for (const well of this.gravityWells) {
            well.update();
        }
        
        // Spawn new gravity wells
        const rightEdge = this.cameraX + this.width * 1.5;
        const lastWell = this.gravityWells[this.gravityWells.length - 1];
        if (lastWell && lastWell.x < rightEdge) {
            this.spawnGravityWell();
        }
        
        // Remove off-screen gravity wells
        this.gravityWells = this.gravityWells.filter(
            well => well.x > this.cameraX - well.radius * 2
        );
        
        // Create release burst particles
        if (this.ship.releaseBurst) {
            this.ship.releaseBurst = false;
            const burstColors = ['#66FCF1', '#FFD93D', '#FFFFFF'];
            for (let i = 0; i < 15; i++) {
                const angle = Utils.randomRange(0, Math.PI * 2);
                const speed = Utils.randomRange(1, 4);
                this.particles.push(new Particle(this.ship.x, this.ship.y, {
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    radius: Utils.randomRange(1, 3),
                    color: burstColors[Utils.randomInt(0, burstColors.length - 1)],
                    decay: 0.03
                }));
            }
        }
        
        // Update particles
        for (const particle of this.particles) {
            particle.update();
        }
        this.particles = this.particles.filter(p => !p.isDead);
        
        // Update hold indicator state
        this.updateHoldIndicator();
        
        // Update star field
        this.starField.update();
        
        // Check collisions
        this.checkCollisions();
    }
    
    checkCollisions() {
        // Check gravity well collision
        for (const well of this.gravityWells) {
            if (well.containsPoint(this.ship.x, this.ship.y)) {
                // Try to use shield
                if (this.ship.useShield()) {
                    // Shield saved us - push ship out and redirect tangentially
                    const dist = Utils.distance(this.ship.x, this.ship.y, well.x, well.y);
                    const escapeAngle = Utils.angle(well.x, well.y, this.ship.x, this.ship.y);
                    
                    // Push ship outside event horizon
                    this.ship.x = well.x + Math.cos(escapeAngle) * (well.eventHorizon + 30);
                    this.ship.y = well.y + Math.sin(escapeAngle) * (well.eventHorizon + 30);
                    
                    // Give velocity mostly forward (right) with slight outward push
                    const forwardBias = 0.7;
                    const outwardBias = 0.3;
                    const escapeSpeed = this.ship.speed * 2.5;
                    
                    this.ship.vx = escapeSpeed * forwardBias + Math.cos(escapeAngle) * escapeSpeed * outwardBias;
                    this.ship.vy = Math.sin(escapeAngle) * escapeSpeed * outwardBias;
                    
                    // Ensure we're moving forward
                    if (this.ship.vx < this.ship.speed) {
                        this.ship.vx = this.ship.speed;
                    }
                    
                    this.ship.tethered = false;
                    this.ship.tetherTarget = null;
                    this.screenShake = 10;
                    
                    // Update shield indicator
                    this.shieldIndicator.classList.add('used');
                    
                    // Shield break particles
                    const colors = ['#64C8FF', '#FFFFFF', '#66FCF1'];
                    for (let i = 0; i < 20; i++) {
                        const pAngle = Utils.randomRange(0, Math.PI * 2);
                        const speed = Utils.randomRange(2, 5);
                        this.particles.push(new Particle(this.ship.x, this.ship.y, {
                            vx: Math.cos(pAngle) * speed,
                            vy: Math.sin(pAngle) * speed,
                            radius: Utils.randomRange(2, 4),
                            color: colors[Utils.randomInt(0, colors.length - 1)],
                            decay: 0.03
                        }));
                    }
                    return;
                }
                this.gameOver();
                return;
            }
        }
        
        // Check screen boundaries (with more forgiveness)
        const screenY = this.ship.y;
        const boundaryMargin = 80;
        if (screenY < -boundaryMargin || screenY > this.height + boundaryMargin) {
            // Try to use shield for boundary save
            if (this.ship.useShield()) {
                // Bounce back into play, maintain forward momentum
                if (screenY < 0) {
                    this.ship.y = 30;
                    this.ship.vy = Math.abs(this.ship.vy) * 0.3 + 1.5;
                } else {
                    this.ship.y = this.height - 30;
                    this.ship.vy = -Math.abs(this.ship.vy) * 0.3 - 1.5;
                }
                
                // Keep forward momentum
                if (this.ship.vx < this.ship.speed) {
                    this.ship.vx = this.ship.speed;
                }
                
                this.screenShake = 8;
                
                // Update shield indicator
                this.shieldIndicator.classList.add('used');
                return;
            }
            this.gameOver();
            return;
        }
        
        // Check if ship went too far left (fell behind) - more forgiving
        if (this.ship.x < this.cameraX - 150) {
            this.gameOver();
            return;
        }
    }
    
    gameOver() {
        this.state = 'gameOver';
        
        // Hide indicators
        this.holdIndicator.classList.remove('visible', 'holding');
        this.shieldIndicator.classList.add('hidden');
        
        // Create explosion
        this.particles.push(...this.ship.createExplosion());
        
        // Screen shake effect
        this.screenShake = 15;
        
        // Update high score
        if (this.score > this.highScore) {
            this.highScore = this.score;
            this.saveHighScore();
        }
        
        // Show game over screen after delay
        setTimeout(() => {
            this.finalDistanceElement.textContent = this.score;
            this.bestDistanceElement.textContent = this.highScore;
            this.gameOverScreen.classList.remove('hidden');
        }, 1000);
    }
    
    draw() {
        // Clear canvas
        this.ctx.fillStyle = '#0B0C10';
        this.ctx.fillRect(0, 0, this.width, this.height);
        
        // Draw star field (parallax)
        this.starField.draw(this.ctx, this.cameraX);
        
        // Screen shake
        let shakeX = 0, shakeY = 0;
        if (this.screenShake > 0) {
            shakeX = (Math.random() - 0.5) * this.screenShake;
            shakeY = (Math.random() - 0.5) * this.screenShake;
            this.screenShake *= 0.9;
            if (this.screenShake < 0.5) this.screenShake = 0;
        }
        
        // Apply camera transform
        this.ctx.save();
        this.ctx.translate(-this.cameraX + shakeX, shakeY);
        
        // Draw gravity wells
        for (const well of this.gravityWells) {
            well.draw(this.ctx);
        }
        
        // Draw ship
        if (this.ship && this.state === 'playing') {
            this.ship.draw(this.ctx);
        }
        
        // Draw particles
        for (const particle of this.particles) {
            particle.draw(this.ctx);
        }
        
        this.ctx.restore();
    }
    
    gameLoop(timestamp) {
        this.deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;
        
        this.update(this.deltaTime);
        this.draw();
        
        requestAnimationFrame((t) => this.gameLoop(t));
    }
    
    updateScoreDisplay() {
        this.scoreElement.textContent = this.score;
    }
    
    updateHighScoreDisplay() {
        this.highScoreElement.textContent = `BEST: ${this.highScore}`;
    }
    
    loadHighScore() {
        try {
            return parseInt(localStorage.getItem('avyra_highscore')) || 0;
        } catch {
            return 0;
        }
    }
    
    saveHighScore() {
        try {
            localStorage.setItem('avyra_highscore', this.highScore.toString());
            this.updateHighScoreDisplay();
        } catch {
            // localStorage not available
        }
    }
}

// ============================================
// INITIALIZE GAME
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    new Game();
});
