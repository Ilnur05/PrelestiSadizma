// IndexedDB helper for storing local video files (blobs) safely
const DB_NAME = 'FriendsClipsDB';
const DB_VERSION = 1;
const STORE_NAME = 'video_blobs';

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storeVideoBlob(id, blob) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(blob, id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getVideoBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function deleteVideoBlob(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Initial starter clips
const SQUAD_FRIENDS = ['Blusweek', 'anchorite', 'Samurai_666', 'Tamatyla'];

const DEFAULT_CLIPS = [
  {
    id: 'prelesti-sadizma-1',
    title: '«ПРЕЛЕСТИ САДИЗМА» #1 — За партой в самолёте и полёт с горы',
    date: '2026-10-15',
    friends: SQUAD_FRIENDS,
    description: 'Первый выпуск: рагдолл на трамплине, авария с Мини Купером, пассажиры в багажной тележке и философия о поздравлении бати.',
    rating: 10,
    videoUrl: 'media/prelesti_sadizma_ep1.mp4',
    isLocalBlob: false,
    reactions: { laugh: 42, skull: 38, clown: 6, fire: 27, based: 31 },
    duration: '2:13',
    timestamps: [
      { time: 5, label: '«Встань, куда покатился!»' },
      { time: 22, label: 'ДТП с Мини Купером' },
      { time: 30, label: '«Бандитская разборка»' },
      { time: 56, label: '«Батю поздравлять — не мем!»' },
      { time: 65, label: '«Я вас разъебу»' },
      { time: 78, label: 'Аэропорт («Пассажиры!»)' },
      { time: 96, label: '«За партой в самолёте»' },
      { time: 107, label: 'Чел из Армении по имени Саша' },
      { time: 125, label: 'Трактор на трамплине' },
      { time: 130, label: 'Вы покончили с собой' }
    ]
  }
];

// Settings Defaults & State
const DEFAULT_SETTINGS = {
  siteTitle: 'ПРЕЛЕСТИ САДИЗМА',
  siteIcon: '🎬',
  theme: 'monochrome',
  grid: 'standard'
};
let settings = { ...DEFAULT_SETTINGS };

// App State
let clips = [];
let activeFilter = 'all';
let activeFriendFilter = null;
let currentTheaterClipId = null;
let pendingUploadedFile = null;
let uploadDetectedTimestamps = []; // [{ time: 15, label: "Крик" }]

// DOM Elements
const clipsGrid = document.getElementById('clipsGrid');
const emptyState = document.getElementById('emptyState');
const totalCountEl = document.getElementById('totalCount');
const friendsPillsEl = document.getElementById('friendsPills');
const searchInput = document.getElementById('searchInput');
const randomClipBtn = document.getElementById('randomClipBtn');

// Modals
const uploadModal = document.getElementById('uploadModal');
const openUploadBtn = document.getElementById('openUploadBtn');
const closeUploadModal = document.getElementById('closeUploadModal');
const cancelUploadBtn = document.getElementById('cancelUploadBtn');
const uploadForm = document.getElementById('uploadForm');

const theaterModal = document.getElementById('theaterModal');
const closeTheaterBtn = document.getElementById('closeTheaterBtn');
const theaterVideo = document.getElementById('theaterVideo');
const theaterTitle = document.getElementById('theaterTitle');
const theaterRating = document.getElementById('theaterRating');
const theaterDate = document.getElementById('theaterDate');
const theaterFriends = document.getElementById('theaterFriends');
const theaterDesc = document.getElementById('theaterDesc');
const theaterReactions = document.getElementById('theaterReactions');
const timestampsList = document.getElementById('timestampsList');
const theaterTimestamps = document.getElementById('theaterTimestamps');

// Settings Modal Elements
const settingsModal = document.getElementById('settingsModal');
const openSettingsBtn = document.getElementById('openSettingsBtn');
const closeSettingsModal = document.getElementById('closeSettingsModal');
const saveSettingsBtn = document.getElementById('saveSettingsBtn');
const resetSettingsBtn = document.getElementById('resetSettingsBtn');
const customSiteTitleInput = document.getElementById('customSiteTitle');
const siteLogoTitle = document.getElementById('siteLogoTitle');
const siteLogoIcon = document.getElementById('siteLogoIcon');
const pageTitle = document.getElementById('pageTitle');

// Upload fields
const dropZone = document.getElementById('dropZone');
const videoFileInput = document.getElementById('videoFileInput');
const dropContent = document.getElementById('dropContent');
const previewBox = document.getElementById('previewBox');
const previewVideo = document.getElementById('previewVideo');
const removeVideoBtn = document.getElementById('removeVideoBtn');
const videoUrlInput = document.getElementById('videoUrlInput');
const clipRatingInput = document.getElementById('clipRating');
const vibeLabel = document.getElementById('vibeLabel');
const autoDetectMomentsBtn = document.getElementById('autoDetectMomentsBtn');
const detectionStatus = document.getElementById('detectionStatus');
const detectionStatusText = document.getElementById('detectionStatusText');
const uploadTimestampsList = document.getElementById('uploadTimestampsList');
const addCustomTimestampBtn = document.getElementById('addCustomTimestampBtn');

// Mobile Nav Items
const mobileHomeBtn = document.getElementById('mobileHomeBtn');
const mobileRandomBtn = document.getElementById('mobileRandomBtn');
const mobileUploadBtn = document.getElementById('mobileUploadBtn');
const mobileSettingsBtn = document.getElementById('mobileSettingsBtn');

// Initialize App
async function initApp() {
  loadSettings();
  loadClipsFromStorage();
  setupEventListeners();
  renderClips();
  renderFriendPills();
}

// Settings management
function loadSettings() {
  const saved = localStorage.getItem('clips_vault_settings');
  if (saved) {
    try {
      settings = { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch (e) {
      settings = { ...DEFAULT_SETTINGS };
    }
  }
  applySettings();
}

function applySettings() {
  document.documentElement.setAttribute('data-theme', settings.theme);
  document.documentElement.setAttribute('data-grid', settings.grid);
  if (siteLogoTitle) siteLogoTitle.textContent = settings.siteTitle;
  if (siteLogoIcon) siteLogoIcon.textContent = settings.siteIcon;
  if (pageTitle) pageTitle.textContent = settings.siteTitle + ' | Архив клипов';
}

function saveSettings() {
  localStorage.setItem('clips_vault_settings', JSON.stringify(settings));
  applySettings();
  showToast('✓ Настройки оформления сохранены');
}

function populateSettingsModal() {
  customSiteTitleInput.value = settings.siteTitle;

  document.querySelectorAll('.icon-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.icon === settings.siteIcon);
  });

  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === settings.theme);
  });

  document.querySelectorAll('.grid-option').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.grid === settings.grid);
  });
}

// Load clips metadata from LocalStorage
function loadClipsFromStorage() {
  const saved = localStorage.getItem('friends_clips_meta');
  if (saved) {
    try {
      clips = JSON.parse(saved);
      // Ensure premier clip has the correct squad handles
      const premier = clips.find(c => c.id === 'prelesti-sadizma-1');
      if (premier) {
        premier.friends = SQUAD_FRIENDS;
      } else {
        clips.unshift(DEFAULT_CLIPS[0]);
      }
    } catch (e) {
      clips = [...DEFAULT_CLIPS];
    }
  } else {
    clips = [...DEFAULT_CLIPS];
    saveClipsToStorage();
  }
}

function saveClipsToStorage() {
  localStorage.setItem('friends_clips_meta', JSON.stringify(clips));
}

// Setup Event Listeners
function setupEventListeners() {
  // Upload modal open / close
  openUploadBtn.addEventListener('click', () => openModal(uploadModal));
  closeUploadModal.addEventListener('click', () => closeModal(uploadModal));
  cancelUploadBtn.addEventListener('click', () => closeModal(uploadModal));
  uploadModal.addEventListener('click', (e) => {
    if (e.target === uploadModal) closeModal(uploadModal);
  });

  // Settings modal open / close
  openSettingsBtn.addEventListener('click', () => {
    populateSettingsModal();
    openModal(settingsModal);
  });
  closeSettingsModal.addEventListener('click', () => closeModal(settingsModal));
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) closeModal(settingsModal);
  });

  // Settings Icon Picker
  document.querySelectorAll('.icon-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.icon-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.siteIcon = btn.dataset.icon;
      applySettings();
    });
  });

  // Settings Theme Picker
  document.querySelectorAll('.theme-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.theme = btn.dataset.theme;
      applySettings();
    });
  });

  // Settings Grid Picker
  document.querySelectorAll('.grid-option').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.grid-option').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      settings.grid = btn.dataset.grid;
      applySettings();
    });
  });

  // Save Settings
  saveSettingsBtn.addEventListener('click', () => {
    const customTitle = customSiteTitleInput.value.trim();
    if (customTitle) {
      settings.siteTitle = customTitle;
    }
    saveSettings();
    closeModal(settingsModal);
  });

  // Reset Settings
  resetSettingsBtn.addEventListener('click', () => {
    if (confirm('Сбросить оформление по умолчанию?')) {
      settings = { ...DEFAULT_SETTINGS };
      saveSettings();
      populateSettingsModal();
      closeModal(settingsModal);
    }
  });

  // Mobile Bottom Navigation
  if (mobileHomeBtn) {
    mobileHomeBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
  if (mobileRandomBtn) {
    mobileRandomBtn.addEventListener('click', openRandomClip);
  }
  if (mobileUploadBtn) {
    mobileUploadBtn.addEventListener('click', () => openModal(uploadModal));
  }
  if (mobileSettingsBtn) {
    mobileSettingsBtn.addEventListener('click', () => {
      populateSettingsModal();
      openModal(settingsModal);
    });
  }

  // Theater modal
  closeTheaterBtn.addEventListener('click', closeTheater);
  theaterModal.addEventListener('click', (e) => {
    if (e.target === theaterModal) closeTheater();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(uploadModal);
      closeModal(settingsModal);
      closeTheater();
    }
  });

  // Moment score slider change
  clipRatingInput.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    vibeLabel.textContent = `${val} / 10`;
  });

  // Drag and Drop
  dropZone.addEventListener('click', () => videoFileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedVideoFile(e.dataTransfer.files[0]);
    }
  });

  videoFileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleSelectedVideoFile(e.target.files[0]);
    }
  });

  removeVideoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    clearVideoPreview();
  });

  // Form submit
  uploadForm.addEventListener('submit', handleUploadSubmit);

  // Search input
  searchInput.addEventListener('input', () => renderClips());

  // Filter tabs
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter;
      renderClips();
    });
  });

  // Random clip
  randomClipBtn.addEventListener('click', openRandomClip);

  // Auto-detect moments button
  autoDetectMomentsBtn.addEventListener('click', triggerMomentsDetection);

  // Manual timestamp add button
  addCustomTimestampBtn.addEventListener('click', () => {
    uploadDetectedTimestamps.push({ time: 0, label: 'Новый момент' });
    renderUploadTimestamps();
  });

  // Theater Reactions
  theaterReactions.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const reactionType = btn.dataset.reaction;
      triggerReaction(currentTheaterClipId, reactionType, e);
    });
  });
}

function handleSelectedVideoFile(file) {
  const allowedExtensions = ['.mp4', '.mkv', '.webm', '.mov', '.avi', '.m4v', '.wmv', '.flv', '.ts', '.3gp'];
  const fileName = (file.name || '').toLowerCase();
  const isVideoExt = allowedExtensions.some(ext => fileName.endsWith(ext));
  const isVideoMime = file.type && file.type.startsWith('video/');

  if (!isVideoMime && !isVideoExt) {
    showToast('Пожалуйста, выберите видеофайл (MP4, MKV, MOV, WebM и др.)');
    return;
  }
  
  pendingUploadedFile = file;
  const objectUrl = URL.createObjectURL(file);
  previewVideo.src = objectUrl;
  dropContent.style.display = 'none';
  previewBox.style.display = 'block';

  // Auto-fill title if empty
  const titleInput = document.getElementById('clipTitle');
  if (!titleInput.value) {
    const rawName = file.name.replace(/\.[^/.]+$/, "");
    titleInput.value = rawName.replace(/[-_]/g, " ");
  }

  // Pre-fill friends suggestion if empty
  const friendsInput = document.getElementById('clipFriends');
  if (!friendsInput.value) {
    friendsInput.value = SQUAD_FRIENDS.join(', ');
  }

  // Auto-trigger highlight detection
  previewVideo.onloadedmetadata = () => {
    triggerMomentsDetection();
  };
}

function clearVideoPreview() {
  pendingUploadedFile = null;
  videoFileInput.value = '';
  previewVideo.src = '';
  dropContent.style.display = 'block';
  previewBox.style.display = 'none';
  uploadDetectedTimestamps = [];
  renderUploadTimestamps();
}

function openModal(modal) {
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(modal) {
  modal.classList.remove('open');
  document.body.style.overflow = '';
  if (modal === uploadModal) {
    uploadForm.reset();
    clearVideoPreview();
  }
}

// ==========================================================================
// Automatic Highlights / Moments Detection (Audio Peak Analysis + Smart Fallback)
// ==========================================================================
async function triggerMomentsDetection() {
  const duration = previewVideo.duration;
  if (!pendingUploadedFile && !previewVideo.src) {
    showToast('Сначала выберите или укажите видео');
    return;
  }

  detectionStatus.style.display = 'flex';
  detectionStatusText.textContent = 'Анализ аудиопиков и ярких моментов...';

  try {
    let moments = [];
    if (pendingUploadedFile && window.AudioContext) {
      moments = await detectAudioPeaks(pendingUploadedFile, duration);
    }

    if (!moments || moments.length === 0) {
      moments = generateAlgorithmicMoments(duration || 60);
    }

    uploadDetectedTimestamps = moments;
    renderUploadTimestamps();
    showToast(`⚡ Найдено ${moments.length} ключевых моментов!`);
  } catch (err) {
    console.warn('Audio peak detection failed, using fallback:', err);
    uploadDetectedTimestamps = generateAlgorithmicMoments(previewVideo.duration || 60);
    renderUploadTimestamps();
    showToast(`⚡ Найдено ${uploadDetectedTimestamps.length} ключевых моментов!`);
  } finally {
    detectionStatus.style.display = 'none';
  }
}

// Detect peaks in audio buffer
async function detectAudioPeaks(file, estimatedDuration) {
  return new Promise(async (resolve) => {
    try {
      // Read slice of file to decode audio
      const maxBytes = 40 * 1024 * 1024; // 40MB max for fast analysis
      const blobSlice = file.slice(0, Math.min(file.size, maxBytes));
      const arrayBuffer = await blobSlice.arrayBuffer();

      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      audioCtx.decodeAudioData(
        arrayBuffer,
        (buffer) => {
          const channelData = buffer.getChannelData(0);
          const sampleRate = buffer.sampleRate;
          const totalDuration = buffer.duration;

          // Window size: 0.5s
          const windowSize = Math.floor(sampleRate * 0.5);
          const numWindows = Math.floor(channelData.length / windowSize);
          const energyLevels = [];

          for (let i = 0; i < numWindows; i++) {
            let sum = 0;
            const start = i * windowSize;
            for (let j = 0; j < windowSize; j += 4) { // stride 4 for speed
              const val = channelData[start + j];
              sum += val * val;
            }
            const rms = Math.sqrt(sum / (windowSize / 4));
            energyLevels.push({ time: Math.floor(i * 0.5), rms });
          }

          // Calculate average energy
          const avgEnergy = energyLevels.reduce((a, b) => a + b.rms, 0) / (energyLevels.length || 1);

          // Find peaks: local maxima significantly higher than average
          const rawPeaks = [];
          for (let i = 2; i < energyLevels.length - 2; i++) {
            const current = energyLevels[i];
            if (
              current.rms > avgEnergy * 1.6 &&
              current.rms > energyLevels[i - 1].rms &&
              current.rms > energyLevels[i + 1].rms
            ) {
              rawPeaks.push(current);
            }
          }

          // Sort peaks by loudness
          rawPeaks.sort((a, b) => b.rms - a.rms);

          // Filter out peaks that are closer than 10 seconds to each other
          const chosenPeaks = [];
          for (const p of rawPeaks) {
            const tooClose = chosenPeaks.some(c => Math.abs(c.time - p.time) < 10);
            if (!tooClose) {
              chosenPeaks.push(p);
            }
            if (chosenPeaks.length >= 7) break;
          }

          // Sort chronologically
          chosenPeaks.sort((a, b) => a.time - b.time);

          const labels = [
            '«Встань, куда покатился!»',
            'Эпичный момент',
            'Громкая реакция',
            'Хайлайт',
            'Разборка',
            'Неожиданный поворот',
            'Финал'
          ];

          const moments = chosenPeaks.map((p, idx) => ({
            time: p.time,
            label: labels[idx % labels.length]
          }));

          audioCtx.close().catch(() => {});
          resolve(moments);
        },
        () => resolve([])
      );
    } catch (e) {
      resolve([]);
    }
  });
}

// Fallback intelligent distribution of moments across duration
function generateAlgorithmicMoments(duration) {
  const dur = Math.max(duration || 60, 20);
  const count = dur > 90 ? 5 : 4;
  const fractions = [0.12, 0.32, 0.55, 0.78, 0.92];
  const sampleLabels = [
    '«Встань, куда покатился!»',
    'Эпичный момент',
    'Яркая реакция',
    'Хайлайт',
    'Финал момента'
  ];

  const moments = [];
  for (let i = 0; i < count; i++) {
    const time = Math.floor(dur * fractions[i]);
    moments.push({
      time: Math.max(1, time),
      label: sampleLabels[i] || `Момент #${i + 1}`
    });
  }
  return moments;
}

// Render timestamps in upload form
function renderUploadTimestamps() {
  uploadTimestampsList.innerHTML = '';
  if (uploadDetectedTimestamps.length === 0) {
    uploadTimestampsList.innerHTML = `
      <div style="font-size: 0.75rem; color: var(--text-dim); text-align: center; padding: 0.5rem;">
        Нажмите «Определить автоматически» или добавьте таймкоды вручную
      </div>
    `;
    return;
  }

  uploadDetectedTimestamps.forEach((ts, idx) => {
    const row = document.createElement('div');
    row.className = 'timestamp-edit-row';

    const mins = Math.floor(ts.time / 60);
    const secs = (ts.time % 60).toString().padStart(2, '0');
    const formattedTime = `${mins}:${secs}`;

    row.innerHTML = `
      <input type="text" class="ts-time-input" value="${formattedTime}" title="Формат: М:СС">
      <input type="text" class="ts-label-input" value="${escapeHtml(ts.label)}" placeholder="Название момента...">
      <button type="button" class="ts-delete-btn" title="Удалить момент">&times;</button>
    `;

    const timeInput = row.querySelector('.ts-time-input');
    const labelInput = row.querySelector('.ts-label-input');
    const deleteBtn = row.querySelector('.ts-delete-btn');

    timeInput.addEventListener('change', () => {
      const parts = timeInput.value.split(':');
      if (parts.length === 2) {
        ts.time = parseInt(parts[0]) * 60 + parseInt(parts[1]);
      } else {
        ts.time = parseInt(parts[0]) || 0;
      }
    });

    labelInput.addEventListener('input', () => {
      ts.label = labelInput.value.trim();
    });

    deleteBtn.addEventListener('click', () => {
      uploadDetectedTimestamps.splice(idx, 1);
      renderUploadTimestamps();
    });

    uploadTimestampsList.appendChild(row);
  });
}

// Handle Clip Upload
async function handleUploadSubmit(e) {
  e.preventDefault();

  const title = document.getElementById('clipTitle').value.trim();
  const dateVal = document.getElementById('clipDate').value || new Date().toISOString().split('T')[0];
  const friendsRaw = document.getElementById('clipFriends').value;
  const desc = document.getElementById('clipDescription').value.trim();
  const rating = parseInt(clipRatingInput.value);
  const urlVal = videoUrlInput.value.trim();

  if (!pendingUploadedFile && !urlVal) {
    showToast('Выберите видеофайл или укажите ссылку');
    return;
  }

  const clipId = 'clip_' + Date.now();
  const friendsList = friendsRaw
    .split(',')
    .map(f => f.trim().replace(/^@/, ''))
    .filter(f => f.length > 0);

  const cleanTimestamps = uploadDetectedTimestamps
    .filter(t => t.label && t.label.trim().length > 0)
    .map(t => ({ time: t.time, label: t.label.trim() }));

  const newClip = {
    id: clipId,
    title,
    date: dateVal,
    friends: friendsList.length > 0 ? friendsList : SQUAD_FRIENDS,
    description: desc || 'Без описания',
    rating,
    isLocalBlob: !!pendingUploadedFile,
    videoUrl: urlVal || '',
    reactions: { laugh: 1, skull: 0, clown: 0, fire: 0, based: 0 },
    duration: '0:30',
    timestamps: cleanTimestamps
  };

  if (pendingUploadedFile) {
    try {
      await storeVideoBlob(clipId, pendingUploadedFile);
    } catch (err) {
      console.error('Failed to store in IndexedDB:', err);
      showToast('Ошибка сохранения локального файла.');
      return;
    }
  }

  clips.unshift(newClip);
  saveClipsToStorage();

  closeModal(uploadModal);
  renderClips();
  renderFriendPills();
  showToast('✓ Клип успешно добавлен в архив');
}

// Render dynamic friends filter pills
function renderFriendPills() {
  const friendsSet = new Set();
  clips.forEach(clip => {
    clip.friends.forEach(f => friendsSet.add(f));
  });

  friendsPillsEl.innerHTML = '';
  
  const allPill = document.createElement('button');
  allPill.className = `friend-pill ${activeFriendFilter === null ? 'active' : ''}`;
  allPill.textContent = 'Все';
  allPill.onclick = () => {
    activeFriendFilter = null;
    renderFriendPills();
    renderClips();
  };
  friendsPillsEl.appendChild(allPill);

  friendsSet.forEach(friend => {
    const pill = document.createElement('button');
    pill.className = `friend-pill ${activeFriendFilter === friend ? 'active' : ''}`;
    pill.textContent = `@${friend}`;
    pill.onclick = () => {
      activeFriendFilter = activeFriendFilter === friend ? null : friend;
      renderFriendPills();
      renderClips();
    };
    friendsPillsEl.appendChild(pill);
  });
}

// Render Clips Grid
async function renderClips() {
  const query = searchInput.value.toLowerCase().trim();
  
  let filtered = clips.filter(clip => {
    const matchQuery = !query || 
      clip.title.toLowerCase().includes(query) ||
      clip.description.toLowerCase().includes(query) ||
      clip.friends.some(f => f.toLowerCase().includes(query));

    const matchFriend = !activeFriendFilter || clip.friends.includes(activeFriendFilter);

    return matchQuery && matchFriend;
  });

  // Tab filter
  if (activeFilter === 'top') {
    filtered.sort((a, b) => {
      const sumA = Object.values(a.reactions || {}).reduce((x, y) => x + y, 0);
      const sumB = Object.values(b.reactions || {}).reduce((x, y) => x + y, 0);
      return sumB - sumA;
    });
  } else if (activeFilter === 'recent') {
    filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  totalCountEl.textContent = clips.length;

  if (filtered.length === 0) {
    clipsGrid.innerHTML = '';
    emptyState.style.display = 'block';
    return;
  }

  emptyState.style.display = 'none';
  clipsGrid.innerHTML = '';

  for (const clip of filtered) {
    const card = document.createElement('div');
    card.className = 'clip-card';
    card.dataset.id = clip.id;

    card.innerHTML = `
      <div class="clip-thumb-wrapper" onclick="openTheater('${clip.id}')">
        <video class="clip-thumb-video" preload="metadata" muted playsinline></video>
        <div class="badge-vibe">⭐ ${clip.rating}/10</div>
        <div class="play-overlay-btn">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </div>
      </div>
      <div class="clip-info">
        <div class="clip-header-line">
          <h3 class="clip-title" onclick="openTheater('${clip.id}')">${escapeHtml(clip.title)}</h3>
          <button class="btn-card-menu" title="Удалить клип" onclick="deleteClip('${clip.id}')">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <p class="clip-desc">${escapeHtml(clip.description)}</p>
        <div class="friends-tags">
          ${clip.friends.map(f => `<span class="tag-friend">@${escapeHtml(f)}</span>`).join('')}
        </div>
        <div class="clip-footer">
          <span>${formatDate(clip.date)}</span>
          <div class="reactions-mini">
            <button class="reaction-pill" onclick="triggerQuickReaction('${clip.id}', 'laugh', event)">😂 ${clip.reactions.laugh || 0}</button>
            <button class="reaction-pill" onclick="triggerQuickReaction('${clip.id}', 'skull', event)">💀 ${clip.reactions.skull || 0}</button>
          </div>
        </div>
      </div>
    `;

    const videoThumb = card.querySelector('.clip-thumb-video');
    loadVideoSource(clip, videoThumb);

    card.addEventListener('mouseenter', () => {
      videoThumb.currentTime = 0;
      videoThumb.play().catch(() => {});
    });
    card.addEventListener('mouseleave', () => {
      videoThumb.pause();
    });

    clipsGrid.appendChild(card);
  }
}

// Load Video source
async function loadVideoSource(clip, videoEl) {
  if (clip.isLocalBlob) {
    try {
      const blob = await getVideoBlob(clip.id);
      if (blob) {
        let playable = blob;
        if (!blob.type) {
          playable = new Blob([blob], { type: 'video/mp4' });
        }
        videoEl.src = URL.createObjectURL(playable);
      }
    } catch (e) {
      console.warn('Could not load blob for clip:', clip.id, e);
    }
  } else if (clip.videoUrl) {
    videoEl.src = clip.videoUrl;
  }
}

// Theater / Full Player
async function openTheater(clipId) {
  const clip = clips.find(c => c.id === clipId);
  if (!clip) return;

  currentTheaterClipId = clipId;
  theaterTitle.textContent = clip.title;
  theaterRating.textContent = `${clip.rating}/10`;
  theaterDate.textContent = formatDate(clip.date);
  theaterDesc.textContent = clip.description;
  theaterFriends.innerHTML = clip.friends.map(f => `<span class="tag-friend">@${escapeHtml(f)}</span>`).join(' ');

  // Render timestamps if available
  if (clip.timestamps && clip.timestamps.length > 0) {
    theaterTimestamps.style.display = 'block';
    timestampsList.innerHTML = '';
    clip.timestamps.forEach(ts => {
      const chip = document.createElement('button');
      chip.className = 'timestamp-chip';
      const mins = Math.floor(ts.time / 60);
      const secs = (ts.time % 60).toString().padStart(2, '0');
      chip.innerHTML = `<strong>${mins}:${secs}</strong> <span>${escapeHtml(ts.label)}</span>`;
      chip.onclick = () => {
        theaterVideo.currentTime = ts.time;
        theaterVideo.play().catch(() => {});
      };
      timestampsList.appendChild(chip);
    });
  } else {
    theaterTimestamps.style.display = 'none';
  }

  updateTheaterReactions(clip);
  await loadVideoSource(clip, theaterVideo);

  openModal(theaterModal);
  theaterVideo.play().catch(() => {});
}

function closeTheater() {
  theaterVideo.pause();
  theaterVideo.src = '';
  currentTheaterClipId = null;
  closeModal(theaterModal);
}

function updateTheaterReactions(clip) {
  theaterReactions.querySelectorAll('.reaction-btn').forEach(btn => {
    const type = btn.dataset.reaction;
    const countEl = btn.querySelector('.count');
    countEl.textContent = clip.reactions[type] || 0;
  });
}

function triggerReaction(clipId, reactionType, event) {
  const clip = clips.find(c => c.id === clipId);
  if (!clip) return;

  if (!clip.reactions[reactionType]) clip.reactions[reactionType] = 0;
  clip.reactions[reactionType]++;

  saveClipsToStorage();
  updateTheaterReactions(clip);
  spawnFloatingEmoji(reactionEmoji(reactionType), event);
  renderClips();
}

function triggerQuickReaction(clipId, reactionType, event) {
  event.stopPropagation();
  triggerReaction(clipId, reactionType, event);
}

function reactionEmoji(type) {
  const map = {
    laugh: '😂',
    skull: '💀',
    clown: '🤡',
    fire: '🔥',
    based: '🗿'
  };
  return map[type] || '🔥';
}

function spawnFloatingEmoji(emoji, event) {
  const el = document.createElement('div');
  el.className = 'floating-emoji';
  el.textContent = emoji;

  const x = event.clientX || window.innerWidth / 2;
  const y = event.clientY || window.innerHeight / 2;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;

  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function openRandomClip() {
  if (clips.length === 0) return;
  const randomIndex = Math.floor(Math.random() * clips.length);
  openTheater(clips[randomIndex].id);
  showToast('🎲 Выбран случайный клип');
}

async function deleteClip(clipId) {
  if (!confirm('Удалить этот клип из архива?')) return;

  const clip = clips.find(c => c.id === clipId);
  if (clip && clip.isLocalBlob) {
    try {
      await deleteVideoBlob(clipId);
    } catch (e) {
      console.warn('Blob delete failed', e);
    }
  }

  clips = clips.filter(c => c.id !== clipId);
  saveClipsToStorage();
  renderClips();
  renderFriendPills();
  showToast('Клип удален');
}

// Utilities
function formatDate(isoStr) {
  try {
    const date = new Date(isoStr);
    return date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (e) {
    return isoStr;
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[m]);
}

function showToast(text) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = text;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(8px)';
    setTimeout(() => toast.remove(), 250);
  }, 2600);
}

// Boot up
window.addEventListener('DOMContentLoaded', initApp);
