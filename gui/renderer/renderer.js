const $ = (id) => document.getElementById(id)

const ids = ['eyes', 'focus', 'blur', 'exposure', 'dup']
for (const id of ids) {
  const el = $(id)
  const out = $(`${id}Val`)
  if (!el || !out) continue
  el.addEventListener('input', () => {
    out.textContent = el.value
    persistRecent()

    if ($('reviewPanel').classList.contains('hidden')) return
    if (id === 'dup') {
      scheduleRegroupAndRender(70)
      return
    }
    recomputeDecisionsByStrength()
    renderReviewGrid()
  })
}

const PRESET_KEY = 'photoforge.presets.v1'
const RECENT_KEY = 'photoforge.recent.v1'

let modalItems = []
let analysisSummary = {}
let reviewFilter = 'all'
let reviewSort = 'name_asc'
let reviewMinScore = 0
let viewMode = 'large'
let activeFile = ''
let analyzeProgress = { running: false, current: 0, total: 0 }
let analyzeStartedAt = 0
let regroupToken = 0
let regroupTimer = null
let groupModalState = { groupId: '', selectedFile: '' }

const defaultPresets = {
  conservative: { eyes: 1, focus: 1, blur: 1, exposure: 1, dup: 1 },
  balanced: { eyes: 2, focus: 2, blur: 1, exposure: 1, dup: 2 },
  aggressive: { eyes: 3, focus: 3, blur: 2, exposure: 2, dup: 3 },
}

function setStartupOverlay(percent, message) {
  const p = Math.max(0, Math.min(100, Number(percent || 0)))
  const bar = $('startupBarFill')
  const pct = $('startupPercent')
  const msg = $('startupMessage')
  if (bar) bar.style.width = `${p}%`
  if (pct) pct.textContent = `${Math.round(p)}%`
  if (msg && message) msg.textContent = message
}

function hideStartupOverlay() {
  const ov = $('startupOverlay')
  if (!ov) return
  ov.classList.add('hidden')
}

async function runStartupWarmupUI() {
  const runBtn = $('runBtn')
  if (runBtn) runBtn.disabled = true

  let unsub = null
  if (window.photoforge?.onStartupProgress) {
    unsub = window.photoforge.onStartupProgress((p) => {
      setStartupOverlay(p?.percent || 0, p?.message || '초기화 중...')
    })
  }

  try {
    setStartupOverlay(3, '앱 초기화 중...')
    const res = await window.photoforge.startupWarmup()
    if (!res?.ok) {
      setStartupOverlay(100, '초기화 일부 실패 (분석 시 재시도)')
      $('log').textContent = `[startup] 워밍업 실패\n${res?.error || ''}`
      setTimeout(hideStartupOverlay, 800)
    } else {
      setStartupOverlay(100, '준비 완료')
      setTimeout(hideStartupOverlay, 250)
    }
  } catch (e) {
    setStartupOverlay(100, '초기화 오류 (분석 시 재시도)')
    $('log').textContent = `[startup] 오류\n${String(e)}`
    setTimeout(hideStartupOverlay, 900)
  } finally {
    if (typeof unsub === 'function') unsub()
    if (runBtn) runBtn.disabled = false
  }
}

function duplicateLevelToBurstSec(level) {
  const n = Number(level || 0)
  if (n <= 1) return 2.5
  if (n === 2) return 5.0
  return 7.5
}

function scheduleRegroupAndRender(delayMs = 70) {
  if (regroupTimer) clearTimeout(regroupTimer)
  regroupTimer = setTimeout(async () => {
    regroupTimer = null
    await recomputeBurstDuplicateGroupsWithProgress()
    recomputeDecisionsByStrength()
    renderReviewGrid()
  }, Math.max(0, Number(delayMs || 0)))
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESET_KEY) || '{}'
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
    eyes: levels.eyes ?? levels.eyes_closed ?? 2,
    focus: levels.focus ?? levels.out_of_focus_subject ?? 2,
    blur: levels.blur ?? levels.motion_blur ?? 1,
    exposure: levels.exposure ?? levels.exposure_bad ?? 1,
    dup: levels.dup ?? levels.duplicate ?? 2,
  }
  for (const [k, v] of Object.entries(map)) {
    $(k).value = String(v)
    $(`${k}Val`).textContent = String(v)
  }
}

function getSettingFromUI() {
  const dupLevel = Number($('dup').value || 0)
  return {
    inputDir: $('inputDir').value.trim(),
    outputDir: $('outputDir').value.trim(),
    conflictPolicy: $('conflictPolicy').value,
    exportMode: document.querySelector('input[name="exportMode"]:checked')?.value || 'copy',
    includeSidecars: Boolean($('includeSidecars')?.checked),
    compromise: 0,
    burstWindowSec: duplicateLevelToBurstSec(dupLevel),
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
    const raw = localStorage.getItem(RECENT_KEY) || '{}'
    const v = JSON.parse(raw)
    if (v.inputDir) $('inputDir').value = v.inputDir
    if (v.outputDir) $('outputDir').value = v.outputDir
    if (v.conflictPolicy) $('conflictPolicy').value = v.conflictPolicy
    if (v.exportMode) {
      const radio = document.querySelector(`input[name="exportMode"][value="${v.exportMode}"]`)
      if (radio) radio.checked = true
    }
    if (typeof v.includeSidecars === 'boolean' && $('includeSidecars')) {
      $('includeSidecars').checked = v.includeSidecars
    }
    if (v.levels) {
      applyLevelSet({ ...(v.levels || {}) })
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

function getLiveLevels() {
  return {
    eyes_closed: Number($('eyes')?.value || 0),
    out_of_focus_subject: Number($('focus')?.value || 0),
    motion_blur: Number($('blur')?.value || 0),
    exposure_bad: Number($('exposure')?.value || 0),
    duplicate: Number($('dup')?.value || 0),
  }
}

function reasonScores(item) {
  const f = reasonFlags(item.reject_reasons)
  const levels = getLiveLevels()
  return {
    눈감: f.눈감 ? levels.eyes_closed : 0,
    초점: f.초점 ? levels.out_of_focus_subject : 0,
    블러: f.블러 ? levels.motion_blur : 0,
    노출: f.노출 ? levels.exposure_bad : 0,
    중복: f.중복완전일치 ? Math.max(1, levels.duplicate) : (f.중복 ? levels.duplicate : 0),
  }
}

function itemScore(item) {
  const f = reasonFlags(item.reject_reasons)
  const levels = getLiveLevels()
  let count = 0
  if (f.눈감 && levels.eyes_closed > 0) count += 1
  if (f.초점 && levels.out_of_focus_subject > 0) count += 1
  if (f.블러 && levels.motion_blur > 0) count += 1
  if (f.노출 && levels.exposure_bad > 0) count += 1
  if (f.중복 && levels.duplicate > 0) count += 1
  return count
}

function splitReasons(text) {
  return String(text || '')
    .split(';')
    .map((x) => x.trim())
    .filter(Boolean)
}

function isDuplicateReason(reason) {
  return reason.startsWith('duplicate:') || reason.startsWith('duplicate_exact:')
}

function joinReasons(reasons) {
  return reasons.filter(Boolean).join(';')
}

function parseHashBigInt(v) {
  const s = String(v || '').trim()
  if (!s) return null
  try {
    return BigInt(s)
  } catch {
    return null
  }
}

function hammingDistance64BigInt(a, b) {
  let x = a ^ b
  let c = 0
  while (x !== 0n) {
    x &= x - 1n
    c += 1
  }
  return c
}

function getScoreNum(item, key) {
  return Number(item?._scoresObj?.[key] || 0)
}

function timestampGapSec(item, rep) {
  if (item.capture_ts_source === 'exif' && rep.capture_ts_source === 'exif') {
    const t1 = Number(item.capture_ts || 0)
    const t2 = Number(rep.capture_ts || 0)
    if (Number.isFinite(t1) && Number.isFinite(t2)) return Math.abs(t1 - t2)
  }
  return null
}

function dynamicDupThreshold(item, rep, baseThreshold, windowSec) {
  const gap = timestampGapSec(item, rep)
  if (gap === null || windowSec <= 0) return baseThreshold
  const ratio = Math.min(1, gap / windowSec)
  const penalty = Math.round(ratio * 4)
  return Math.max(4, baseThreshold - penalty)
}

function isLikelySceneShift(item, rep) {
  const expGap = Math.abs(getScoreNum(item, 'exposure_score') - getScoreNum(rep, 'exposure_score'))
  const focusGap = Math.abs(getScoreNum(item, 'focus_delta') - getScoreNum(rep, 'focus_delta'))
  const blurA = getScoreNum(item, 'laplacian_var')
  const blurB = getScoreNum(rep, 'laplacian_var')
  const blurRatio = (Math.max(blurA, blurB) + 1) / (Math.min(blurA, blurB) + 1)

  if (expGap >= 70) return true
  if (focusGap >= 70) return true
  if (blurRatio >= 4.2) return true
  return false
}

function withinBurstWindow(item, rep, windowSec) {
  if (windowSec <= 0) return true
  const gap = timestampGapSec(item, rep)
  if (gap === null) return true
  return gap <= windowSec
}

function qualityPenaltyFromBaseReasons(item) {
  const joined = joinReasons(item._baseRejectReasons || [])
  const lv = getLiveLevels()
  let p = 0
  if (joined.includes('eyes_closed')) p += lv.eyes_closed
  if (joined.includes('out_of_focus_subject')) p += lv.out_of_focus_subject
  if (joined.includes('motion_blur')) p += lv.motion_blur
  if (joined.includes('exposure_bad')) p += lv.exposure_bad
  return p
}

function isBetterRepresentative(candidate, current) {
  const cp = qualityPenaltyFromBaseReasons(candidate)
  const pp = qualityPenaltyFromBaseReasons(current)
  if (cp !== pp) return cp < pp

  const cScores = candidate._scoresObj || {}
  const pScores = current._scoresObj || {}
  const cBlur = Number(cScores.laplacian_var || 0)
  const pBlur = Number(pScores.laplacian_var || 0)
  if (cBlur !== pBlur) return cBlur > pBlur

  const cFocus = Number(cScores.focus_delta || 0)
  const pFocus = Number(pScores.focus_delta || 0)
  if (cFocus !== pFocus) return cFocus > pFocus

  return String(candidate.file || '') < String(current.file || '')
}

function pickBestRepresentative(members) {
  if (!Array.isArray(members) || members.length === 0) return null
  let best = members[0]
  for (let i = 1; i < members.length; i += 1) {
    if (isBetterRepresentative(members[i], best)) best = members[i]
  }
  return best
}

async function recomputeBurstDuplicateGroupsWithProgress() {
  regroupToken += 1
  const myToken = regroupToken

  const dupLevel = Number($('dup')?.value || 0)
  const burstWindowSec = duplicateLevelToBurstSec(dupLevel)
  const dupBase = Number(analysisSummary?.thresholds?.duplicate_hamming_max ?? 8)
  const dupThreshold = dupBase + (dupLevel <= 1 ? 2 : dupLevel === 2 ? 6 : 10)

  for (const item of modalItems) {
    if (!Array.isArray(item._baseRejectReasons)) {
      item._baseRejectReasons = splitReasons(item.reject_reasons).filter((r) => !isDuplicateReason(r))
    }
    item._dupGroupId = ''
    item._dupGroupSize = 1
    item._dupGroupRep = false
    item._dupGroupMembers = []
    item._dupGroupBy = ''
    item.reject_reasons = joinReasons(item._baseRejectReasons)
  }

  if (dupLevel <= 0) {
    return
  }

  const candidates = modalItems
    .filter((it) => parseHashBigInt(it.hash) !== null)
    .map((it) => {
      it._hashBI = parseHashBigInt(it.hash)
      return it
    })
    .sort((a, b) => {
      const aNoTs = a.capture_ts ? 0 : 1
      const bNoTs = b.capture_ts ? 0 : 1
      if (aNoTs !== bNoTs) return aNoTs - bNoTs
      const at = Number(a.capture_ts || 0)
      const bt = Number(b.capture_ts || 0)
      if (at !== bt) return at - bt
      return String(a.file).localeCompare(String(b.file))
    })

  const groups = []
  const total = candidates.length
  for (let i = 0; i < candidates.length; i += 1) {
    if (myToken !== regroupToken) return
    const item = candidates[i]
    let matched = false
    for (const g of groups) {
      const rep = g.rep
      if (!withinBurstWindow(item, rep, burstWindowSec)) continue
      const hd = hammingDistance64BigInt(item._hashBI, rep._hashBI)
      const effThreshold = dynamicDupThreshold(item, rep, dupThreshold, burstWindowSec)
      const sceneShift = isLikelySceneShift(item, rep)
      if (hd <= effThreshold && !sceneShift) {
        g.members.push(item)
        matched = true
        if (isBetterRepresentative(item, rep)) g.rep = item
        break
      }
    }
    if (!matched) groups.push({ rep: item, members: [item] })

    if (i === 0 || i === total - 1 || i % 12 === 0) {
      setAnalyzeProgress(true, i + 1, total, '재분류중')
    }
    if (i % 36 === 0) {
      await new Promise((r) => setTimeout(r, 0))
    }
  }
  setAnalyzeProgress(false, 0, 0)

  for (let gi = 0; gi < groups.length; gi += 1) {
    const g = groups[gi]
    if (g.members.length <= 1) continue
    const gid = `g${gi + 1}`
    const rep = g.rep
    const repName = String(rep.file || '').split('/').pop() || ''
    const by = burstWindowSec > 0 ? 'burst+duplicate' : 'duplicate'

    for (const m of g.members) {
      m._dupGroupId = gid
      m._dupGroupSize = g.members.length
      m._dupGroupRep = m.file === rep.file
      m._dupGroupMembers = g.members.map((x) => x.file)
      m._dupGroupBy = by
      if (m.file !== rep.file) {
        const hd = hammingDistance64BigInt(m._hashBI, rep._hashBI)
        const dupReason = hd === 0 ? `duplicate_exact:${repName}` : `duplicate:${repName}:hd=${hd}`
        m.reject_reasons = joinReasons([...(m._baseRejectReasons || []), dupReason])
      } else {
        m.reject_reasons = joinReasons(m._baseRejectReasons || [])
      }
    }
  }
}

function getGroupMembers(groupId) {
  return modalItems.filter((x) => x._dupGroupId === groupId)
}

function summarizeGroupCandidate(groupId, repFile) {
  const members = getGroupMembers(groupId)
  if (!members.length) return ''

  const current = members.find((m) => m._dupGroupRep) || members[0]
  const next = members.find((m) => m.file === repFile) || current

  const curPenalty = qualityPenaltyFromBaseReasons(current)
  const nextPenalty = qualityPenaltyFromBaseReasons(next)
  const curBlur = getScoreNum(current, 'laplacian_var').toFixed(1)
  const nextBlur = getScoreNum(next, 'laplacian_var').toFixed(1)
  const curFocus = getScoreNum(current, 'focus_delta').toFixed(1)
  const nextFocus = getScoreNum(next, 'focus_delta').toFixed(1)

  const changed = current.file === next.file ? '현재 대표 유지' : `대표 변경: ${current.file.split('/').pop()} -> ${next.file.split('/').pop()}`
  return `${changed} | 페널티 ${curPenalty} -> ${nextPenalty}, 선명도 ${curBlur} -> ${nextBlur}, 초점 ${curFocus} -> ${nextFocus}`
}

function updateGroupDeltaPreview() {
  const deltaEl = $('groupDelta')
  if (!deltaEl) return
  if (!groupModalState.groupId) {
    deltaEl.textContent = ''
    return
  }
  deltaEl.textContent = summarizeGroupCandidate(groupModalState.groupId, groupModalState.selectedFile)
}

function rebuildGroupWithRepresentative(groupId, repFile) {
  const members = getGroupMembers(groupId)
  if (!members.length) return

  let rep = members.find((m) => m.file === repFile)
  if (!rep) rep = members[0]
  const repName = String(rep.file || '').split('/').pop() || ''

  for (const m of members) {
    m._dupGroupRep = m.file === rep.file
    m._dupGroupMembers = members.map((x) => x.file)
    if (m._dupGroupRep) {
      m.reject_reasons = joinReasons(m._baseRejectReasons || [])
      continue
    }

    const mh = parseHashBigInt(m.hash)
    const rh = parseHashBigInt(rep.hash)
    let dupReason = `duplicate:${repName}:hd=999`
    if (mh !== null && rh !== null) {
      const hd = hammingDistance64BigInt(mh, rh)
      dupReason = hd === 0 ? `duplicate_exact:${repName}` : `duplicate:${repName}:hd=${hd}`
    }
    m.reject_reasons = joinReasons([...(m._baseRejectReasons || []), dupReason])
  }
}

function renderGroupModal() {
  const members = getGroupMembers(groupModalState.groupId)
  const grid = $('groupGrid')
  grid.innerHTML = ''
  const recommended = pickBestRepresentative(members)
  for (const m of members) {
    const card = document.createElement('div')
    card.className = `groupItem ${m.file === groupModalState.selectedFile ? 'sel' : ''}`

    const stage = document.createElement('div')
    stage.className = 'thumbStage'
    const mat = document.createElement('div')
    mat.className = 'thumbMat'
    const img = document.createElement('img')
    img.className = 'thumb'
    img.src = `file://${m.file}`
    img.loading = 'lazy'
    mat.appendChild(img)
    stage.appendChild(mat)

    const name = document.createElement('div')
    name.className = 'groupItemName'
    const base = m.file.split('/').pop()
    const repTag = m._dupGroupRep ? '대표 · ' : ''
    const recTag = recommended && recommended.file === m.file ? '추천 · ' : ''
    name.textContent = `${repTag}${recTag}${base}`

    card.appendChild(stage)
    card.appendChild(name)
    card.addEventListener('click', () => {
      groupModalState.selectedFile = m.file
      renderGroupModal()
    })
    grid.appendChild(card)
  }

  updateGroupDeltaPreview()
}

function openGroupModal(groupId) {
  const members = getGroupMembers(groupId)
  if (!members.length) return
  const rep = members.find((m) => m._dupGroupRep) || members[0]
  groupModalState = { groupId, selectedFile: rep.file }
  $('groupMeta').textContent = `그룹 ${groupId} · ${members.length}장 · 대표 이미지를 선택하세요.`
  renderGroupModal()
  $('groupModal').classList.remove('hidden')
}

function closeGroupModal() {
  $('groupModal').classList.add('hidden')
  groupModalState = { groupId: '', selectedFile: '' }
  const deltaEl = $('groupDelta')
  if (deltaEl) deltaEl.textContent = ''
}

function recomputeDecisionsByStrength() {
  for (const item of modalItems) {
    const total = itemScore(item)
    item.decision = total > reviewMinScore ? 'reject' : 'approve'
  }
}

function setAnalyzeProgress(running, current = 0, total = 0, label = '분석중') {
  const now = Date.now()
  const wasRunning = analyzeProgress.running
  analyzeProgress = { running: !!running, current: Number(current || 0), total: Number(total || 0), label }

  if (analyzeProgress.running && !wasRunning) analyzeStartedAt = now
  if (!analyzeProgress.running) analyzeStartedAt = 0

  const el = $('detailProgress')
  if (!el) return
  if (!analyzeProgress.running) {
    el.textContent = analyzeProgress.total > 0 ? `완료 (${analyzeProgress.total}/${analyzeProgress.total})` : '대기'
    return
  }
  if (analyzeProgress.total > 0) {
    let etaTxt = ''
    if (analyzeStartedAt > 0 && analyzeProgress.current > 0) {
      const elapsedSec = Math.max(1, Math.round((now - analyzeStartedAt) / 1000))
      const perItem = elapsedSec / analyzeProgress.current
      const remaining = Math.max(0, Math.round((analyzeProgress.total - analyzeProgress.current) * perItem))
      etaTxt = `, 약 ${remaining}s 남음`
    }
    el.textContent = `${analyzeProgress.label || '분석중'} (${analyzeProgress.current}/${analyzeProgress.total}${etaTxt})`
  } else {
    el.textContent = `${analyzeProgress.label || '분석중'} (0/?)`
  }
}

function updateSelectionDetail(item) {
  if (!item) {
    $('detailName').textContent = '-'
    $('detailPath').textContent = '-'
    $('detailDecision').textContent = '-'
    $('detailScore').textContent = '-'
    $('detailReason').textContent = '-'
    return
  }

  const name = item.file.split('/').pop()
  $('detailName').textContent = name
  $('detailPath').textContent = item.file
  const decisionLabel = item.decision === 'approve' ? '승인' : item.decision === 'reject' ? '거절' : '-'
  $('detailDecision').textContent = decisionLabel
  $('detailScore').textContent = String(itemScore(item))
  $('detailReason').textContent = item.reject_reasons || item.review_reasons || '-'
}

function reasonChips(item, scores, totalScore) {
  const levelClass = (v) => {
    if (v >= 3) return 'lv3'
    if (v >= 2) return 'lv2'
    if (v >= 1) return 'lv1'
    return 'lv0'
  }

  const showOnlyIssues = viewMode === 'small' || viewMode === 'list'
  const scoreBox = showOnlyIssues ? '' : `<span class="chip total-score" title="종합 점수">${totalScore}</span>`

  const issueTags = ['눈감', '초점', '블러', '노출', '중복']
    .filter((x) => (showOnlyIssues ? (scores[x] || 0) > 0 : true))
    .map((x) => `<span class="chip issue ${levelClass(scores[x] || 0)}">${x}</span>`)
    .join('')

  const dupTag = item?._dupGroupSize > 1
    ? `<button type="button" class="chip dup-group" data-group-id="${item._dupGroupId || ''}" title="중복/연사 그룹">중복 ${item._dupGroupSize}</button>`
    : ''

  return `${scoreBox}${issueTags}${dupTag}`
}

function applyCycleFilterButton() {
  const btn = $('cycleFilterBtn')
  btn.classList.remove('mode-all', 'mode-approve', 'mode-reject')
  if (reviewFilter === 'approve') {
    btn.classList.add('mode-approve')
    btn.textContent = '승인'
  } else if (reviewFilter === 'reject') {
    btn.classList.add('mode-reject')
    btn.textContent = '거절'
  } else {
    btn.classList.add('mode-all')
    btn.textContent = '모두'
  }
}

function applyViewMode() {
  const grid = $('reviewGrid')
  grid.classList.remove('view-large', 'view-small', 'view-list')
  grid.classList.add(`view-${viewMode}`)
}

function refreshModalSummary() {
  const rejectCnt = modalItems.filter((x) => x.decision === 'reject').length
  const visible = getDisplayedItems().length
  $('modalSummary').textContent = `${modalItems.length}건 (거절 ${rejectCnt}, 표시 ${visible}, 강도≥${reviewMinScore})`
}

function getDisplayedItems() {
  let items = [...modalItems]
  if (reviewFilter === 'approve') items = items.filter((x) => x.decision === 'approve')
  if (reviewFilter === 'reject') items = items.filter((x) => x.decision === 'reject')

  // 공간이 작은 보기에서는 문제 컷 중심으로 표시
  if (reviewFilter === 'all' && (viewMode === 'small' || viewMode === 'list')) {
    items = items.filter((x) => itemScore(x) > 0)
  }

  items.sort((a, b) => {
    if (reviewFilter === 'all') return a.file.localeCompare(b.file)
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
  card.className = `reviewCard decision-${item.decision || 'none'}`
  if (item.file === activeFile) card.classList.add('active-card')

  const thumbStage = document.createElement('div')
  thumbStage.className = 'thumbStage'

  const thumbMat = document.createElement('div')
  thumbMat.className = 'thumbMat'

  const img = document.createElement('img')
  img.className = 'thumb'
  img.src = `file://${item.file}`
  img.loading = 'lazy'
  img.onclick = () => window.photoforge.openPath(item.file)

  thumbMat.appendChild(img)
  thumbStage.appendChild(thumbMat)

  const sc = reasonScores(item)
  const total = itemScore(item)

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.innerHTML = `<div class="filename">${item.file.split('/').pop()}</div><div class="chips">${reasonChips(item, sc, total)}</div>`
  const dupBtn = meta.querySelector('.dup-group')
  if (dupBtn) {
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      const gid = dupBtn.getAttribute('data-group-id') || item._dupGroupId || ''
      if (gid) openGroupModal(gid)
    })
  }

  const toggles = document.createElement('div')
  toggles.className = 'smallActions'
  const a = document.createElement('button')
  const r = document.createElement('button')
  a.textContent = '승인'
  r.textContent = '거절'

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

  card.appendChild(thumbStage)
  card.appendChild(meta)
  card.appendChild(toggles)
  return card
}

function renderReviewGrid() {
  const items = getDisplayedItems()
  const grid = $('reviewGrid')
  applyViewMode()
  grid.innerHTML = ''
  items.forEach((it) => grid.appendChild(makeReviewCard(it)))
  refreshModalSummary()
  updateSelectionDetail(getActiveItem())
}

async function openReview(items) {
  modalItems = items
  reviewFilter = 'all'
  reviewSort = 'name_asc'
  reviewMinScore = 0
  viewMode = 'large'
  $('reviewSort').value = reviewSort
  $('reviewMinScore').value = String(reviewMinScore)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  $('viewMode').value = viewMode
  applyCycleFilterButton()
  activeFile = items[0]?.file || ''
  $('emptyCenter').classList.add('hidden')
  $('reviewPanel').classList.remove('hidden')

  await recomputeBurstDuplicateGroupsWithProgress()
  recomputeDecisionsByStrength()
  renderReviewGrid()
}

function closeReview() {
  $('reviewPanel').classList.add('hidden')
  $('emptyCenter').classList.remove('hidden')
  updateSelectionDetail(null)
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

$('groupCancel').addEventListener('click', closeGroupModal)
$('groupModal').addEventListener('click', (e) => {
  if (e.target.id === 'groupModal') closeGroupModal()
})
$('groupRecommend').addEventListener('click', () => {
  if (!groupModalState.groupId) return
  const members = getGroupMembers(groupModalState.groupId)
  const best = pickBestRepresentative(members)
  if (!best) return
  groupModalState.selectedFile = best.file
  renderGroupModal()
})

$('groupApply').addEventListener('click', () => {
  if (!groupModalState.groupId || !groupModalState.selectedFile) return
  const msg = summarizeGroupCandidate(groupModalState.groupId, groupModalState.selectedFile)
  rebuildGroupWithRepresentative(groupModalState.groupId, groupModalState.selectedFile)
  recomputeDecisionsByStrength()
  renderReviewGrid()
  $('log').textContent = `[중복대표] ${msg}`
  closeGroupModal()
})

if (window.photoforge?.onAnalyzeProgress) {
  window.photoforge.onAnalyzeProgress((p) => {
    const running = !!p?.running
    const current = Number(p?.current || 0)
    const total = Number(p?.total || 0)
    setAnalyzeProgress(running, current, total)
  })
}

$('presetSelect').addEventListener('change', async () => {
  const presets = loadPresets()
  applyLevelSet(presets[$('presetSelect').value] || presets.balanced)
  persistRecent()
  if (!$('reviewPanel').classList.contains('hidden')) {
    await recomputeBurstDuplicateGroupsWithProgress()
    recomputeDecisionsByStrength()
    renderReviewGrid()
  }
})

$('savePreset').addEventListener('click', () => {
  const presets = loadPresets()
  presets[$('presetSelect').value] = {
    eyes: Number($('eyes').value),
    focus: Number($('focus').value),
    blur: Number($('blur').value),
    exposure: Number($('exposure').value),
    dup: Number($('dup').value),
  }
  savePresets(presets)
  $('log').textContent = '프리셋 저장 완료'
  persistRecent()
})

$('pickInput').addEventListener('click', async () => {
  const dir = await window.photoforge.pickFolder()
  if (dir) $('inputDir').value = dir
  persistRecent()
})

$('pickOutput').addEventListener('click', async () => {
  const dir = await window.photoforge.pickFolder()
  if (dir) $('outputDir').value = dir
  persistRecent()
})

$('openOut').addEventListener('click', async () => {
  const p = $('outputDir').value.trim()
  if (p) await window.photoforge.openPath(p)
})

$('undoLast').addEventListener('click', async () => {
  const outputDir = $('outputDir').value.trim()
  if (!outputDir) {
    window.alert('출력 폴더를 먼저 지정해 주세요.')
    return
  }
  const ok = window.confirm('직전 적용 작업을 되돌릴까요?\n(copy는 생성 파일 삭제, move는 원래 위치로 복원)')
  if (!ok) return

  const res = await window.photoforge.undoLastExport({ outputDir })
  if (!res?.ok) {
    $('log').textContent = `되돌리기 실패\n${res?.error || ''}`
    return
  }
  $('log').textContent = `되돌리기 완료\n${JSON.stringify(res.summary?.last_undo || {}, null, 2)}`
})

const githubIconBtn = $('githubIconBtn')
if (githubIconBtn) {
  githubIconBtn.addEventListener('click', async () => {
    await window.photoforge.openExternalUrl('https://github.com/ktkarchive/photo-forge-app')
  })
}

$('reviewSort').addEventListener('change', () => {
  reviewSort = $('reviewSort').value
  renderReviewGrid()
})

$('reviewMinScore').addEventListener('input', () => {
  reviewMinScore = Number($('reviewMinScore').value || 0)
  $('reviewMinScoreVal').textContent = String(reviewMinScore)
  recomputeDecisionsByStrength()
  renderReviewGrid()
})

$('viewMode').addEventListener('change', () => {
  viewMode = $('viewMode').value || 'large'
  renderReviewGrid()
})

$('cycleFilterBtn').addEventListener('click', () => {
  if (reviewFilter === 'all') reviewFilter = 'approve'
  else if (reviewFilter === 'approve') reviewFilter = 'reject'
  else reviewFilter = 'all'
  applyCycleFilterButton()
  renderReviewGrid()
})

$('cancelReview').addEventListener('click', () => {
  closeReview()
  $('log').textContent = '사용자가 취소했습니다. 실제 복사/이동은 수행하지 않았습니다.'
})

$('confirmReview').addEventListener('click', async () => {
  const s = getSettingFromUI()
  if (s.exportMode === 'move') {
    const ok = window.confirm('move mode는 거절본만 Rejected로 이동합니다. 승인본은 원위치 유지됩니다. 진행할까요?')
    if (!ok) return
  }

  const result = await window.photoforge.applyReviewExport({
    outputDir: s.outputDir,
    exportMode: s.exportMode,
    conflictPolicy: s.conflictPolicy,
    includeSidecars: s.includeSidecars,
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
  setAnalyzeProgress(true, 0, 0)
  persistRecent()

  const analyzed = await window.photoforge.analyzeForReview(s)
  $('runBtn').disabled = false

  if (!analyzed.ok) {
    setAnalyzeProgress(false, 0, 0)
    if (String(analyzed.code) === 'NO_FILES') {
      window.alert('파일 없음.')
      $('log').textContent = '파일 없음. (jpg/jpeg 파일을 확인해 주세요)'
      return
    }
    $('log').textContent = `[exit=${analyzed.code}] 실패\n${analyzed.stderr || analyzed.stdout || ''}`
    return
  }

  const rows = analyzed.rows || []
  analysisSummary = analyzed.summary || {}
  setAnalyzeProgress(false, rows.length, rows.length)
  const items = rows.map((r) => ({
    ...r,
    decision: 'approve',
    _scoresObj: (() => {
      try { return JSON.parse(r.scores || '{}') } catch { return {} }
    })(),
    _baseRejectReasons: splitReasons(r.reject_reasons).filter((x) => !isDuplicateReason(x)),
  }))

  $('log').textContent = `분석 완료: total=${rows.length}. 중앙 영역에서 승인/거절 조정 후 확인을 누르세요.`
  await openReview(items)
})

$('conflictPolicy').addEventListener('change', persistRecent)
if ($('includeSidecars')) $('includeSidecars').addEventListener('change', persistRecent)
document.querySelectorAll('input[name="exportMode"]').forEach((r) => r.addEventListener('change', persistRecent))

document.addEventListener('keydown', (e) => {
  if ($('reviewPanel').classList.contains('hidden')) return

  if (!$('groupModal').classList.contains('hidden') && e.key === 'Escape') {
    e.preventDefault()
    closeGroupModal()
    return
  }

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
runStartupWarmupUI()
