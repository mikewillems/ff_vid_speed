(function() {
    'use strict';

    // This controller preserves the playback-rate and breathe-mode logic of
    // https://github.com/mikewillems/greasemonkey_video_speed/blob/main/videospeedcontroller
    // without requiring a userscript manager.

    const BIG_INCREMENTS = [0.125, 0.25, 0.5, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0];
    const SMALL_INC_RANGE = [0.1, 10.0];
    const SHOW_DURATION_MS = 1000;
    const FADE_DURATION_MS = 1000;

    const OSC_UP_MS = 5000;
    const OSC_HOLD_MAX_MS = 0;
    const OSC_DOWN_MS = 4000;
    const OSC_HOLD_MIN_MS = 1000;
    const OSC_TOTAL_MS = OSC_UP_MS + OSC_HOLD_MAX_MS + OSC_DOWN_MS + OSC_HOLD_MIN_MS;
    const OSC_TICK_MS = 100;

    let currentMedia = null;
    let controllerBox = null;
    let setButton = null;
    let hideTimeout = null;
    let finalHideTimeout = null;
    let overlayHover = false;

    const mediaElements = new Set();

    let oscillationActive = false;
    let oscillationPaused = false;
    let oscillationTimer = null;
    let oscillationPauseTimeout = null;
    let oscillationStartTime = 0;
    let breatheAnchor = 1.0;
    let oscillationMin = 1.0;
    let oscillationMax = 2.0;

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function roundToTwoDecimals(value) {
        return Math.round(value * 100) / 100;
    }

    function setPlaybackRate(media, rate) {
        if (!media) return;
        let newRate = clamp(rate, SMALL_INC_RANGE[0], SMALL_INC_RANGE[1]);
        newRate = roundToTwoDecimals(newRate);
        // Match the working userscript: write on every tick, unconditionally.
        media.playbackRate = newRate;
        updateSetButtonLabel();
    }

    function showOverlay() {
        if (!controllerBox) return;
        if (hideTimeout) {
            clearTimeout(hideTimeout);
            hideTimeout = null;
        }
        if (finalHideTimeout) {
            clearTimeout(finalHideTimeout);
            finalHideTimeout = null;
        }
        controllerBox.style.display = 'flex';
        controllerBox.offsetHeight;
        controllerBox.classList.add('gm-visible');
        if (overlayHover) return;
        hideTimeout = setTimeout(() => {
            controllerBox.classList.remove('gm-visible');
            finalHideTimeout = setTimeout(() => {
                if (!controllerBox.classList.contains('gm-visible')) {
                    controllerBox.style.display = 'none';
                }
            }, FADE_DURATION_MS);
        }, SHOW_DURATION_MS);
    }

    function recomputeOscillationRangeFromAnchor() {
        oscillationMin = clamp(Math.min(breatheAnchor, 2.0), SMALL_INC_RANGE[0], SMALL_INC_RANGE[1]);
        oscillationMax = clamp(Math.max(breatheAnchor, 2.0), SMALL_INC_RANGE[0], SMALL_INC_RANGE[1]);
    }

    function ensureOscillationTimer() {
        if (!oscillationActive || oscillationPaused || oscillationTimer) return;
        oscillationStartTime = performance.now();
        oscillationTimer = setInterval(updateOscillation, OSC_TICK_MS);
    }

    function clearOscillationTimer() {
        if (oscillationTimer) {
            clearInterval(oscillationTimer);
            oscillationTimer = null;
        }
    }

    function cancelOscillation() {
        if (!oscillationActive) return;
        oscillationActive = false;
        oscillationPaused = false;
        clearOscillationTimer();
        if (oscillationPauseTimeout) {
            clearTimeout(oscillationPauseTimeout);
            oscillationPauseTimeout = null;
        }
    }

    function pauseOscillationForUserAdjust() {
        if (!oscillationActive) return;
        oscillationPaused = true;
        clearOscillationTimer();
        if (oscillationPauseTimeout) clearTimeout(oscillationPauseTimeout);
        oscillationPauseTimeout = setTimeout(() => {
            oscillationPauseTimeout = null;
            if (!oscillationActive) return;
            oscillationPaused = false;
            ensureOscillationTimer();
        }, 1000);
    }

    function startOscillation() {
        if (!currentMedia) return;
        const cur = currentMedia.playbackRate || 1.0;
        breatheAnchor = clamp(cur, SMALL_INC_RANGE[0], SMALL_INC_RANGE[1]);
        recomputeOscillationRangeFromAnchor();
        if (oscillationMin === oscillationMax) return;
        oscillationActive = true;
        oscillationPaused = false;
        if (oscillationPauseTimeout) {
            clearTimeout(oscillationPauseTimeout);
            oscillationPauseTimeout = null;
        }
        ensureOscillationTimer();
        showOverlay();
    }

    function updateOscillation() {
        if (!oscillationActive || oscillationPaused || !currentMedia) {
            clearOscillationTimer();
            return;
        }
        const elapsed = performance.now() - oscillationStartTime;
        const t = elapsed % OSC_TOTAL_MS;
        let rate;
        if (t < OSC_UP_MS) {
            const f = t / OSC_UP_MS;
            rate = oscillationMin + (oscillationMax - oscillationMin) * f;
        } else if (t < OSC_UP_MS + OSC_HOLD_MAX_MS) {
            rate = oscillationMax;
        } else if (t < OSC_UP_MS + OSC_HOLD_MAX_MS + OSC_DOWN_MS) {
            const tDown = t - OSC_UP_MS - OSC_HOLD_MAX_MS;
            const f = tDown / OSC_DOWN_MS;
            rate = oscillationMax - (oscillationMax - oscillationMin) * f;
        } else {
            rate = oscillationMin;
        }
        setPlaybackRate(currentMedia, rate);
    }

    function applyUserRateChange(targetRate) {
        if (!currentMedia) return;
        if (oscillationActive) {
            breatheAnchor = clamp(targetRate, SMALL_INC_RANGE[0], SMALL_INC_RANGE[1]);
            recomputeOscillationRangeFromAnchor();
            setPlaybackRate(currentMedia, breatheAnchor);
            pauseOscillationForUserAdjust();
        } else {
            setPlaybackRate(currentMedia, targetRate);
        }
    }

    function getBaseSpeedForAdjust(media) {
        return oscillationActive ? breatheAnchor : (media.playbackRate || 1.0);
    }

    function bigStepDown(media) {
        const base = getBaseSpeedForAdjust(media);
        let target = base;
        for (let i = BIG_INCREMENTS.length - 1; i >= 0; i--) {
            if (BIG_INCREMENTS[i] < base) {
                target = BIG_INCREMENTS[i];
                break;
            }
        }
        applyUserRateChange(target);
    }

    function bigStepUp(media) {
        const base = getBaseSpeedForAdjust(media);
        let target = base;
        for (let i = 0; i < BIG_INCREMENTS.length; i++) {
            if (BIG_INCREMENTS[i] > base) {
                target = BIG_INCREMENTS[i];
                break;
            }
        }
        applyUserRateChange(target);
    }

    function smallStepDown(media) {
        const base = getBaseSpeedForAdjust(media);
        let target = Math.floor(base * 10 - 0.0001) / 10;
        if (target < SMALL_INC_RANGE[0]) target = SMALL_INC_RANGE[0];
        applyUserRateChange(target);
    }

    function smallStepUp(media) {
        const base = getBaseSpeedForAdjust(media);
        let target = Math.ceil(base * 10 + 0.0001) / 10;
        if (target > SMALL_INC_RANGE[1]) target = SMALL_INC_RANGE[1];
        applyUserRateChange(target);
    }

    function setToDefault(media) {
        cancelOscillation();
        setPlaybackRate(media, 1.0);
    }

    function injectStyles() {
        const css = `
            #gm-video-speed-controller {
                position: fixed;
                bottom: 16px;
                right: 16px;
                z-index: 999999;
                background: rgba(0, 0, 0, 0.9);
                color: #fff;
                padding: 8px;
                border-radius: 6px;
                font-family: sans-serif;
                font-size: 12px;
                display: none;
                gap: 6px;
                align-items: center;
                opacity: 0;
                transition: opacity ${FADE_DURATION_MS}ms ease-out;
            }
            #gm-video-speed-controller.gm-visible { opacity: 1; }
            #gm-video-speed-controller .gm-btn {
                border: 1px solid rgba(255,255,255,0.6);
                padding: 2px 6px;
                border-radius: 3px;
                cursor: pointer;
                user-select: none;
                min-width: 24px;
                text-align: center;
            }
            #gm-video-speed-controller .gm-btn:hover {
                background: rgba(255,255,255,0.2);
            }
        `;
        const style = document.createElement('style');
        style.textContent = css;
        (document.head || document.documentElement).appendChild(style);
    }

    function createController() {
        if (controllerBox) return controllerBox;
        injectStyles();
        controllerBox = document.createElement('div');
        controllerBox.id = 'gm-video-speed-controller';
        const label = document.createElement('span');
        label.textContent = 'Speed:';
        const btnLabels = ['<<', '<', 'set', '>', '>>'];
        const buttons = {};
        btnLabels.forEach(text => {
            const b = document.createElement('div');
            b.className = 'gm-btn';
            b.textContent = text;
            buttons[text] = b;
            controllerBox.appendChild(b);
        });
        controllerBox.insertBefore(label, controllerBox.firstChild);

        buttons['<<'].addEventListener('click', () => {
            if (!currentMedia) return;
            bigStepDown(currentMedia);
            showOverlay();
        });
        buttons['<'].addEventListener('click', () => {
            if (!currentMedia) return;
            smallStepDown(currentMedia);
            showOverlay();
        });
        buttons['set'].addEventListener('click', () => {
            if (!currentMedia) return;
            setToDefault(currentMedia);
            showOverlay();
        });
        buttons['>'].addEventListener('click', () => {
            if (!currentMedia) return;
            smallStepUp(currentMedia);
            showOverlay();
        });
        buttons['>>'].addEventListener('click', () => {
            if (!currentMedia) return;
            bigStepUp(currentMedia);
            showOverlay();
        });

        setButton = buttons['set'];
        document.body.appendChild(controllerBox);
        updateSetButtonLabel();
        return controllerBox;
    }

    function updateSetButtonLabel() {
        if (!setButton) return;
        let speed = 1.0;
        if (currentMedia) speed = currentMedia.playbackRate || 1.0;
        setButton.textContent = `${roundToTwoDecimals(speed).toFixed(2)}x`;
    }

    function markMediaActive(media) {
        currentMedia = media;
        if (!media.hasAttribute('tabindex')) media.setAttribute('tabindex', '0');
        updateSetButtonLabel();
        showOverlay();
    }

    function attachToMedia(media) {
        if (mediaElements.has(media)) return;
        mediaElements.add(media);
        media.addEventListener('click', () => markMediaActive(media));
        media.addEventListener('focus', () => markMediaActive(media));
        media.addEventListener('playing', () => markMediaActive(media));
        media.addEventListener('ratechange', () => {
            if (currentMedia === media) updateSetButtonLabel();
        });
        if (!currentMedia) markMediaActive(media);
    }

    function scanForMedia() {
        const nodes = document.querySelectorAll('video, audio');
        nodes.forEach(media => attachToMedia(media));
        for (const media of mediaElements) {
            if (!media.isConnected) mediaElements.delete(media);
        }
    }

    window.addEventListener('keydown', function(e) {
        if (!currentMedia) return;
        if (e.ctrlKey || e.altKey || e.metaKey) return;
        const target = e.target;
        const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
        if (['input', 'textarea', 'select'].includes(tag) || target.isContentEditable) return;
        let handled = false;
        switch (e.key) {
            case 'S': bigStepDown(currentMedia); handled = true; break;
            case 's': smallStepDown(currentMedia); handled = true; break;
            case 'o': setToDefault(currentMedia); handled = true; break;
            case 'd': smallStepUp(currentMedia); handled = true; break;
            case 'D': bigStepUp(currentMedia); handled = true; break;
            case 'v':
                if (oscillationActive) cancelOscillation();
                else startOscillation();
                handled = true;
                break;
        }
        if (handled) {
            e.preventDefault();
            e.stopPropagation();
            showOverlay();
        }
    }, true);

    window.addEventListener('mousemove', function(e) {
        const x = e.clientX;
        const y = e.clientY;
        let inOverlay = false;
        if (controllerBox && controllerBox.style.display !== 'none') {
            const rect = controllerBox.getBoundingClientRect();
            inOverlay = x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
        }
        if (inOverlay) {
            if (!overlayHover) {
                overlayHover = true;
                if (hideTimeout) {
                    clearTimeout(hideTimeout);
                    hideTimeout = null;
                }
                if (finalHideTimeout) {
                    clearTimeout(finalHideTimeout);
                    finalHideTimeout = null;
                }
                controllerBox.style.display = 'flex';
                controllerBox.classList.add('gm-visible');
            }
            return;
        }
        if (overlayHover) {
            overlayHover = false;
            showOverlay();
        }
        for (const media of mediaElements) {
            if (!media.isConnected) continue;
            const rect = media.getBoundingClientRect();
            if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
                markMediaActive(media);
                break;
            }
        }
    }, true);

    createController();
    scanForMedia();
    showOverlay();
    const observer = new MutationObserver(scanForMedia);
    observer.observe(document.documentElement || document.body, {
        childList: true,
        subtree: true
    });
})();
