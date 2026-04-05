const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')
const { spawn } = require('child_process')

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
    title: 'ktk.select',
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

ipcMain.handle('analyze-for-review', async (_evt, payload) => {
  const root = getProjectRoot()
  const prep = await ensurePythonDeps(root)
  if (!prep.ok) {
    return {
      ok: false,
      code: 1,
      stdout: prep.installOut || '',
      stderr: `의존성 설치 실패\n${prep.checkErr || ''}\n${prep.installErr || ''}`,
    }
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

  const ran = await runProcess('python3', args, {
    cwd: root,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONPATH: root },
  })

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
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
