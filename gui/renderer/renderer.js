const $ = (id) => document.getElementById(id)

const ids = ['eyes', 'focus', 'blur', 'exposure', 'dup']
for (const id of ids) {
  const el = $(id)
  const out = $(`${id}Val`)
  el.addEventListener('input', () => (out.textContent = el.value))
}

$('pickInput').addEventListener('click', async () => {
  const dir = await window.ktk.pickFolder()
  if (dir) $('inputDir').value = dir
})

$('pickOutput').addEventListener('click', async () => {
  const dir = await window.ktk.pickFolder()
  if (dir) $('outputDir').value = dir
})

$('openOut').addEventListener('click', async () => {
  const p = $('outputDir').value.trim()
  if (p) await window.ktk.openPath(p)
})

$('runBtn').addEventListener('click', async () => {
  const inputDir = $('inputDir').value.trim()
  const outputDir = $('outputDir').value.trim()
  if (!inputDir || !outputDir) {
    $('log').textContent = '입력/출력 폴더를 먼저 지정해 주세요.'
    return
  }

  $('runBtn').disabled = true
  $('log').textContent = '실행 중...'

  const exportMode = document.querySelector('input[name="exportMode"]:checked')?.value || 'copy'

  const payload = {
    inputDir,
    outputDir,
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

  const res = await window.ktk.runCuller(payload)
  $('runBtn').disabled = false
  const txt = [
    `[exit=${res.code}] ok=${res.ok}`,
    res.stdout ? `\n[stdout]\n${res.stdout}` : '',
    res.stderr ? `\n[stderr]\n${res.stderr}` : '',
  ].join('\n')
  $('log').textContent = txt
})
