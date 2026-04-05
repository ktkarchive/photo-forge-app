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
let currentRows = []
const overrides = {}

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

function getSettingFromUI() {
  const exportMode = document.querySelector('input[name="exportMode"]:checked')?.value || 'copy'
  return {
    inputDir: $('inputDir').value.trim(),
    outputDir: $('outputDir').value.trim(),
    conflictPolicy: $('conflictPolicy').value,
    exportMode,
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

function classBadge(c) {
  if (c === 'reject') return 'badge badge-reject'
  if (c === 'review') return 'badge badge-review'
  return 'badge badge-keep'
}

function makeCard(row) {
  const card = document.createElement('div')
  card.className = 'reviewCard'

  const preview = document.createElement('img')
  preview.src = `file://${row.file}`
  preview.className = 'thumb'
  preview.loading = 'lazy'
  preview.onclick = () => window.ktk.openPath(row.file)

  const meta = document.createElement('div')
  meta.className = 'meta'
  meta.innerHTML = `<span class="${classBadge(row.class)}">${row.class}</span><div class="filename">${row.file.split('/').pop()}</div><div class="reasons">${row.reject_reasons || row.review_reasons || '-'}</div>`

  const actions = document.createElement('div')
  actions.className = 'smallActions'
  ;['keep', 'review', 'reject'].forEach((klass) => {
    const b = document.createElement('button')
    b.textContent = klass
    b.onclick = () => {
      overrides[row.file] = klass
      meta.querySelector('.badge').textContent = `${row.class} → ${klass}`
    }
    actions.appendChild(b)
  })

  card.appendChild(preview)
  card.appendChild(meta)
  card.appendChild(actions)
  return card
}

function renderReview(rows) {
  const grid = $('reviewGrid')
  grid.innerHTML = ''
  const target = rows.filter((r) => r.class === 'reject' || r.class === 'review')
  $('reviewSummary').textContent = `${target.length}건`
  target.forEach((r) => grid.appendChild(makeCard(r)))
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

async function loadArtifactsAndRender() {
  const out = $('outputDir').value.trim()
  if (!out) return
  const loaded = await window.ktk.loadRunArtifacts(out)
  if (!loaded.ok) {
    $('log').textContent = `결과 로드 실패\n${loaded.error || ''}`
    return
  }
  currentRows = loaded.rows || []
  renderReview(currentRows)
}

$('loadResult').addEventListener('click', loadArtifactsAndRender)

$('saveOverrides').addEventListener('click', async () => {
  const out = $('outputDir').value.trim()
  if (!out) return
  const res = await window.ktk.saveOverrides(out, overrides)
  $('log').textContent = res.ok ? `재분류 저장 완료\n${res.stdout || ''}` : `재분류 저장 실패\n${res.stderr || ''}`
})

$('runBtn').addEventListener('click', async () => {
  const payload = getSettingFromUI()
  if (!payload.inputDir || !payload.outputDir) {
    $('log').textContent = '입력/출력 폴더를 먼저 지정해 주세요.'
    return
  }

  if (payload.exportMode === 'move') {
    const ok = window.confirm('move mode는 원본 파일을 이동합니다. 계속할까요?')
    if (!ok) return
  }

  $('runBtn').disabled = true
  $('log').textContent = '실행 중...'
  persistRecent()

  const res = await window.ktk.runCuller(payload)
  $('runBtn').disabled = false
  const txt = [
    `[exit=${res.code}] ok=${res.ok}`,
    res.stdout ? `\n[stdout]\n${res.stdout}` : '',
    res.stderr ? `\n[stderr]\n${res.stderr}` : '',
  ].join('\n')
  $('log').textContent = txt

  if (res.ok) {
    await loadArtifactsAndRender()
  }
})

$('conflictPolicy').addEventListener('change', persistRecent)
document.querySelectorAll('input[name="exportMode"]').forEach((r) => r.addEventListener('change', persistRecent))

restoreRecent()
