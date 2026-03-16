import type { DotColor } from "./main";

// Level button interface
interface LevelButton {
  level: number;
  x: number;
  y: number;
  width: number;
  height: number;
  hoverScale: number;
  clickScale: number;
  clickStartTime: number | null;
  locked: boolean;
  color: DotColor; // Color for the outline
  activated: boolean; // Whether the animation has reached this button
}

interface BackgroundDot {
  x: number;
  y: number;
  radius: number;
  color: DotColor;
  opacity: number;
}

interface ButtonRipple {
  x: number;
  y: number;
  color: DotColor;
  scale: number;
  alpha: number;
}

export class LevelSelector {
  private buttons: LevelButton[] = [];
  private hoveredButton: number | null = null;
  private totalLevels: number;
  private columns: number;
  private rows: number;
  private buttonSpacing: number;
  private buttonWidth: number = 0;
  private buttonHeight: number = 0;
  private onLevelSelected: (level: number) => void;
  private colors: DotColor[];
  private colorHex: Record<DotColor, string>;
  private backgroundDots: BackgroundDot[] = [];
  private maxUnlockedLevel: number = 1;
  private selectedButtonLevel: number | null = null; // Track which button is currently selected/clicked

  // Scrolling state
  private scrollOffset: number = 0;
  private minScrollOffset: number = 0;
  private maxScrollOffset: number = 0;
  private isDragging: boolean = false;
  private lastDragX: number = 0;
  private lastDragY: number = 0;
  private lastDragTime: number = 0;
  private totalDragDistance: number = 0;
  private pressStartX: number = 0;
  private pressStartY: number = 0;
  private scrollVelocity: number = 0;
  private lastScrollFrameTime: number | null = null;
  private autoFollowSuppressedUntil: number = 0;

  // Animation state
  private lineAnimationProgress: number = 0; // 0 to 1
  private animationStartTime: number | null = null;
  private baseAnimationDurationPerLevel: number = 220; // ms per level for uniform speed
  private maxLineAnimationDuration: number = 5500;
  private buttonRipples: ButtonRipple[] = [];

  // Layout caching to avoid recalculating every frame
  private cachedWidth: number = 0;
  private cachedHeight: number = 0;
  private cachedIsMobile: boolean = false;
  private layoutNeedsUpdate: boolean = true;
  private baseY: number = 0; // Cached base Y for scroll calculations

  private cachedIsMobileForHover: boolean =
    window.matchMedia("(pointer: coarse)").matches;

  // Exposed configuration variables
  public buttonSize: number | null = null; // null = auto-calculate, or set specific size
  public fontSize: { mobile: number; desktop: number } = {
    mobile: 18,
    desktop: 22,
  };
  public fontSizeLocked: { mobile: number; desktop: number } = {
    mobile: 10,
    desktop: 12,
  };
  public fontSizeLockedNumber: { mobile: number; desktop: number } = {
    mobile: 8,
    desktop: 10,
  };

  constructor(
    totalLevels: number = 25,
    onLevelSelected: (level: number) => void,
    colors: DotColor[] = ["red", "blue", "green", "yellow"],
    colorHex: Record<DotColor, string> = {
      red: "#e84e60",
      blue: "#a5547d",
      green: "#77c299",
      yellow: "#fece6c",
      purple: "#AA44FF",
    },
    buttonSize: number | null = null,
    fontSize?: { mobile: number; desktop: number },
    fontSizeLocked?: { mobile: number; desktop: number },
    fontSizeLockedNumber?: { mobile: number; desktop: number },
    maxUnlockedLevel: number = 1,
  ) {
    this.totalLevels = totalLevels;
    this.onLevelSelected = onLevelSelected;
    this.columns = 1; // Single column for vertical layout
    this.rows = totalLevels;
    this.buttonSpacing = 56; // Increased spacing for better touch targets
    this.colors = colors;
    this.colorHex = colorHex;
    this.buttonSize = buttonSize;
    this.maxUnlockedLevel = maxUnlockedLevel;
    this.selectedButtonLevel = maxUnlockedLevel; // Set latest unlocked level as selected by default
    if (fontSize) this.fontSize = fontSize;
    if (fontSizeLocked) this.fontSizeLocked = fontSizeLocked;
    if (fontSizeLockedNumber) this.fontSizeLockedNumber = fontSizeLockedNumber;
  }

  private spawnRipple(x: number, y: number, color: DotColor): void {
    this.buttonRipples.push({
      x: x,
      y: y,
      color: color,
      scale: 1,
      alpha: 1,
    });
  }

  private updateRipples(): void {
    let i = this.buttonRipples.length;
    while (i--) {
      const ripple = this.buttonRipples[i];
      ripple.scale += 0.04;
      ripple.alpha -= 0.025;
      if (ripple.alpha <= 0) {
        this.buttonRipples[i] =
          this.buttonRipples[this.buttonRipples.length - 1];
        this.buttonRipples.pop();
      }
    }
  }

  private drawRipples(renderCtx: CanvasRenderingContext2D): void {
    if (this.buttonRipples.length === 0) return;
    for (const ripple of this.buttonRipples) {
      const radius = (this.buttonWidth / 2) * ripple.scale;
      renderCtx.globalAlpha = ripple.alpha;
      renderCtx.fillStyle = this.colorHex[ripple.color];
      renderCtx.beginPath();
      renderCtx.arc(ripple.x, ripple.y, radius, 0, Math.PI * 2);
      renderCtx.fill();
    }
    renderCtx.globalAlpha = 1;
  }

  private clampScrollOffset(): void {
    const clamped = Math.max(
      this.minScrollOffset,
      Math.min(this.maxScrollOffset, this.scrollOffset),
    );
    if (clamped !== this.scrollOffset) {
      this.scrollOffset = clamped;
      this.scrollVelocity = 0;
    }
  }

  private getButtonAt(x: number, y: number): LevelButton | null {
    const hitPadding = 12;

    for (const button of this.buttons) {
      if (button.locked) continue;

      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2 + hitPadding;
      const distance = Math.hypot(x - centerX, y - centerY);

      if (distance <= radius) {
        return button;
      }
    }

    return null;
  }

  private selectButton(button: LevelButton): void {
    if (this.selectedButtonLevel !== null) {
      for (const btn of this.buttons) {
        if (btn.level === this.selectedButtonLevel) {
          btn.clickScale = 1;
          btn.clickStartTime = null;
        }
      }
    }

    this.selectedButtonLevel = button.level;
    button.clickScale = 1.2;
    button.clickStartTime = null;
    this.onLevelSelected(button.level);
  }

  private updateScrollPhysics(now: number): void {
    if (this.lastScrollFrameTime === null) {
      this.lastScrollFrameTime = now;
      return;
    }

    const dt = Math.min(32, now - this.lastScrollFrameTime);
    this.lastScrollFrameTime = now;
    if (dt <= 0 || this.isDragging) return;

    if (Math.abs(this.scrollVelocity) < 0.01) {
      this.scrollVelocity = 0;
      return;
    }

    this.scrollOffset += this.scrollVelocity * dt;
    this.scrollVelocity *= Math.pow(0.92, dt / 16.67);
    this.clampScrollOffset();
  }

  private autoFollowAnimatedPath(
    now: number,
    currentY: number,
    scrollableTop: number,
    scrollableHeight: number,
  ): void {
    if (this.isDragging || this.scrollVelocity !== 0) return;
    if (now < this.autoFollowSuppressedUntil) return;
    if (this.lineAnimationProgress >= 1) return;

    const followThresholdY = scrollableTop + scrollableHeight * 0.52;
    const desiredY = scrollableTop + scrollableHeight * 0.62;

    if (currentY < followThresholdY) {
      this.scrollOffset += (desiredY - currentY) * 0.16;
      this.clampScrollOffset();
    }
  }

  private calculateLayout(
    width: number,
    height: number,
    isMobile: boolean,
  ): void {
    // Check if we need a full layout recalculation (dimensions changed)
    const needsFullRecalc =
      this.layoutNeedsUpdate ||
      width !== this.cachedWidth ||
      height !== this.cachedHeight ||
      isMobile !== this.cachedIsMobile;

    if (needsFullRecalc) {
      this.cachedWidth = width;
      this.cachedHeight = height;
      this.cachedIsMobile = isMobile;
      this.layoutNeedsUpdate = false;

      // Safe area offset for top (matches settings button requirements)
      const safeAreaTop = isMobile ? 120 : 45;
      const titleHeight = safeAreaTop + (isMobile ? 80 : 100); // Space for safe area + title
      const bottomPadding = isMobile ? 140 : 140; // Space for level button and bottom margin
      const sidePadding = isMobile ? 20 : 30;

      const availableHeight = height - titleHeight - bottomPadding;
      const availableWidth = width - sidePadding * 2;

      // Calculate button size - BIGGER for mobile for easier tapping
      let buttonSize: number;
      if (this.buttonSize !== null) {
        buttonSize = this.buttonSize;
      } else {
        // Larger buttons on mobile for easier tapping (56px vs 60px desktop)
        const desiredSize = isMobile ? 56 : 60;
        buttonSize = Math.min(availableWidth * 0.9, desiredSize);
      }

      this.buttonWidth = buttonSize;
      this.buttonHeight = buttonSize;

      // Center horizontally
      const startX = (width - this.buttonWidth) / 2;

      // Calculate total height of all buttons
      const totalButtonsHeight =
        this.totalLevels * this.buttonHeight +
        (this.totalLevels - 1) * this.buttonSpacing;

      // Start Y position for buttons (level 1 at bottom of scrollable area)
      const scrollableAreaBottom = height - bottomPadding;
      this.baseY = scrollableAreaBottom - this.buttonHeight;

      // Calculate scroll limits
      const topMargin = isMobile ? 80 : 50; // Extra margin at top for visibility
      this.minScrollOffset = 0;
      this.maxScrollOffset = Math.max(
        0,
        totalButtonsHeight - availableHeight + topMargin,
      );

      // Create or update buttons only on full recalc
      if (this.buttons.length !== this.totalLevels) {
        this.buttons = [];
        for (let i = 0; i < this.totalLevels; i++) {
          const level = i + 1;
          const colorIndex = (level - 1) % this.colors.length;
          const color = this.colors[colorIndex];
          const isSelected = level === this.selectedButtonLevel;

          this.buttons.push({
            level: level,
            x: startX,
            y: 0, // Will be updated below
            width: this.buttonWidth,
            height: this.buttonHeight,
            hoverScale: 1,
            clickScale: isSelected ? 1.2 : 1,
            clickStartTime: null,
            locked: level > this.maxUnlockedLevel,
            color: color,
            activated: false,
          });
        }
      } else {
        // Update existing button properties
        for (let i = 0; i < this.buttons.length; i++) {
          const button = this.buttons[i];
          button.x = startX;
          button.width = this.buttonWidth;
          button.height = this.buttonHeight;
          button.locked = button.level > this.maxUnlockedLevel;
        }
      }
    }

    // Always clamp and update Y positions (cheap operation)
    this.clampScrollOffset();

    // Update button Y positions based on scroll
    for (let i = 0; i < this.buttons.length; i++) {
      this.buttons[i].y =
        this.baseY -
        i * (this.buttonHeight + this.buttonSpacing) +
        this.scrollOffset;
    }
  }

  handleInput(x: number, y: number): boolean {
    const now = performance.now();
    this.isDragging = true;
    this.lastDragX = x;
    this.lastDragY = y;
    this.lastDragTime = now;
    this.pressStartX = x;
    this.pressStartY = y;
    this.totalDragDistance = 0;
    this.scrollVelocity = 0;
    this.autoFollowSuppressedUntil = now + 1200;
    return false;
  }

  handleInputMove(x: number, y: number): void {
    if (this.isDragging) {
      const now = performance.now();
      const deltaX = x - this.lastDragX;
      const deltaY = y - this.lastDragY;
      const dt = Math.max(1, now - this.lastDragTime);
      this.scrollOffset += deltaY; // Swipe down = see higher levels above
      this.scrollVelocity = deltaY / dt;
      this.totalDragDistance += Math.hypot(deltaX, deltaY);
      this.lastDragX = x;
      this.lastDragY = y;
      this.lastDragTime = now;
      this.clampScrollOffset();
    }
  }

  handleInputEnd(x: number, y: number): boolean {
    if (!this.isDragging) return false;

    const wasTap =
      this.totalDragDistance < 12 &&
      Math.hypot(x - this.pressStartX, y - this.pressStartY) < 12;

    this.isDragging = false;
    if (!wasTap) {
      return false;
    }

    this.scrollVelocity = 0;
    const button = this.getButtonAt(x, y);
    if (!button) return false;

    this.selectButton(button);
    return true;
  }

  handleWheel(deltaY: number): void {
    // Scroll on wheel (wheel down = see higher levels above)
    this.scrollOffset += deltaY * 0.5; // Adjust scroll speed
    this.scrollVelocity = deltaY * 0.01;
    this.autoFollowSuppressedUntil = performance.now() + 1200;
    this.clampScrollOffset();
  }

  handleButtonClick(x: number, y: number): boolean {
    const button = this.getButtonAt(x, y);
    if (!button) return false;

    this.selectButton(button);
    return true;
  }

  updateHover(x: number, y: number): void {
    if (this.cachedIsMobileForHover) return;

    this.hoveredButton = null;

    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i];
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2;
      const distance = Math.sqrt(
        Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2),
      );
      const isHovered = distance <= radius && !button.locked;

      if (isHovered) {
        this.hoveredButton = i;
        button.hoverScale = Math.min(button.hoverScale + 0.1, 1.15);
      } else {
        button.hoverScale = Math.max(button.hoverScale - 0.1, 1);
      }
    }
  }

  render(
    renderCtx: CanvasRenderingContext2D,
    width: number,
    height: number,
    isMobileOverride?: boolean,
  ): void {
    const now = performance.now();
    const isMobile =
      isMobileOverride ?? window.matchMedia("(pointer: coarse)").matches;
    this.cachedIsMobileForHover = isMobile;

    this.updateScrollPhysics(now);

    // Safe area offset for top (matches settings button requirements)
    const safeAreaTop = isMobile ? 120 : 45;

    // Ensure the latest unlocked level is selected (enlarged) if no button is currently selected
    if (this.selectedButtonLevel === null) {
      this.selectedButtonLevel = this.maxUnlockedLevel;
    }

    // Calculate layout
    this.calculateLayout(width, height, isMobile);

    // Start animation on first render
    if (this.animationStartTime === null) {
      this.animationStartTime = Date.now();
    }

    // Calculate animation duration based on maxUnlockedLevel for uniform speed
    const animationDuration = Math.min(
      this.maxUnlockedLevel * this.baseAnimationDurationPerLevel,
      this.maxLineAnimationDuration,
    );

    // Update animation progress
    const elapsed = Date.now() - this.animationStartTime;
    this.lineAnimationProgress = Math.min(elapsed / animationDuration, 1);

    // Update ripples
    this.updateRipples();

    // Initialize background dots if needed
    if (this.backgroundDots.length === 0) {
      const numDots = 12;
      for (let i = 0; i < numDots; i++) {
        this.backgroundDots.push({
          x: Math.random() * width,
          y: Math.random() * height,
          radius: 60 + Math.random() * 80, // 60-140px radius
          color: this.colors[Math.floor(Math.random() * this.colors.length)],
          opacity: 0.05 + Math.random() * 0.3, // 5-35% opacity
        });
      }
    }

    if (this.backgroundDots.length > 0) {
      for (const bgDot of this.backgroundDots) {
        renderCtx.globalAlpha = bgDot.opacity;
        renderCtx.fillStyle = this.colorHex[bgDot.color];
        renderCtx.beginPath();
        renderCtx.arc(bgDot.x, bgDot.y, bgDot.radius, 0, Math.PI * 2);
        renderCtx.fill();
      }
      renderCtx.globalAlpha = 1;
    }

    // Draw title "Levels" with same style as start screen
    const fontSize = isMobile ? 32 : 48;
    const titleY = safeAreaTop + (isMobile ? 40 : 50);
    const shadowOffset = fontSize * 0.08;

    renderCtx.font = `${fontSize}px 'Press Start 2P', monospace`;
    renderCtx.textAlign = "center";

    // Draw shadow
    renderCtx.fillStyle = "rgba(0, 0, 0, 0.3)";
    renderCtx.fillText(
      "Levels",
      width / 2 + shadowOffset,
      titleY + shadowOffset,
    );

    // Draw main text
    renderCtx.fillStyle = "#333333";
    renderCtx.fillText("Levels", width / 2, titleY);

    // Define scrollable area (below title with safe area, above hint text)
    const titleHeight = safeAreaTop + (isMobile ? 80 : 100);
    const bottomPadding = isMobile ? 80 : 100;
    const scrollableTop = titleHeight;
    const scrollableBottom = height - bottomPadding;
    const scrollableHeight = scrollableBottom - scrollableTop;

    // Save context and clip to scrollable area
    renderCtx.save();
    renderCtx.beginPath();
    renderCtx.rect(0, scrollableTop, width, scrollableHeight);
    renderCtx.clip();

    // Draw connecting line between all circles with animation
    if (this.buttons.length > 1) {
      const firstButton = this.buttons[0];
      const firstCenterX = firstButton.x + firstButton.width / 2;
      const firstCenterY = firstButton.y + firstButton.height / 2;
      const extendedBottomY = height - (isMobile ? 20 : 30);

      // Calculate total line length from bottom to maxUnlockedLevel (not all the way to top)
      const maxUnlockedButton =
        this.buttons[
          Math.min(this.maxUnlockedLevel - 1, this.buttons.length - 1)
        ];
      const maxUnlockedCenterY =
        maxUnlockedButton.y + maxUnlockedButton.height / 2;
      const totalLineLength = extendedBottomY - maxUnlockedCenterY;

      // Calculate current animated length
      const animatedLength = totalLineLength * this.lineAnimationProgress;
      const currentY = extendedBottomY - animatedLength;

      renderCtx.lineWidth = 3;
      renderCtx.lineCap = "round";
      renderCtx.lineJoin = "round";

      // Draw grey line (full line from bottom to top)
      renderCtx.strokeStyle = "#CCCCCC"; // Grey color
      renderCtx.beginPath();
      renderCtx.moveTo(firstCenterX, extendedBottomY);
      renderCtx.lineTo(firstCenterX, firstCenterY);

      for (let i = 1; i < this.buttons.length; i++) {
        const button = this.buttons[i];
        const centerX = button.x + button.width / 2;
        const centerY = button.y + button.height / 2;
        renderCtx.lineTo(centerX, centerY);
      }
      renderCtx.stroke();

      // Draw red line (animated portion from bottom to current progress, up to maxUnlockedLevel)
      if (this.lineAnimationProgress > 0) {
        renderCtx.strokeStyle = "#e84e60"; // Red color
        renderCtx.lineWidth = 7;
        renderCtx.beginPath();
        renderCtx.moveTo(firstCenterX, extendedBottomY);

        // Draw line segments until we reach the current animation point or maxUnlockedLevel
        let reachedEnd = false;

        // First segment from bottom to level 1
        if (currentY <= firstCenterY) {
          renderCtx.lineTo(firstCenterX, firstCenterY);

          // Continue through buttons up to maxUnlockedLevel
          for (
            let i = 1;
            i < Math.min(this.maxUnlockedLevel, this.buttons.length);
            i++
          ) {
            const button = this.buttons[i];
            const centerX = button.x + button.width / 2;
            const centerY = button.y + button.height / 2;

            if (currentY <= centerY) {
              renderCtx.lineTo(centerX, centerY);
            } else {
              // Interpolate to the exact current position
              const prevButton = this.buttons[i - 1];
              const prevCenterX = prevButton.x + prevButton.width / 2;
              const prevCenterY = prevButton.y + prevButton.height / 2;

              const segmentLength = prevCenterY - centerY;
              const remainingLength = prevCenterY - currentY;
              const t = remainingLength / segmentLength;

              const interpolatedX = prevCenterX + (centerX - prevCenterX) * t;
              const interpolatedY = currentY;

              renderCtx.lineTo(interpolatedX, interpolatedY);
              reachedEnd = true;
              break;
            }
          }
        } else {
          // We're still in the first segment (bottom to level 1)
          renderCtx.lineTo(firstCenterX, currentY);
        }

        renderCtx.stroke();
      }
    }

    // Calculate which buttons have been reached by the animation and spawn ripples
    const firstButton = this.buttons[0];
    const firstCenterY = firstButton.y + firstButton.height / 2;
    const extendedBottomY = height - (isMobile ? 20 : 30);
    const maxUnlockedButton =
      this.buttons[
        Math.min(this.maxUnlockedLevel - 1, this.buttons.length - 1)
      ];
    const maxUnlockedCenterY =
      maxUnlockedButton.y + maxUnlockedButton.height / 2;
    const totalLineLength = extendedBottomY - maxUnlockedCenterY;
    const animatedLength = totalLineLength * this.lineAnimationProgress;
    const currentY = extendedBottomY - animatedLength;

    this.autoFollowAnimatedPath(now, currentY, scrollableTop, scrollableHeight);
    this.calculateLayout(width, height, isMobile);

    // Check each button and spawn ripple when reached (only up to maxUnlockedLevel)
    for (
      let i = 0;
      i < Math.min(this.maxUnlockedLevel, this.buttons.length);
      i++
    ) {
      const button = this.buttons[i];
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;

      // Check if animation has reached this button
      const isReached = currentY <= centerY;

      // If button is newly reached, spawn ripple and mark as activated
      if (isReached && !button.activated) {
        button.activated = true;
        this.spawnRipple(centerX, centerY, button.color);
      }
    }

    // Draw ripples (behind buttons)
    this.drawRipples(renderCtx);

    // Draw buttons (only visible buttons within clip area will show)
    for (let i = 0; i < this.buttons.length; i++) {
      const button = this.buttons[i];

      // Skip buttons that are completely outside the visible area
      if (
        button.y + button.height < scrollableTop ||
        button.y > scrollableBottom
      ) {
        continue;
      }

      const isHovered = this.hoveredButton === i;
      const centerX = button.x + button.width / 2;
      const centerY = button.y + button.height / 2;
      const radius = button.width / 2;

      if (button.level === this.selectedButtonLevel) {
        button.clickScale = 1.2;
      } else if (button.clickScale !== 1) {
        button.clickScale = 1;
      }

      const scale = button.hoverScale * button.clickScale;
      const needsScale = scale !== 1;

      if (needsScale) {
        renderCtx.save();
        renderCtx.translate(centerX, centerY);
        renderCtx.scale(scale, scale);
        renderCtx.translate(-centerX, -centerY);
      }

      renderCtx.fillStyle = "rgba(0, 0, 0, 0.08)";
      renderCtx.beginPath();
      renderCtx.arc(centerX, centerY + 2, radius, 0, Math.PI * 2);
      renderCtx.fill();

      renderCtx.fillStyle =
        button.locked || !button.activated ? "#E0E0E0" : "#FFFFFF";
      renderCtx.beginPath();
      renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      renderCtx.fill();

      const outlineColor =
        button.locked || !button.activated
          ? "#CCCCCC"
          : this.colorHex[button.color];
      renderCtx.strokeStyle = outlineColor;
      renderCtx.lineWidth = isHovered ? 6 : 5;
      renderCtx.beginPath();
      renderCtx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      renderCtx.stroke();

      if (button.locked) {
        this.drawLockIcon(renderCtx, centerX, centerY, radius * 1.2);
      } else {
        renderCtx.fillStyle = !button.activated ? "#999999" : "#333333";
        renderCtx.font = `bold ${isMobile ? this.fontSize.mobile : this.fontSize.desktop}px Arial, sans-serif`;
        renderCtx.textAlign = "center";
        renderCtx.textBaseline = "middle";
        renderCtx.fillText(button.level.toString(), centerX, centerY);
      }

      if (needsScale) {
        renderCtx.restore();
      }
    }

    renderCtx.restore();
  }

  reset(): void {
    this.hoveredButton = null;
    this.selectedButtonLevel = null;
    this.scrollOffset = 0;
    this.isDragging = false;
    this.scrollVelocity = 0;
    this.lastScrollFrameTime = null;
    this.totalDragDistance = 0;
    this.autoFollowSuppressedUntil = 0;
    this.lineAnimationProgress = 0;
    this.animationStartTime = null;
    this.buttonRipples = [];
    this.layoutNeedsUpdate = true; // Force layout recalculation
    for (const button of this.buttons) {
      button.hoverScale = 1;
      button.clickScale = 1;
      button.clickStartTime = null;
      button.activated = false;
    }
  }

  setLevel(level: number): void {
    // Ensure level is within valid range
    if (level >= 1 && level <= this.totalLevels) {
      this.onLevelSelected(level);
    }
  }

  updateMaxUnlockedLevel(maxLevel: number): void {
    this.maxUnlockedLevel = maxLevel;
    // Set the latest unlocked level as selected (enlarged)
    this.selectedButtonLevel = maxLevel;
    // Force layout recalculation to update locked states
    this.layoutNeedsUpdate = true;
  }

  private drawStar(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    filled: boolean,
  ): void {
    const points = 5;
    const innerRadius = radius * 0.4;

    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = (i * Math.PI) / points - Math.PI / 2;
      const r = i % 2 === 0 ? radius : innerRadius;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;

      if (i === 0) {
        ctx.moveTo(px, py);
      } else {
        ctx.lineTo(px, py);
      }
    }
    ctx.closePath();

    if (filled) {
      ctx.fill();
    } else {
      ctx.stroke();
    }
  }

  private drawLockIcon(
    ctx: CanvasRenderingContext2D,
    centerX: number,
    centerY: number,
    size: number,
  ): void {
    const lockWidth = size * 0.5;
    const lockHeight = size * 0.6;
    const shackleRadius = lockWidth * 0.35;
    const shackleThickness = size * 0.08;
    const bodyHeight = lockHeight * 0.55;

    ctx.strokeStyle = "#999999";
    ctx.fillStyle = "#999999";
    ctx.lineWidth = shackleThickness;
    ctx.lineCap = "round";

    const shackleY = centerY - lockHeight * 0.15;
    ctx.beginPath();
    ctx.arc(centerX, shackleY, shackleRadius, Math.PI, 0, false);
    ctx.stroke();

    const bodyY = shackleY + shackleRadius * 0.3;
    const bodyWidth = lockWidth;
    const cornerRadius = size * 0.08;

    ctx.beginPath();
    ctx.moveTo(centerX - bodyWidth / 2 + cornerRadius, bodyY);
    ctx.lineTo(centerX + bodyWidth / 2 - cornerRadius, bodyY);
    ctx.quadraticCurveTo(
      centerX + bodyWidth / 2,
      bodyY,
      centerX + bodyWidth / 2,
      bodyY + cornerRadius,
    );
    ctx.lineTo(centerX + bodyWidth / 2, bodyY + bodyHeight - cornerRadius);
    ctx.quadraticCurveTo(
      centerX + bodyWidth / 2,
      bodyY + bodyHeight,
      centerX + bodyWidth / 2 - cornerRadius,
      bodyY + bodyHeight,
    );
    ctx.lineTo(centerX - bodyWidth / 2 + cornerRadius, bodyY + bodyHeight);
    ctx.quadraticCurveTo(
      centerX - bodyWidth / 2,
      bodyY + bodyHeight,
      centerX - bodyWidth / 2,
      bodyY + bodyHeight - cornerRadius,
    );
    ctx.lineTo(centerX - bodyWidth / 2, bodyY + cornerRadius);
    ctx.quadraticCurveTo(
      centerX - bodyWidth / 2,
      bodyY,
      centerX - bodyWidth / 2 + cornerRadius,
      bodyY,
    );
    ctx.closePath();
    ctx.fill();

    const keyholeY = bodyY + bodyHeight * 0.4;
    const keyholeRadius = size * 0.08;

    ctx.fillStyle = "#E0E0E0";
    ctx.beginPath();
    ctx.arc(centerX, keyholeY, keyholeRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillRect(
      centerX - keyholeRadius * 0.3,
      keyholeY,
      keyholeRadius * 0.6,
      bodyHeight * 0.35,
    );
  }
}
