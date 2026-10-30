// 99시간 59분 59초 최대 상한선 (밀리초)
const MAX_TIME_MS = (99 * 3600 + 59 * 60 + 59) * 1000;

// 앱 상태 객체
const state = {
  options: { chaos: false, variants: true, silhouette: true, grouping: true, unreleased: false },
  subOptions: {
    noCollab: false,
    fullName: false,
    noAuto: false,
    jpServer: false
  },
  students: [],
  revealedList: [],
  revealedSet: new Set(),
  givenUpSet: new Set(),
  timerInterval: null,
  startTime: 0,
  elapsed: 0,
  isFinished: false,
  isGivenUp: false
};

// DOM 요소 캐싱
const startModal = document.getElementById('startModal');
const clearModal = document.getElementById('clearModal');
const boardGrid = document.getElementById('boardGrid');
const inputWrapper = document.getElementById('inputWrapper');
const scoreText = document.getElementById('scoreText');
const timerText = document.getElementById('timerText');
const giveUpBtn = document.getElementById('giveUpBtn');

// 세부 설정 버튼 캐싱
const subSettingsToggle = document.getElementById('subSettingsToggle');
const subSettingsGrid = document.getElementById('subSettingsGrid');
const btnSubCollab = document.getElementById('btn-sub-collab');
const btnSubFullName = document.getElementById('btn-sub-fullname');
const btnSubNoAuto = document.getElementById('btn-sub-noauto');
const btnSubJpServer = document.getElementById('btn-sub-jpserver');

// ⭐ 모바일 HUD 토글 캐싱 ⭐
const mobileHudToggle = document.getElementById('mobileHudToggle');
const hudCollapsibleGroup = document.getElementById('hudCollapsibleGroup');

// 1. 공백, 괄호, 특수기호 제거 정규화
function clean(str) {
  return (str || "").replace(/[\s\(\)\[\]\-_·]/g, "").toLowerCase();
}

// 2. 시간 포맷팅 (HH:MM:SS)
function formatTime(ms) {
  const clamped = Math.min(ms, MAX_TIME_MS);
  const totalSec = Math.floor(clamped / 1000);
  const hours = String(Math.floor(totalSec / 3600)).padStart(2, '0');
  const mins = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
  const secs = String(totalSec % 60).padStart(2, '0');
  return `${hours}:${mins}:${secs}`;
}

// 3. 흔들림 피드백
function triggerShake() {
  inputWrapper.classList.remove('shake');
  void inputWrapper.offsetWidth;
  inputWrapper.classList.add('shake');
  setTimeout(() => inputWrapper.classList.remove('shake'), 400);
}

// 4. 타이머
function startTimer() {
  clearInterval(state.timerInterval);
  state.startTime = performance.now() - state.elapsed;

  state.timerInterval = setInterval(() => {
    state.elapsed = performance.now() - state.startTime;

    if (state.elapsed >= MAX_TIME_MS) {
      state.elapsed = MAX_TIME_MS;
      timerText.textContent = "99:59:59";
      clearInterval(state.timerInterval);
      return;
    }

    timerText.textContent = formatTime(state.elapsed);
  }, 250);
}

function stopTimer() {
  clearInterval(state.timerInterval);
}

// 5. 열 수 계산
function getTargetColCount() {
  const width = boardGrid.clientWidth || (window.innerWidth - 48);
  const count = Math.floor((width + 16) / (280 + 16));
  return Math.max(1, Math.min(count, 4));
}

// 6. 5대 챌린지 모드 테두리 하이라이트 갱신
function updateOptionHighlights() {
  const rules = [
    { id: 'chk-chaos', isHard: (el) => el.checked },
    { id: 'chk-variants', isHard: (el) => el.checked },
    { id: 'chk-silhouette', isHard: (el) => !el.checked },
    { id: 'chk-grouping', isHard: (el) => !el.checked },
    { id: 'chk-unreleased', isHard: (el) => el.checked },
  ];

  rules.forEach(({ id, isHard }) => {
    const el = document.getElementById(id);
    if (!el) return;
    const item = el.closest('.checklist-item');
    if (item) {
      item.classList.toggle('is-hard', isHard(el));
    }
  });
}

// 7. 한글 IME 버퍼 종료를 위한 입력창 노드 재생성
function resetAnswerInput() {
  const oldInput = document.getElementById('answerInput');
  if (!oldInput) return null;

  const newInput = document.createElement('input');
  newInput.type = 'text';
  newInput.id = 'answerInput';
  newInput.className = 'student-search-input';
  newInput.placeholder = state.subOptions.fullName 
    ? '학생 풀네임(성씨 포함)을 입력하세요...' 
    : '학생 이름을 입력하세요...';
  newInput.autocomplete = 'off';

  oldInput.replaceWith(newInput);
  newInput.focus();
  return newInput;
}

// 8. 게임 초기화
function initGame() {
  state.options = {
    chaos: document.getElementById('chk-chaos').checked,
    variants: document.getElementById('chk-variants').checked,
    silhouette: document.getElementById('chk-silhouette').checked,
    grouping: document.getElementById('chk-grouping').checked,
    unreleased: document.getElementById('chk-unreleased').checked,
  };

  state.students = STUDENTS_DATA.filter(s => {
    if (state.subOptions.noCollab && s.school === "콜라보레이션") return false;
    if (!state.options.variants && s.isVariant) return false;

    if (state.subOptions.jpServer) {
      if (!state.options.unreleased && !s.isPlayableJp) return false;
    } else {
      const appearedInKr = (s.isAppearedKr === true || s.isPlayable === true);
      if (!appearedInKr) return false;
      if (!state.options.unreleased && !s.isPlayable) return false;
    }

    return true;
  });

  state.revealedList = [];
  state.revealedSet.clear();
  state.givenUpSet.clear();
  state.isFinished = false;
  state.isGivenUp = false;
  state.elapsed = 0;
  timerText.textContent = "00:00:00";

  const inputEl = resetAnswerInput() || document.getElementById('answerInput');
  if (inputEl) {
    inputEl.value = "";
    inputEl.disabled = false;
  }

  giveUpBtn.className = 'skew-box btn-skew-action btn-giveup';
  giveUpBtn.innerHTML = `
    <div class="skew-inner btn-text">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6h-5.6z"/></svg>
      포기
    </div>
  `;
  giveUpBtn.onclick = executeGiveUp;

  // 모바일 메뉴 닫기
  closeMobileHud();

  renderBoard();
  updateScoreUI();
  startTimer();

  setTimeout(() => {
    const el = document.getElementById('answerInput');
    if (el) el.focus();
  }, 150);
}

// 9. 슬롯 DOM 생성 함수
function createSlotElement(student, isRevealed, isGivenUpSlot = false, isNew = false) {
  const slot = document.createElement('div');
  let statusClass = 'locked';

  if (isRevealed) {
    statusClass = isGivenUpSlot ? 'revealed given-up' : 'revealed';
    if (isNew) statusClass += ' just-revealed';
  } else if (state.options.silhouette) {
    statusClass = 'silhouette';
  }

  slot.className = `student-slot ${statusClass}`;
  if (student) slot.id = `slot-${student.id}`;

  slot.oncontextmenu = (e) => e.preventDefault();

  const lockSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  lockSvg.setAttribute('viewBox', '0 0 24 24');
  lockSvg.innerHTML = '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>';
  slot.appendChild(lockSvg);

  if (student) {
    const img = document.createElement('img');
    img.className = 'avatar-img';
    img.src = student.image;
    img.draggable = false;

    const displayName = state.subOptions.fullName ? (student.fullName || student.name) : student.name;

    if (isRevealed) {
      img.alt = displayName;
      slot.title = displayName;
    } else {
      img.alt = "";
      slot.removeAttribute('title');
    }

    slot.appendChild(img);

    const label = document.createElement('div');
    label.className = 'giveup-label';
    label.textContent = state.subOptions.fullName ? (student.fullName || student.name) : student.name.split(" ")[0];
    slot.appendChild(label);
  }

  return slot;
}

// 10. 보드 렌더링
function renderBoard(newlyRevealedId = null) {
  boardGrid.innerHTML = "";
  boardGrid.className = state.options.grouping ? "academy-grid" : "academy-grid unified-mode";

  if (state.options.grouping) {
    const grouped = {};
    state.students.forEach(s => {
      if (!grouped[s.school]) grouped[s.school] = [];
      grouped[s.school].push(s);
    });

    const numCols = getTargetColCount();
    const cols = [];
    const colHeights = [];

    for (let i = 0; i < numCols; i++) {
      const colDiv = document.createElement('div');
      colDiv.className = 'masonry-col';
      boardGrid.appendChild(colDiv);
      cols.push(colDiv);
      colHeights.push(0);
    }

    Object.keys(grouped).forEach(school => {
      const list = grouped[school];
      const card = document.createElement('section');
      card.className = 'academy-card';

      const revealedCount = state.options.chaos 
        ? state.revealedList.filter(s => s.school === school).length 
        : list.filter(s => state.revealedSet.has(s.id)).length;

      card.innerHTML = `
        <div class="academy-header">
          <div class="academy-title-wrap">
            <div class="academy-pill-indicator"></div>
            <div class="academy-name">${school}</div>
          </div>
          <span class="academy-count-badge" id="count-${school}">${revealedCount} / ${list.length}</span>
        </div>
      `;

      const slotsBox = document.createElement('div');
      slotsBox.className = 'slots-container';
      slotsBox.id = `slots-${school}`;

      if (state.options.chaos) {
        const matchedInSchool = state.revealedList.filter(s => s.school === school);
        const unrevealedInSchool = list.filter(s => !state.revealedList.some(r => r.id === s.id));

        matchedInSchool.forEach(s => {
          const isNew = (s.id === newlyRevealedId);
          slotsBox.appendChild(createSlotElement(s, true, state.givenUpSet.has(s.id), isNew));
        });
        unrevealedInSchool.forEach(s => {
          slotsBox.appendChild(createSlotElement(s, false));
        });
      } else {
        list.forEach(student => {
          const isRev = state.revealedSet.has(student.id);
          const isGivenUpSlot = state.givenUpSet.has(student.id);
          const isNew = (student.id === newlyRevealedId);
          slotsBox.appendChild(createSlotElement(student, isRev, isGivenUpSlot, isNew));
        });
      }

      card.appendChild(slotsBox);

      let minColIdx = 0;
      for (let i = 1; i < numCols; i++) {
        if (colHeights[i] < colHeights[minColIdx]) {
          minColIdx = i;
        }
      }

      cols[minColIdx].appendChild(card);
      const estimatedHeight = 75 + Math.ceil(list.length / 5) * 55;
      colHeights[minColIdx] += estimatedHeight;
    });

  } else {
    const card = document.createElement('section');
    card.className = 'academy-card';
    const currentCount = state.options.chaos ? state.revealedList.length : state.revealedSet.size;
    card.innerHTML = `
      <div class="academy-header">
        <div class="academy-title-wrap">
          <div class="academy-pill-indicator"></div>
          <div class="academy-name">키보토스 통합 명부</div>
        </div>
        <span class="academy-count-badge">${currentCount} / ${state.students.length}</span>
      </div>
    `;
    const slotsBox = document.createElement('div');
    slotsBox.className = 'slots-container';

    if (state.options.chaos) {
      const unrevealed = state.students.filter(s => !state.revealedList.some(r => r.id === s.id));

      state.revealedList.forEach(s => {
        const isNew = (s.id === newlyRevealedId);
        slotsBox.appendChild(createSlotElement(s, true, state.givenUpSet.has(s.id), isNew));
      });
      unrevealed.forEach(s => {
        slotsBox.appendChild(createSlotElement(s, false));
      });
    } else {
      state.students.forEach(student => {
        const isRev = state.revealedSet.has(student.id);
        const isGivenUpSlot = state.givenUpSet.has(student.id);
        const isNew = (student.id === newlyRevealedId);
        slotsBox.appendChild(createSlotElement(student, isRev, isGivenUpSlot, isNew));
      });
    }

    card.appendChild(slotsBox);
    boardGrid.appendChild(card);
  }
}

// 11. RECRUIT 및 학원별 점수 UI 갱신
function updateScoreUI() {
  const current = state.options.chaos ? state.revealedList.length : state.revealedSet.size;
  const total = state.students.length;
  scoreText.textContent = `${current} / ${total}`;

  if (state.options.grouping) {
    const schools = [...new Set(state.students.map(s => s.school))];
    schools.forEach(school => {
      const badge = document.getElementById(`count-${school}`);
      if (!badge) return;
      const totalInSchool = state.students.filter(s => s.school === school).length;
      const matchCount = state.options.chaos 
        ? state.revealedList.filter(s => s.school === school).length
        : state.students.filter(s => s.school === school && state.revealedSet.has(s.id)).length;
      badge.textContent = `${matchCount} / ${totalInSchool}`;
    });
  }
}

// 12. 치트키 실행
function executeCheatClear(forceAllHard = false) {
  if (state.isFinished) return;

  state.revealedList = [...state.students];
  state.revealedSet = new Set(state.students.map(s => s.id));
  state.givenUpSet.clear();

  if (forceAllHard) {
    state.options = {
      chaos: true,
      variants: true,
      silhouette: false,
      grouping: false,
      unreleased: true
    };
  }

  closeMobileHud();
  renderBoard();
  updateScoreUI();
  finishGame(false, true);
}

// 13. 입력값과 학생 매칭 검사 함수
function checkStudentMatch(query) {
  if (!query) return null;

  return state.students.find(student => {
    const alreadyDone = state.options.chaos 
      ? state.revealedList.some(s => s.id === student.id)
      : state.revealedSet.has(student.id);
    if (alreadyDone) return false;

    if (state.subOptions.fullName) {
      return clean(student.fullName) === query;
    }

    if (clean(student.name) === query) return true;
    return (student.aliases || []).some(alias => clean(alias) === query);
  });
}

// 14. 정답 처리 공통 실행부
function processCorrectMatch(matched) {
  resetAnswerInput();
  closeMobileHud();

  if (state.options.chaos) {
    state.revealedList.push(matched);
    renderBoard(matched.id);
  } else {
    state.revealedSet.add(matched.id);
    const slot = document.getElementById(`slot-${matched.id}`);
    if (slot) {
      slot.className = 'student-slot revealed just-revealed';
      const displayName = state.subOptions.fullName ? (matched.fullName || matched.name) : matched.name;
      slot.title = displayName;
      const img = slot.querySelector('.avatar-img');
      if (img) img.alt = displayName;
    }
  }

  updateScoreUI();

  const currentCount = state.options.chaos ? state.revealedList.length : state.revealedSet.size;
  if (currentCount === state.students.length) {
    finishGame(false, true);
  }
}

// 15. 입력 이벤트 분기
function handleInputEvent(inputEl) {
  if (state.isFinished || !inputEl) return;
  if (state.subOptions.noAuto) return;

  const query = clean(inputEl.value);
  if (!query) return;

  if (query === '올하드' || query === 'cheat') {
    resetAnswerInput();
    executeCheatClear(true);
    return;
  }
  if (query === '치트' || query === '올클' || query === 'clear') {
    resetAnswerInput();
    executeCheatClear(false);
    return;
  }

  const matched = checkStudentMatch(query);
  if (matched) {
    processCorrectMatch(matched);
  }
}

// 16. 엔터키 이벤트
function handleEnterEvent(inputEl) {
  if (state.isFinished || !inputEl) return;
  const query = clean(inputEl.value);
  if (!query) return;

  if (query === '올하드' || query === 'cheat') {
    resetAnswerInput();
    executeCheatClear(true);
    return;
  }
  if (query === '치트' || query === '올클' || query === 'clear') {
    resetAnswerInput();
    executeCheatClear(false);
    return;
  }

  const matched = checkStudentMatch(query);
  if (matched) {
    processCorrectMatch(matched);
  } else {
    triggerShake();
  }
}

// 17. 이벤트 위임
inputWrapper.addEventListener('input', (e) => {
  if (e.target && e.target.id === 'answerInput') {
    handleInputEvent(e.target);
  }
});

inputWrapper.addEventListener('keydown', (e) => {
  if (e.target && e.target.id === 'answerInput') {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleEnterEvent(e.target);
    }
  }
});

// 18. 포기하기 실행
function executeGiveUp() {
  if (state.isFinished) return;
  if (!confirm("작전을 포기하고 남아있는 모든 학생의 정답을 확인하시겠습니까?")) return;

  state.isGivenUp = true;
  stopTimer();
  closeMobileHud();

  const inputEl = document.getElementById('answerInput');
  if (inputEl) inputEl.disabled = true;

  state.students.forEach(student => {
    const isAlreadyRevealed = state.options.chaos
      ? state.revealedList.some(r => r.id === student.id)
      : state.revealedSet.has(student.id);

    if (!isAlreadyRevealed) {
      state.givenUpSet.add(student.id);
      if (state.options.chaos) {
        state.revealedList.push(student);
      } else {
        state.revealedSet.add(student.id);
      }
    }
  });

  renderBoard();
  finishGame(true, false);
}

// 19. 클리어 / 포기 완료 처리
function finishGame(isGivenUp = false, openModalImmediately = true) {
  state.isFinished = true;
  stopTimer();
  closeMobileHud();

  const inputEl = document.getElementById('answerInput');
  if (inputEl) inputEl.disabled = true;

  giveUpBtn.className = 'skew-box btn-skew-action';
  giveUpBtn.innerHTML = `
    <div class="skew-inner btn-text" style="color: var(--ba-blue-dark);">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/></svg>
      결과 보기
    </div>
  `;
  giveUpBtn.onclick = () => clearModal.classList.remove('hidden');

  const opt = state.options;
  const isAllHard = !isGivenUp && (opt.chaos === true && opt.variants === true && opt.silhouette === false && opt.grouping === false && opt.unreleased === true);

  const clearModalCard = document.getElementById('clearModalCard');
  const clearStamp = document.getElementById('clearStamp');
  const finalTimeText = document.getElementById('finalTimeText');
  const finalScoreText = document.getElementById('finalScoreText');
  const resultTimeLabel = document.getElementById('resultTimeLabel');
  const clearOptionsSummary = document.getElementById('clearOptionsSummary');
  const clearChallengeCount = document.getElementById('clearChallengeCount');

  finalTimeText.textContent = formatTime(state.elapsed);

  const total = state.students.length;
  const correctCount = isGivenUp ? (total - state.givenUpSet.size) : total;
  const percent = total > 0 ? ((correctCount / total) * 100).toFixed(1) : "0.0";

  if (finalScoreText) {
    finalScoreText.textContent = `${correctCount} / ${total} (${percent}%)`;
  }

  clearModalCard.classList.remove('all-hard-active', 'retired-active');

  if (isGivenUp) {
    clearModalCard.classList.add('retired-active');
    clearStamp.textContent = 'OPERATION RETIRED';
    resultTimeLabel.textContent = '작전 중단 시점 (RETIRED TIME)';
  } else if (isAllHard) {
    clearModalCard.classList.add('all-hard-active');
    clearStamp.textContent = 'PERFECT OPERATION';
    resultTimeLabel.textContent = '작전 소요 시간 (CLEAR TIME)';
  } else {
    clearStamp.textContent = 'MISSION COMPLETE';
    resultTimeLabel.textContent = '작전 소요 시간 (CLEAR TIME)';
  }

  const ruleList = [
    { name: "1. 무질서 (Chaos)", status: opt.chaos ? "ON (활성)" : "OFF", hard: opt.chaos === true },
    { name: "2. 이격 학생 포함", status: opt.variants ? "ON (포함)" : "OFF", hard: opt.variants === true },
    { name: "3. 실루엣 보기", status: opt.silhouette ? "ON" : "OFF (노 힌트)", hard: opt.silhouette === false },
    { name: "4. 학원 분리", status: opt.grouping ? "ON" : "OFF (통합 그리드)", hard: opt.grouping === false },
    { name: "5. 미실장 학생 포함", status: opt.unreleased ? "ON (포함)" : "OFF", hard: opt.unreleased === true }
  ];

  clearOptionsSummary.innerHTML = "";
  let hardCount = 0;
  ruleList.forEach(r => {
    if (r.hard) hardCount++;
    const item = document.createElement('div');
    item.className = `applied-opt-item ${r.hard ? 'is-hardcore' : ''}`;
    item.innerHTML = `
      <div class="applied-opt-name">${r.name}</div>
      <div class="applied-opt-status">${r.status}</div>
    `;
    clearOptionsSummary.appendChild(item);
  });

  const subList = [];
  if (state.subOptions.noCollab) subList.push("콜라보 제외");
  if (state.subOptions.fullName) subList.push("성씨 풀네임 매칭");
  if (state.subOptions.noAuto) subList.push("엔터 수동입력");
  if (state.subOptions.jpServer) subList.push("JP서버 기준");

  if (subList.length > 0) {
    const extraItem = document.createElement('div');
    extraItem.className = 'applied-opt-item';
    extraItem.innerHTML = `
      <div class="applied-opt-name" style="color:var(--ba-text-sub);">부가 작전 설정</div>
      <div class="applied-opt-status">${subList.join(", ")}</div>
    `;
    clearOptionsSummary.appendChild(extraItem);
  }

  clearChallengeCount.textContent = `CHALLENGE ${hardCount} / 5`;
  clearChallengeCount.style.color = hardCount === 5 ? 'var(--hard-gold)' : 'var(--hard-accent)';

  if (openModalImmediately) {
    setTimeout(() => clearModal.classList.remove('hidden'), 500);
  }
}

// ⭐ 모바일 HUD 메뉴 제어 함수 ⭐
function closeMobileHud() {
  if (hudCollapsibleGroup) hudCollapsibleGroup.classList.remove('is-open');
  if (mobileHudToggle) mobileHudToggle.classList.remove('is-active');
}

if (mobileHudToggle) {
  mobileHudToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isOpen = hudCollapsibleGroup.classList.toggle('is-open');
    mobileHudToggle.classList.toggle('is-active', isOpen);
  });
}

// 화면 바깥 클릭 시 모바일 메뉴 자동 닫힘
document.addEventListener('click', (e) => {
  if (window.innerWidth <= 768 && hudCollapsibleGroup && hudCollapsibleGroup.classList.contains('is-open')) {
    if (!hudCollapsibleGroup.contains(e.target) && !mobileHudToggle.contains(e.target)) {
      closeMobileHud();
    }
  }
});

// 20. 세부 설정 UI 및 토글 버튼 연동
subSettingsToggle.addEventListener('click', () => {
  const isHidden = subSettingsGrid.classList.toggle('hidden');
  subSettingsToggle.classList.toggle('is-open', !isHidden);
});

function bindSubOption(buttonEl, stateKey) {
  buttonEl.addEventListener('click', () => {
    state.subOptions[stateKey] = !state.subOptions[stateKey];
    buttonEl.classList.toggle('is-active', state.subOptions[stateKey]);
  });
}

bindSubOption(btnSubCollab, 'noCollab');
bindSubOption(btnSubFullName, 'fullName');
bindSubOption(btnSubNoAuto, 'noAuto');
bindSubOption(btnSubJpServer, 'jpServer');

// 21. 모달 및 기본 이벤트 연동
document.getElementById('startBtn').addEventListener('click', () => {
  startModal.classList.add('hidden');
  initGame();
});

document.getElementById('openSettingsBtn').addEventListener('click', () => {
  stopTimer();
  closeMobileHud();
  updateOptionHighlights();
  startModal.classList.remove('hidden');
});

giveUpBtn.addEventListener('click', executeGiveUp);

document.getElementById('inspectBoardBtn').addEventListener('click', () => {
  clearModal.classList.add('hidden');
});

document.getElementById('retryBtn').addEventListener('click', () => {
  clearModal.classList.add('hidden');
  closeMobileHud();
  updateOptionHighlights();
  startModal.classList.remove('hidden');
});

window.addEventListener('resize', () => {
  if (state.options.grouping && !state.isFinished) {
    const currentCols = boardGrid.querySelectorAll('.masonry-col').length;
    if (currentCols !== getTargetColCount()) {
      renderBoard();
    }
  }
  // 데스크톱 크기로 커지면 모바일 메뉴 상태 자동 정리
  if (window.innerWidth > 768) {
    closeMobileHud();
  }
});

document.querySelectorAll('.options-checklist input[type="checkbox"]').forEach(chk => {
  chk.addEventListener('change', updateOptionHighlights);
});

updateOptionHighlights();