const $ = (id) => document.getElementById(id)

const ids = ['eyes', 'focus', 'blur', 'exposure', 'dup', 'compromise', 'burstLevel']
for (const id of ids) {
  const el = $(id)
  const out = $(`${id}Val`)
  if (!el || !out) continue
  el.addEventListener('input', () => {
    out.textContent = el.value
    persistRecent()
  })
}

const PRESET_KEY = 'photoforge.presets.v1'
const RECENT_KEY = 'photoforge.recent.v1'
const LEGACY_PRESET_KEY = 'ktk.select.presets.v1'
const LEGACY_RECENT_KEY = 'ktk.select.recent.v1'

let modalItems = []
let reviewFilter = 'all'
let reviewSort = 'score_desc'
let reviewMinScore = 0
let quickViewMode = 'none'
let activeFile = ''

const defaultPresets = {
  conservative: { eyes: 1, focus: 1, blur: 1, exposure: 1, dup: 0, compromise: 0, burstLevel: 1 },
  balanced: { eyes: 2, focus: 2, blur: 1, exposure: 1, dup: 1, compromise: 0, burstLevel: 2 },
  aggressive: { eyes: 3, focus: 3, blur: 2, exposure: 2, dup: 2, compromise: 0, burstLevel: 3 },
}

function burstLevelToSec(level) {
  const n = Number(level || 0)
  if (n <= 0) return 0.0
  if (n === 1) return 0.8
  if (n === 2) return 1.5
  return 2.5
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY) || localStorage.getItem(LEGACY_PRESET_KEY) || '{}'
    const v = JSON.parse(raw)
    return { ...defaultPresets, ...v }
  } catch {
    return { ...defaultPresets }
  }
}

function savePresets(presets) {
  localStorage.setItem(PRESET_KEY, JSON.stringify(presets))
}

function applyLevelSet(levels) {
  const map = {
    burstLevel: levels.burstLevel ?? 2,
    eyes: levels.eyes ?? levels.eyes_closed ?? 2,
    focus: levels.focus ?? levels.out_of_focus_subject ?? 2,
    blur: levels.blur ?? levels.motion_blur ?? 1,
    exposure: levels.exposure ?? levels.exposure_bad ?? 1,
    dup: levels.dup ?? levels.duplicate ?? 1,
    compromise: levels.compromise ?? 0,
  }
  for (const [k, v] of Object.entries(map)) {
    $(k).value = String(v)
    $(`${k}Val`).textContent = String(v)
  }
}

function getSettingFromUI() {
  const burstLevel = Number($('burstLevel').value || 0)
  return {
    inputDir: $('inputDir').value.trim(),
    outputDir: $('outputDir').value.trim(),
    conflictPolicy: $('conflictPolicy').value,
    exportMode: document.querySelector('input[name="exportMode"]:checked')?.value || 'copy',
    compromise: Number($('compromise').value),
    burstLevel,
    burstWindowSec: burstLevelToSec(burstLevel),
    levels: {
      eyes_closed: Number($('eyes').value),
      out_of_focus_subject: Number($('focus').value),
      motion_blur: Number($('blur').value),
      exposure_bad: Number($('exposure').value),
      duplicate: Number($('dup').value),
      occlusion: 0,
      composition_bad: 0,
    },
  }
}

function persistRecent() {
  localStorage.setItem(RECENT_KEY, JSON.stringify(getSettingFromUI()))
}

function restoreRecent() {
  try {
    const raw = localStorage.getItem(RECENT_KEY) || localStorage.getItem(LEGACY_RECENT_KEY) || '{}'
    const v = JSON.parse(raw)
    if (v.inputDir) $('inputDir').value = v.inputDir
    if (v.outputDir) $('outputDir').value = v.outputDir
    if (v.conflictPolicy) $('conflictPolicy').value = v.conflictPolicy
    if (v.exportMode) {
      const radio = document.querySelector(`input[name="exportMode"][value="${v.exportMode}"]`)
      if (radio) radio.checked = true
    }
    if (v.levels || typeof v.compromise !== 'undefined' || typeof v.burstLevel !== 'undefined') {
      applyLevelSet({ ...(v.levels || {}), compromise: v.compromise ?? 0, burstLevel: v.burstLevel ?? 2 })
    }
  } catch {}
}

function reasonFlags(rejectReasons) {
  const t = String(rejectReasons || '')
  return {
    눈감: t.includes('eyes_closed'),
    초점: t.includes('out_of_focus_subject') || t.includes('focus_unavailable'),
    블러: t.includes('motion_blur'),
    노출: t.includes('exposure_bad'),
    중복: t.includes('duplicate:') || t.includes('duplicate_exact:'),
    중복완전일치: t.includes('duplicate_exact:'),
  }
}

function reasonScores(item) {
  const f = reasonFlags(item.reject_reasons)
  const levels = item._levels
  return {
    눈감: f.눈감 ? levels.eyes_closed : 0,
    초점: f.초점 ? levels.out_of_focus_subject : 0,
    블러: f.블러 ? levels.motion_blur : 0,
    노출: f.노출 ? levels.exposure_bad : 0,
    중복: f.중복완전일치 ? 3 : (f.중복 ? levels.duplicate : 0),
  }
}

function sumScore(sc) {
  return sc.눈감 + sc.초점 + sc.블러 + sc.노출 + sc.중복
}

function itemScore(item) {
  return sumScore(reasonScores(item))
}

function reasonChips(scores) {
  const levelClass = (v) => {
    if (v >= 3) return 'lv3'
    if (v >= 2) return 'lv2'
    if (v >= 1) return 'lv1'
    return 'lv0'
  }
  return ['눈감', '초점', '블러', '노출', '중복']
    .map((x) => `<span class="chip ${levelClass(scores[x] || 0)}">${x}</span>`)
    .join('')
}

function syncQuickButtons() {
  const approveBtn = $('quickApproveView')
  const rejectBtn = $('quickRejectView')
  const approveOn = quickViewMode === 'approve'
  const rejectOn = quickViewMode === 'reject'

  approveBtn.classList.toggle('active', approveOn)
  rejectBtn.classList.toggle('active', rejectOn)

  approveBtn.textContent = approveOn ? 'approve 빠른보기 ON' : 'approve만 빠르게 보기'
  rejectBtn.textContent = rejectOn ? 'reject 빠른보기 ON' : 'reject만 빠르게 보기'
}

function refreshModalSummary() {
  const rejectCnt = modalItems.filter((x) => x.decision === 'reject').length
  const visible = getDisplayedItems().length
  $('modalSummary').textContent = `${modalItems.length}건 (reject ${rejectCnt}, 표시 ${visible}, score≥${reviewMinScore})`
}

function getDisplayedItems() {
  let items = [...modalItems]
  if (reviewFilter === 'approve') items = items.filter((x) => x.decision === 'approve')
  if (reviewFilter === 'reject') items = items.filter((x) => x.decision === 'reject')
  items = items.filter((x) => itemScore(x) >= reviewMinScore)

  items.sort((a, b) => {
    const sa = itemScore(a)
    const sb = itemScore(b)
    if (reviewSort === 'score_desc') return sb - sa || a.file.localeCompare(b.file)
    if (reviewSort === 'score_asc') return sa - sb || a.file.localeCompare(b.file)
    if (reviewSort === 'name_desc') return b.file.localeCompare(a.file)
    return a.file.localeCompare(b.file)
  })
  return items
}

function setDecision(item, decision) {
  item.decision = decision
  renderReviewGrid()
}

function getActiveItem() {
  const displayed = getDisplayedItems()
  if (displayed.length === 0) return null
  let found = displayed.find((x) => x.file === activeFile)
  if (!found) {
    found = displayed[0]
    activeFile = found.file
  }
  return found
}

function moveActiveBy(direction) {
  const displayed = getDisplayedItems()
  if (displayed.length === 0) return
  let idx = displayed.findIndex((x) => x.file === activeFile)
  if (idx < 0) idx = 0

  const cols = 4
  if (direction === 'left') idx -= 1
  else if (direction === 'right') idx += 1
  else if (direction === 'up') idx -= cols
  else if (direction === 'down') idx += cols

  if (idx < 0) idx = 0
  if (idx >= displayed.length) idx = displayed.length - 1

  activeFile = displayed[idx].file
  renderReviewGrid()
}

function makeReviewCard(item) {
  const card = document.createElement('div')
  card.className = 'reviewCard'
  if (item.file === activeFile) card.classList.add('active-card')

  const img = document.createElement('img')
  img.className = 'thumb'
  img.src = `file://${item.file}`
  img.loading = 'lazy'
  img.onclick = () => window.ktk.openPath(item.file)

  const sc = reasonScores(item)

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.innerHTML = `<div class="filename">${item.file.split('/').pop()} · score ${itemScore(item)}</div><div class="reasons">${item.reject_reasons || item.review_reasons || '-'}</div><div class="chips">${reasonChips(sc)}</div>`

  const toggles = document.createElement('div')
  toggles.className = 'smallActions'
  const a = document.createElement('button')
  const r = document.createElement('button')
  a.textContent = 'approve'
  r.textContent = 'reject'

  a.classList.toggle('sel', item.decision === 'approve')
  r.classList.toggle('sel', item.decision === 'reject')

  card.onclick = () => {
    activeFile = item.file
    renderReviewGrid()
  }

  a.onclick = (e) => {
    e.stopPropagation()
    activeFile = item.file
    setDecision(item, 'approve')
  }

  r.onclick = (e) => {
    e.stopPropagation()
    activeFile = item.file
    setDecision(item, 'reject')
  }

  toggles.appendChild(a)
  toggles.appendChild(r)

  card.appendChild(img)
  card.appendChild(meta)
  card.appendChild(toggles)
  return card
}

function renderReviewGrid() {
  const items = getDisplayedItems()
  const grid = $('reviewGrid')
  grid.innerHTML = ''
  items.forEach((it) => grid.appendChild(makeReviewCard(it)))
  refreshModalSummary()
}

function openReview(items) {
  modalItems = items
  reviewFilter = 'all'
  reviewSort = 'score_desc'
  reviewMinScore = 0
  quickViewMode = 'none'
  $('reviewFilter').value = reviewFilter
  $('reviewSort').value = reviewSort
  $('reviewMinScore').value = String(reviewMinScore)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  syncQuickButtons()
  activeFile = items[0]?.file || ''
  $('emptyCenter').classList.add('hidden')
  $('reviewPanel').classList.remove('hidden')
  renderReviewGrid()
}

function closeReview() {
  $('reviewPanel').classList.add('hidden')
  $('emptyCenter').classList.remove('hidden')
}

function openSettings() {
  $('settingsModal').classList.remove('hidden')
}

function closeSettings() {
  $('settingsModal').classList.add('hidden')
}

$('openSettings').addEventListener('click', openSettings)
$('closeSettings').addEventListener('click', closeSettings)
$('settingsModal').addEventListener('click', (e) => {
  if (e.target.id === 'settingsModal') closeSettings()
})

$('presetSelect').addEventListener('change', () => {
  const presets = loadPresets()
  applyLevelSet(presets[$('presetSelect').value] || presets.balanced)
  persistRecent()
})

$('savePreset').addEventListener('click', () => {
  const presets = loadPresets()
  presets[$('presetSelect').value] = {
    burstLevel: Number($('burstLevel').value),
    eyes: Number($('eyes').value),
    focus: Number($('focus').value),
    blur: Number($('blur').value),
    exposure: Number($('exposure').value),
    dup: Number($('dup').value),
    compromise: Number($('compromise').value),
  }
  savePresets(presets)
  $('log').textContent = '프리셋 저장 완료'
  persistRecent()
})

$('pickInput').addEventListener('click', async () => {
  const dir = await window.ktk.pickFolder()
  if (dir) $('inputDir').value = dir
  persistRecent()
})

$('pickOutput').addEventListener('click', async () => {
  const dir = await window.ktk.pickFolder()
  if (dir) $('outputDir').value = dir
  persistRecent()
})

$('openOut').addEventListener('click', async () => {
  const p = $('outputDir').value.trim()
  if (p) await window.ktk.openPath(p)
})

$('reviewFilter').addEventListener('change', () => {
  reviewFilter = $('reviewFilter').value
  if (quickViewMode === 'approve' && reviewFilter !== 'approve') {
    quickViewMode = 'none'
    syncQuickButtons()
  }
  if (quickViewMode === 'reject' && reviewFilter !== 'reject') {
    quickViewMode = 'none'
    syncQuickButtons()
  }
  renderReviewGrid()
})

$('reviewSort').addEventListener('change', () => {
  reviewSort = $('reviewSort').value
  renderReviewGrid()
})

$('reviewMinScore').addEventListener('input', () => {
  reviewMinScore = Number($('reviewMinScore').value || 0)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  if (quickViewMode === 'reject' && reviewMinScore < 1) {
    quickViewMode = 'none'
    syncQuickButtons()
  }
  if (quickViewMode === 'approve' && reviewMinScore !== 0) {
    quickViewMode = 'none'
    syncQuickButtons()
  }
  renderReviewGrid()
})

function toggleQuickApproveView() {
  quickViewMode = quickViewMode === 'approve' ? 'none' : 'approve'
  if (quickViewMode === 'approve') {
    reviewFilter = 'approve'
    reviewMinScore = 0
  } else {
    reviewFilter = 'all'
    reviewMinScore = 0
  }
  $('reviewFilter').value = reviewFilter
  $('reviewMinScore').value = String(reviewMinScore)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  syncQuickButtons()
  renderReviewGrid()
}

function toggleQuickRejectView() {
  quickViewMode = quickViewMode === 'reject' ? 'none' : 'reject'
  if (quickViewMode === 'reject') {
    reviewFilter = 'reject'
    reviewMinScore = Math.max(1, Number($('reviewMinScore').value || 0))
  } else {
    reviewFilter = 'all'
    reviewMinScore = 0
  }
  $('reviewFilter').value = reviewFilter
  $('reviewMinScore').value = String(reviewMinScore)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  syncQuickButtons()
  renderReviewGrid()
}

$('quickApproveView').addEventListener('click', toggleQuickApproveView)
$('quickRejectView').addEventListener('click', toggleQuickRejectView)

$('cancelReview').addEventListener('click', () => {
  closeReview()
  $('log').textContent = '사용자가 취소했습니다. 실제 복사/이동은 수행하지 않았습니다.'
})

$('confirmReview').addEventListener('click', async () => {
  const s = getSettingFromUI()
  if (s.exportMode === 'move') {
    const ok = window.confirm('move mode는 원본을 이동합니다. 최종 확인하시겠습니까?')
    if (!ok) return
  }

  const result = await window.ktk.applyReviewExport({
    outputDir: s.outputDir,
    exportMode: s.exportMode,
    conflictPolicy: s.conflictPolicy,
    items: modalItems,
  })

  if (!result.ok) {
    $('log').textContent = `적용 실패\n${result.stderr || result.stdout || ''}`
    return
  }

  closeReview()
  $('log').textContent = `적용 완료\n${JSON.stringify(result.summary || {}, null, 2)}`
})

$('runBtn').addEventListener('click', async () => {
  const s = getSettingFromUI()
  if (!s.inputDir || !s.outputDir) {
    $('log').textContent = '입력/출력 폴더를 먼저 지정해 주세요.'
    return
  }

  $('runBtn').disabled = true
  $('log').textContent = '분석 중... (report mode)'
  persistRecent()

  const analyzed = await window.ktk.analyzeForReview(s)
  $('runBtn').disabled = false

  if (!analyzed.ok) {
    $('log').textContent = `[exit=${analyzed.code}] 실패\n${analyzed.stderr || analyzed.stdout || ''}`
    return
  }

  const rows = analyzed.rows || []
  const compromise = Number(s.compromise || 0)
  const items = rows.map((r) => {
    const it = { ...r, _levels: s.levels }
    const total = itemScore(it)
    const hasAny = total > 0
    let decision = 'approve'
    if (hasAny && total > compromise) decision = 'reject'
    return { ...it, decision }
  })

  $('log').textContent = `분석 완료: total=${rows.length}. 중앙 영역에서 approve/reject 조정 후 확인을 누르세요.`
  openReview(items)
})

$('conflictPolicy').addEventListener('change', persistRecent)
document.querySelectorAll('input[name="exportMode"]').forEach((r) => r.addEventListener('change', persistRecent))

document.addEventListener('keydown', (e) => {
  if ($('reviewPanel').classList.contains('hidden')) return

  const tag = (e.target?.tagName || '').toLowerCase()
  const isTypingTarget = tag === 'input' || tag === 'textarea' || tag === 'select'

  if (e.key === 'Escape') {
    e.preventDefault()
    $('cancelReview').click()
    return
  }

  if (e.key === 'Enter' && !isTypingTarget) {
    e.preventDefault()
    $('confirmReview').click()
    return
  }

  if (isTypingTarget) return

  const key = e.key.toLowerCase()

  if (key === 'arrowleft') {
    e.preventDefault()
    moveActiveBy('left')
    return
  }
  if (key === 'arrowright') {
    e.preventDefault()
    moveActiveBy('right')
    return
  }
  if (key === 'arrowup') {
    e.preventDefault()
    moveActiveBy('up')
    return
  }
  if (key === 'arrowdown') {
    e.preventDefault()
    moveActiveBy('down')
    return
  }

  if (key === 'q') {
    e.preventDefault()
    toggleQuickApproveView()
    return
  }
  if (key === 'w') {
    e.preventDefault()
    toggleQuickRejectView()
    return
  }

  const active = getActiveItem()
  if (!active) return

  if (key === 'a') {
    e.preventDefault()
    setDecision(active, 'approve')
  } else if (key === 'r') {
    e.preventDefault()
    setDecision(active, 'reject')
  }
})

restoreRecent()
