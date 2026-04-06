const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let pythonDepsReady = false
let pythonDepsCheckPromise = null
let startupWarmupDone = false
let startupWarmupPromise = null

function getProjectRoot() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'app', 'embedded')
  return path.join(__dirname, 'embedded')
}

function runProcess(cmd, args, opts = {}) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, opts)
    let out = ''
    let err = ''
    cp.stdout.on('data', (d) => (out += d.toString()))
    cp.stderr.on('data', (d) => (err += d.toString()))
    cp.on('close', (code) => resolve({ code, stdout: out, stderr: err }))
  })
}

function runProcessWithProgress(cmd, args, opts = {}, onProgress = null) {
  return new Promise((resolve) => {
    const cp = spawn(cmd, args, opts)
    let out = ''
    let err = ''
    let outBuf = ''
    let errBuf = ''

    const parseLines = (chunk, isErr) => {
      const text = chunk.toString()
      if (isErr) err += text
      else out += text

      let buf = (isErr ? errBuf : outBuf) + text
      const lines = buf.split(/\r?\n/)
      buf = lines.pop() || ''

      for (const line of lines) {
        const s = String(line || '').trim()
        if (!s.startsWith('KTK_PROGRESS')) continue
        // KTK_PROGRESS current/total
        const payload = s.replace('KTK_PROGRESS', '').trim()
        const m = payload.match(/^(\d+)\/(\d+)$/)
        if (!m) continue
        if (onProgress) {
          onProgress({ current: Number(m[1]), total: Number(m[2]) })
        }
      }

      if (isErr) errBuf = buf
      else outBuf = buf
    }

    cp.stdout.on('data', (d) => parseLines(d, false))
    cp.stderr.on('data', (d) => parseLines(d, true))
    cp.on('close', (code) => resolve({ code, stdout: out, stderr: err }))
  })
}

async function ensurePythonDeps(root) {
  const check = await runProcess('python3', ['-c', 'import cv2, numpy, mediapipe'], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  if (check.code === 0) return { ok: true }

  const install = await runProcess('python3', ['-m', 'pip', 'install', '--user', '-r', 'requirements.txt'], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  return { ok: install.code === 0, checkErr: check.stderr, installOut: install.stdout, installErr: install.stderr }
}

async function ensurePythonDepsCached(root) {
  if (pythonDepsReady) return { ok: true }
  if (pythonDepsCheckPromise) return pythonDepsCheckPromise

  pythonDepsCheckPromise = ensurePythonDeps(root)
    .then((res) => {
      if (res.ok) pythonDepsReady = true
      return res
    })
    .finally(() => {
      pythonDepsCheckPromise = null
    })

  return pythonDepsCheckPromise
}

async function runStartupWarmup(root, notify = null) {
  if (startupWarmupDone) {
    if (notify) notify({ step: 'ready', percent: 100, message: '준비 완료' })
    return { ok: true, warmed: true }
  }

  if (startupWarmupPromise) return startupWarmupPromise

  startupWarmupPromise = (async () => {
    if (notify) notify({ step: 'deps', percent: 15, message: 'Python 의존성 확인 중...' })
    const prep = await ensurePythonDepsCached(root)
    if (!prep.ok) {
      return {
        ok: false,
        error: `의존성 설치 실패\n${prep.checkErr || ''}\n${prep.installErr || ''}`,
      }
    }

    if (notify) notify({ step: 'warm', percent: 65, message: '초기 엔진 워밍업 중...' })
    const warm = await runProcess('python3', ['-c', 'import cv2, numpy, mediapipe; print("WARMUP_OK")'], {
      cwd: root,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: root },
    })

    if (warm.code !== 0) {
      return { ok: false, error: warm.stderr || warm.stdout || '워밍업 실패' }
    }

    startupWarmupDone = true
    if (notify) notify({ step: 'ready', percent: 100, message: '준비 완료' })
    return { ok: true, warmed: true }
  })().finally(() => {
    startupWarmupPromise = null
  })

  return startupWarmupPromise
}

function countJpegFiles(inputDir) {
  if (!inputDir) return 0
  const stack = [inputDir]
  let count = 0
  while (stack.length > 0) {
    const cur = stack.pop()
    let entries = []
    try {
      entries = fs.readdirSync(cur, { withFileTypes: true })
    } catch {
      continue
    }
    for (const ent of entries) {
      const p = path.join(cur, ent.name)
      if (ent.isDirectory()) stack.push(p)
      else if (ent.isFile()) {
        const ext = path.extname(ent.name).toLowerCase()
        if (ext === '.jpg' || ext === '.jpeg') count += 1
      }
    }
  }
  return count
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1240,
    height: 900,
    backgroundColor: '#161616',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    title: 'Photo Forge',
  })

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
}

ipcMain.handle('pick-folder', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'createDirectory'] })
  if (res.canceled || !res.filePaths?.length) return ''
  return res.filePaths[0]
})

ipcMain.handle('open-path', async (_evt, p) => {
  if (!p) return false
  await shell.openPath(p)
  return true
})

ipcMain.handle('startup-warmup', async (evt) => {
  const root = getProjectRoot()
  const notify = (payload) => evt.sender.send('startup-progress', payload)
  notify({ step: 'boot', percent: 5, message: '앱 초기화 중...' })
  const res = await runStartupWarmup(root, notify)
  return res
})

ipcMain.handle('analyze-for-review', async (evt, payload) => {
  const root = getProjectRoot()
  const prep = await ensurePythonDepsCached(root)
  if (!prep.ok) {
    return {
      ok: false,
      code: 1,
      stdout: prep.installOut || '',
      stderr: `의존성 설치 실패\n${prep.checkErr || ''}\n${prep.installErr || ''}`,
    }
  }

  const jpegCount = countJpegFiles(payload.inputDir)
  if (jpegCount <= 0) {
    evt.sender.send('analyze-progress', { current: 0, total: 0, running: false })
    return { ok: false, code: 'NO_FILES', stdout: '', stderr: '파일 없음.' }
  }

  const tempOut = path.join(payload.outputDir, '.ktk_review_tmp')
  const args = ['-m', 'ktk_select.cli', 'run', '--input', payload.inputDir, '--output', tempOut]
  args.push('--eyes-level', String(payload.levels?.eyes_closed ?? 2))
  args.push('--focus-level', String(payload.levels?.out_of_focus_subject ?? 2))
  args.push('--blur-level', String(payload.levels?.motion_blur ?? 1))
  args.push('--exposure-level', String(payload.levels?.exposure_bad ?? 1))
  args.push('--duplicate-level', String(payload.levels?.duplicate ?? 1))
  args.push('--occlusion-level', String(payload.levels?.occlusion ?? 0))
  args.push('--composition-level', String(payload.levels?.composition_bad ?? 0))
  args.push('--export-mode', 'report')
  args.push('--burst-window-sec', String(payload.burstWindowSec ?? 1.5))

  evt.sender.send('analyze-progress', { current: 0, total: jpegCount, running: true })
  const ran = await runProcessWithProgress(
    'python3',
    args,
    {
      cwd: root,
      env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: root },
    },
    (p) => evt.sender.send('analyze-progress', { ...p, running: true })
  )
  evt.sender.send('analyze-progress', { current: 0, total: 0, running: false })

  if (ran.code !== 0) return { ok: false, code: ran.code, stdout: ran.stdout, stderr: ran.stderr }

  const py = `
import csv, json, pathlib, sys
out = pathlib.Path(sys.argv[1])
rows = []
with (out / 'result.csv').open('r', encoding='utf-8', newline='') as f:
    rows = list(csv.DictReader(f))
summary = json.loads((out / 'summary.json').read_text(encoding='utf-8'))
print(json.dumps({'rows': rows, 'summary': summary}, ensure_ascii=False))
`
  const loaded = await runProcess('python3', ['-c', py, tempOut], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  if (loaded.code !== 0) return { ok: false, code: 1, stdout: ran.stdout, stderr: loaded.stderr || loaded.stdout }

  try {
    const parsed = JSON.parse(loaded.stdout || '{}')
    return { ok: true, code: 0, stdout: ran.stdout, stderr: ran.stderr, ...parsed }
  } catch (e) {
    return { ok: false, code: 1, stdout: ran.stdout, stderr: String(e) }
  }
})

ipcMain.handle('apply-review-export', async (_evt, payload) => {
  const root = getProjectRoot()
  const py = `
import json, pathlib, shutil, sys

output_dir = pathlib.Path(sys.argv[1])
mode = sys.argv[2]
conflict = sys.argv[3]
items = json.loads(sys.argv[4])

reason_priority = [
  ('eyes_closed', '눈감'),
  ('out_of_focus_subject', '초점'),
  ('focus_unavailable', '초점'),
  ('motion_blur', '블러'),
  ('exposure_bad', '노출'),
  ('duplicate_exact:', '중복'),
  ('duplicate:', '중복'),
]

def bucket(reject_reasons: str):
  t = (reject_reasons or '')
  for k, v in reason_priority:
    if k in t:
      return v
  return '수동'

def resolve_target(target: pathlib.Path):
  if not target.exists():
    return target
  if conflict == 'overwrite':
    return target
  if conflict == 'skip':
    return None
  stem, suffix = target.stem, target.suffix
  i = 1
  while True:
    cand = target.parent / f'{stem}_{i}{suffix}'
    if not cand.exists():
      return cand
    i += 1

(output_dir / 'approve').mkdir(parents=True, exist_ok=True)
(output_dir / 'reject').mkdir(parents=True, exist_ok=True)
for _, v in reason_priority:
  (output_dir / 'reject' / v).mkdir(parents=True, exist_ok=True)
(output_dir / 'reject' / '수동').mkdir(parents=True, exist_ok=True)

copied = moved = skipped = 0
for it in items:
  src = pathlib.Path(it.get('file', ''))
  if not src.exists():
    continue
  decision = it.get('decision', 'approve')
  if decision == 'reject':
    dst = output_dir / 'reject' / bucket(it.get('reject_reasons', '')) / src.name
  else:
    dst = output_dir / 'approve' / src.name

  dst.parent.mkdir(parents=True, exist_ok=True)
  dst2 = resolve_target(dst)
  if dst2 is None:
    skipped += 1
    continue

  if mode == 'move':
    shutil.move(str(src), str(dst2)); moved += 1
  else:
    shutil.copy2(str(src), str(dst2)); copied += 1

summary = {
  'mode': mode,
  'conflict_policy': conflict,
  'copied': copied,
  'moved': moved,
  'skipped': skipped,
  'total': len(items),
}
(output_dir / 'review_apply_summary.json').write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps(summary, ensure_ascii=False))
`

  const res = await runProcess('python3', ['-c', py, payload.outputDir, payload.exportMode, payload.conflictPolicy, JSON.stringify(payload.items || [])], {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
  })
  if (res.code !== 0) return { ok: false, code: res.code, stdout: res.stdout, stderr: res.stderr }

  try {
    return { ok: true, code: 0, summary: JSON.parse(res.stdout || '{}') }
  } catch {
    return { ok: true, code: 0, stdout: res.stdout }
  }
})

app.whenReady().then(() => {
  createWindow()

  // 첫 분석 지연 완화: 백그라운드 워밍업(비차단)
  const root = getProjectRoot()
  setTimeout(() => {
    runStartupWarmup(root).catch(() => {})
  }, 200)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
