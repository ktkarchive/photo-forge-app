const $ = (id) => document.getElementById(id)

const ids = ['eyes', 'focus', 'blur', 'exposure', 'dup']
for (const id of ids) {
  const el = $(id)
  const out = $(`${id}Val`)
  el.addEventListener('input', () => {
    out.textContent = el.value
    persistRecent()
  })
}

const PRESET_KEY = 'ktk.select.presets.v1'
const RECENT_KEY = 'ktk.select.recent.v1'
let modalItems = []

const defaultPresets = {
  conservative: { eyes: 1, focus: 1, blur: 1, exposure: 1, dup: 0 },
  balanced: { eyes: 2, focus: 2, blur: 1, exposure: 1, dup: 1 },
  aggressive: { eyes: 3, focus: 3, blur: 2, exposure: 2, dup: 2 },
}

function loadPresets() {
  try {
    const v = JSON.parse(localStorage.getItem(PRESET_KEY) || '{}')
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
    dup: levels.dup ?? levels.duplicate ?? 1,
  }
  for (const [k, v] of Object.entries(map)) {
    $(k).value = String(v)
    $(`${k}Val`).textContent = String(v)
  }
}

function getSettingFromUI() {
  return {
    inputDir: $('inputDir').value.trim(),
    outputDir: $('outputDir').value.trim(),
    conflictPolicy: $('conflictPolicy').value,
    exportMode: document.querySelector('input[name="exportMode"]:checked')?.value || 'copy',
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
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '{}')
    if (v.inputDir) $('inputDir').value = v.inputDir
    if (v.outputDir) $('outputDir').value = v.outputDir
    if (v.conflictPolicy) $('conflictPolicy').value = v.conflictPolicy
    if (v.exportMode) {
      const radio = document.querySelector(`input[name="exportMode"][value="${v.exportMode}"]`)
      if (radio) radio.checked = true
    }
    if (v.levels) applyLevelSet(v.levels)
  } catch {}
}

function pickRejectBucket(rejectReasons) {
  const t = String(rejectReasons || '')
  if (t.includes('eyes_closed')) return '눈감음'
  if (t.includes('out_of_focus_subject') || t.includes('focus_unavailable')) return '초점'
  if (t.includes('motion_blur')) return '흔들림'
  if (t.includes('exposure_bad')) return '노출'
  if (t.includes('duplicate:')) return '중복'
  return '기타'
}

function reasonChips(rejectReasons) {
  const all = ['눈감음', '초점', '흔들림', '노출', '중복', '기타']
  const active = pickRejectBucket(rejectReasons)
  return all
    .map((x) => `<span class="chip ${x === active ? 'active' : ''}">${x}</span>`)
    .join('')
}

function makeReviewCard(item) {
  const card = document.createElement('div')
  card.className = 'reviewCard'

  const img = document.createElement('img')
  img.className = 'thumb'
  img.src = `file://${item.file}`
  img.loading = 'lazy'
  img.onclick = () => window.ktk.openPath(item.file)

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.innerHTML = `<div class="filename">${item.file.split('/').pop()}</div><div class="reasons">${item.reject_reasons || item.review_reasons || '-'}</div><div class="chips">${reasonChips(item.reject_reasons)}</div>`

  const toggles = document.createElement('div')
  toggles.className = 'smallActions'
  const a = document.createElement('button')
  const r = document.createElement('button')
  a.textContent = 'approve'
  r.textContent = 'reject'

  const applyUI = () => {
    a.classList.toggle('sel', item.decision === 'approve')
    r.classList.toggle('sel', item.decision === 'reject')
  }

  a.onclick = () => {
    item.decision = 'approve'
    applyUI()
  }
  r.onclick = () => {
    item.decision = 'reject'
    applyUI()
  }
  applyUI()

  toggles.appendChild(a)
  toggles.appendChild(r)

  card.appendChild(img)
  card.appendChild(meta)
  card.appendChild(toggles)
  return card
}

function openModal(items) {
  modalItems = items
  $('reviewGrid').innerHTML = ''
  items.forEach((it) => $('reviewGrid').appendChild(makeReviewCard(it)))
  const rejectCnt = items.filter((x) => x.decision === 'reject').length
  $('modalSummary').textContent = `${items.length}건 (reject ${rejectCnt})`
  $('reviewModal').classList.remove('hidden')
}

function closeModal() {
  $('reviewModal').classList.add('hidden')
}

$('presetSelect').addEventListener('change', () => {
  const presets = loadPresets()
  applyLevelSet(presets[$('presetSelect').value] || presets.balanced)
  persistRecent()
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

$('cancelReview').addEventListener('click', () => {
  closeModal()
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

  closeModal()
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
  const items = rows.map((r) => ({
    ...r,
    decision: r.class === 'reject' ? 'reject' : 'approve',
  }))

  $('log').textContent = `분석 완료: total=${rows.length}. 검토 팝업에서 approve/reject 조정 후 확인을 눌러주세요.`
  openModal(items)
})

$('conflictPolicy').addEventListener('change', persistRecent)
document.querySelectorAll('input[name="exportMode"]').forEach((r) => r.addEventListener('change', persistRecent))

restoreRecent()
